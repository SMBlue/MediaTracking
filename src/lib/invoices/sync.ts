/**
 * Invoice ingestion logic shared between the Vercel cron route and
 * the local backfill script. The route handler just wraps this with
 * auth and prerequisites; tests + manual backfills call it directly.
 */

import { prisma } from "../db";
import {
  fetchUnprocessedEmails,
  downloadAttachment,
  markEmailProcessed,
} from "../gmail";
import { analyzeEmailWithClaude, extractPdfText } from "../pdf-parser";
import { matchClient, mapPlatform } from "../invoice-matching";
import { matchLineItemsToMBAs } from "../mba-matching";
import { planParseUnits, type ParseAttachment } from "../parsing/parse-units";
import { uploadInvoiceSourcePdf } from "./source-storage";

export type SyncInvoicesOptions = {
  maxEmailsPerRun?: number;
  afterDate?: string;
};

export type SyncInvoicesResult = {
  emailsFound: number;
  emailsProcessed: number;
  invoicesCreated: number;
  emailsSkipped: number;
  errors: string[];
};

const DEFAULT_MAX_EMAILS_PER_RUN = 100;

export async function syncInvoices(
  options: SyncInvoicesOptions = {}
): Promise<SyncInvoicesResult> {
  const maxEmails = options.maxEmailsPerRun ?? DEFAULT_MAX_EMAILS_PER_RUN;
  const errors: string[] = [];
  let emailsFound = 0;
  let emailsProcessed = 0;
  let invoicesCreated = 0;
  let emailsSkipped = 0;

  const syncLog = await prisma.emailSyncLog.create({ data: {} });

  try {
    const emails = await fetchUnprocessedEmails(maxEmails, options.afterDate);
    emailsFound = emails.length;

    for (const email of emails) {
      try {
        const downloaded: ParseAttachment[] = [];
        const pdfBufferByFilename = new Map<string, Buffer>();

        for (const attachment of email.attachments) {
          try {
            const buffer = await downloadAttachment(
              email.id,
              attachment.attachmentId
            );
            if (attachment.mimeType === "application/pdf") {
              const pdfText = await extractPdfText(buffer);
              downloaded.push({
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                content: pdfText,
              });
              pdfBufferByFilename.set(attachment.filename, buffer);
            } else if (attachment.mimeType.startsWith("image/")) {
              downloaded.push({
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                content: buffer,
              });
            }
          } catch (downloadError) {
            console.error(
              `Failed to download ${attachment.filename}: ${downloadError}`
            );
            errors.push(
              `Failed to download ${attachment.filename} from email ${email.id}: ${downloadError}`
            );
          }
        }

        const parseUnits = planParseUnits(downloaded);
        let invoiceCreatedForThisEmail = false;

        for (const unit of parseUnits) {
          const analysis = await analyzeEmailWithClaude(
            {
              subject: email.subject,
              from: email.from,
              bodyText: email.bodyText,
            },
            unit.attachments
          );

          if (analysis.classification === "not_invoice") {
            console.log(
              `Skipped attachment ${unit.attachmentFilename ?? "(body)"} on email ${email.id} (${email.subject}): ${analysis.reason}`
            );
            continue;
          }

          const parsed = analysis.invoice!;
          const totalAmount = Number(parsed.totalAmount) || 0;
          const invoiceDate = parsed.invoiceDate
            ? new Date(parsed.invoiceDate)
            : new Date();
          const invoiceNumber =
            String(parsed.invoiceNumber || "").trim() ||
            `EMAIL-${email.id}-${unit.attachmentFilename ?? "body"}-${Date.now()}`;

          if (isNaN(invoiceDate.getTime())) {
            console.log(
              `Skipped attachment ${unit.attachmentFilename ?? "(body)"} on email ${email.id}: invalid invoice date "${parsed.invoiceDate}"`
            );
            continue;
          }

          const matchedClient = await matchClient(parsed.clientName);

          const parsedLineItems = (parsed.lineItems || [])
            .filter((item) => item.campaignName)
            .map((item) => ({
              campaignName: String(item.campaignName),
              platform: item.platform ? String(item.platform) : null,
              amount: Number(item.amount) || 0,
              confidence: Number(item.confidence) || 0,
            }));

          const matchedLineItems = await matchLineItemsToMBAs(
            parsedLineItems,
            matchedClient?.id || null,
            mapPlatform(parsed.platform),
            invoiceDate
          );

          const lineItems = matchedLineItems.map((item) => ({
            campaignName: item.campaignName,
            platform: item.platform,
            amount: item.amount,
            confidence: item.confidence,
            mbaId: item.mbaId || undefined,
          }));

          const rawDetectedClient = parsed.clientName
            ? String(parsed.clientName).trim() || null
            : null;
          const rawDetectedVendor =
            (parsed as { vendorName?: unknown }).vendorName
              ? String((parsed as { vendorName?: unknown }).vendorName).trim() || null
              : null;

          try {
            const pdfBuffer = unit.attachmentFilename
              ? pdfBufferByFilename.get(unit.attachmentFilename) ?? null
              : null;

            const invoice = await prisma.invoice.create({
              data: {
                vendor: mapPlatform(parsed.platform),
                invoiceNumber,
                invoiceDate,
                totalAmount,
                status: "CONFIRMED",
                sourceType: "EMAIL_PARSED",
                emailMessageId: email.id,
                attachmentFilename: unit.attachmentFilename,
                emailSubject: email.subject,
                emailReceivedAt: email.receivedAt,
                parseConfidence: Number(parsed.overallConfidence) || 0,
                detectedClientId: matchedClient?.id ?? null,
                detectedClientName: matchedClient?.name ?? rawDetectedClient,
                detectedVendorName: rawDetectedVendor,
                sourceEmailBodyText: pdfBuffer ? null : email.bodyText ?? null,
                lineItems: { create: lineItems },
              },
            });

            if (pdfBuffer && unit.attachmentFilename) {
              try {
                const uploaded = await uploadInvoiceSourcePdf({
                  invoiceId: invoice.id,
                  filename: unit.attachmentFilename,
                  buffer: pdfBuffer,
                });
                await prisma.invoice.update({
                  where: { id: invoice.id },
                  data: {
                    sourcePdfPath: uploaded.path,
                    sourcePdfFilename: unit.attachmentFilename,
                    sourcePdfSize: uploaded.size,
                  },
                });
              } catch (uploadError) {
                console.error(
                  `Failed to persist invoice source PDF for ${invoice.id}: ${uploadError}`
                );
              }
            }

            invoicesCreated++;
            invoiceCreatedForThisEmail = true;
            console.log(
              `Created invoice ${invoice.id} from email ${email.id} attachment ${unit.attachmentFilename ?? "(body)"} (${invoiceNumber})`
            );
          } catch (createError: unknown) {
            const errStr = String(createError);
            if (errStr.includes("Unique constraint")) {
              console.log(
                `Skipped duplicate invoice on email ${email.id} attachment ${unit.attachmentFilename ?? "(body)"} (${invoiceNumber})`
              );
              continue;
            }
            throw createError;
          }
        }

        if (!invoiceCreatedForThisEmail) emailsSkipped++;
        await markEmailProcessed(email.id);
        emailsProcessed++;
      } catch (emailError: unknown) {
        const errStr = String(emailError);
        if (errStr.includes("Unique constraint")) {
          console.log(
            `Skipped email ${email.id} (${email.subject}): duplicate invoice number`
          );
          emailsSkipped++;
          try {
            await markEmailProcessed(email.id);
            emailsProcessed++;
          } catch {
            // ignore label failure
          }
          continue;
        }

        const msg = `Failed to process email ${email.id} (${email.subject}): ${emailError}`;
        console.error(msg);
        errors.push(msg);
        try {
          await markEmailProcessed(email.id);
          emailsProcessed++;
        } catch {
          // ignore label failure
        }
      }
    }
  } catch (fetchError) {
    const msg = `Failed to fetch emails: ${fetchError}`;
    console.error(msg);
    errors.push(msg);
  }

  await prisma.emailSyncLog.update({
    where: { id: syncLog.id },
    data: {
      completedAt: new Date(),
      emailsFound,
      emailsProcessed,
      invoicesCreated,
      errors: errors.length > 0 ? errors.join("\n") : null,
      status: "COMPLETED",
    },
  });

  return { emailsFound, emailsProcessed, invoicesCreated, emailsSkipped, errors };
}

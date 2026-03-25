import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isGmailConfigured,
  fetchUnprocessedEmails,
  downloadAttachment,
  markEmailProcessed,
} from "@/lib/gmail";
import {
  isClaudeConfigured,
  extractPdfText,
  analyzeEmailWithClaude,
} from "@/lib/pdf-parser";
import { matchClient, mapPlatform } from "@/lib/invoice-matching";
import { matchLineItemsToMBAs } from "@/lib/mba-matching";

export const dynamic = "force-dynamic";

const MAX_EMAILS_PER_RUN = 100;

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check prerequisites
  if (!isGmailConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Gmail credentials not configured",
    });
  }

  if (!isClaudeConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Anthropic API key not configured",
    });
  }

  // Create sync log
  const syncLog = await prisma.emailSyncLog.create({ data: {} });

  const errors: string[] = [];
  let emailsFound = 0;
  let emailsProcessed = 0;
  let invoicesCreated = 0;
  let emailsSkipped = 0;

  try {
    const afterDate = request.nextUrl.searchParams.get("after") || undefined;
    const emails = await fetchUnprocessedEmails(MAX_EMAILS_PER_RUN, afterDate);
    emailsFound = emails.length;

    for (const email of emails) {
      try {
        // Prepare attachments for Claude — download and extract text from PDFs,
        // pass images as raw buffers for vision
        const attachmentData: {
          filename: string;
          mimeType: string;
          content: string | Buffer;
        }[] = [];

        for (const attachment of email.attachments) {
          try {
            const buffer = await downloadAttachment(
              email.id,
              attachment.attachmentId
            );

            if (attachment.mimeType === "application/pdf") {
              const pdfText = await extractPdfText(buffer);
              attachmentData.push({
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                content: pdfText,
              });
            } else if (attachment.mimeType.startsWith("image/")) {
              // Pass image buffer directly — Claude will use vision
              attachmentData.push({
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

        // Let Claude analyze the full email context + attachments
        const analysis = await analyzeEmailWithClaude(
          {
            subject: email.subject,
            from: email.from,
            bodyText: email.bodyText,
          },
          attachmentData
        );

        if (analysis.classification === "not_invoice") {
          console.log(
            `Skipped email ${email.id} (${email.subject}): ${analysis.reason}`
          );
          emailsSkipped++;
          await markEmailProcessed(email.id);
          emailsProcessed++;
          continue;
        }

        // It's an invoice — create a draft
        const parsed = analysis.invoice!;

        // Coerce numeric fields — Claude may return strings or null
        const totalAmount = Number(parsed.totalAmount) || 0;
        const invoiceDate = parsed.invoiceDate
          ? new Date(parsed.invoiceDate)
          : new Date();
        const invoiceNumber =
          String(parsed.invoiceNumber || "").trim() ||
          `EMAIL-${email.id}-${Date.now()}`;

        // Skip if date is invalid
        if (isNaN(invoiceDate.getTime())) {
          console.log(
            `Skipped email ${email.id}: invalid invoice date "${parsed.invoiceDate}"`
          );
          emailsSkipped++;
          await markEmailProcessed(email.id);
          emailsProcessed++;
          continue;
        }

        // Try to match client
        const matchedClient = await matchClient(parsed.clientName);

        // Coerce line item amounts
        const parsedLineItems = (parsed.lineItems || [])
          .filter((item) => item.campaignName)
          .map((item) => ({
            campaignName: String(item.campaignName),
            platform: item.platform ? String(item.platform) : null,
            amount: Number(item.amount) || 0,
            confidence: Number(item.confidence) || 0,
          }));

        // Auto-match line items to MBAs
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

        const invoice = await prisma.invoice.create({
          data: {
            vendor: mapPlatform(parsed.platform),
            invoiceNumber,
            invoiceDate,
            totalAmount,
            status: "DRAFT",
            sourceType: "EMAIL_PARSED",
            emailMessageId: email.id,
            emailSubject: email.subject,
            emailReceivedAt: email.receivedAt,
            parseConfidence: Number(parsed.overallConfidence) || 0,
            notes: matchedClient
              ? `Auto-matched client: ${matchedClient.name}`
              : parsed.clientName
                ? `Detected client: ${parsed.clientName} (no match found)`
                : undefined,
            lineItems: {
              create: lineItems,
            },
          },
        });

        invoicesCreated++;
        console.log(
          `Created draft invoice ${invoice.id} from email ${email.id} (${invoiceNumber})`
        );

        await markEmailProcessed(email.id);
        emailsProcessed++;
      } catch (emailError: unknown) {
        const errStr = String(emailError);

        // Handle duplicate invoice numbers gracefully
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

        // Still mark as processed to avoid retrying broken emails forever
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

  // Update sync log
  await prisma.emailSyncLog.update({
    where: { id: syncLog.id },
    data: {
      completedAt: new Date(),
      emailsFound,
      emailsProcessed,
      invoicesCreated,
      errors: errors.length > 0 ? errors.join("\n") : null,
      status: errors.length > 0 ? "COMPLETED" : "COMPLETED",
    },
  });

  return NextResponse.json({
    status: "completed",
    emailsFound,
    emailsProcessed,
    invoicesCreated,
    emailsSkipped,
    errors: errors.length,
  });
}

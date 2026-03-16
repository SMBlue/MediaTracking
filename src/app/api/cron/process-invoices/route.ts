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
  parseInvoiceWithClaude,
} from "@/lib/pdf-parser";
import { matchClient, mapPlatform } from "@/lib/invoice-matching";

export const dynamic = "force-dynamic";

const MAX_EMAILS_PER_RUN = 5;

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

  try {
    const emails = await fetchUnprocessedEmails(MAX_EMAILS_PER_RUN);
    emailsFound = emails.length;

    for (const email of emails) {
      try {
        // Process each PDF attachment
        for (const attachment of email.attachments) {
          try {
            const pdfBuffer = await downloadAttachment(
              email.id,
              attachment.attachmentId
            );
            const pdfText = await extractPdfText(pdfBuffer);
            const parsed = await parseInvoiceWithClaude(pdfText);

            // Try to match client
            const matchedClient = await matchClient(parsed.clientName);

            // Create draft invoice
            const invoice = await prisma.invoice.create({
              data: {
                vendor: mapPlatform(parsed.platform),
                invoiceNumber:
                  parsed.invoiceNumber || `EMAIL-${email.id}-${Date.now()}`,
                invoiceDate: parsed.invoiceDate
                  ? new Date(parsed.invoiceDate)
                  : new Date(),
                totalAmount: parsed.totalAmount,
                status: "DRAFT",
                sourceType: "EMAIL_PARSED",
                emailMessageId: email.id,
                emailSubject: email.subject,
                emailReceivedAt: email.receivedAt,
                parseConfidence: parsed.overallConfidence,
                notes: matchedClient
                  ? `Auto-matched client: ${matchedClient.name}`
                  : parsed.clientName
                    ? `Detected client: ${parsed.clientName} (no match found)`
                    : undefined,
                lineItems: {
                  create: parsed.lineItems.map((item) => ({
                    campaignName: item.campaignName,
                    platform: item.platform,
                    amount: item.amount,
                    confidence: item.confidence,
                    mbaId: undefined, // User maps MBAs during review
                  })),
                },
              },
            });

            invoicesCreated++;
            console.log(
              `Created draft invoice ${invoice.id} from email ${email.id}`
            );
          } catch (attachmentError) {
            const msg = `Failed to process attachment ${attachment.filename} from email ${email.id}: ${attachmentError}`;
            console.error(msg);
            errors.push(msg);
          }
        }

        // Mark email as processed even if some attachments failed
        await markEmailProcessed(email.id);
        emailsProcessed++;
      } catch (emailError) {
        const msg = `Failed to process email ${email.id}: ${emailError}`;
        console.error(msg);
        errors.push(msg);
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
    errors: errors.length,
  });
}

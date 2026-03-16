import { google } from "googleapis";
import { prisma } from "./db";

// Check if Gmail credentials are configured
export function isGmailConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );
}

function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  receivedAt: Date;
  attachments: { filename: string; mimeType: string; attachmentId: string }[];
}

/**
 * Fetch unprocessed emails with PDF attachments from the inbox.
 * Deduplicates against already-processed emailMessageIds in the DB.
 */
export async function fetchUnprocessedEmails(
  maxResults = 10
): Promise<EmailMessage[]> {
  if (!isGmailConfigured()) {
    return [];
  }

  const gmail = getGmailClient();

  // Search for emails with PDF attachments that haven't been labeled as processed
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "has:attachment filename:pdf -label:mba-tracker-processed",
    maxResults,
  });

  const messageIds = response.data.messages ?? [];
  if (messageIds.length === 0) return [];

  // Check which ones we've already processed
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      emailMessageId: { in: messageIds.map((m) => m.id!).filter(Boolean) },
    },
    select: { emailMessageId: true },
  });
  const processedIds = new Set(
    existingInvoices.map((i) => i.emailMessageId).filter(Boolean)
  );

  const emails: EmailMessage[] = [];

  for (const msg of messageIds) {
    if (!msg.id || processedIds.has(msg.id)) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.data.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const dateStr = headers.find((h) => h.name === "Date")?.value;
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    // Find PDF attachments
    const attachments: EmailMessage["attachments"] = [];
    const parts = full.data.payload?.parts ?? [];
    for (const part of parts) {
      if (
        part.mimeType === "application/pdf" &&
        part.body?.attachmentId &&
        part.filename
      ) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          attachmentId: part.body.attachmentId,
        });
      }
    }

    if (attachments.length > 0) {
      emails.push({
        id: msg.id,
        subject,
        from,
        receivedAt,
        attachments,
      });
    }
  }

  return emails;
}

/**
 * Download a PDF attachment as a Buffer.
 */
export async function downloadAttachment(
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = getGmailClient();

  const response = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  const data = response.data.data;
  if (!data) throw new Error("Empty attachment data");

  // Gmail returns base64url-encoded data
  return Buffer.from(data, "base64url");
}

/**
 * Mark an email as processed by adding a label.
 * Creates the label if it doesn't exist.
 */
export async function markEmailProcessed(messageId: string): Promise<void> {
  const gmail = getGmailClient();
  const labelName = "mba-tracker-processed";

  // Find or create the label
  const labels = await gmail.users.labels.list({ userId: "me" });
  let label = labels.data.labels?.find((l) => l.name === labelName);

  if (!label) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    label = created.data;
  }

  if (label?.id) {
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: [label.id],
      },
    });
  }
}

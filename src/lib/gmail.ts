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

// Supported attachment types for invoice parsing
const PARSEABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
}

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  bodyText: string;
  receivedAt: Date;
  attachments: EmailAttachment[];
}

/**
 * Extract plain text body from Gmail message parts (recursive).
 */
function extractBodyText(
  parts: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: typeof parts }[] | undefined
): string {
  if (!parts) return "";

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    // Recurse into multipart
    if (part.parts) {
      const nested = extractBodyText(part.parts as typeof parts);
      if (nested) return nested;
    }
  }
  return "";
}

/**
 * Fetch unprocessed emails with attachments from the inbox.
 * Supports PDFs, images, and other parseable document types.
 * Deduplicates against already-processed emailMessageIds in the DB.
 */
export async function fetchUnprocessedEmails(
  maxResults = 10,
  afterDate?: string // YYYY/MM/DD format for Gmail search
): Promise<EmailMessage[]> {
  if (!isGmailConfigured()) {
    return [];
  }

  const gmail = getGmailClient();

  // Search for emails with PDF attachments that haven't been labeled as processed
  // Pre-filters to reduce Claude API calls:
  //   - Require PDF attachment (skip signature PNGs)
  //   - Exclude reply threads (internal conversations)
  //   - Exclude close-out emails (MBA close-out docs, not invoices)
  let query =
    "has:attachment filename:pdf -label:mba-tracker-processed -subject:Re: -subject:(Close out) -subject:(close out)";
  if (afterDate) {
    query += ` after:${afterDate}`;
  }

  // Paginate through all results
  const messageIds: { id?: string | null }[] = [];
  let pageToken: string | undefined;
  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(maxResults, 100),
      pageToken,
    });
    if (response.data.messages) messageIds.push(...response.data.messages);
    pageToken = response.data.nextPageToken ?? undefined;
    // Stop if we've hit the requested limit
    if (messageIds.length >= maxResults) break;
  } while (pageToken);

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
    const to = headers.find((h) => h.name === "To")?.value ?? "";
    const dateStr = headers.find((h) => h.name === "Date")?.value;
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    // Extract email body text
    const parts = full.data.payload?.parts ?? [];
    let bodyText = "";
    // Check if body is directly on payload (non-multipart)
    if (full.data.payload?.body?.data) {
      bodyText = Buffer.from(full.data.payload.body.data, "base64url").toString("utf-8");
    } else {
      bodyText = extractBodyText(parts as Parameters<typeof extractBodyText>[0]);
    }

    // Find parseable attachments (PDFs, images)
    const attachments: EmailAttachment[] = [];
    for (const part of parts) {
      if (
        part.mimeType &&
        PARSEABLE_MIME_TYPES.has(part.mimeType) &&
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

    // Include emails even without attachments — the body itself may contain invoice info
    emails.push({
      id: msg.id,
      subject,
      from,
      to,
      bodyText: bodyText.slice(0, 3000), // Limit body size
      receivedAt,
      attachments,
    });
  }

  return emails;
}

/**
 * Download an attachment as a Buffer.
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

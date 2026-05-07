/**
 * Gmail integration for the contracts mailbox (mediareconbot@bluestate.co).
 * Mirrors the patterns in src/lib/gmail.ts but for the contracts inbox.
 *
 * The contracts mailbox is a member of the contracts@ Google Group, so it
 * receives copies of every contract email distributed to the group.
 */

import { google } from "googleapis";
import { prisma } from "../db";

const PROCESSED_LABEL = "mba-tracker-contract-processed";

export function isContractsGmailConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.CONTRACTS_GMAIL_REFRESH_TOKEN
  );
}

function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.CONTRACTS_GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export interface ContractAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
}

export interface ContractEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  bodyText: string;
  receivedAt: Date;
  attachments: ContractAttachment[];
}

function extractBodyText(
  parts:
    | {
        mimeType?: string | null;
        body?: { data?: string | null } | null;
        parts?: typeof parts;
      }[]
    | undefined
): string {
  if (!parts) return "";
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) {
      const nested = extractBodyText(part.parts as typeof parts);
      if (nested) return nested;
    }
  }
  return "";
}

/**
 * Fetch unprocessed contract emails. Filters:
 * - To: contracts@bluestate.co (group address — confirms it came from the group, not direct mail)
 * - Has PDF attachment
 * - Not already labeled as processed
 */
export async function fetchUnprocessedContracts(
  maxResults = 25
): Promise<ContractEmail[]> {
  if (!isContractsGmailConfigured()) return [];

  const gmail = getGmailClient();
  const query = `to:contracts@bluestate.co has:attachment filename:pdf -label:${PROCESSED_LABEL}`;

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
    if (messageIds.length >= maxResults) break;
  } while (pageToken);

  if (messageIds.length === 0) return [];

  // Dedup against MBAs already created from these emails
  const existing = await prisma.mBA.findMany({
    where: {
      contractEmailId: { in: messageIds.map((m) => m.id!).filter(Boolean) },
    },
    select: { contractEmailId: true, contractAttachmentId: true },
  });
  const processedKeys = new Set(
    existing.map(
      (e) => `${e.contractEmailId}|${e.contractAttachmentId}`
    )
  );

  const emails: ContractEmail[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

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

    const parts = full.data.payload?.parts ?? [];
    let bodyText = "";
    if (full.data.payload?.body?.data) {
      bodyText = Buffer.from(
        full.data.payload.body.data,
        "base64url"
      ).toString("utf-8");
    } else {
      bodyText = extractBodyText(
        parts as Parameters<typeof extractBodyText>[0]
      );
    }

    // Walk all parts (including nested) to find PDF attachments
    const attachments: ContractAttachment[] = [];
    type GmailPart = NonNullable<typeof full.data.payload>["parts"];
    function walkAttachments(parts: GmailPart) {
      if (!parts) return;
      for (const p of parts) {
        if (
          p.mimeType === "application/pdf" &&
          p.body?.attachmentId &&
          p.filename
        ) {
          attachments.push({
            filename: p.filename,
            mimeType: p.mimeType,
            attachmentId: p.body.attachmentId,
          });
        }
        if (p.parts) walkAttachments(p.parts);
      }
    }
    walkAttachments(full.data.payload?.parts);

    // Filter out attachments already processed
    const unprocessed = attachments.filter(
      (a) => !processedKeys.has(`${msg.id}|${a.attachmentId}`)
    );

    if (unprocessed.length === 0) continue;

    emails.push({
      id: msg.id,
      subject,
      from,
      to,
      bodyText: bodyText.slice(0, 5000),
      receivedAt,
      attachments: unprocessed,
    });
  }

  return emails;
}

export async function downloadContractAttachment(
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
  return Buffer.from(data, "base64url");
}

/** Label an email as processed so we don't re-fetch it. */
export async function markContractEmailProcessed(
  messageId: string
): Promise<void> {
  const gmail = getGmailClient();
  const labels = await gmail.users.labels.list({ userId: "me" });
  let label = labels.data.labels?.find((l) => l.name === PROCESSED_LABEL);
  if (!label) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: PROCESSED_LABEL,
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
      requestBody: { addLabelIds: [label.id] },
    });
  }
}

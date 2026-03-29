/**
 * Removes the "mba-tracker-processed" label from emails that were labeled
 * but never actually analyzed (e.g., due to API credit exhaustion).
 *
 * These emails have a Gmail label but no corresponding Invoice record in the DB.
 * After running this, the next cron job will re-fetch and re-analyze them.
 *
 * Usage: node scripts/unlabel-failed-emails.mjs [--dry-run]
 */

import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// Find the label
const labelsRes = await gmail.users.labels.list({ userId: "me" });
const label = labelsRes.data.labels?.find(
  (l) => l.name === "mba-tracker-processed"
);
if (!label?.id) {
  console.log("Label 'mba-tracker-processed' not found");
  process.exit(0);
}

// Get all labeled emails
const messageIds = [];
let pageToken;
do {
  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: [label.id],
    maxResults: 500,
    pageToken,
  });
  if (res.data.messages) messageIds.push(...res.data.messages);
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);

console.log(`Found ${messageIds.length} emails with processed label`);

// Check which ones have an invoice in our DB
const existingInvoices = await prisma.invoice.findMany({
  where: {
    emailMessageId: {
      in: messageIds.map((m) => m.id).filter(Boolean),
    },
  },
  select: { emailMessageId: true },
});
const hasInvoice = new Set(
  existingInvoices.map((i) => i.emailMessageId).filter(Boolean)
);

// Find emails that were labeled but have no invoice (failed processing)
const failedIds = messageIds
  .map((m) => m.id)
  .filter(Boolean)
  .filter((id) => !hasInvoice.has(id));

console.log(
  `${hasInvoice.size} emails have invoices, ${failedIds.length} were labeled but never analyzed`
);

if (failedIds.length === 0) {
  console.log("Nothing to unlabel");
  await prisma.$disconnect();
  process.exit(0);
}

if (dryRun) {
  console.log(`[DRY RUN] Would remove label from ${failedIds.length} emails`);
  await prisma.$disconnect();
  process.exit(0);
}

// Remove label in batches
let unlabeled = 0;
for (const id of failedIds) {
  try {
    await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: [label.id] },
    });
    unlabeled++;
    if (unlabeled % 50 === 0) {
      console.log(`  Unlabeled ${unlabeled}/${failedIds.length}...`);
    }
  } catch (err) {
    console.error(`Failed to unlabel ${id}: ${err.message}`);
  }
}

console.log(`Done. Removed label from ${unlabeled} emails.`);
console.log("Run the cron job to re-process them once API credits are restored.");

await prisma.$disconnect();

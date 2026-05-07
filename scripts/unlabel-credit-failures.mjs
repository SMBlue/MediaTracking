/**
 * Removes the "mba-tracker-processed" label ONLY from emails that failed
 * due to Anthropic API credit exhaustion. Extracts email IDs from sync
 * log error messages.
 *
 * Usage: node scripts/unlabel-credit-failures.mjs [--dry-run]
 */

import "dotenv/config";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

// Find sync logs with credit errors
const logs = await prisma.emailSyncLog.findMany({
  where: { errors: { contains: "credit balance" } },
  select: { errors: true },
});

// Extract email IDs from error messages
const failedIds = new Set();
for (const log of logs) {
  if (!log.errors) continue;
  for (const line of log.errors.split("\n")) {
    if (line.includes("credit balance")) {
      const match = line.match(/email (\w+)/);
      if (match) failedIds.add(match[1]);
    }
  }
}

console.log(`Found ${failedIds.size} emails that failed due to credit exhaustion`);

if (failedIds.size === 0) {
  await prisma.$disconnect();
  process.exit(0);
}

if (dryRun) {
  console.log(`[DRY RUN] Would remove label from ${failedIds.size} emails`);
  await prisma.$disconnect();
  process.exit(0);
}

// Set up Gmail client
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
  await prisma.$disconnect();
  process.exit(1);
}

// Remove label from failed emails
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
      console.log(`  Unlabeled ${unlabeled}/${failedIds.size}...`);
    }
  } catch (err) {
    console.error(`Failed to unlabel ${id}: ${err.message}`);
  }
}

console.log(`Done. Removed label from ${unlabeled} emails.`);
console.log("Run the cron job to re-process them.");

await prisma.$disconnect();

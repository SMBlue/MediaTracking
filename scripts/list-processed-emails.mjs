import "dotenv/config";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth: oauth2Client });

const labels = await gmail.users.labels.list({ userId: "me" });
const label = labels.data.labels?.find((l) => l.name === "mba-tracker-processed");
if (!label) {
  console.log("No processed label found");
  process.exit(0);
}

let messages = [];
let pageToken;
do {
  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: [label.id],
    maxResults: 100,
    pageToken,
  });
  if (res.data.messages) messages.push(...res.data.messages);
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`Total processed emails: ${messages.length}\n`);

// Check which ones became invoices
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const invoices = await prisma.invoice.findMany({
  where: { sourceType: "EMAIL_PARSED" },
  select: { emailMessageId: true, invoiceNumber: true },
});
const invoiceMap = new Map(invoices.map((i) => [i.emailMessageId, i.invoiceNumber]));

for (const msg of messages) {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: msg.id,
    format: "full",
  });
  const headers = full.data.payload?.headers ?? [];
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
  const from = headers.find((h) => h.name === "From")?.value ?? "";
  const date = headers.find((h) => h.name === "Date")?.value ?? "";

  // Check attachments
  const parts = full.data.payload?.parts ?? [];
  const attachments = parts
    .filter((p) => p.filename && p.body?.attachmentId)
    .map((p) => p.filename);

  const status = invoiceMap.has(msg.id)
    ? `✓ INVOICE (${invoiceMap.get(msg.id)})`
    : "✗ SKIPPED";

  console.log(`${status}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  From: ${from}`);
  console.log(`  Date: ${date}`);
  console.log(`  Attachments: ${attachments.length > 0 ? attachments.join(", ") : "none"}`);
  console.log();
}

await prisma.$disconnect();

import "dotenv/config";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: "v1", auth: oauth2Client });

const query = process.argv[2] || "from:payments-noreply@google.com after:2026/01/01";
console.log(`Searching: ${query}\n`);

let messages = [];
let pageToken;
do {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
    pageToken,
  });
  if (res.data.messages) messages.push(...res.data.messages);
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`Found ${messages.length} emails\n`);

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

  const parts = full.data.payload?.parts ?? [];
  const attachments = parts
    .filter((p) => p.filename && p.body?.attachmentId)
    .map((p) => `${p.filename} (${p.mimeType})`);

  // Check labels
  const labelIds = full.data.labelIds ?? [];
  const isProcessed = labelIds.some((l) => l === "Label_27");

  console.log(`${isProcessed ? "[PROCESSED]" : "[NEW]"} ${msg.id}`);
  console.log(`  Date: ${date}`);
  console.log(`  From: ${from}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Attachments: ${attachments.length > 0 ? attachments.join(", ") : "none"}`);
  console.log();
}

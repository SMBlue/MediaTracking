/**
 * Run the contracts sync directly (bypassing the cron endpoint).
 * Replicates src/lib/contracts/sync.ts but in plain ESM so we can run it
 * without spinning up the dev server.
 */

import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

const prisma = new PrismaClient();

const PROCESSED_LABEL = "mba-tracker-contract-processed";

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

const SYSTEM_PROMPT = `You are extracting structured data from a Media Buying Agreement (MBA) contract for Blue State, a digital marketing agency.

Your job:
1. Determine whether the attached PDF is a signed MBA contract.
2. If yes, extract the structured fields below.

A signed MBA typically includes:
- A specific client name (e.g., "Michael J. Fox Foundation", "AARP", "Airbnb")
- A project name describing the scope or campaign (e.g., "PPMI BLAAC PD May-June FY26")
- Budget / fees / total contract value
- Service period (start and end dates)
- Project lead at Blue State (often listed as "Project Lead" or "Account Lead")

NOT contracts: invoices, change orders, status reports, internal correspondence.

EXTRACT (use null when not present):
- clientName: The client's organization name as written on the contract
- projectName: The full project / campaign / MBA name
- budget: Total contract value in dollars (numeric only, no $ or commas)
- currency: ISO currency code, default "USD"
- startDate: Project start date in YYYY-MM-DD format
- endDate: Project end date in YYYY-MM-DD format
- projectLead: Name of BSD project lead (or null)
- notes: 1-sentence scope summary
- overallConfidence: 0.0-1.0, how confident you are in the extracted data

Return JSON only:
{
  "classification": "contract" | "not_contract",
  "reason": "...",
  "contract": null  // when not_contract
  // OR full ParsedContract object when classification = contract
}`;

async function fetchEmails(gmail, max = 10) {
  const list = await gmail.users.messages.list({
    userId: "me",
    q: `to:contracts@bluestate.co has:attachment filename:pdf -label:${PROCESSED_LABEL}`,
    maxResults: max,
  });
  return list.data.messages || [];
}

function walkParts(parts, attachments) {
  if (!parts) return;
  for (const p of parts) {
    if (p.mimeType === "application/pdf" && p.body?.attachmentId && p.filename) {
      attachments.push({
        filename: p.filename,
        attachmentId: p.body.attachmentId,
      });
    }
    if (p.parts) walkParts(p.parts, attachments);
  }
}

function extractBodyText(parts) {
  if (!parts) return "";
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      return Buffer.from(p.body.data, "base64url").toString("utf-8");
    }
    if (p.parts) {
      const nested = extractBodyText(p.parts);
      if (nested) return nested;
    }
  }
  return "";
}

async function parseContract(pdfBuffer, filename, emailContext) {
  const anthropic = new Anthropic();
  const pdfText = (await pdfParse(pdfBuffer)).text;

  const userPrompt = `EMAIL CONTEXT:
From: ${emailContext.from}
Subject: ${emailContext.subject}
${emailContext.bodyText ? `\nEmail body:\n${emailContext.bodyText.slice(0, 2000)}` : ""}

ATTACHMENT FILENAME: ${filename}

PDF TEXT:
${pdfText.slice(0, 50000)}

Analyze and return JSON only.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content.find((b) => b.type === "text");
  let raw = block.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  return JSON.parse(raw);
}

(async () => {
  const gmail = getGmailClient();
  const messages = await fetchEmails(gmail);
  console.log(`Found ${messages.length} unprocessed messages\n`);

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });
    const headers = Object.fromEntries(
      full.data.payload.headers.map((h) => [h.name, h.value])
    );
    console.log("=== Email:", headers.Subject, "===");
    console.log("  From:", headers.From);

    const attachments = [];
    walkParts(full.data.payload?.parts, attachments);
    let bodyText = "";
    if (full.data.payload.body?.data) {
      bodyText = Buffer.from(full.data.payload.body.data, "base64url").toString("utf-8");
    } else {
      bodyText = extractBodyText(full.data.payload.parts);
    }

    console.log(`  Attachments: ${attachments.length}`);

    for (const att of attachments) {
      console.log(`\n  -- ${att.filename}`);
      try {
        const dl = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: msg.id,
          id: att.attachmentId,
        });
        const buffer = Buffer.from(dl.data.data, "base64url");
        console.log(`     Downloaded ${buffer.length} bytes`);

        const analysis = await parseContract(buffer, att.filename, {
          from: headers.From,
          subject: headers.Subject,
          bodyText,
        });
        console.log(`     Classification: ${analysis.classification}`);
        console.log(`     Reason: ${analysis.reason}`);
        if (analysis.contract) {
          console.log("     Parsed:", JSON.stringify(analysis.contract, null, 2).split("\n").map(l => "       " + l).join("\n"));
        }
      } catch (err) {
        console.log(`     ERROR: ${err.message?.slice(0, 200)}`);
      }
    }
  }

  await prisma.$disconnect();
})();

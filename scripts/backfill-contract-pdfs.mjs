/**
 * One-time backfill: pull contract PDFs from Gmail for MBAs that already have
 * contractEmailId + contractAttachmentId but no contractPdfPath, and upload
 * them to the mba-contracts Supabase Storage bucket.
 *
 * Requires env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, CONTRACTS_GMAIL_REFRESH_TOKEN,
 *               NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-contract-pdfs.mjs [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "mba-contracts";
const dryRun = process.argv.includes("--dry-run");

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

async function findAttachmentFilename(gmail, messageId, attachmentId) {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  let found = null;
  function walk(parts) {
    if (!parts || found) return;
    for (const p of parts) {
      if (p.body?.attachmentId === attachmentId && p.filename) {
        found = p.filename;
        return;
      }
      if (p.parts) walk(p.parts);
    }
  }
  walk(full.data.payload?.parts);
  return found ?? `contract-${messageId}.pdf`;
}

async function main() {
  const candidates = await prisma.mBA.findMany({
    where: {
      contractEmailId: { not: null },
      contractAttachmentId: { not: null },
      contractPdfPath: null,
    },
    select: {
      id: true,
      mbaNumber: true,
      contractEmailId: true,
      contractAttachmentId: true,
    },
  });

  console.log(
    `Found ${candidates.length} MBA(s) needing PDF backfill${dryRun ? " (dry-run)" : ""}`
  );

  if (candidates.length === 0) return;

  const gmail = getGmailClient();
  let ok = 0;
  let failed = 0;

  for (const mba of candidates) {
    try {
      const filename = await findAttachmentFilename(
        gmail,
        mba.contractEmailId,
        mba.contractAttachmentId
      );

      const response = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: mba.contractEmailId,
        id: mba.contractAttachmentId,
      });
      const data = response.data.data;
      if (!data) throw new Error("Empty attachment");
      const buffer = Buffer.from(data, "base64url");

      const path = `${mba.id}/${safeFilename(filename)}`;

      if (dryRun) {
        console.log(
          `[dry-run] would upload ${mba.mbaNumber} → ${path} (${buffer.byteLength} bytes)`
        );
        ok++;
        continue;
      }

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadErr) throw new Error(uploadErr.message);

      await prisma.mBA.update({
        where: { id: mba.id },
        data: {
          contractPdfPath: path,
          contractPdfFilename: filename,
          contractPdfSize: buffer.byteLength,
          contractPdfUploadedAt: new Date(),
        },
      });

      console.log(`✓ ${mba.mbaNumber} → ${path} (${buffer.byteLength} bytes)`);
      ok++;
    } catch (err) {
      console.error(`✗ ${mba.mbaNumber}: ${err.message ?? err}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${failed} failed.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

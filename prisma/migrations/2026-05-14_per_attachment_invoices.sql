-- Per-attachment invoice fan-out
-- Today Invoice.emailMessageId is @unique, meaning a Gmail message with
-- multiple PDF attachments collapses to one Invoice. Move uniqueness to
-- the compound (emailMessageId, attachmentFilename) so each attachment
-- becomes its own row. Body-only invoices keep attachmentFilename NULL.
--
-- Apply via Supabase SQL editor, MCP apply_migration, or psql.
--
-- BEFORE APPLYING: confirm no rows would collide. The query below should
-- return zero rows in production today.
--
--   SELECT "emailMessageId", count(*)
--   FROM "Invoice"
--   WHERE "emailMessageId" IS NOT NULL
--   GROUP BY 1 HAVING count(*) > 1;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "attachmentFilename" TEXT;

ALTER TABLE "Invoice"
  DROP CONSTRAINT IF EXISTS "Invoice_emailMessageId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_emailMessageId_attachmentFilename_key"
  ON "Invoice"("emailMessageId", "attachmentFilename");

CREATE INDEX IF NOT EXISTS "Invoice_emailMessageId_idx"
  ON "Invoice"("emailMessageId");

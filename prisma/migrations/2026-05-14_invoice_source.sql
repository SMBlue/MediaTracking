-- Persist the original invoice source so the detail page can show it.
-- Mirrors the mba-contracts pattern: PDFs go to a private Supabase
-- Storage bucket, body-only invoices (when the vendor sends the
-- invoice in the email body itself) store the text directly.
--
-- Apply via Supabase SQL editor, MCP apply_migration, or psql.

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "sourcePdfPath"       TEXT,
  ADD COLUMN IF NOT EXISTS "sourcePdfFilename"   TEXT,
  ADD COLUMN IF NOT EXISTS "sourcePdfSize"       INTEGER,
  ADD COLUMN IF NOT EXISTS "sourceEmailBodyText" TEXT;

-- Private storage bucket for invoice PDFs. 50 MB cap, PDFs only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-sources',
  'invoice-sources',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

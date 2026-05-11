-- Persisted contract PDF on MBA
-- Apply via Supabase SQL editor, MCP apply_migration, or psql.

ALTER TABLE "MBA"
  ADD COLUMN IF NOT EXISTS "contractPdfPath"       TEXT,
  ADD COLUMN IF NOT EXISTS "contractPdfFilename"   TEXT,
  ADD COLUMN IF NOT EXISTS "contractPdfSize"       INTEGER,
  ADD COLUMN IF NOT EXISTS "contractPdfUploadedAt" TIMESTAMP(3);

-- Storage bucket for contract PDFs (private; access via signed URLs only).
-- File size limit: 50 MB. Allowed MIME: application/pdf.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mba-contracts',
  'mba-contracts',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Surface detected client/vendor from invoice parsing as first-class columns
-- instead of stuffing them into Invoice.notes. Add an alias array on Client
-- so the matching service can resolve vendor-written variants ("MJFF",
-- "Michael J Fox Foundation") to the canonical Client.name.
--
-- Apply via Supabase SQL editor, MCP apply_migration, or psql.

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "detectedClientId"   TEXT,
  ADD COLUMN IF NOT EXISTS "detectedClientName" TEXT,
  ADD COLUMN IF NOT EXISTS "detectedVendorName" TEXT;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_detectedClientId_fkey"
  FOREIGN KEY ("detectedClientId") REFERENCES "Client"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Invoice_detectedClientId_idx"
  ON "Invoice"("detectedClientId");

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "nameAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

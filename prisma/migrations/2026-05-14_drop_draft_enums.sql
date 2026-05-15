-- Drop DRAFT from InvoiceStatus and MBAStatus enums.
--
-- DEPENDENCIES: this migration is a follow-up to PR #10 + PR #11. Do
-- not apply it until those have been in production long enough that
-- no DRAFT rows remain. Run the pre-flight check below first.
--
-- Pre-flight (must return zero rows for each query):
--
--   SELECT count(*) FROM "Invoice" WHERE status = 'DRAFT';
--   SELECT count(*) FROM "MBA"     WHERE status = 'DRAFT';
--
-- Postgres does not support DROP VALUE on an enum. The classical
-- workaround is: create a replacement type, swap the column, drop the
-- old type, rename. We do this inside a single transaction.

BEGIN;

-- Hard guard: refuse to run if any DRAFT data remains. Pulled out of
-- the column rewrite below so the error message is obvious.
DO $$
DECLARE
  remaining_invoice_drafts INT;
  remaining_mba_drafts INT;
BEGIN
  SELECT count(*) INTO remaining_invoice_drafts FROM "Invoice" WHERE status::text = 'DRAFT';
  SELECT count(*) INTO remaining_mba_drafts FROM "MBA" WHERE status::text = 'DRAFT';
  IF remaining_invoice_drafts > 0 THEN
    RAISE EXCEPTION 'Refusing to drop InvoiceStatus.DRAFT: % rows still carry it', remaining_invoice_drafts;
  END IF;
  IF remaining_mba_drafts > 0 THEN
    RAISE EXCEPTION 'Refusing to drop MBAStatus.DRAFT: % rows still carry it', remaining_mba_drafts;
  END IF;
END $$;

-- InvoiceStatus: { DRAFT, CONFIRMED } → { CONFIRMED }
CREATE TYPE "InvoiceStatus_new" AS ENUM ('CONFIRMED');

ALTER TABLE "Invoice"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "InvoiceStatus_new"
    USING ("status"::text::"InvoiceStatus_new"),
  ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

DROP TYPE "InvoiceStatus";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";

-- MBAStatus: { DRAFT, ACTIVE, RECONCILING, CLOSED } → { ACTIVE, RECONCILING, CLOSED }
CREATE TYPE "MBAStatus_new" AS ENUM ('ACTIVE', 'RECONCILING', 'CLOSED');

ALTER TABLE "MBA"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "MBAStatus_new"
    USING ("status"::text::"MBAStatus_new"),
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "MBAStatus";
ALTER TYPE "MBAStatus_new" RENAME TO "MBAStatus";

COMMIT;

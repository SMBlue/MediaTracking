-- MBA Tracker Database Setup for Supabase
-- Run this in the Supabase SQL Editor

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE "MBAStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "Platform" AS ENUM ('GOOGLE_ADS', 'META', 'BING', 'TIKTOK', 'LINKEDIN', 'OTHER');

-- ============================================
-- NextAuth Tables (for Google SSO)
-- ============================================

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- ============================================
-- Application Tables
-- ============================================

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MBA" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mbaNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budget" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "MBAStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MBA_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MBA_mbaNumber_key" ON "MBA"("mbaNumber");

CREATE TABLE "SpendEntry" (
    "id" TEXT NOT NULL,
    "mbaId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "period" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpendEntry_mbaId_platform_period_key" ON "SpendEntry"("mbaId", "platform", "period");

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "vendor" "Platform" NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_vendor_invoiceNumber_key" ON "Invoice"("vendor", "invoiceNumber");

CREATE TABLE "InvoiceAllocation" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "mbaId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceAllocation_invoiceId_mbaId_key" ON "InvoiceAllocation"("invoiceId", "mbaId");

-- ============================================
-- Foreign Key Constraints
-- ============================================

-- NextAuth foreign keys
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application foreign keys
ALTER TABLE "MBA" ADD CONSTRAINT "MBA_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpendEntry" ADD CONSTRAINT "SpendEntry_mbaId_fkey"
    FOREIGN KEY ("mbaId") REFERENCES "MBA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpendEntry" ADD CONSTRAINT "SpendEntry_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceAllocation" ADD CONSTRAINT "InvoiceAllocation_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceAllocation" ADD CONSTRAINT "InvoiceAllocation_mbaId_fkey"
    FOREIGN KEY ("mbaId") REFERENCES "MBA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Helper function for auto-updating updatedAt
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updatedAt
CREATE TRIGGER update_client_updated_at BEFORE UPDATE ON "Client"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mba_updated_at BEFORE UPDATE ON "MBA"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spend_entry_updated_at BEFORE UPDATE ON "SpendEntry"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoice_updated_at BEFORE UPDATE ON "Invoice"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CUID generation function (for Prisma compatibility)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION generate_cuid()
RETURNS TEXT AS $$
DECLARE
    timestamp_part TEXT;
    random_part TEXT;
BEGIN
    timestamp_part := lpad(to_hex(floor(extract(epoch from now()) * 1000)::bigint), 12, '0');
    random_part := encode(gen_random_bytes(12), 'hex');
    RETURN 'c' || substring(timestamp_part from 1 for 8) || substring(random_part from 1 for 16);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Done! Your database is ready.
-- ============================================

-- Next steps:
-- 1. Copy your Supabase database URL from Settings > Database > Connection string (URI)
-- 2. Add it to your .env file as DATABASE_URL
-- 3. Run: npx prisma generate
-- 4. Your app should now connect to Supabase!

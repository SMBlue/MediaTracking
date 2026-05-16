#!/usr/bin/env -S npx tsx
/**
 * One-off backfill: run syncInvoices() locally against prod DB.
 *
 * Mirrors scripts/backfill-contracts.ts — needed because the prod cron
 * has been crashing with pdf-parse ENOENT since 2026-05-08. The fix
 * shipped, but waiting for the 4h cron is a long wait. This script
 * uses the local .env credentials, which point at the same production
 * Supabase DB.
 *
 * Run:  npx tsx scripts/backfill-invoices.ts
 */

import "dotenv/config";

async function main() {
  const { syncInvoices } = await import("../src/lib/invoices/sync");
  console.log("Starting invoices backfill...");
  const before = Date.now();
  const result = await syncInvoices({ maxEmailsPerRun: 100 });
  const elapsedMs = Date.now() - before;
  console.log(`\nDone in ${(elapsedMs / 1000).toFixed(1)}s:`);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) {
    console.error(`\n${result.errors.length} errors:`);
    for (const err of result.errors) console.error(`  - ${err}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

#!/usr/bin/env -S npx tsx
/**
 * One-off backfill: run syncContracts() locally against prod DB.
 *
 * Needed because the prod cron has been crashing with the pdf-parse ENOENT
 * since 2026-05-08. The fix has shipped (commit af8bf1c) but the next
 * scheduled cron at 00:00 UTC is a long wait. This script runs the same
 * sync logic right now using the local .env credentials, which point at
 * the same production Supabase DB.
 *
 * Run:  npx tsx scripts/backfill-contracts.ts
 */

import "dotenv/config";

async function main() {
  const { syncContracts } = await import("../src/lib/contracts/sync");
  console.log("Starting contracts backfill...");
  const before = Date.now();
  const result = await syncContracts();
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

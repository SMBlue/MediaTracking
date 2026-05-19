#!/usr/bin/env -S npx tsx
/**
 * Re-run the client matcher against existing invoices that have a
 * detectedClientName but no detectedClientId. Useful after adding
 * aliases to Client rows — picks up rows that previously failed to
 * match.
 *
 * No Claude calls, no Gmail. Pure DB + the pure matcher.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchClientFromString } from "../src/lib/parsing/match-client";

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, nameAliases: true },
  });
  console.log(`Loaded ${clients.length} clients with aliases`);

  const candidates = await prisma.invoice.findMany({
    where: {
      detectedClientId: null,
      detectedClientName: { not: null },
    },
    select: { id: true, detectedClientName: true },
  });
  console.log(`${candidates.length} unmatched-but-named invoices to consider`);

  let matched = 0;
  const byClient = new Map<string, number>();

  for (const inv of candidates) {
    const hit = matchClientFromString(inv.detectedClientName, clients);
    if (!hit) continue;
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        detectedClientId: hit.clientId,
        detectedClientName: hit.canonicalName,
      },
    });
    matched++;
    byClient.set(hit.canonicalName, (byClient.get(hit.canonicalName) ?? 0) + 1);
  }

  console.log(`\nMatched ${matched} of ${candidates.length} invoices:`);
  for (const [name, count] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

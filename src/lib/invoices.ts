/**
 * Query helpers for the Invoice list and overview alerts.
 *
 * Treats an invoice as "unallocated" when its sum of allocations is
 * less than its total amount minus a sub-cent tolerance. Fully
 * allocated invoices are excluded — they're done from the media
 * planner's perspective. Drives the unallocated banner on the overview
 * page (PR #20) and the "needs allocation" filter on the invoice list.
 */

import { prisma } from "./db";

const ALLOCATION_TOLERANCE = 0.005;

export type UnallocatedSummary = {
  count: number;
  unallocatedAmount: number;
};

export async function getUnallocatedInvoices(): Promise<UnallocatedSummary> {
  const invoices = await prisma.invoice.findMany({
    where: {
      // DRAFT is being retired in PR #22; until then, only count
      // confirmed invoices in the alert.
      status: "CONFIRMED",
    },
    select: {
      totalAmount: true,
      allocations: { select: { amount: true } },
    },
  });

  let count = 0;
  let unallocatedAmount = 0;

  for (const inv of invoices) {
    const allocated = inv.allocations.reduce(
      (sum, a) => sum + Number(a.amount),
      0
    );
    const total = Number(inv.totalAmount);
    const remaining = total - allocated;
    if (remaining > ALLOCATION_TOLERANCE) {
      count++;
      unallocatedAmount += remaining;
    }
  }

  return { count, unallocatedAmount };
}

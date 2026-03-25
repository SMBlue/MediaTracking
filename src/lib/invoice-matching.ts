import { prisma } from "./db";

/**
 * Try to match a parsed client name to an existing client in the database.
 * Uses case-insensitive substring matching.
 */
export async function matchClient(
  clientName: string | null
): Promise<{ id: string; name: string } | null> {
  if (!clientName) return null;

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
  });

  const normalized = clientName.toLowerCase().trim();

  // Exact match first
  const exact = clients.find(
    (c) => c.name.toLowerCase().trim() === normalized
  );
  if (exact) return exact;

  // Substring match (client name appears in parsed name or vice versa)
  const partial = clients.find(
    (c) =>
      normalized.includes(c.name.toLowerCase().trim()) ||
      c.name.toLowerCase().trim().includes(normalized)
  );
  if (partial) return partial;

  return null;
}

/**
 * Sync InvoiceAllocation records to match the current line item → MBA assignments.
 * Groups line items by mbaId, sums amounts, and upserts/deletes allocations accordingly.
 */
export async function syncInvoiceAllocations(
  invoiceId: string
): Promise<void> {
  const lineItems = await prisma.vendorInvoiceLineItem.findMany({
    where: { invoiceId, mbaId: { not: null } },
    select: { mbaId: true, amount: true },
  });

  // Group by MBA and sum amounts
  const mbaAmounts = new Map<string, number>();
  for (const item of lineItems) {
    if (!item.mbaId) continue;
    const current = mbaAmounts.get(item.mbaId) || 0;
    mbaAmounts.set(item.mbaId, current + Number(item.amount));
  }

  // Get existing allocations for this invoice
  const existing = await prisma.invoiceAllocation.findMany({
    where: { invoiceId },
    select: { id: true, mbaId: true },
  });

  const existingByMba = new Map(existing.map((a) => [a.mbaId, a.id]));

  await prisma.$transaction(async (tx) => {
    // Upsert allocations for each MBA that has line items
    for (const [mbaId, amount] of mbaAmounts) {
      await tx.invoiceAllocation.upsert({
        where: { invoiceId_mbaId: { invoiceId, mbaId } },
        update: { amount },
        create: { invoiceId, mbaId, amount },
      });
    }

    // Delete allocations for MBAs that no longer have line items
    for (const [mbaId, allocId] of existingByMba) {
      if (!mbaAmounts.has(mbaId)) {
        await tx.invoiceAllocation.delete({ where: { id: allocId } });
      }
    }
  });
}

/**
 * Map a platform string from parsing to a valid Prisma Platform enum value.
 */
export function mapPlatform(
  platform: string | null
): "META" | "GOOGLE_ADS" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER" {
  if (!platform) return "OTHER";
  const valid = ["META", "GOOGLE_ADS", "BING", "TIKTOK", "LINKEDIN", "OTHER"];
  const upper = platform.toUpperCase();
  return valid.includes(upper)
    ? (upper as "META" | "GOOGLE_ADS" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER")
    : "OTHER";
}

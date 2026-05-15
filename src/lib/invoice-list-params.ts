/**
 * URL → query plumbing for the vendor invoice list page.
 *
 * The list page is server-rendered; users drive filters and sort via
 * URL params so views are bookmarkable and survive page reloads.
 * Saved-view persistence (PR #14) layers on top of this without
 * needing to know the underlying shape.
 */

import type { Prisma } from "@prisma/client";

export type SortField = "invoiceDate" | "totalAmount" | "vendor" | "invoiceNumber";

const VALID_SORT_FIELDS: SortField[] = [
  "invoiceDate",
  "totalAmount",
  "vendor",
  "invoiceNumber",
];

const VALID_PLATFORMS = [
  "GOOGLE_ADS",
  "META",
  "BING",
  "TIKTOK",
  "LINKEDIN",
  "OTHER",
] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

export type InvoiceListParams = {
  sort: SortField;
  dir: "asc" | "desc";
  clientId: string | null;
  platform: Platform | null;
  paid: "paid" | "unpaid" | null;
  vendorContains: string | null;
};

export function parseInvoiceListParams(
  searchParams: Record<string, string | string[] | undefined>
): InvoiceListParams {
  const raw = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v ?? null;
  };

  const sortParam = raw("sort");
  const sort: SortField =
    sortParam && (VALID_SORT_FIELDS as string[]).includes(sortParam)
      ? (sortParam as SortField)
      : "invoiceDate";

  const dir = raw("dir") === "asc" ? "asc" : "desc";

  const platformParam = raw("platform");
  const platform: Platform | null =
    platformParam && (VALID_PLATFORMS as readonly string[]).includes(platformParam)
      ? (platformParam as Platform)
      : null;

  const paidParam = raw("paid");
  const paid: "paid" | "unpaid" | null =
    paidParam === "paid" || paidParam === "unpaid" ? paidParam : null;

  const vendorRaw = raw("vendor");
  const vendorContains =
    vendorRaw && vendorRaw.trim().length > 0 ? vendorRaw.trim() : null;

  const clientRaw = raw("client");
  const clientId = clientRaw && clientRaw.trim().length > 0 ? clientRaw.trim() : null;

  return { sort, dir, clientId, platform, paid, vendorContains };
}

export function paramsToInvoiceWhere(
  params: InvoiceListParams
): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { status: "CONFIRMED" };
  if (params.clientId) where.detectedClientId = params.clientId;
  if (params.platform) where.vendor = params.platform;
  if (params.paid === "paid") where.isPaid = true;
  if (params.paid === "unpaid") where.isPaid = false;
  if (params.vendorContains) {
    where.detectedVendorName = {
      contains: params.vendorContains,
      mode: "insensitive",
    };
  }
  return where;
}

export function paramsToInvoiceOrderBy(
  params: InvoiceListParams
): Prisma.InvoiceOrderByWithRelationInput {
  return { [params.sort]: params.dir };
}

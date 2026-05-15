export const dynamic = "force-dynamic";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Badge } from "@/components/ui/badge";
import { ConcurStatusBadge } from "@/components/concur-status-badge";
import { InvoiceFilters } from "@/components/invoice-filters";
import { SortableHeader } from "@/components/sortable-header";
import { SavedViewsMenu } from "@/components/saved-views-menu";
import { SyncNowButton } from "@/components/sync-now-button";
import { SyncCadence } from "@/components/sync-cadence";
import { prisma } from "@/lib/db";
import {
  parseInvoiceListParams,
  paramsToInvoiceWhere,
  paramsToInvoiceOrderBy,
  type InvoiceListParams,
} from "@/lib/invoice-list-params";
import { PLATFORM_TO_VENDOR } from "@/lib/concur/constants";

const PLATFORMS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
];

async function getInvoices(params: InvoiceListParams) {
  return prisma.invoice.findMany({
    where: paramsToInvoiceWhere(params),
    include: {
      allocations: {
        include: {
          mba: {
            include: { client: true },
          },
        },
      },
      detectedClient: { select: { id: true, name: true } },
      _count: { select: { lineItems: true } },
    },
    orderBy: paramsToInvoiceOrderBy(params),
  });
}

async function getClientOptions() {
  const rows = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ value: c.id, label: c.name }));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = parseInvoiceListParams(await searchParams);
  const [invoices, clientOptions] = await Promise.all([
    getInvoices(params),
    getClientOptions(),
  ]);

  const totalUnpaid = invoices
    .filter((inv) => !inv.isPaid && inv.type === "INVOICE")
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  const totalCredits = invoices
    .filter((inv) => inv.type === "CREDIT_NOTE")
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // URLSearchParams pre-built for sortable header links — we only need
  // to preserve the filter params, not the existing sort.
  const preserve = new URLSearchParams();
  if (params.clientId) preserve.set("client", params.clientId);
  if (params.platform) preserve.set("platform", params.platform);
  if (params.paid) preserve.set("paid", params.paid);
  if (params.vendorContains) preserve.set("vendor", params.vendorContains);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Invoices"
        description="Track invoices from platforms (Google, Meta, etc.) and payment status"
        actions={
          <div className="flex items-center gap-2">
            <SyncNowButton />
            <Button asChild>
              <Link href="/invoices/new">+ New Invoice</Link>
            </Button>
          </div>
        }
      />
      <SyncCadence />

      <InvoiceFilters
        clients={clientOptions}
        platforms={PLATFORMS}
      />

      <SavedViewsMenu scope="invoices" />

      {(totalUnpaid > 0 || totalCredits > 0) && (
        <div className="flex gap-4">
          {totalUnpaid > 0 && (
            <AlertBanner variant="error" className="flex-1">
              <p>
                <strong>{formatCurrency(totalUnpaid)}</strong> owed to vendors
              </p>
            </AlertBanner>
          )}
          {totalCredits > 0 && (
            <AlertBanner variant="info" className="flex-1">
              <p>
                <strong>{formatCurrency(totalCredits)}</strong> in credit notes
              </p>
            </AlertBanner>
          )}
        </div>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices match"
          description="Try clearing filters, or record a new vendor invoice."
          action={
            <Button asChild>
              <Link href="/invoices/new">+ New Invoice</Link>
            </Button>
          }
        />
      ) : (
        <div className="border border-border rounded-2xl bg-card overflow-hidden">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead>Type</TableHead>
                <TableHead>
                  <SortableHeader
                    field="invoiceNumber"
                    label="Invoice #"
                    currentSort={params.sort}
                    currentDir={params.dir}
                    preserveParams={preserve}
                    basePath="/invoices"
                  />
                </TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>
                  <SortableHeader
                    field="vendor"
                    label="Platform"
                    currentSort={params.sort}
                    currentDir={params.dir}
                    preserveParams={preserve}
                    basePath="/invoices"
                  />
                </TableHead>
                <TableHead>Client</TableHead>
                <TableHead>
                  <SortableHeader
                    field="invoiceDate"
                    label="Date"
                    currentSort={params.sort}
                    currentDir={params.dir}
                    preserveParams={preserve}
                    basePath="/invoices"
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="totalAmount"
                    label="Total"
                    currentSort={params.sort}
                    currentDir={params.dir}
                    preserveParams={preserve}
                    basePath="/invoices"
                    className="justify-end"
                  />
                </TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Concur</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const allocatedTotal = invoice.allocations.reduce(
                  (sum, alloc) => sum + Number(alloc.amount),
                  0
                );
                const invoiceTotal = Number(invoice.totalAmount);
                const isFullyAllocated =
                  Math.abs(allocatedTotal - invoiceTotal) < 0.01;

                const vendorName =
                  invoice.detectedVendorName ??
                  PLATFORM_TO_VENDOR[invoice.vendor] ??
                  invoice.vendor;

                const clientLabel = invoice.detectedClient
                  ? invoice.detectedClient.name
                  : invoice.detectedClientName;

                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      {invoice.type === "CREDIT_NOTE" ? (
                        <Badge variant="credit">Credit</Badge>
                      ) : (
                        <Badge variant="invoice">Invoice</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{vendorName}</TableCell>
                    <TableCell>
                      {PLATFORMS.find((p) => p.value === invoice.vendor)?.label ||
                        invoice.vendor}
                    </TableCell>
                    <TableCell>
                      {clientLabel ? (
                        invoice.detectedClient ? (
                          <span>{clientLabel}</span>
                        ) : (
                          <span className="italic text-muted-foreground">
                            {clientLabel}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(invoiceTotal)}
                      {invoice._count.lineItems > 0 && (
                        <span className="text-muted-foreground text-xs ml-1">
                          {invoice._count.lineItems} items
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {invoice.allocations.length === 0 ? (
                        <span className="text-bs-coral text-sm">
                          Not allocated
                        </span>
                      ) : (
                        <div className="text-sm">
                          {invoice.allocations.map((alloc) => (
                            <div key={alloc.id}>
                              {alloc.mba.client.name} - {alloc.mba.mbaNumber}
                            </div>
                          ))}
                          {!isFullyAllocated && (
                            <span className="text-bs-coral">
                              ({formatCurrency(invoiceTotal - allocatedTotal)}{" "}
                              unallocated)
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {invoice.isPaid ? (
                        <Badge variant="paid" dot>Paid</Badge>
                      ) : (
                        <Badge variant="unpaid" dot>Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ConcurStatusBadge status={invoice.concurSyncStatus} />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/invoices/${invoice.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

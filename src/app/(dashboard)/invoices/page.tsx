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
import { prisma } from "@/lib/db";

const PLATFORMS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
];

async function getInvoices() {
  return prisma.invoice.findMany({
    where: { status: "CONFIRMED" },
    include: {
      allocations: {
        include: {
          mba: {
            include: {
              client: true,
            },
          },
        },
      },
      _count: { select: { lineItems: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
}

async function getDraftCount() {
  return prisma.invoice.count({ where: { status: "DRAFT" } });
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

export default async function InvoicesPage() {
  const [invoices, draftCount] = await Promise.all([
    getInvoices(),
    getDraftCount(),
  ]);

  const totalUnpaid = invoices
    .filter((inv) => !inv.isPaid && inv.type === "INVOICE")
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  const totalCredits = invoices
    .filter((inv) => inv.type === "CREDIT_NOTE")
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Invoices"
        description="Track invoices from platforms (Google, Meta, etc.) and payment status"
        actions={
          <Button asChild>
            <Link href="/invoices/new">+ New Invoice</Link>
          </Button>
        }
      />

      {draftCount > 0 && (
        <AlertBanner
          variant="warning"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/invoices/drafts">Review Drafts</Link>
            </Button>
          }
        >
          <p>
            <strong>{draftCount}</strong> draft invoice{draftCount !== 1 ? "s" : ""} pending review
          </p>
        </AlertBanner>
      )}

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
          title="No invoices yet"
          description="Record your first vendor invoice to start tracking spend."
          action={
            <Button asChild>
              <Link href="/invoices/new">+ New Invoice</Link>
            </Button>
          }
        />
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Allocated To</TableHead>
                <TableHead>Paid to Vendor</TableHead>
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
                    <TableCell>
                      {PLATFORMS.find((p) => p.value === invoice.vendor)?.label ||
                        invoice.vendor}
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

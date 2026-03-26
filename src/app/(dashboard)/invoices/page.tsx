export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendor Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Track invoices from platforms (Google, Meta, etc.) and payment status
          </p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">+ New Invoice</Link>
        </Button>
      </div>

      {draftCount > 0 && (
        <div className="bg-bs-yellow/50 border border-bs-yellow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-bs-midnight">
              <strong>{draftCount}</strong> draft invoice{draftCount !== 1 ? "s" : ""} pending review
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/invoices/drafts">Review Drafts</Link>
            </Button>
          </div>
        </div>
      )}

      {(totalUnpaid > 0 || totalCredits > 0) && (
        <div className="flex gap-4">
          {totalUnpaid > 0 && (
            <div className="bg-bs-coral/10 border border-bs-coral/30 rounded-lg p-4 flex-1">
              <p className="text-bs-midnight">
                <strong>{formatCurrency(totalUnpaid)}</strong> owed to vendors
              </p>
            </div>
          )}
          {totalCredits > 0 && (
            <div className="bg-bs-light-blue border border-bs-cobalt/20 rounded-lg p-4 flex-1">
              <p className="text-bs-midnight">
                <strong>{formatCurrency(totalCredits)}</strong> in credit notes
              </p>
            </div>
          )}
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No invoices yet.</p>
          <p className="mt-2">
            <Link href="/invoices/new" className="text-bs-cobalt hover:underline">
              Record your first invoice
            </Link>
          </p>
        </div>
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
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bs-cobalt/10 text-bs-cobalt">
                          Credit
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bs-dark-gray/10 text-bs-dark-gray">
                          Invoice
                        </span>
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
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bs-teal/20 text-bs-teal-dark">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bs-coral/15 text-bs-coral-dark">
                          Unpaid
                        </span>
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

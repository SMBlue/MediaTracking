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
    },
    orderBy: { invoiceDate: "desc" },
  });
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
  const invoices = await getInvoices();

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
          <h1 className="text-3xl font-bold">Vendor Invoices</h1>
          <p className="text-muted-foreground">
            Track invoices from platforms (Google, Meta, etc.) and payment status
          </p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">+ New Invoice</Link>
        </Button>
      </div>

      {(totalUnpaid > 0 || totalCredits > 0) && (
        <div className="flex gap-4">
          {totalUnpaid > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex-1">
              <p className="text-orange-800">
                <strong>{formatCurrency(totalUnpaid)}</strong> owed to vendors
              </p>
            </div>
          )}
          {totalCredits > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-1">
              <p className="text-blue-800">
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
            <Link href="/invoices/new" className="text-primary hover:underline">
              Record your first invoice
            </Link>
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
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
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          Credit
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
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
                    <TableCell className="text-right">
                      {formatCurrency(invoiceTotal)}
                    </TableCell>
                    <TableCell>
                      {invoice.allocations.length === 0 ? (
                        <span className="text-orange-600 text-sm">
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
                            <span className="text-orange-600">
                              ({formatCurrency(invoiceTotal - allocatedTotal)}{" "}
                              unallocated)
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {invoice.isPaid ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
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

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { LineItemAssignments } from "@/components/line-item-assignments";
import { ConcurStatusBadge } from "@/components/concur-status-badge";
import {
  togglePaidStatus,
  deleteInvoice,
  syncInvoiceToConcur,
} from "./actions";

const PLATFORMS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
];

async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
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
      lineItems: {
        include: {
          mba: { include: { client: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  return invoice;
}

async function getActiveMBAs() {
  return prisma.mBA.findMany({
    where: { status: { in: ["ACTIVE", "RECONCILING"] } },
    include: { client: true },
    orderBy: [{ client: { name: "asc" } }, { mbaNumber: "asc" }],
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, activeMBAs] = await Promise.all([getInvoice(id), getActiveMBAs()]);

  const totalAmount = Number(invoice.totalAmount);
  const allocatedTotal = invoice.allocations.reduce(
    (sum, alloc) => sum + Number(alloc.amount),
    0
  );
  const unallocated = totalAmount - allocatedTotal;


  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${PLATFORMS.find((p) => p.value === invoice.vendor)?.label || invoice.vendor} \u00b7 ${formatDate(invoice.invoiceDate)}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Vendor Invoices", href: "/invoices" },
          { label: invoice.invoiceNumber },
        ]}
        actions={
          <form action={togglePaidStatus}>
            <input type="hidden" name="id" value={invoice.id} />
            <input
              type="hidden"
              name="currentStatus"
              value={String(invoice.isPaid)}
            />
            <Button
              type="submit"
              variant={invoice.isPaid ? "outline" : "default"}
            >
              {invoice.isPaid ? "Mark as Unpaid" : "Mark as Paid"}
            </Button>
          </form>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Allocated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(allocatedTotal)}
            </p>
            {unallocated > 0.01 && (
              <p className="text-sm text-bs-coral">
                {formatCurrency(unallocated)} unallocated
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                invoice.isPaid ? "text-bs-teal-dark" : "text-bs-coral"
              }`}
            >
              {invoice.isPaid ? "Paid" : "Unpaid"}
            </p>
            {invoice.isPaid && invoice.paidDate && (
              <p className="text-sm text-muted-foreground">
                {formatDate(invoice.paidDate)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Concur sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Concur</span>
            <ConcurStatusBadge status={invoice.concurSyncStatus} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2 text-sm text-muted-foreground">
            <div>
              Concur invoice ID:{" "}
              <span className="font-mono text-foreground">
                {invoice.concurInvoiceId ?? "—"}
              </span>
            </div>
            <div>
              Last sync:{" "}
              <span className="text-foreground">
                {invoice.concurLastSyncAt
                  ? formatDate(invoice.concurLastSyncAt)
                  : "—"}
              </span>
            </div>
            {invoice.concurLastSyncError && (
              <div className="md:col-span-2 text-bs-coral">
                Last error: {invoice.concurLastSyncError}
              </div>
            )}
          </div>
          {invoice.status === "CONFIRMED" &&
            invoice.concurSyncStatus !== "PAYMENT_RECEIVED" && (
              <form action={syncInvoiceToConcur}>
                <input type="hidden" name="id" value={invoice.id} />
                <Button
                  type="submit"
                  variant={
                    invoice.concurSyncStatus === "SYNCED"
                      ? "outline"
                      : "default"
                  }
                >
                  {invoice.concurSyncStatus === "SYNC_FAILED"
                    ? "Retry sync"
                    : invoice.concurSyncStatus === "SYNCED"
                    ? "Re-sync"
                    : "Push to Concur"}
                </Button>
              </form>
            )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Line Items
            {invoice.lineItems.length > 0 && (
              <Badge variant="info">
                {invoice.lineItems.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemAssignments
            invoiceId={invoice.id}
            lineItems={invoice.lineItems.map((item) => ({
              id: item.id,
              campaignName: item.campaignName,
              platform: item.platform,
              amount: Number(item.amount),
              mbaId: item.mbaId,
              confidence: item.confidence,
            }))}
            activeMBAs={activeMBAs.map((mba) => ({
              id: mba.id,
              mbaNumber: mba.mbaNumber,
              name: mba.name,
              client: { name: mba.client.name },
            }))}
            totalAmount={totalAmount}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MBA Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.allocations.length === 0 ? (
            <p className="text-muted-foreground">
              This invoice has not been allocated to any MBAs.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>MBA</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.allocations.map((alloc) => (
                  <TableRow key={alloc.id}>
                    <TableCell>{alloc.mba.client.name}</TableCell>
                    <TableCell>
                      <Link
                        href={`/mbas/${alloc.mba.id}`}
                        className="hover:underline"
                      >
                        {alloc.mba.mbaNumber} - {alloc.mba.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(alloc.amount))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold">
                  <TableCell colSpan={2}>Total Allocated</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(allocatedTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={deleteInvoice}>
            <input type="hidden" name="id" value={invoice.id} />
            <p className="text-sm text-muted-foreground mb-4">
              Deleting this invoice will also remove all MBA allocations.
            </p>
            <Button type="submit" variant="destructive">
              Delete Invoice
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

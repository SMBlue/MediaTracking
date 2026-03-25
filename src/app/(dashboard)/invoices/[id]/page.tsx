export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
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
import { prisma } from "@/lib/db";
import { LineItemAssignments } from "@/components/line-item-assignments";
import {
  togglePaidStatus,
  deleteInvoice,
  confirmDraft,
  discardDraft,
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

  function confidenceBadge(confidence: number | null) {
    if (confidence === null) return null;
    if (confidence >= 0.8) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          High ({Math.round(confidence * 100)}%)
        </span>
      );
    }
    if (confidence >= 0.5) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          Medium ({Math.round(confidence * 100)}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        Low ({Math.round(confidence * 100)}%)
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {invoice.status === "DRAFT" && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-800 font-medium">
                Draft Invoice — Pending Review
              </p>
              <p className="text-purple-600 text-sm">
                This invoice was auto-parsed from email. Review the details and
                confirm or discard.
                {invoice.parseConfidence !== null && (
                  <> Parse confidence: {confidenceBadge(invoice.parseConfidence)}</>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={confirmDraft}>
                <input type="hidden" name="id" value={invoice.id} />
                <Button type="submit">Confirm</Button>
              </form>
              <form action={discardDraft}>
                <input type="hidden" name="id" value={invoice.id} />
                <Button type="submit" variant="destructive">
                  Discard
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{invoice.invoiceNumber}</h1>
          <p className="text-muted-foreground">
            {PLATFORMS.find((p) => p.value === invoice.vendor)?.label ||
              invoice.vendor}{" "}
            &middot; {formatDate(invoice.invoiceDate)}
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

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
              <p className="text-sm text-orange-600">
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
                invoice.isPaid ? "text-green-600" : "text-orange-600"
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

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Line Items
            {invoice.lineItems.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {invoice.lineItems.length}
              </span>
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
            isDraft={invoice.status === "DRAFT"}
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

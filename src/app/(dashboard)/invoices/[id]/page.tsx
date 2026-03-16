export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

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

async function togglePaidStatus(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const currentStatus = formData.get("currentStatus") === "true";

  await prisma.invoice.update({
    where: { id },
    data: {
      isPaid: !currentStatus,
      paidDate: !currentStatus ? new Date() : null,
    },
  });

  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "UPDATE",
    changes: { isPaid: { old: currentStatus, new: !currentStatus } },
  });

  redirect(`/invoices/${id}`);
}

async function deleteInvoice(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;

  await prisma.invoice.delete({
    where: { id },
  });

  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "DELETE",
  });

  redirect("/invoices");
}

async function updateLineItemMBA(formData: FormData) {
  "use server";

  const lineItemId = formData.get("lineItemId") as string;
  const mbaId = (formData.get("mbaId") as string) || null;
  const invoiceId = formData.get("invoiceId") as string;

  await prisma.vendorInvoiceLineItem.update({
    where: { id: lineItemId },
    data: { mbaId: mbaId === "__unmap__" ? null : mbaId },
  });

  await logAudit({
    entityType: "VendorInvoiceLineItem",
    entityId: lineItemId,
    action: "UPDATE",
    changes: { mbaId: { old: null, new: mbaId } },
  });

  redirect(`/invoices/${invoiceId}`);
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

  const lineItemsTotal = invoice.lineItems.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  return (
    <div className="space-y-6">
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
          {invoice.lineItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No line items recorded for this invoice
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign Name</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>MBA Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.campaignName}</TableCell>
                      <TableCell>{item.platform || "–"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(item.amount))}</TableCell>
                      <TableCell>
                        <form action={updateLineItemMBA} className="flex items-center gap-1">
                          <input type="hidden" name="lineItemId" value={item.id} />
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <Select name="mbaId" defaultValue={item.mbaId || "__unmap__"}>
                            <SelectTrigger className="w-52 h-8 text-xs">
                              <SelectValue placeholder="Unmapped" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unmap__">Unmapped</SelectItem>
                              {activeMBAs.map((mba) => (
                                <SelectItem key={mba.id} value={mba.id}>
                                  {mba.client.name} - {mba.mbaNumber}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button type="submit" variant="ghost" size="sm" className="h-8 text-xs px-2">
                            Save
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between text-sm pt-2 border-t mt-2">
                <span>Line items total: {formatCurrency(lineItemsTotal)}</span>
                <span className={Math.abs(lineItemsTotal - totalAmount) < 0.01 ? "text-green-600" : "text-orange-600"}>
                  {Math.abs(lineItemsTotal - totalAmount) < 0.01
                    ? "Matches invoice total"
                    : `Invoice total: ${formatCurrency(totalAmount)}`}
                </span>
              </div>
            </>
          )}
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

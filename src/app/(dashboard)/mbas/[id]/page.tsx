export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { logAudit, computeChanges } from "@/lib/audit";

const PLATFORMS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
];

async function getMBA(id: string) {
  const mba = await prisma.mBA.findUnique({
    where: { id },
    include: {
      client: true,
      spendEntries: {
        orderBy: { period: "desc" },
      },
      invoiceAllocations: {
        include: {
          invoice: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!mba) {
    notFound();
  }

  return mba;
}

async function addSpendEntry(formData: FormData) {
  "use server";

  const mbaId = formData.get("mbaId") as string;
  const platform = formData.get("platform") as string;
  const periodStr = formData.get("period") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const notes = formData.get("notes") as string;

  if (!mbaId || !platform || !periodStr || isNaN(amount)) {
    throw new Error("All fields are required");
  }

  // Period should be first day of the month
  const period = new Date(periodStr + "-01");

  // Check if entry exists
  const existing = await prisma.spendEntry.findUnique({
    where: {
      mbaId_platform_period: {
        mbaId,
        platform: platform as "GOOGLE_ADS" | "META" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER",
        period,
      },
    },
  });

  const entry = await prisma.spendEntry.upsert({
    where: {
      mbaId_platform_period: {
        mbaId,
        platform: platform as "GOOGLE_ADS" | "META" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER",
        period,
      },
    },
    update: {
      amount,
      notes: notes || null,
    },
    create: {
      mbaId,
      platform: platform as "GOOGLE_ADS" | "META" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER",
      period,
      amount,
      notes: notes || null,
    },
  });

  await logAudit({
    entityType: "SpendEntry",
    entityId: entry.id,
    action: existing ? "UPDATE" : "CREATE",
    changes: existing
      ? computeChanges(
          { amount: existing.amount, notes: existing.notes },
          { amount: entry.amount, notes: entry.notes },
          ["amount", "notes"]
        )
      : undefined,
  });

  redirect(`/mbas/${mbaId}`);
}

async function updateMBAStatus(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const status = formData.get("status") as "DRAFT" | "ACTIVE" | "CLOSED";

  const existing = await prisma.mBA.findUnique({ where: { id } });

  await prisma.mBA.update({
    where: { id },
    data: { status },
  });

  if (existing && existing.status !== status) {
    await logAudit({
      entityType: "MBA",
      entityId: id,
      action: "UPDATE",
      changes: { status: { old: existing.status, new: status } },
    });
  }

  redirect(`/mbas/${id}`);
}

async function updateClientPayment(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const clientPaid = formData.get("clientPaid") === "true";
  const clientPaidDateStr = formData.get("clientPaidDate") as string;
  const clientPaidAmountStr = formData.get("clientPaidAmount") as string;

  const existing = await prisma.mBA.findUnique({ where: { id } });

  const updated = await prisma.mBA.update({
    where: { id },
    data: {
      clientPaid,
      clientPaidDate: clientPaidDateStr ? new Date(clientPaidDateStr) : null,
      clientPaidAmount: clientPaidAmountStr ? parseFloat(clientPaidAmountStr) : null,
    },
  });

  if (existing) {
    const changes = computeChanges(
      {
        clientPaid: existing.clientPaid,
        clientPaidDate: existing.clientPaidDate?.toISOString(),
        clientPaidAmount: existing.clientPaidAmount,
      },
      {
        clientPaid: updated.clientPaid,
        clientPaidDate: updated.clientPaidDate?.toISOString(),
        clientPaidAmount: updated.clientPaidAmount,
      },
      ["clientPaid", "clientPaidDate", "clientPaidAmount"]
    );

    if (changes) {
      await logAudit({
        entityType: "MBA",
        entityId: id,
        action: "UPDATE",
        changes,
      });
    }
  }

  redirect(`/mbas/${id}`);
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

function formatMonth(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateForInput(date: Date | null) {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export default async function MBADetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mba = await getMBA(id);

  const budget = Number(mba.budget);

  // Calculate invoiced amounts, accounting for credit notes
  const invoiceTotal = mba.invoiceAllocations
    .filter((alloc) => alloc.invoice.type === "INVOICE")
    .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
  const creditTotal = mba.invoiceAllocations
    .filter((alloc) => alloc.invoice.type === "CREDIT_NOTE")
    .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
  const totalInvoiced = invoiceTotal - creditTotal;

  const totalSpend = mba.spendEntries.reduce(
    (sum, entry) => sum + Number(entry.amount),
    0
  );
  const remaining = budget - totalInvoiced;
  const percentUsed = budget > 0 ? (totalInvoiced / budget) * 100 : 0;
  const variance = totalSpend - totalInvoiced;

  // Group spend by platform
  const spendByPlatform = mba.spendEntries.reduce((acc, entry) => {
    const platform = entry.platform;
    acc[platform] = (acc[platform] || 0) + Number(entry.amount);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{mba.mbaNumber}</h1>
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                mba.status === "ACTIVE"
                  ? "bg-green-100 text-green-700"
                  : mba.status === "CLOSED"
                  ? "bg-gray-100 text-gray-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {mba.status}
            </span>
          </div>
          <p className="text-muted-foreground">
            {mba.client.name} &middot; {mba.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDate(mba.startDate)} - {formatDate(mba.endDate)}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={updateMBAStatus}>
            <input type="hidden" name="id" value={mba.id} />
            <Select name="status" defaultValue={mba.status}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" size="sm" className="ml-2">
              Update
            </Button>
          </form>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(budget)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendor Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</p>
            <p className="text-xs text-muted-foreground">
              {Math.round(percentUsed)}% of budget (owed to platforms)
              {creditTotal > 0 && (
                <span className="text-blue-600 block">
                  ({formatCurrency(invoiceTotal)} - {formatCurrency(creditTotal)} credits)
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                remaining < 0 ? "text-red-600" : ""
              }`}
            >
              {formatCurrency(remaining)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Spend vs Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                variance !== 0
                  ? variance > 0
                    ? "text-orange-600"
                    : "text-blue-600"
                  : ""
              }`}
            >
              {variance >= 0 ? "+" : ""}
              {formatCurrency(variance)}
            </p>
            <p className="text-xs text-muted-foreground">
              {variance > 0
                ? "Spend exceeds invoices"
                : variance < 0
                ? "Invoices exceed spend"
                : "Balanced"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Budget Utilization</span>
              <span>{Math.round(percentUsed)}%</span>
            </div>
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percentUsed > 100
                    ? "bg-red-500"
                    : percentUsed > 80
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Payment Tracking - what the client pays us */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Client Payment (to Agency)</span>
            {mba.clientPaid ? (
              <span className="text-sm font-normal px-2 py-1 bg-green-100 text-green-700 rounded-full">
                Received
              </span>
            ) : (
              <span className="text-sm font-normal px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                Outstanding
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateClientPayment} className="space-y-4">
            <input type="hidden" name="id" value={mba.id} />

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientPaid">Status</Label>
                <Select name="clientPaid" defaultValue={mba.clientPaid ? "true" : "false"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Outstanding</SelectItem>
                    <SelectItem value="true">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientPaidDate">Paid Date</Label>
                <Input
                  id="clientPaidDate"
                  name="clientPaidDate"
                  type="date"
                  defaultValue={formatDateForInput(mba.clientPaidDate)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientPaidAmount">Amount Paid</Label>
                <Input
                  id="clientPaidAmount"
                  name="clientPaidAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={budget.toString()}
                  defaultValue={mba.clientPaidAmount ? Number(mba.clientPaidAmount).toString() : ""}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Budget: {formatCurrency(budget)}
                {mba.clientPaidAmount && Number(mba.clientPaidAmount) !== budget && (
                  <span className={Number(mba.clientPaidAmount) < budget ? " text-orange-600" : " text-green-600"}>
                    {" "}(Variance: {formatCurrency(Number(mba.clientPaidAmount) - budget)})
                  </span>
                )}
              </p>
              <Button type="submit" size="sm">Update Payment</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Spend by Platform */}
        <Card>
          <CardHeader>
            <CardTitle>Spend by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(spendByPlatform).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No spend logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(spendByPlatform).map(([platform, amount]) => (
                  <div key={platform} className="flex justify-between">
                    <span>
                      {PLATFORMS.find((p) => p.value === platform)?.label ||
                        platform}
                    </span>
                    <span className="font-medium">{formatCurrency(amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(totalSpend)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Spend Form */}
        <Card>
          <CardHeader>
            <CardTitle>Log Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addSpendEntry} className="space-y-4">
              <input type="hidden" name="mbaId" value={mba.id} />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platform">Platform</Label>
                  <Select name="platform" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="period">Month</Label>
                  <Input
                    id="period"
                    name="period"
                    type="month"
                    defaultValue={getCurrentMonth()}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" name="notes" placeholder="Any notes..." />
              </div>

              <Button type="submit">Add Spend</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Vendor Invoices - what vendors bill us */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Vendor Invoices (from Platforms)</CardTitle>
          <Button asChild size="sm">
            <Link href={`/invoices/new?mbaId=${mba.id}`}>+ Add Invoice</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {mba.invoiceAllocations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No vendor invoices allocated to this MBA yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mba.invoiceAllocations.map((alloc) => (
                  <TableRow key={alloc.id}>
                    <TableCell>
                      {alloc.invoice.type === "CREDIT_NOTE" ? (
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
                      <Link
                        href={`/invoices/${alloc.invoice.id}`}
                        className="hover:underline"
                      >
                        {alloc.invoice.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {PLATFORMS.find((p) => p.value === alloc.invoice.vendor)
                        ?.label || alloc.invoice.vendor}
                    </TableCell>
                    <TableCell>{formatDate(alloc.invoice.invoiceDate)}</TableCell>
                    <TableCell className={`text-right ${alloc.invoice.type === "CREDIT_NOTE" ? "text-blue-600" : ""}`}>
                      {alloc.invoice.type === "CREDIT_NOTE" ? "-" : ""}
                      {formatCurrency(Number(alloc.amount))}
                    </TableCell>
                    <TableCell>
                      {alloc.invoice.isPaid ? (
                        <span className="text-green-600">Paid</span>
                      ) : (
                        <span className="text-orange-600">Unpaid</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Spend Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Spend Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {mba.spendEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No spend entries yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mba.spendEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatMonth(entry.period)}</TableCell>
                    <TableCell>
                      {PLATFORMS.find((p) => p.value === entry.platform)?.label ||
                        entry.platform}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(entry.amount))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

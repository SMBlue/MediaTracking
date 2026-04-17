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
import { calculateEffectiveBudget } from "@/lib/budget";
import { MBAHeader } from "@/components/mba-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

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
      invoiceAllocations: {
        include: {
          invoice: {
            include: {
              _count: { select: { lineItems: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      changeOrders: {
        orderBy: { effectiveDate: "asc" },
      },
      creditsOut: {
        include: { toMba: { include: { client: true } } },
        orderBy: { createdAt: "desc" },
      },
      creditsIn: {
        include: { fromMba: { include: { client: true } } },
        orderBy: { createdAt: "desc" },
      },
      netsuiteInvoices: {
        orderBy: { invoiceDate: "desc" },
      },
    },
  });

  if (!mba) {
    notFound();
  }

  return mba;
}



async function updateMBAStatus(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const status = formData.get("status") as "DRAFT" | "ACTIVE" | "RECONCILING" | "CLOSED";

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

async function addChangeOrder(formData: FormData) {
  "use server";

  const mbaId = formData.get("mbaId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const description = (formData.get("description") as string)?.trim();
  const effectiveDateStr = formData.get("effectiveDate") as string;

  if (!mbaId || isNaN(amount) || amount === 0 || !description || !effectiveDateStr) {
    throw new Error("All fields are required and amount cannot be zero");
  }

  const mba = await prisma.mBA.findUnique({ where: { id: mbaId } });
  if (!mba) throw new Error("MBA not found");

  const record = await prisma.changeOrder.create({
    data: {
      mbaId,
      amount,
      description,
      effectiveDate: new Date(effectiveDateStr),
    },
  });

  await logAudit({
    entityType: "ChangeOrder",
    entityId: record.id,
    action: "CREATE",
  });

  redirect(`/mbas/${mbaId}`);
}

async function deleteChangeOrder(formData: FormData) {
  "use server";

  const changeOrderId = formData.get("changeOrderId") as string;
  const mbaId = formData.get("mbaId") as string;

  const record = await prisma.changeOrder.findUnique({ where: { id: changeOrderId } });
  if (!record) throw new Error("Change order not found");

  await prisma.changeOrder.delete({ where: { id: changeOrderId } });

  await logAudit({
    entityType: "ChangeOrder",
    entityId: changeOrderId,
    action: "DELETE",
    changes: {
      amount: { old: Number(record.amount), new: null },
      description: { old: record.description, new: null },
    },
  });

  redirect(`/mbas/${mbaId}`);
}

async function getOtherMBAs(excludeId: string) {
  return prisma.mBA.findMany({
    where: { id: { not: excludeId } },
    include: { client: true },
    orderBy: [{ client: { name: "asc" } }, { mbaNumber: "asc" }],
  });
}

async function createRollover(formData: FormData) {
  "use server";

  const currentMbaId = formData.get("currentMbaId") as string;
  const direction = formData.get("direction") as string;
  const otherMbaId = formData.get("otherMbaId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const type = formData.get("type") as "JOURNAL_ENTRY" | "CREDIT_MEMO" | "CASH_CREDIT";
  const description = (formData.get("description") as string)?.trim() || null;

  if (!currentMbaId || !otherMbaId || isNaN(amount) || amount <= 0 || !type) {
    throw new Error("All required fields must be filled");
  }

  if (currentMbaId === otherMbaId) {
    throw new Error("Cannot transfer to the same MBA");
  }

  const fromMbaId = direction === "send" ? currentMbaId : otherMbaId;
  const toMbaId = direction === "send" ? otherMbaId : currentMbaId;

  // Verify both MBAs exist
  const [fromMba, toMba] = await Promise.all([
    prisma.mBA.findUnique({ where: { id: fromMbaId } }),
    prisma.mBA.findUnique({ where: { id: toMbaId } }),
  ]);
  if (!fromMba || !toMba) throw new Error("One or both MBAs not found");

  const record = await prisma.creditRollover.create({
    data: { fromMbaId, toMbaId, amount, type, description },
  });

  await Promise.all([
    logAudit({ entityType: "CreditRollover", entityId: record.id, action: "CREATE" }),
    logAudit({
      entityType: "MBA",
      entityId: fromMbaId,
      action: "UPDATE",
      changes: { creditOut: { old: null, new: amount } },
    }),
    logAudit({
      entityType: "MBA",
      entityId: toMbaId,
      action: "UPDATE",
      changes: { creditIn: { old: null, new: amount } },
    }),
  ]);

  redirect(`/mbas/${currentMbaId}`);
}

async function deleteRollover(formData: FormData) {
  "use server";

  const rolloverId = formData.get("rolloverId") as string;
  const currentMbaId = formData.get("currentMbaId") as string;

  const record = await prisma.creditRollover.findUnique({ where: { id: rolloverId } });
  if (!record) throw new Error("Rollover not found");

  await prisma.creditRollover.delete({ where: { id: rolloverId } });

  await Promise.all([
    logAudit({
      entityType: "CreditRollover",
      entityId: rolloverId,
      action: "DELETE",
      changes: { amount: { old: Number(record.amount), new: null } },
    }),
    logAudit({
      entityType: "MBA",
      entityId: record.fromMbaId,
      action: "UPDATE",
      changes: { creditOut: { old: Number(record.amount), new: null } },
    }),
    logAudit({
      entityType: "MBA",
      entityId: record.toMbaId,
      action: "UPDATE",
      changes: { creditIn: { old: Number(record.amount), new: null } },
    }),
  ]);

  redirect(`/mbas/${currentMbaId}`);
}

async function updateMBA(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const budget = parseFloat(formData.get("budget") as string);
  const currency = formData.get("currency") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const clientId = formData.get("clientId") as string;

  if (!id || !name || isNaN(budget) || !startDate || !endDate || !clientId) {
    throw new Error("All fields are required");
  }

  const existing = await prisma.mBA.findUnique({ where: { id } });
  if (!existing) throw new Error("MBA not found");

  const updated = await prisma.mBA.update({
    where: { id },
    data: {
      name,
      budget,
      currency,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      clientId,
    },
  });

  const changes = computeChanges(
    {
      name: existing.name,
      budget: Number(existing.budget),
      currency: existing.currency,
      startDate: existing.startDate.toISOString(),
      endDate: existing.endDate.toISOString(),
      clientId: existing.clientId,
    },
    {
      name: updated.name,
      budget: Number(updated.budget),
      currency: updated.currency,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate.toISOString(),
      clientId: updated.clientId,
    },
    ["name", "budget", "currency", "startDate", "endDate", "clientId"]
  );

  if (changes) {
    await logAudit({
      entityType: "MBA",
      entityId: id,
      action: "UPDATE",
      changes,
    });
  }

  redirect(`/mbas/${id}`);
}

async function updateNetsuiteProject(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const netsuiteProjectNumber = (formData.get("netsuiteProjectNumber") as string)?.trim() || null;

  const existing = await prisma.mBA.findUnique({ where: { id } });

  await prisma.mBA.update({
    where: { id },
    data: { netsuiteProjectNumber },
  });

  if (existing && existing.netsuiteProjectNumber !== netsuiteProjectNumber) {
    await logAudit({
      entityType: "MBA",
      entityId: id,
      action: "UPDATE",
      changes: { netsuiteProjectNumber: { old: existing.netsuiteProjectNumber, new: netsuiteProjectNumber } },
    });
  }

  redirect(`/mbas/${id}`);
}

const ROLLOVER_TYPE_LABELS: Record<string, string> = {
  JOURNAL_ENTRY: "Journal Entry",
  CREDIT_MEMO: "Credit Memo",
  CASH_CREDIT: "Cash Credit",
};

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
  const [mba, otherMBAs, allClients] = await Promise.all([
    getMBA(id),
    getOtherMBAs(id),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const originalBudget = Number(mba.budget);
  const effectiveBudget = calculateEffectiveBudget(mba);
  const hasChangeOrders = mba.changeOrders.length > 0;
  const hasRollovers = mba.creditsIn.length > 0 || mba.creditsOut.length > 0;
  const changeOrderTotal = mba.changeOrders.reduce((sum, co) => sum + Number(co.amount), 0);
  const creditsInTotal = mba.creditsIn.reduce((sum, cr) => sum + Number(cr.amount), 0);
  const creditsOutTotal = mba.creditsOut.reduce((sum, cr) => sum + Number(cr.amount), 0);

  // Calculate invoiced amounts, accounting for credit notes
  const invoiceTotal = mba.invoiceAllocations
    .filter((alloc) => alloc.invoice.type === "INVOICE")
    .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
  const creditTotal = mba.invoiceAllocations
    .filter((alloc) => alloc.invoice.type === "CREDIT_NOTE")
    .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
  const totalInvoiced = invoiceTotal - creditTotal;

  const remaining = effectiveBudget - totalInvoiced;
  const percentUsed = effectiveBudget > 0 ? (totalInvoiced / effectiveBudget) * 100 : 0;

  // Calculate running budget for change orders table
  let runningBudget = originalBudget;

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title=""
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "MBAs", href: "/mbas" },
          { label: mba.mbaNumber },
        ]}
        className="pb-0 border-b-0"
      />
      <MBAHeader
        mba={{
          id: mba.id,
          mbaNumber: mba.mbaNumber,
          name: mba.name,
          budget: Number(mba.budget),
          currency: mba.currency,
          startDate: formatDateForInput(mba.startDate),
          endDate: formatDateForInput(mba.endDate),
          status: mba.status,
          netsuiteProjectNumber: mba.netsuiteProjectNumber,
          clientId: mba.clientId,
          clientName: mba.client.name,
        }}
        clients={allClients}
        updateMBA={updateMBA}
        updateMBAStatus={updateMBAStatus}
        updateNetsuiteProject={updateNetsuiteProject}
      />

      {/* Budget Summary */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {hasChangeOrders ? "Effective Budget" : "Budget"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(effectiveBudget)}</p>
              {(hasChangeOrders || hasRollovers) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {[
                    `Original: ${formatCurrency(originalBudget)}`,
                    changeOrderTotal !== 0 ? `${changeOrderTotal > 0 ? "+" : ""}CO: ${formatCurrency(changeOrderTotal)}` : null,
                    creditsInTotal > 0 ? `+In: ${formatCurrency(creditsInTotal)}` : null,
                    creditsOutTotal > 0 ? `−Out: ${formatCurrency(creditsOutTotal)}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Vendor Invoiced
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalInvoiced)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round(percentUsed)}% of budget
                {creditTotal > 0 && (
                  <span className="text-bs-cobalt">
                    {" "}({formatCurrency(invoiceTotal)} − {formatCurrency(creditTotal)} credits)
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
                className={`text-2xl font-bold tabular-nums ${
                  remaining < 0 ? "text-bs-coral" : ""
                }`}
              >
                {formatCurrency(remaining)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Budget Utilization</span>
            <span>{Math.round(percentUsed)}%</span>
          </div>
          <div className="h-2.5 bg-bs-lavender rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                percentUsed > 100
                  ? "bg-bs-coral"
                  : percentUsed > 80
                  ? "bg-bs-yellow"
                  : "bg-bs-teal"
              }`}
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Change Orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Change Orders
            {mba.changeOrders.length > 0 && (
              <Badge variant="info">
                {mba.changeOrders.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mba.changeOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No change orders</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Running Budget</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mba.changeOrders.map((co) => {
                  const coAmount = Number(co.amount);
                  runningBudget += coAmount;
                  return (
                    <TableRow key={co.id}>
                      <TableCell>{formatDate(co.effectiveDate)}</TableCell>
                      <TableCell>{co.description}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${coAmount >= 0 ? "text-bs-teal-dark" : "text-bs-coral"}`}>
                        {coAmount >= 0 ? "+" : ""}{formatCurrency(coAmount)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(runningBudget)}</TableCell>
                      <TableCell>
                        <form action={deleteChangeOrder}>
                          <input type="hidden" name="changeOrderId" value={co.id} />
                          <input type="hidden" name="mbaId" value={mba.id} />
                          <Button type="submit" variant="ghost" size="sm" className="text-bs-coral hover:text-bs-coral-dark h-6 w-6 p-0">
                            &times;
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Add Change Order Form */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Add Change Order</p>
            <form action={addChangeOrder} className="flex items-end gap-3">
              <input type="hidden" name="mbaId" value={mba.id} />
              <div className="space-y-1">
                <Label htmlFor="co-amount" className="text-xs">Amount</Label>
                <Input
                  id="co-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  placeholder="25000 or -10000"
                  required
                  className="w-40"
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label htmlFor="co-description" className="text-xs">Description</Label>
                <Input
                  id="co-description"
                  name="description"
                  placeholder="e.g., Q2 budget increase"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="co-date" className="text-xs">Effective Date</Label>
                <Input
                  id="co-date"
                  name="effectiveDate"
                  type="date"
                  defaultValue={today}
                  required
                  className="w-40"
                />
              </div>
              <Button type="submit" size="sm">Add Change Order</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Credits & Rollovers */}
      <Card>
        <CardHeader>
          <CardTitle>Credits &amp; Rollovers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Credits Received */}
          <div>
            <h4 className="text-sm font-medium mb-2">Credits Received</h4>
            {mba.creditsIn.length === 0 ? (
              <p className="text-muted-foreground text-sm">No credits received</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From MBA</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mba.creditsIn.map((cr) => (
                      <TableRow key={cr.id}>
                        <TableCell>
                          <Link href={`/mbas/${cr.fromMba.id}`} className="hover:underline font-medium">
                            {cr.fromMba.mbaNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{cr.fromMba.client.name}</TableCell>
                        <TableCell className="text-right text-bs-teal-dark font-medium tabular-nums">
                          +{formatCurrency(Number(cr.amount))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="info">
                            {ROLLOVER_TYPE_LABELS[cr.type] || cr.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(cr.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground">{cr.description || "-"}</TableCell>
                        <TableCell>
                          <form action={deleteRollover}>
                            <input type="hidden" name="rolloverId" value={cr.id} />
                            <input type="hidden" name="currentMbaId" value={mba.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-bs-coral hover:text-bs-coral-dark h-6 w-6 p-0">
                              &times;
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm font-medium text-right mt-1">
                  Subtotal: {formatCurrency(creditsInTotal)}
                </p>
              </>
            )}
          </div>

          {/* Credits Sent */}
          <div>
            <h4 className="text-sm font-medium mb-2">Credits Sent</h4>
            {mba.creditsOut.length === 0 ? (
              <p className="text-muted-foreground text-sm">No credits sent</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>To MBA</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mba.creditsOut.map((cr) => (
                      <TableRow key={cr.id}>
                        <TableCell>
                          <Link href={`/mbas/${cr.toMba.id}`} className="hover:underline font-medium">
                            {cr.toMba.mbaNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{cr.toMba.client.name}</TableCell>
                        <TableCell className="text-right text-bs-coral font-medium tabular-nums">
                          -{formatCurrency(Number(cr.amount))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="info">
                            {ROLLOVER_TYPE_LABELS[cr.type] || cr.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(cr.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground">{cr.description || "-"}</TableCell>
                        <TableCell>
                          <form action={deleteRollover}>
                            <input type="hidden" name="rolloverId" value={cr.id} />
                            <input type="hidden" name="currentMbaId" value={mba.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-bs-coral hover:text-bs-coral-dark h-6 w-6 p-0">
                              &times;
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm font-medium text-right mt-1">
                  Subtotal: {formatCurrency(creditsOutTotal)}
                </p>
              </>
            )}
          </div>

          {/* Transfer Credit Form */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Transfer Credit</p>
            <form action={createRollover} className="space-y-3">
              <input type="hidden" name="currentMbaId" value={mba.id} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cr-direction" className="text-xs">Direction</Label>
                  <Select name="direction" defaultValue="send">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send">Send FROM this MBA</SelectItem>
                      <SelectItem value="receive">Receive INTO this MBA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-other" className="text-xs">Other MBA</Label>
                  <Select name="otherMbaId" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select MBA" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherMBAs.map((other) => (
                        <SelectItem key={other.id} value={other.id}>
                          {other.client.name} - {other.mbaNumber} ({other.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cr-amount" className="text-xs">Amount</Label>
                  <Input
                    id="cr-amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-type" className="text-xs">Type</Label>
                  <Select name="type" defaultValue="JOURNAL_ENTRY">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JOURNAL_ENTRY">Journal Entry</SelectItem>
                      <SelectItem value="CREDIT_MEMO">Credit Memo</SelectItem>
                      <SelectItem value="CASH_CREDIT">Cash Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-desc" className="text-xs">Description (optional)</Label>
                  <Input id="cr-desc" name="description" placeholder="e.g., Q1 rollover" />
                </div>
              </div>
              <Button type="submit" size="sm">Transfer Credit</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* NetSuite Client Invoices */}
      {mba.netsuiteInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              NetSuite Client Invoices
              <Badge variant="info">
                {mba.netsuiteInvoices.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mba.netsuiteInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(inv.amount))}</TableCell>
                    <TableCell>
                      {inv.status === "paidInFull" ? (
                        <Badge variant="paid">Paid</Badge>
                      ) : (
                        <Badge variant="outstanding">
                          {inv.status === "open" ? "Open" : inv.status}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold">
                  <TableCell colSpan={2}>Total Invoiced</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      mba.netsuiteInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0)
                    )}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow className="font-bold text-bs-teal-dark">
                  <TableCell colSpan={2}>Total Paid</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      mba.netsuiteInvoices
                        .filter((inv) => inv.status === "paidInFull")
                        .reduce((sum, inv) => sum + Number(inv.amount), 0)
                    )}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">
              Synced from NetSuite project {mba.netsuiteProjectNumber}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Client Payment Tracking - what the client pays us */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Client Payment (to Agency)</span>
            {mba.clientPaid ? (
              <span className="text-sm font-normal px-2 py-1 bg-bs-teal/20 text-bs-teal-dark rounded-full">
                Received
              </span>
            ) : Number(mba.clientPaidAmount || 0) > 0 ? (
              <span className="text-sm font-normal px-2 py-1 bg-bs-yellow text-bs-dark-gray rounded-full">
                Partial &middot; {formatCurrency(Number(mba.clientPaidAmount))} of {formatCurrency(effectiveBudget)}
              </span>
            ) : (
              <span className="text-sm font-normal px-2 py-1 bg-bs-coral/15 text-bs-coral-dark rounded-full">
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
                  placeholder={effectiveBudget.toString()}
                  defaultValue={mba.clientPaidAmount ? Number(mba.clientPaidAmount).toString() : ""}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Budget: {formatCurrency(effectiveBudget)}
                {mba.clientPaidAmount && Number(mba.clientPaidAmount) !== effectiveBudget && (
                  <span className={Number(mba.clientPaidAmount) < effectiveBudget ? " text-bs-coral" : " text-bs-teal-dark"}>
                    {" "}(Variance: {formatCurrency(Number(mba.clientPaidAmount) - effectiveBudget)})
                  </span>
                )}
              </p>
              <Button type="submit" size="sm">Update Payment</Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                        <Badge variant="credit">Credit</Badge>
                      ) : (
                        <Badge variant="invoice">Invoice</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/invoices/${alloc.invoice.id}`}
                        className="hover:underline"
                      >
                        {alloc.invoice.invoiceNumber}
                      </Link>
                      {alloc.invoice._count.lineItems > 0 && (
                        <span className="ml-1 text-muted-foreground text-xs">
                          {alloc.invoice._count.lineItems} items
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {PLATFORMS.find((p) => p.value === alloc.invoice.vendor)
                        ?.label || alloc.invoice.vendor}
                    </TableCell>
                    <TableCell>{formatDate(alloc.invoice.invoiceDate)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${alloc.invoice.type === "CREDIT_NOTE" ? "text-bs-cobalt" : ""}`}>
                      {alloc.invoice.type === "CREDIT_NOTE" ? "-" : ""}
                      {formatCurrency(Number(alloc.amount))}
                    </TableCell>
                    <TableCell>
                      {alloc.invoice.isPaid ? (
                        <span className="text-bs-teal-dark">Paid</span>
                      ) : (
                        <span className="text-bs-coral">Unpaid</span>
                      )}
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

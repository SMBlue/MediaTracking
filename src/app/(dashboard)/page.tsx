export const dynamic = "force-dynamic";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

async function getDashboardStats() {
  const [mbaCount, activeCount, clientCount] = await Promise.all([
    prisma.mBA.count(),
    prisma.mBA.count({ where: { status: "ACTIVE" } }),
    prisma.client.count(),
  ]);

  // Get total budget and invoiced amounts for active MBAs
  const activeMBAs = await prisma.mBA.findMany({
    where: { status: "ACTIVE" },
    include: {
      invoiceAllocations: true,
      spendEntries: true,
    },
  });

  const totalBudget = activeMBAs.reduce(
    (sum, mba) => sum + Number(mba.budget),
    0
  );

  const totalInvoiced = activeMBAs.reduce(
    (sum, mba) =>
      sum +
      mba.invoiceAllocations.reduce(
        (allocSum, alloc) => allocSum + Number(alloc.amount),
        0
      ),
    0
  );

  const totalSpend = activeMBAs.reduce(
    (sum, mba) =>
      sum +
      mba.spendEntries.reduce(
        (spendSum, entry) => spendSum + Number(entry.amount),
        0
      ),
    0
  );

  // Client payment stats
  const clientPaidCount = activeMBAs.filter((mba) => mba.clientPaid).length;
  const totalClientPaid = activeMBAs
    .filter((mba) => mba.clientPaid)
    .reduce((sum, mba) => sum + Number(mba.clientPaidAmount || mba.budget), 0);
  const totalOutstanding = activeMBAs
    .filter((mba) => !mba.clientPaid)
    .reduce((sum, mba) => sum + Number(mba.budget), 0);

  return {
    mbaCount,
    activeCount,
    clientCount,
    totalBudget,
    totalInvoiced,
    totalSpend,
    variance: totalSpend - totalInvoiced,
    remaining: totalBudget - totalInvoiced,
    clientPaidCount,
    totalClientPaid,
    totalOutstanding,
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your media buying agreements
          </p>
        </div>
        <Button asChild>
          <Link href="/mbas/new">+ New MBA</Link>
        </Button>
      </div>

      {/* Budget Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active MBAs</CardDescription>
            <CardTitle className="text-4xl">{stats.activeCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats.mbaCount} total MBAs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Budget</CardDescription>
            <CardTitle className="text-4xl">
              {formatCurrency(stats.totalBudget)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Across active MBAs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendor Invoiced</CardDescription>
            <CardTitle className="text-4xl">
              {formatCurrency(stats.totalInvoiced)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats.totalBudget > 0
                ? `${Math.round((stats.totalInvoiced / stats.totalBudget) * 100)}% of budget (owed to platforms)`
                : "No budget set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remaining</CardDescription>
            <CardTitle className="text-4xl">
              {formatCurrency(stats.remaining)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Available to spend
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Variance & Client Payment */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Spend</CardDescription>
            <CardTitle className="text-4xl">
              {formatCurrency(stats.totalSpend)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Logged platform spend
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Spend vs Invoiced</CardDescription>
            <CardTitle className={`text-4xl ${
              stats.variance !== 0
                ? stats.variance > 0
                  ? "text-orange-600"
                  : "text-blue-600"
                : ""
            }`}>
              {stats.variance >= 0 ? "+" : ""}{formatCurrency(stats.variance)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats.variance > 0
                ? "Spend exceeds invoices"
                : stats.variance < 0
                ? "Invoices exceed spend"
                : "Balanced"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Received from Clients</CardDescription>
            <CardTitle className="text-4xl text-green-600">
              {formatCurrency(stats.totalClientPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats.clientPaidCount} of {stats.activeCount} MBAs paid by client
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding from Clients</CardDescription>
            <CardTitle className="text-4xl text-orange-600">
              {formatCurrency(stats.totalOutstanding)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Awaiting payment from clients
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/mbas/new">Create new MBA</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/clients/new">Add new client</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/invoices/new">Record invoice</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Add your clients</p>
            <p>2. Create MBAs with budgets</p>
            <p>3. Log spend by platform</p>
            <p>4. Record invoices as they come in</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

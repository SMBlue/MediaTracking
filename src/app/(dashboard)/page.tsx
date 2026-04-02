export const dynamic = "force-dynamic";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { calculateEffectiveBudget } from "@/lib/budget";

async function getNetsuiteSyncStatus() {
  try {
    const lastSync = await prisma.netsuiteSyncLog.findFirst({
      orderBy: { startedAt: "desc" },
    });
    return { lastSync };
  } catch {
    return { lastSync: null };
  }
}

async function getEmailIngestionStatus() {
  try {
    const lastSync = await prisma.emailSyncLog.findFirst({
      orderBy: { startedAt: "desc" },
    });
    const draftCount = await prisma.invoice.count({ where: { status: "DRAFT" } });
    return { lastSync, draftCount };
  } catch {
    return { lastSync: null, draftCount: 0 };
  }
}

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
      changeOrders: true,
      creditsIn: true,
      creditsOut: true,
    },
  });

  const totalBudget = activeMBAs.reduce(
    (sum, mba) => sum + calculateEffectiveBudget(mba),
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

  // Needs reconciliation: active MBAs past end date by 60+ days
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const needsReconCount = activeMBAs.filter(
    (mba) => new Date(mba.endDate) < sixtyDaysAgo
  ).length;

  // Client payment stats — payments can come in chunks, so track totals
  const clientPaidCount = activeMBAs.filter((mba) => mba.clientPaid).length;
  const clientPartialCount = activeMBAs.filter(
    (mba) => !mba.clientPaid && Number(mba.clientPaidAmount || 0) > 0
  ).length;
  const totalClientPaid = activeMBAs.reduce(
    (sum, mba) => sum + Number(mba.clientPaidAmount || 0),
    0
  );
  const totalOutstanding = totalBudget - totalClientPaid;

  return {
    mbaCount,
    activeCount,
    clientCount,
    totalBudget,
    totalInvoiced,
    remaining: totalBudget - totalInvoiced,
    clientPaidCount,
    clientPartialCount,
    totalClientPaid,
    totalOutstanding,
    needsReconCount,
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
  const [stats, emailStatus, netsuiteStatus] = await Promise.all([
    getDashboardStats(),
    getEmailIngestionStatus(),
    getNetsuiteSyncStatus(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
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
            <CardTitle className="text-3xl tabular-nums">{stats.activeCount}</CardTitle>
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
            <CardTitle className="text-3xl tabular-nums">
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
            <CardTitle className="text-3xl tabular-nums">
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
            <CardTitle className="text-3xl tabular-nums text-bs-cobalt">
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

      {/* Client Payment */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Received from Clients</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-bs-teal-dark">
              {formatCurrency(stats.totalClientPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats.clientPaidCount} of {stats.activeCount} MBAs fully paid
              {stats.clientPartialCount > 0 && `, ${stats.clientPartialCount} partial`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding from Clients</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-bs-coral">
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

      {stats.needsReconCount > 0 && (
        <div className="bg-bs-light-blue border border-bs-cobalt/20 rounded-lg p-4">
          <p className="text-bs-midnight">
            <strong>{stats.needsReconCount}</strong> active MBA{stats.needsReconCount > 1 ? "s" : ""} may need reconciliation (ended 60+ days ago)
          </p>
          <Button asChild variant="link" className="p-0 h-auto text-bs-cobalt">
            <Link href="/mbas">View MBAs</Link>
          </Button>
        </div>
      )}

      {/* Email Ingestion Status */}
      <Card>
        <CardHeader>
          <CardTitle>Email Ingestion</CardTitle>
        </CardHeader>
        <CardContent>
          {!emailStatus.lastSync ? (
            <div className="text-sm text-muted-foreground">
              <p>Email invoice processing is not yet configured.</p>
              <p className="mt-1">
                Set up Gmail and Anthropic API credentials to enable automatic
                invoice parsing from email.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Last Sync</p>
                <p className="font-medium mt-1">
                  {new Date(emailStatus.lastSync.startedAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Emails Processed</p>
                <p className="font-medium mt-1">{emailStatus.lastSync.emailsProcessed}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Invoices Created</p>
                <p className="font-medium mt-1">{emailStatus.lastSync.invoicesCreated}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Drafts Pending</p>
                <p className="font-medium mt-1">
                  {emailStatus.draftCount > 0 ? (
                    <Link href="/invoices/drafts" className="text-bs-cobalt hover:underline">
                      {emailStatus.draftCount} to review
                    </Link>
                  ) : (
                    "None"
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* NetSuite Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle>NetSuite Sync</CardTitle>
        </CardHeader>
        <CardContent>
          {!netsuiteStatus.lastSync ? (
            <div className="text-sm text-muted-foreground">
              <p>NetSuite sync has not run yet.</p>
              <p className="mt-1">
                Set MBA NetSuite project numbers to enable automatic invoice and payment syncing.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Last Sync</p>
                <p className="font-medium mt-1">
                  {new Date(netsuiteStatus.lastSync.startedAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">MBAs Checked</p>
                <p className="font-medium mt-1">{netsuiteStatus.lastSync.mbasChecked}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Payments Updated</p>
                <p className="font-medium mt-1">{netsuiteStatus.lastSync.paymentsUpdated}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Rollovers Found</p>
                <p className="font-medium mt-1">{netsuiteStatus.lastSync.rolloversCreated}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start hover:border-bs-cobalt/30 hover:bg-bs-lavender transition-colors duration-150">
              <Link href="/mbas/new">Create new MBA</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start hover:border-bs-cobalt/30 hover:bg-bs-lavender transition-colors duration-150">
              <Link href="/clients/new">Add new client</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start hover:border-bs-cobalt/30 hover:bg-bs-lavender transition-colors duration-150">
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
            <p>3. Record invoices as they come in</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

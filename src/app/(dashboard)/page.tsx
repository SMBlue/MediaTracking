export const dynamic = "force-dynamic";

import Link from "next/link";
import { BarChart3, DollarSign, FileText, Receipt, HandCoins, AlertCircle, Plus, Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KPICard } from "@/components/kpi-card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
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
      <PageHeader
        title="Dashboard"
        description="Overview of your media buying agreements"
        actions={
          <Button asChild>
            <Link href="/mbas/new">+ New MBA</Link>
          </Button>
        }
      />

      {/* Budget Overview */}
      <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Active MBAs"
          value={stats.activeCount}
          subtitle={`${stats.mbaCount} total MBAs`}
          icon={BarChart3}
          accentColor="cobalt"
        />
        <KPICard
          label="Total Budget"
          value={formatCurrency(stats.totalBudget)}
          subtitle="Across active MBAs"
          icon={DollarSign}
          accentColor="cobalt"
        />
        <KPICard
          label="Vendor Invoiced"
          value={formatCurrency(stats.totalInvoiced)}
          subtitle={stats.totalBudget > 0
            ? `${Math.round((stats.totalInvoiced / stats.totalBudget) * 100)}% of budget invoiced`
            : "No budget set"}
          icon={Receipt}
          accentColor="neutral"
        />
        <KPICard
          label="Remaining"
          value={formatCurrency(stats.remaining)}
          subtitle="Available to spend"
          icon={DollarSign}
          accentColor="teal"
        />
      </div>
      </div>

      {/* Client Payment */}
      <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client Payments</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Received from Clients"
          value={formatCurrency(stats.totalClientPaid)}
          subtitle={`${stats.clientPaidCount} of ${stats.activeCount} MBAs fully paid${stats.clientPartialCount > 0 ? `, ${stats.clientPartialCount} partial` : ""}`}
          icon={HandCoins}
          accentColor="teal"
        />
        <KPICard
          label="Outstanding from Clients"
          value={formatCurrency(stats.totalOutstanding)}
          subtitle="Awaiting payment from clients"
          icon={AlertCircle}
          accentColor="coral"
        />
      </div>
      </div>

      {stats.needsReconCount > 0 && (
        <AlertBanner
          variant="info"
          action={
            <Button asChild variant="link" className="p-0 h-auto text-bs-cobalt">
              <Link href="/mbas">View MBAs</Link>
            </Button>
          }
        >
          <p>
            <strong>{stats.needsReconCount}</strong> active MBA{stats.needsReconCount > 1 ? "s" : ""} may need reconciliation (ended 60+ days ago)
          </p>
        </AlertBanner>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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

      <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/mbas/new" className="group">
          <div className="bg-card rounded-xl border border-border/60 shadow-[var(--shadow-card)] p-5 flex items-center gap-4 transition-all duration-150 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5">
            <div className="size-10 rounded-lg bg-bs-cobalt/10 flex items-center justify-center shrink-0 group-hover:bg-bs-cobalt/15 transition-colors duration-150">
              <Plus className="size-5 text-bs-cobalt" />
            </div>
            <div>
              <p className="font-medium text-sm">Create new MBA</p>
              <p className="text-xs text-muted-foreground">Set up a new media buying agreement</p>
            </div>
          </div>
        </Link>
        <Link href="/clients/new" className="group">
          <div className="bg-card rounded-xl border border-border/60 shadow-[var(--shadow-card)] p-5 flex items-center gap-4 transition-all duration-150 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5">
            <div className="size-10 rounded-lg bg-bs-cobalt/10 flex items-center justify-center shrink-0 group-hover:bg-bs-cobalt/15 transition-colors duration-150">
              <Building2 className="size-5 text-bs-cobalt" />
            </div>
            <div>
              <p className="font-medium text-sm">Add new client</p>
              <p className="text-xs text-muted-foreground">Register a new client organization</p>
            </div>
          </div>
        </Link>
        <Link href="/invoices/new" className="group">
          <div className="bg-card rounded-xl border border-border/60 shadow-[var(--shadow-card)] p-5 flex items-center gap-4 transition-all duration-150 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5">
            <div className="size-10 rounded-lg bg-bs-cobalt/10 flex items-center justify-center shrink-0 group-hover:bg-bs-cobalt/15 transition-colors duration-150">
              <FileText className="size-5 text-bs-cobalt" />
            </div>
            <div>
              <p className="font-medium text-sm">Record invoice</p>
              <p className="text-xs text-muted-foreground">Log a vendor invoice manually</p>
            </div>
          </div>
        </Link>
      </div>
      </div>
    </div>
  );
}

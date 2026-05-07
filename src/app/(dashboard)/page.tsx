export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KPICard } from "@/components/kpi-card";
import { AlertBanner } from "@/components/ui/alert-banner";
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
    const draftCount = await prisma.invoice.count({
      where: { status: "DRAFT" },
    });
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

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const needsReconCount = activeMBAs.filter(
    (mba) => new Date(mba.endDate) < sixtyDaysAgo
  ).length;

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

function formatRelativeTime(date: Date) {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 mb-3">
      {children}
    </h2>
  );
}

export default async function DashboardPage() {
  const [stats, emailStatus, netsuiteStatus] = await Promise.all([
    getDashboardStats(),
    getEmailIngestionStatus(),
    getNetsuiteSyncStatus(),
  ]);

  return (
    <div className="space-y-10">
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
      <section>
        <SectionLabel>Budget Overview</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Active MBAs"
            value={stats.activeCount}
            subtitle={`${stats.mbaCount} total`}
            accentColor="cobalt"
          />
          <KPICard
            label="Total Budget"
            value={formatCurrency(stats.totalBudget)}
            subtitle="Across active MBAs"
            accentColor="cobalt"
          />
          <KPICard
            label="Vendor Invoiced"
            value={formatCurrency(stats.totalInvoiced)}
            subtitle={
              stats.totalBudget > 0
                ? `${Math.round((stats.totalInvoiced / stats.totalBudget) * 100)}% of budget`
                : "No budget set"
            }
            accentColor="neutral"
          />
          <KPICard
            label="Remaining"
            value={formatCurrency(stats.remaining)}
            subtitle="Available to spend"
            accentColor="teal"
          />
        </div>
      </section>

      {/* Client Payments */}
      <section>
        <SectionLabel>Client Payments</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Received"
            value={formatCurrency(stats.totalClientPaid)}
            subtitle={`${stats.clientPaidCount} of ${stats.activeCount} fully paid${
              stats.clientPartialCount > 0
                ? `, ${stats.clientPartialCount} partial`
                : ""
            }`}
            accentColor="teal"
          />
          <KPICard
            label="Outstanding"
            value={formatCurrency(stats.totalOutstanding)}
            subtitle="Awaiting payment"
            accentColor="coral"
          />
        </div>
      </section>

      {stats.needsReconCount > 0 && (
        <AlertBanner
          variant="info"
          action={
            <Button asChild variant="link" className="p-0 h-auto">
              <Link href="/mbas">View MBAs</Link>
            </Button>
          }
        >
          <p>
            <strong>{stats.needsReconCount}</strong> active MBA
            {stats.needsReconCount > 1 ? "s" : ""} may need reconciliation
            (ended 60+ days ago)
          </p>
        </AlertBanner>
      )}

      {/* Sync activity — compact, side by side */}
      <section>
        <SectionLabel>Sync Activity</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          <SyncCard
            title="Email Ingestion"
            href="/sync-log"
            lastRun={emailStatus.lastSync?.startedAt ?? null}
            stats={
              emailStatus.lastSync
                ? [
                    {
                      label: "Processed",
                      value: emailStatus.lastSync.emailsProcessed,
                    },
                    {
                      label: "Created",
                      value: emailStatus.lastSync.invoicesCreated,
                    },
                    {
                      label: "Drafts",
                      value: emailStatus.draftCount,
                      href:
                        emailStatus.draftCount > 0
                          ? "/invoices/drafts"
                          : undefined,
                    },
                  ]
                : []
            }
            emptyText="Email invoice processing not yet configured."
          />
          <SyncCard
            title="NetSuite Sync"
            href="/sync-log"
            lastRun={netsuiteStatus.lastSync?.startedAt ?? null}
            stats={
              netsuiteStatus.lastSync
                ? [
                    {
                      label: "MBAs",
                      value: netsuiteStatus.lastSync.mbasChecked,
                    },
                    {
                      label: "Payments",
                      value: netsuiteStatus.lastSync.paymentsUpdated,
                    },
                    {
                      label: "Rollovers",
                      value: netsuiteStatus.lastSync.rolloversCreated,
                    },
                  ]
                : []
            }
            emptyText="NetSuite sync has not run yet."
          />
        </div>
      </section>

      {/* Quick actions — minimal text links, not boxed cards */}
      <section>
        <SectionLabel>Quick Actions</SectionLabel>
        <div className="grid gap-2 sm:grid-cols-3">
          <QuickAction
            href="/mbas/new"
            title="Create new MBA"
            description="Set up a new media buying agreement"
          />
          <QuickAction
            href="/clients/new"
            title="Add new client"
            description="Register a new client organization"
          />
          <QuickAction
            href="/invoices/new"
            title="Record invoice"
            description="Log a vendor invoice manually"
          />
        </div>
      </section>
    </div>
  );
}

function SyncCard({
  title,
  href,
  lastRun,
  stats,
  emptyText,
}: {
  title: string;
  href: string;
  lastRun: Date | null;
  stats: { label: string; value: number; href?: string }[];
  emptyText: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastRun ? `Last run ${formatRelativeTime(lastRun)}` : "Inactive"}
          </p>
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
      </div>
      {stats.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                {s.label}
              </p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <ArrowUpRight className="size-3.5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </Link>
  );
}

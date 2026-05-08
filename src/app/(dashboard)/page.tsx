export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KPICard } from "@/components/kpi-card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { calculateEffectiveBudget } from "@/lib/budget";

interface ClientRow {
  clientId: string;
  clientName: string;
  mbaCount: number;
  effectiveBudget: number;
  vendorInvoiced: number;
  remaining: number;
  clientPaid: number;
  outstanding: number;
}

async function getOverviewData() {
  const [activeMBAs, totalMBACount, lastEmailSync, lastNetsuiteSync, draftCount] =
    await Promise.all([
      prisma.mBA.findMany({
        where: { status: "ACTIVE" },
        include: {
          client: { select: { id: true, name: true } },
          invoiceAllocations: true,
          changeOrders: true,
          creditsIn: true,
          creditsOut: true,
        },
      }),
      prisma.mBA.count(),
      prisma.emailSyncLog
        .findFirst({ orderBy: { startedAt: "desc" } })
        .catch(() => null),
      prisma.netsuiteSyncLog
        .findFirst({ orderBy: { startedAt: "desc" } })
        .catch(() => null),
      prisma.invoice.count({ where: { status: "DRAFT" } }).catch(() => 0),
    ]);

  const clientMap = new Map<string, ClientRow>();
  let needsReconCount = 0;
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  for (const mba of activeMBAs) {
    if (new Date(mba.endDate) < sixtyDaysAgo) needsReconCount += 1;

    const effectiveBudget = calculateEffectiveBudget(mba);
    const vendorInvoiced = mba.invoiceAllocations.reduce(
      (s, a) => s + Number(a.amount),
      0
    );
    const remaining = effectiveBudget - vendorInvoiced;
    const clientPaid = Number(mba.clientPaidAmount || 0);
    const outstanding = effectiveBudget - clientPaid;

    const existing = clientMap.get(mba.clientId) ?? {
      clientId: mba.clientId,
      clientName: mba.client.name,
      mbaCount: 0,
      effectiveBudget: 0,
      vendorInvoiced: 0,
      remaining: 0,
      clientPaid: 0,
      outstanding: 0,
    };
    existing.mbaCount += 1;
    existing.effectiveBudget += effectiveBudget;
    existing.vendorInvoiced += vendorInvoiced;
    existing.remaining += remaining;
    existing.clientPaid += clientPaid;
    existing.outstanding += outstanding;
    clientMap.set(mba.clientId, existing);
  }

  const byClient = Array.from(clientMap.values()).sort(
    (a, b) => b.outstanding - a.outstanding
  );

  const totals = byClient.reduce(
    (acc, c) => ({
      mbaCount: acc.mbaCount + c.mbaCount,
      effectiveBudget: acc.effectiveBudget + c.effectiveBudget,
      vendorInvoiced: acc.vendorInvoiced + c.vendorInvoiced,
      remaining: acc.remaining + c.remaining,
      clientPaid: acc.clientPaid + c.clientPaid,
      outstanding: acc.outstanding + c.outstanding,
    }),
    {
      mbaCount: 0,
      effectiveBudget: 0,
      vendorInvoiced: 0,
      remaining: 0,
      clientPaid: 0,
      outstanding: 0,
    }
  );

  const outstandingClientCount = byClient.filter((c) => c.outstanding > 0).length;
  const netCashFlow = totals.clientPaid - totals.vendorInvoiced;

  return {
    byClient,
    totals,
    activeCount: activeMBAs.length,
    totalMBACount,
    needsReconCount,
    outstandingClientCount,
    netCashFlow,
    lastEmailSync,
    lastNetsuiteSync,
    draftCount,
  };
}

function fmt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function pct(part: number, whole: number) {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
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

export default async function OverviewPage() {
  const data = await getOverviewData();
  const {
    byClient,
    totals,
    activeCount,
    totalMBACount,
    needsReconCount,
    outstandingClientCount,
    netCashFlow,
    lastEmailSync,
    lastNetsuiteSync,
    draftCount,
  } = data;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Overview"
        description="Where active MBAs stand right now."
        actions={
          <Button asChild>
            <Link href="/mbas/new">+ New MBA</Link>
          </Button>
        }
      />

      {/* KPI strip */}
      <section>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KPICard
            label="Active MBAs"
            value={activeCount}
            subtitle={`${totalMBACount} total`}
            accentColor="cobalt"
          />
          <KPICard
            label="Effective Budget"
            value={fmt(totals.effectiveBudget)}
            subtitle={`Across ${byClient.length} client${byClient.length === 1 ? "" : "s"}`}
            accentColor="cobalt"
          />
          <KPICard
            label="Vendor Invoiced"
            value={fmt(totals.vendorInvoiced)}
            subtitle={`${pct(totals.vendorInvoiced, totals.effectiveBudget)} of budget`}
            accentColor="neutral"
          />
          <KPICard
            label="Client Paid"
            value={fmt(totals.clientPaid)}
            subtitle={`${pct(totals.clientPaid, totals.effectiveBudget)} of budget`}
            accentColor="teal"
          />
          <KPICard
            label="Net Cash Flow"
            value={`${netCashFlow >= 0 ? "+" : ""}${fmt(netCashFlow)}`}
            subtitle="Paid minus invoiced"
            accentColor={netCashFlow >= 0 ? "teal" : "coral"}
          />
        </div>
      </section>

      {/* Conditional alerts */}
      {(needsReconCount > 0 || totals.outstanding > 0) && (
        <section className="space-y-2">
          {needsReconCount > 0 && (
            <AlertBanner
              variant="info"
              action={
                <Button asChild variant="link" className="p-0 h-auto">
                  <Link href="/mbas">View MBAs</Link>
                </Button>
              }
            >
              <p>
                <strong>{needsReconCount}</strong> active MBA
                {needsReconCount === 1 ? "" : "s"} may need reconciliation
                (ended 60+ days ago)
              </p>
            </AlertBanner>
          )}
          {totals.outstanding > 0 && (
            <AlertBanner variant="warning">
              <p>
                <strong>{fmt(totals.outstanding)}</strong> outstanding from
                clients across {outstandingClientCount} client
                {outstandingClientCount === 1 ? "" : "s"}
              </p>
            </AlertBanner>
          )}
        </section>
      )}

      {/* By-client table */}
      <section>
        <SectionLabel>Cash Position by Client</SectionLabel>
        <Card>
          <CardHeader>
            <CardTitle>By Client</CardTitle>
            <CardDescription>
              Active MBAs only, sorted by outstanding balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byClient.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No active MBAs found.{" "}
                <Link
                  href="/mbas/new"
                  className="text-bs-cobalt hover:underline"
                >
                  Create one
                </Link>{" "}
                to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-center">MBAs</TableHead>
                      <TableHead className="text-right">
                        Effective Budget
                      </TableHead>
                      <TableHead className="text-right">
                        Vendor Invoiced
                      </TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-right">Client Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byClient.map((c) => {
                      const net = c.clientPaid - c.vendorInvoiced;
                      return (
                        <TableRow key={c.clientId}>
                          <TableCell>
                            <Link
                              href={`/clients/${c.clientId}`}
                              className="font-medium text-bs-cobalt hover:underline"
                            >
                              {c.clientName}
                            </Link>
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {c.mbaCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(c.effectiveBudget)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(c.vendorInvoiced)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt(c.remaining)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-bs-teal-dark">
                            {c.clientPaid > 0 ? fmt(c.clientPaid) : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              c.outstanding > 0
                                ? "text-bs-coral font-medium"
                                : ""
                            }`}
                          >
                            {c.outstanding > 0 ? fmt(c.outstanding) : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium ${
                              net >= 0 ? "text-bs-teal-dark" : "text-bs-coral"
                            }`}
                          >
                            {net >= 0 ? "+" : ""}
                            {fmt(net)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 font-bold bg-bs-lavender/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {totals.mbaCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.effectiveBudget)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.vendorInvoiced)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.remaining)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          totals.clientPaid > 0 ? "text-bs-teal-dark" : ""
                        }`}
                      >
                        {fmt(totals.clientPaid)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          totals.outstanding > 0 ? "text-bs-coral" : ""
                        }`}
                      >
                        {fmt(totals.outstanding)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          netCashFlow >= 0 ? "text-bs-teal-dark" : "text-bs-coral"
                        }`}
                      >
                        {netCashFlow >= 0 ? "+" : ""}
                        {fmt(netCashFlow)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Footer: sync activity + quick actions */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionLabel>Sync Activity</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <SyncCard
              title="Email Ingestion"
              href="/sync-log"
              lastRun={lastEmailSync?.startedAt ?? null}
              stats={
                lastEmailSync
                  ? [
                      { label: "Processed", value: lastEmailSync.emailsProcessed },
                      { label: "Created", value: lastEmailSync.invoicesCreated },
                      {
                        label: "Drafts",
                        value: draftCount,
                        href: draftCount > 0 ? "/invoices/drafts" : undefined,
                      },
                    ]
                  : []
              }
              emptyText="Email invoice processing not yet configured."
            />
            <SyncCard
              title="NetSuite Sync"
              href="/sync-log"
              lastRun={lastNetsuiteSync?.startedAt ?? null}
              stats={
                lastNetsuiteSync
                  ? [
                      { label: "MBAs", value: lastNetsuiteSync.mbasChecked },
                      {
                        label: "Payments",
                        value: lastNetsuiteSync.paymentsUpdated,
                      },
                      {
                        label: "Rollovers",
                        value: lastNetsuiteSync.rolloversCreated,
                      },
                    ]
                  : []
              }
              emptyText="NetSuite sync has not run yet."
            />
          </div>
        </div>

        <div>
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="grid gap-2">
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

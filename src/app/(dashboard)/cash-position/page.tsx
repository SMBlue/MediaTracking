export const dynamic = "force-dynamic";

import Link from "next/link";
import { DollarSign, Receipt, HandCoins, TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KPICard } from "@/components/kpi-card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { prisma } from "@/lib/db";
import { calculateEffectiveBudget } from "@/lib/budget";
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

interface ClientCashPosition {
  clientId: string;
  clientName: string;
  mbaCount: number;
  effectiveBudget: number;
  vendorInvoiced: number;
  remaining: number;
  clientPaid: number;
  outstanding: number;
}

async function getCashPositionData(): Promise<{
  byClient: ClientCashPosition[];
  totals: Omit<ClientCashPosition, "clientId" | "clientName" | "mbaCount"> & {
    mbaCount: number;
  };
}> {
  const mbas = await prisma.mBA.findMany({
    where: { status: "ACTIVE" },
    include: {
      client: { select: { id: true, name: true } },
      invoiceAllocations: true,
      changeOrders: true,
      creditsIn: true,
      creditsOut: true,
    },
  });

  const clientMap = new Map<string, ClientCashPosition>();

  for (const mba of mbas) {
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

    const effectiveBudget = calculateEffectiveBudget(mba);
    const vendorInvoiced = mba.invoiceAllocations.reduce(
      (sum, a) => sum + Number(a.amount),
      0
    );
    const remaining = effectiveBudget - vendorInvoiced;
    const clientPaidAmt = Number(mba.clientPaidAmount || 0);
    const outstandingAmt = effectiveBudget - clientPaidAmt;

    existing.mbaCount += 1;
    existing.effectiveBudget += effectiveBudget;
    existing.vendorInvoiced += vendorInvoiced;
    existing.remaining += remaining;
    existing.clientPaid += clientPaidAmt;
    existing.outstanding += outstandingAmt;

    clientMap.set(mba.clientId, existing);
  }

  const byClient = Array.from(clientMap.values()).sort(
    (a, b) => b.effectiveBudget - a.effectiveBudget
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

  return { byClient, totals };
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
  if (whole === 0) return "\u2014";
  return `${Math.round((part / whole) * 100)}%`;
}

export default async function CashPositionPage() {
  const { byClient, totals } = await getCashPositionData();

  const netCashFlow = totals.clientPaid - totals.vendorInvoiced;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cash Position"
        description="Financial overview across all active MBAs, grouped by client"
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Total Effective Budget"
          value={fmt(totals.effectiveBudget)}
          subtitle={`${totals.mbaCount} active MBAs across ${byClient.length} clients`}
          icon={DollarSign}
          accentColor="cobalt"
        />
        <KPICard
          label="Owed to Vendors"
          value={fmt(totals.vendorInvoiced)}
          subtitle={`${pct(totals.vendorInvoiced, totals.effectiveBudget)} of budget invoiced by platforms`}
          icon={Receipt}
          accentColor="coral"
        />
        <KPICard
          label="Received from Clients"
          value={fmt(totals.clientPaid)}
          subtitle={`${pct(totals.clientPaid, totals.effectiveBudget)} of budget collected`}
          icon={HandCoins}
          accentColor="teal"
        />
        <KPICard
          label="Net Cash Flow"
          value={`${netCashFlow >= 0 ? "+" : ""}${fmt(netCashFlow)}`}
          subtitle="Client payments minus vendor invoices"
          icon={netCashFlow >= 0 ? TrendingUp : TrendingDown}
          accentColor={netCashFlow >= 0 ? "teal" : "coral"}
        />
      </div>

      {/* Outstanding summary */}
      {totals.outstanding > 0 && (
        <AlertBanner variant="warning">
          <p>
            <strong>{fmt(totals.outstanding)}</strong> outstanding from clients
            across{" "}
            {byClient.filter((c) => c.outstanding > 0).length} client
            {byClient.filter((c) => c.outstanding > 0).length !== 1
              ? "s"
              : ""}
          </p>
        </AlertBanner>
      )}

      {/* Client breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle>By Client</CardTitle>
          <CardDescription>
            Cash position breakdown for each client (active MBAs only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byClient.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No active MBAs found.{" "}
              <Link href="/mbas/new" className="text-bs-cobalt hover:underline">
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
                          {c.clientPaid > 0 ? fmt(c.clientPaid) : "\u2014"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            c.outstanding > 0 ? "text-bs-coral font-medium" : ""
                          }`}
                        >
                          {c.outstanding > 0 ? fmt(c.outstanding) : "\u2014"}
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
                  {/* Totals row */}
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
                    <TableCell className="text-right tabular-nums text-bs-teal-dark">
                      {fmt(totals.clientPaid)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-bs-coral">
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
    </div>
  );
}

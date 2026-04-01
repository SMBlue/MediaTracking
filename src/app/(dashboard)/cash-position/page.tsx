export const dynamic = "force-dynamic";

import Link from "next/link";
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
    const clientPaidAmt = mba.clientPaid
      ? Number(mba.clientPaidAmount || mba.budget)
      : 0;
    const outstandingAmt = mba.clientPaid ? 0 : effectiveBudget;

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cash Position</h1>
        <p className="text-muted-foreground mt-1">
          Financial overview across all active MBAs, grouped by client
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Effective Budget</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {fmt(totals.effectiveBudget)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {totals.mbaCount} active MBAs across {byClient.length} clients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Owed to Vendors</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-bs-coral">
              {fmt(totals.vendorInvoiced)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pct(totals.vendorInvoiced, totals.effectiveBudget)} of budget
              invoiced by platforms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Received from Clients</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-bs-teal-dark">
              {fmt(totals.clientPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {pct(totals.clientPaid, totals.effectiveBudget)} of budget
              collected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net Cash Flow</CardDescription>
            <CardTitle
              className={`text-3xl tabular-nums ${
                netCashFlow >= 0 ? "text-bs-teal-dark" : "text-bs-coral"
              }`}
            >
              {netCashFlow >= 0 ? "+" : ""}
              {fmt(netCashFlow)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Client payments minus vendor invoices
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding summary */}
      {totals.outstanding > 0 && (
        <div className="bg-bs-yellow/40 border border-bs-yellow rounded-lg p-4">
          <p className="text-bs-midnight">
            <strong>{fmt(totals.outstanding)}</strong> outstanding from clients
            across{" "}
            {byClient.filter((c) => c.outstanding > 0).length} client
            {byClient.filter((c) => c.outstanding > 0).length !== 1
              ? "s"
              : ""}
          </p>
        </div>
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

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { calculateEffectiveBudget } from "@/lib/budget";
import { AddClientModal } from "@/components/add-client-modal";
import { ClientFilter } from "./client-filter";

async function getClients() {
  return prisma.client.findMany({
    orderBy: { name: "asc" },
  });
}

async function getMBAs(clientId?: string) {
  return prisma.mBA.findMany({
    where: clientId ? { clientId } : undefined,
    include: {
      client: true,
      invoiceAllocations: {
        include: {
          invoice: true,
        },
      },
      spendEntries: true,
      changeOrders: true,
      creditsIn: true,
      creditsOut: true,
    },
    orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function MBAsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientId } = await searchParams;
  const clients = await getClients();
  const mbas = await getMBAs(clientId);
  const selectedClient = clientId
    ? clients.find((c) => c.id === clientId)
    : null;

  // MBAs that may need reconciliation (active, end date 60+ days ago)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const needsReconCount = mbas.filter(
    (mba) => mba.status === "ACTIVE" && new Date(mba.endDate) < sixtyDaysAgo
  ).length;

  // Calculate totals
  const totals = mbas.reduce(
    (acc, mba) => {
      const budget = calculateEffectiveBudget(mba);
      const spend = mba.spendEntries.reduce(
        (sum, entry) => sum + Number(entry.amount),
        0
      );
      const invoiceTotal = mba.invoiceAllocations
        .filter((alloc) => alloc.invoice.type === "INVOICE")
        .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
      const creditTotal = mba.invoiceAllocations
        .filter((alloc) => alloc.invoice.type === "CREDIT_NOTE")
        .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
      const invoiced = invoiceTotal - creditTotal;
      const remaining = budget - invoiced;

      return {
        budget: acc.budget + budget,
        spend: acc.spend + spend,
        invoiced: acc.invoiced + invoiced,
        remaining: acc.remaining + remaining,
      };
    },
    { budget: 0, spend: 0, invoiced: 0, remaining: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MBAs</h1>
          <p className="text-muted-foreground mt-1">
            Media Buying Agreements and their budgets
          </p>
        </div>
        <div className="flex gap-2">
          <AddClientModal>
            <Button variant="outline">+ Add Client</Button>
          </AddClientModal>
          <Button asChild>
            <Link
              href={
                clientId ? `/mbas/new?clientId=${clientId}` : "/mbas/new"
              }
            >
              + New MBA
            </Link>
          </Button>
        </div>
      </div>

      {/* Client Filter */}
      <div className="flex items-center gap-4">
        <ClientFilter clients={clients} selectedClientId={clientId} />
        {selectedClient && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/clients/${selectedClient.id}`}>Edit Client</Link>
          </Button>
        )}
      </div>

      {needsReconCount > 0 && (
        <div className="bg-bs-light-blue border border-bs-cobalt/20 rounded-lg p-4">
          <p className="text-bs-midnight">
            <strong>{needsReconCount}</strong> MBA{needsReconCount > 1 ? "s" : ""} may need reconciliation (ended 60+ days ago)
          </p>
        </div>
      )}

      {mbas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No MBAs yet{selectedClient ? ` for ${selectedClient.name}` : ""}.</p>
          <p className="mt-2">
            <Link href="/mbas/new" className="text-bs-cobalt hover:underline">
              Create your first MBA
            </Link>
          </p>
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {!clientId && <TableHead>Client</TableHead>}
                <TableHead>MBA #</TableHead>
                <TableHead>NS #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Media Spend</TableHead>
                <TableHead className="text-right">Vendor Invoiced</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Client Paid Us</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mbas.map((mba) => {
                const budget = calculateEffectiveBudget(mba);
                const spend = mba.spendEntries.reduce(
                  (sum, entry) => sum + Number(entry.amount),
                  0
                );
                const invoiceTotal = mba.invoiceAllocations
                  .filter((alloc) => alloc.invoice.type === "INVOICE")
                  .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
                const creditTotal = mba.invoiceAllocations
                  .filter((alloc) => alloc.invoice.type === "CREDIT_NOTE")
                  .reduce((sum, alloc) => sum + Number(alloc.amount), 0);
                const invoiced = invoiceTotal - creditTotal;
                const remaining = budget - invoiced;
                const percentUsed = budget > 0 ? (invoiced / budget) * 100 : 0;

                return (
                  <TableRow key={mba.id}>
                    {!clientId && <TableCell>{mba.client.name}</TableCell>}
                    <TableCell className="font-medium">{mba.mbaNumber}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{mba.netsuiteProjectNumber || "\u2013"}</TableCell>
                    <TableCell>{mba.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(budget)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(invoiced)}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({Math.round(percentUsed)}%)
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        remaining < 0 ? "text-bs-coral font-medium" : ""
                      }`}
                    >
                      {formatCurrency(remaining)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          mba.status === "ACTIVE"
                            ? "bg-bs-teal/20 text-bs-teal-dark"
                            : mba.status === "CLOSED"
                            ? "bg-bs-dark-gray/10 text-bs-dark-gray"
                            : mba.status === "RECONCILING"
                            ? "bg-bs-cobalt/10 text-bs-cobalt"
                            : "bg-bs-yellow text-bs-dark-gray"
                        }`}
                      >
                        {mba.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {mba.clientPaid ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bs-teal/20 text-bs-teal-dark">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-bs-coral/15 text-bs-coral-dark">
                          Outstanding
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/mbas/${mba.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {mbas.length > 1 && (
              <TableFooter>
                <TableRow>
                  {!clientId && <TableCell />}
                  <TableCell colSpan={3} className="font-medium">
                    TOTALS ({mbas.length} MBAs)
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(totals.budget)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(totals.spend)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(totals.invoiced)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      totals.remaining < 0 ? "text-bs-coral" : ""
                    }`}
                  >
                    {formatCurrency(totals.remaining)}
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}

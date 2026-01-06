export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";

async function getMBAs() {
  return prisma.mBA.findMany({
    include: {
      client: true,
      invoiceAllocations: true,
    },
    orderBy: { createdAt: "desc" },
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

export default async function MBAsPage() {
  const mbas = await getMBAs();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MBAs</h1>
          <p className="text-muted-foreground">
            Media Buying Agreements and their budgets
          </p>
        </div>
        <Button asChild>
          <Link href="/mbas/new">+ New MBA</Link>
        </Button>
      </div>

      {mbas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No MBAs yet.</p>
          <p className="mt-2">
            <Link href="/mbas/new" className="text-primary hover:underline">
              Create your first MBA
            </Link>
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>MBA #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Vendor Invoiced</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Client Paid Us</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mbas.map((mba) => {
                const budget = Number(mba.budget);
                const invoiced = mba.invoiceAllocations.reduce(
                  (sum, alloc) => sum + Number(alloc.amount),
                  0
                );
                const remaining = budget - invoiced;
                const percentUsed = budget > 0 ? (invoiced / budget) * 100 : 0;

                return (
                  <TableRow key={mba.id}>
                    <TableCell>{mba.client.name}</TableCell>
                    <TableCell className="font-medium">{mba.mbaNumber}</TableCell>
                    <TableCell>{mba.name}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(budget)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoiced)}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({Math.round(percentUsed)}%)
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        remaining < 0 ? "text-red-600 font-medium" : ""
                      }`}
                    >
                      {formatCurrency(remaining)}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      {mba.clientPaid ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
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
          </Table>
        </div>
      )}
    </div>
  );
}

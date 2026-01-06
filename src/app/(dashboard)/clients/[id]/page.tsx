export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";

async function getClient(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      mbas: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) {
    notFound();
  }

  return client;
}

async function updateClient(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;

  if (!name || name.trim() === "") {
    throw new Error("Client name is required");
  }

  await prisma.client.update({
    where: { id },
    data: { name: name.trim() },
  });

  redirect(`/mbas?client=${id}`);
}

async function deleteClient(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;

  await prisma.client.delete({
    where: { id },
  });

  redirect("/mbas");
}

function formatCurrency(amount: number | bigint | { toNumber(): number }) {
  const num = typeof amount === "object" ? amount.toNumber() : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm">
        <Link href="/mbas" className="text-muted-foreground hover:text-foreground">
          &larr; Back to MBAs
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{client.name}</h1>
          <p className="text-muted-foreground">
            Created {new Date(client.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button asChild>
          <Link href={`/mbas/new?clientId=${client.id}`}>+ New MBA</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Edit Client</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateClient} className="space-y-4">
              <input type="hidden" name="id" value={client.id} />
              <div className="space-y-2">
                <Label htmlFor="name">Client Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={client.name}
                  required
                />
              </div>
              <Button type="submit">Save Changes</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={deleteClient}>
              <input type="hidden" name="id" value={client.id} />
              <p className="text-sm text-muted-foreground mb-4">
                Deleting this client will also delete all associated MBAs,
                spend entries, and invoice allocations.
              </p>
              <Button type="submit" variant="destructive">
                Delete Client
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MBAs ({client.mbas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {client.mbas.length === 0 ? (
            <p className="text-muted-foreground">No MBAs for this client yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MBA #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.mbas.map((mba) => (
                  <TableRow key={mba.id}>
                    <TableCell className="font-medium">{mba.mbaNumber}</TableCell>
                    <TableCell>{mba.name}</TableCell>
                    <TableCell>{formatCurrency(mba.budget)}</TableCell>
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
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/mbas/${mba.id}`}>View</Link>
                      </Button>
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

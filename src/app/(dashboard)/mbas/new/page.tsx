export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prisma } from "@/lib/db";

async function getClients() {
  return prisma.client.findMany({
    orderBy: { name: "asc" },
  });
}

async function generateMBANumber() {
  const year = new Date().getFullYear();
  const count = await prisma.mBA.count({
    where: {
      mbaNumber: {
        startsWith: `MBA-${year}`,
      },
    },
  });
  return `MBA-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function createMBA(formData: FormData) {
  "use server";

  const clientId = formData.get("clientId") as string;
  const name = formData.get("name") as string;
  const budget = parseFloat(formData.get("budget") as string);
  const currency = formData.get("currency") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const status = formData.get("status") as "DRAFT" | "ACTIVE" | "CLOSED";

  if (!clientId || !name || isNaN(budget) || !startDate || !endDate) {
    throw new Error("All fields are required");
  }

  // Generate MBA number
  const year = new Date().getFullYear();
  const count = await prisma.mBA.count({
    where: {
      mbaNumber: {
        startsWith: `MBA-${year}`,
      },
    },
  });
  const mbaNumber = `MBA-${year}-${String(count + 1).padStart(3, "0")}`;

  await prisma.mBA.create({
    data: {
      clientId,
      mbaNumber,
      name: name.trim(),
      budget,
      currency,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status,
    },
  });

  redirect("/mbas");
}

export default async function NewMBAPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId: preselectedClientId } = await searchParams;
  const clients = await getClients();
  const suggestedNumber = await generateMBANumber();

  if (clients.length === 0) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>New MBA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You need to create a client before you can create an MBA.
            </p>
            <Button asChild>
              <a href="/clients/new">Create Client</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const threeMonthsLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New MBA</CardTitle>
          <p className="text-sm text-muted-foreground">
            MBA Number: {suggestedNumber}
          </p>
        </CardHeader>
        <CardContent>
          <form action={createMBA} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">Client</Label>
              <Select name="clientId" defaultValue={preselectedClientId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Q1 Brand Campaign"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget</Label>
                <Input
                  id="budget"
                  name="budget"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="100000"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select name="currency" defaultValue="USD">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  defaultValue={today}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={threeMonthsLater}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="ACTIVE">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit">Create MBA</Button>
              <Button type="button" variant="outline" asChild>
                <a href="/mbas">Cancel</a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

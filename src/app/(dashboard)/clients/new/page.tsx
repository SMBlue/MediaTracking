import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prisma } from "@/lib/db";

async function createClient(formData: FormData) {
  "use server";

  const name = formData.get("name") as string;

  if (!name || name.trim() === "") {
    throw new Error("Client name is required");
  }

  await prisma.client.create({
    data: {
      name: name.trim(),
    },
  });

  redirect("/mbas");
}

export default function NewClientPage() {
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New Client</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createClient} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Acme Corporation"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create Client</Button>
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

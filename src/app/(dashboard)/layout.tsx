import { Nav } from "@/components/nav";
import { prisma } from "@/lib/db";

async function getDraftCount() {
  try {
    return await prisma.invoice.count({ where: { status: "DRAFT" } });
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const draftCount = await getDraftCount();

  return (
    <div className="min-h-screen flex flex-col">
      <Nav draftCount={draftCount} />
      <main className="flex-1 container mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

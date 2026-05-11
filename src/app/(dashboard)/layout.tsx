import { SidebarNav } from "@/components/sidebar-nav";
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
    <div className="min-h-screen flex bg-background">
      <SidebarNav draftCount={draftCount} />
      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="max-w-[1600px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

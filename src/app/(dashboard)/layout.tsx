import { SidebarNav } from "@/components/sidebar-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background">
      <SidebarNav />
      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="max-w-[1600px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

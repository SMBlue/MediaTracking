"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Receipt,
  Activity,
  ClipboardList,
  BookOpen,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/mbas", label: "MBAs", icon: Briefcase, exact: false },
  { href: "/invoices", label: "Vendor Invoices", icon: Receipt, exact: false },
  { href: "/sync-log", label: "Sync Log", icon: Activity, exact: true },
  { href: "/audit", label: "Audit Log", icon: ClipboardList, exact: true },
  { href: "/docs", label: "Documentation", icon: BookOpen, exact: false },
];

export function SidebarNav({ draftCount = 0 }: { draftCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (item: (typeof navItems)[0]) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="px-5 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-7 rounded-md bg-bs-cobalt/95 flex items-center justify-center shadow-sm">
            <span className="text-white text-[11px] font-bold tracking-tight">
              M
            </span>
          </div>
          <span className="font-semibold text-[15px] tracking-tight">
            MBA Tracker
          </span>
        </Link>
      </div>

      <nav className="px-2 py-3 space-y-0.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/invoices" && draftCount > 0 && (
                <span className="text-[10px] font-semibold tabular-nums text-bs-coral-dark bg-bs-coral/10 px-1.5 py-0.5 rounded-full">
                  {draftCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <LogOut className="size-4 opacity-80" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

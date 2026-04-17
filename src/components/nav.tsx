"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/cash-position", label: "Cash Position", exact: true },
  { href: "/mbas", label: "MBAs", exact: false },
  { href: "/invoices", label: "Vendor Invoices", exact: false },
  { href: "/audit", label: "Audit Log", exact: true },
];

export function Nav({ draftCount = 0 }: { draftCount?: number }) {
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
    <nav className="bg-bs-midnight border-b border-bs-medium-blue shadow-[var(--shadow-nav)]">
      <div className="container mx-auto px-4">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="size-6 rounded bg-bs-cobalt flex items-center justify-center">
                <span className="text-white text-xs font-bold">M</span>
              </div>
              <span className="font-bold text-sm text-white tracking-tight">
                MBA Tracker
              </span>
            </Link>
            <div className="flex gap-0.5">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium px-3 py-1.5 rounded-md transition-colors duration-150 relative",
                    isActive(item)
                      ? "bg-white/[0.12] text-white"
                      : "text-bs-lavender/70 hover:text-white hover:bg-white/[0.06]"
                  )}
                >
                  {item.label}
                  {item.href === "/invoices" && draftCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 inline-flex items-center justify-center w-4.5 h-4.5 text-[10px] font-bold text-white bg-bs-coral rounded-full">
                      {draftCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-bs-lavender/60 hover:text-white hover:bg-white/[0.06] h-8 text-xs"
          >
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}

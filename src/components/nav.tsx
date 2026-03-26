"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/cash-position", label: "Cash Position" },
  { href: "/mbas", label: "MBAs" },
  { href: "/invoices", label: "Vendor Invoices" },
  { href: "/audit", label: "Audit Log" },
];

export function Nav({ draftCount = 0 }: { draftCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="bg-bs-midnight border-b border-bs-medium-blue">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="font-bold text-lg text-white tracking-tight">
              MBA Tracker
            </Link>
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium px-3 py-1.5 rounded-md transition-colors duration-150 relative",
                    pathname === item.href
                      ? "bg-bs-cobalt text-white"
                      : "text-bs-lavender/80 hover:text-white hover:bg-bs-medium-blue"
                  )}
                >
                  {item.label}
                  {item.href === "/invoices" && draftCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-bs-coral rounded-full">
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
            className="text-bs-lavender/70 hover:text-white hover:bg-bs-medium-blue"
          >
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}

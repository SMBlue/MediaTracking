"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const ALL = "__all__";

export type InvoiceFilterOption = { value: string; label: string };

type Props = {
  clients: InvoiceFilterOption[];
  platforms: InvoiceFilterOption[];
};

export function InvoiceFilters({ clients, platforms }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = useMemo(
    () => ({
      client: searchParams.get("client") ?? ALL,
      platform: searchParams.get("platform") ?? ALL,
      paid: searchParams.get("paid") ?? ALL,
      vendor: searchParams.get("vendor") ?? "",
    }),
    [searchParams]
  );

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === ALL) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [searchParams, router, pathname]
  );

  const clearAll = () => {
    startTransition(() => {
      router.replace(pathname);
    });
  };

  const anyActive =
    current.client !== ALL ||
    current.platform !== ALL ||
    current.paid !== ALL ||
    current.vendor !== "";

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-border bg-card/40">
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Client</Label>
        <Select
          value={current.client}
          onValueChange={(v) => updateParam("client", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Platform</Label>
        <Select
          value={current.platform}
          onValueChange={(v) => updateParam("platform", v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Paid status</Label>
        <Select
          value={current.paid}
          onValueChange={(v) => updateParam("paid", v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Vendor name</Label>
        <Input
          type="text"
          placeholder="e.g. Spotify"
          value={current.vendor}
          onChange={(e) => updateParam("vendor", e.target.value)}
          className="w-[180px]"
        />
      </div>

      {anyActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          disabled={isPending}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateInvoicePlatform, updateInvoiceClient } from "@/app/(dashboard)/invoices/[id]/actions";

const PLATFORM_OPTIONS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
] as const;

type Platform = (typeof PLATFORM_OPTIONS)[number]["value"];

const UNKNOWN = "__unknown__";

export function InvoicePlatformEdit({
  invoiceId,
  currentPlatform,
}: {
  invoiceId: string;
  currentPlatform: Platform;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        Platform
      </span>
      <Select
        value={currentPlatform}
        disabled={isPending}
        onValueChange={(v) =>
          startTransition(() => updateInvoicePlatform(invoiceId, v as Platform))
        }
      >
        <SelectTrigger className="h-7 text-xs w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLATFORM_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InvoiceClientEdit({
  invoiceId,
  currentClientId,
  clients,
}: {
  invoiceId: string;
  currentClientId: string | null;
  clients: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const value = currentClientId ?? UNKNOWN;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        Client
      </span>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(v) =>
          startTransition(() =>
            updateInvoiceClient(invoiceId, v === UNKNOWN ? null : v)
          )
        }
      >
        <SelectTrigger className="h-7 text-xs w-[200px]">
          <SelectValue placeholder="Unknown" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNKNOWN}>
            <span className="italic text-muted-foreground">Unknown</span>
          </SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

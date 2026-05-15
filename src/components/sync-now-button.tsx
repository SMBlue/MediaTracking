"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; created: number; processed: number; skipped: number; errors: number }
  | { kind: "error"; message: string };

export function SyncNowButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = async () => {
    setResult({ kind: "running" });
    try {
      const res = await fetch("/api/cron/process-invoices/manual", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult({
        kind: "done",
        created: Number(data.invoicesCreated ?? 0),
        processed: Number(data.emailsProcessed ?? 0),
        skipped: Number(data.emailsSkipped ?? 0),
        errors: Number(data.errors ?? 0),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setResult({ kind: "error", message: String(err) });
    }
  };

  const busy = result.kind === "running" || isPending;

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={onClick}
        disabled={busy}
      >
        <RefreshCw className={`size-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing…" : "Sync now"}
      </Button>
      {result.kind === "done" && (
        <span className="text-xs text-muted-foreground">
          +{result.created} invoice{result.created === 1 ? "" : "s"} · {" "}
          {result.processed} email{result.processed === 1 ? "" : "s"} processed
          {result.skipped > 0 && <> · {result.skipped} skipped</>}
          {result.errors > 0 && (
            <> · <span className="text-bs-coral">{result.errors} error{result.errors === 1 ? "" : "s"}</span></>
          )}
        </span>
      )}
      {result.kind === "error" && (
        <span className="text-xs text-bs-coral">Error: {result.message}</span>
      )}
    </div>
  );
}

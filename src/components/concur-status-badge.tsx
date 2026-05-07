import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  NOT_SYNCED: "Not synced",
  PENDING: "Pending",
  SYNCED: "In Concur",
  SYNC_FAILED: "Sync failed",
  PAYMENT_RECEIVED: "Paid",
  SYNCED_PROJECT: "Project synced",
  FAILED: "Sync failed",
};

const STATUS_VARIANT: Record<
  string,
  "active" | "draft" | "paid" | "unpaid" | "info" | "closed"
> = {
  NOT_SYNCED: "draft",
  PENDING: "info",
  SYNCED: "active",
  SYNC_FAILED: "unpaid",
  PAYMENT_RECEIVED: "paid",
  SYNCED_PROJECT: "active",
  FAILED: "unpaid",
};

/**
 * Small status badge for an Invoice's or MBA's Concur sync state.
 * Pass a status string from `Invoice.concurSyncStatus` (NOT_SYNCED, SYNCED, …)
 * or `MBA.concurSyncStatus` (SYNCED, FAILED).
 */
export function ConcurStatusBadge({
  status,
  showWhenNotSynced = true,
}: {
  status: string | null | undefined;
  showWhenNotSynced?: boolean;
}) {
  const key = status ?? "NOT_SYNCED";
  if (!showWhenNotSynced && key === "NOT_SYNCED") return null;

  const label = STATUS_LABEL[key] ?? key;
  const variant = STATUS_VARIANT[key] ?? "info";

  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

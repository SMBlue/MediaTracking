import { prisma } from "@/lib/db";

// Small badge: "Auto-syncs every 4h · Last: 2h ago".
// Cadence is hardcoded to match the cron schedule in vercel.json
// (every 4 hours). Last-run is the most recent EmailSyncLog.startedAt.
export async function SyncCadence({ className }: { className?: string }) {
  const last = await prisma.emailSyncLog
    .findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } })
    .catch(() => null);

  return (
    <span className={`text-xs text-muted-foreground ${className ?? ""}`}>
      Auto-syncs every 4h
      {last && <> · Last: {formatRelative(last.startedAt)}</>}
    </span>
  );
}

function formatRelative(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

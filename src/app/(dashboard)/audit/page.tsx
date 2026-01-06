export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";

async function getAuditLogs() {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatChanges(changes: unknown) {
  if (!changes || typeof changes !== "object") return "-";

  const changesObj = changes as Record<string, { old: unknown; new: unknown }>;
  const entries = Object.entries(changesObj);

  if (entries.length === 0) return "-";

  return entries.map(([field, { old, new: newVal }]) => (
    `${field}: ${formatValue(old)} → ${formatValue(newVal)}`
  )).join(", ");
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return val.toLocaleString();
  if (val instanceof Date) return formatDate(val);
  return String(val);
}

function getActionColor(action: string) {
  switch (action) {
    case "CREATE":
      return "bg-green-100 text-green-700";
    case "UPDATE":
      return "bg-blue-100 text-blue-700";
    case "DELETE":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default async function AuditLogPage() {
  const logs = await getAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">
          Track all changes made to your data
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No activity recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getActionColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{log.entityType}</span>
                      <span className="text-muted-foreground text-xs block">
                        {log.entityId.slice(0, 8)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.userEmail || log.userId || "-"}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {formatChanges(log.changes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

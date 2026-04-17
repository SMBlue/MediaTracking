export const dynamic = "force-dynamic";

import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
    `${field}: ${formatValue(old)} \u2192 ${formatValue(newVal)}`
  )).join(", ");
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return val.toLocaleString();
  if (val instanceof Date) return formatDate(val);
  return String(val);
}

function getActionVariant(action: string) {
  switch (action) {
    case "CREATE": return "create" as const;
    case "UPDATE": return "update" as const;
    case "DELETE": return "delete" as const;
    default: return "info" as const;
  }
}

export default async function AuditLogPage() {
  const logs = await getAuditLogs();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Track all changes made to your data"
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No activity recorded yet"
              description="Changes to your data will appear here as they happen."
            />
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
                      <Badge variant={getActionVariant(log.action)}>
                        {log.action}
                      </Badge>
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

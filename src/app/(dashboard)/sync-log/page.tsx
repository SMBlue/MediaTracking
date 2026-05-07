export const dynamic = "force-dynamic";

import { Activity } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function formatDateTime(date: Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function durationMs(start: Date, end: Date | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({
  status,
  hasErrors,
}: {
  status: string;
  hasErrors: boolean;
}) {
  if (status === "RUNNING") return <Badge variant="info" dot>Running</Badge>;
  if (status === "FAILED") return <Badge variant="unpaid" dot>Failed</Badge>;
  if (hasErrors) return <Badge variant="medium" dot>With errors</Badge>;
  return <Badge variant="active" dot>Completed</Badge>;
}

export default async function SyncLogPage() {
  const [concurLogs, netsuiteLogs, emailLogs] = await Promise.all([
    prisma.concurSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.netsuiteSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.emailSyncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
  ]);

  const empty =
    concurLogs.length === 0 &&
    netsuiteLogs.length === 0 &&
    emailLogs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sync Log"
        description="Recent runs of background sync jobs (email ingestion, NetSuite, Concur)"
      />

      {empty ? (
        <EmptyState
          icon={Activity}
          title="No sync runs yet"
          description="Cron jobs haven't recorded any activity. They run automatically on Vercel."
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Concur Sync</CardTitle>
            </CardHeader>
            <CardContent>
              {concurLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Concur sync runs recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">
                        Projects synced
                      </TableHead>
                      <TableHead className="text-right">
                        Invoices pushed
                      </TableHead>
                      <TableHead className="text-right">
                        Payments updated
                      </TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {concurLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(log.startedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={log.status}
                            hasErrors={!!log.errors}
                          />
                        </TableCell>
                        <TableCell>
                          {durationMs(log.startedAt, log.completedAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.projectsSynced}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.invoicesPushed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.paymentsUpdated}
                        </TableCell>
                        <TableCell className="max-w-md text-xs text-muted-foreground">
                          {log.errors ? (
                            <details>
                              <summary className="cursor-pointer text-bs-coral">
                                {log.errors.split("\n").length} error
                                {log.errors.split("\n").length === 1 ? "" : "s"}
                              </summary>
                              <pre className="whitespace-pre-wrap text-xs mt-1">
                                {log.errors}
                              </pre>
                            </details>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>NetSuite Sync</CardTitle>
            </CardHeader>
            <CardContent>
              {netsuiteLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No NetSuite sync runs recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">MBAs checked</TableHead>
                      <TableHead className="text-right">
                        Payments updated
                      </TableHead>
                      <TableHead className="text-right">
                        Rollovers created
                      </TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {netsuiteLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(log.startedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={log.status}
                            hasErrors={!!log.errors}
                          />
                        </TableCell>
                        <TableCell>
                          {durationMs(log.startedAt, log.completedAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.mbasChecked}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.paymentsUpdated}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.rolloversCreated}
                        </TableCell>
                        <TableCell className="max-w-md text-xs text-muted-foreground">
                          {log.errors ? (
                            <details>
                              <summary className="cursor-pointer text-bs-coral">
                                {log.errors.split("\n").length} error
                                {log.errors.split("\n").length === 1 ? "" : "s"}
                              </summary>
                              <pre className="whitespace-pre-wrap text-xs mt-1">
                                {log.errors}
                              </pre>
                            </details>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Ingestion</CardTitle>
            </CardHeader>
            <CardContent>
              {emailLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No email sync runs recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Found</TableHead>
                      <TableHead className="text-right">Processed</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(log.startedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={log.status}
                            hasErrors={!!log.errors}
                          />
                        </TableCell>
                        <TableCell>
                          {durationMs(log.startedAt, log.completedAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.emailsFound}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.emailsProcessed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {log.invoicesCreated}
                        </TableCell>
                        <TableCell className="max-w-md text-xs text-muted-foreground">
                          {log.errors ? (
                            <details>
                              <summary className="cursor-pointer text-bs-coral">
                                {log.errors.split("\n").length} error
                                {log.errors.split("\n").length === 1 ? "" : "s"}
                              </summary>
                              <pre className="whitespace-pre-wrap text-xs mt-1">
                                {log.errors}
                              </pre>
                            </details>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

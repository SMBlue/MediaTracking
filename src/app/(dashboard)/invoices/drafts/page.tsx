export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { logAudit } from "@/lib/audit";

const PLATFORMS = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "META", label: "Meta" },
  { value: "BING", label: "Bing" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "OTHER", label: "Other" },
];

async function getDraftInvoices() {
  return prisma.invoice.findMany({
    where: { status: "DRAFT" },
    include: {
      lineItems: true,
      _count: { select: { lineItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function confirmDraft(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await prisma.invoice.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "UPDATE",
    changes: { status: { old: "DRAFT", new: "CONFIRMED" } },
  });
  redirect("/invoices/drafts");
}

async function discardDraft(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await prisma.invoice.delete({ where: { id } });
  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "DELETE",
  });
  redirect("/invoices/drafts");
}

async function confirmAllHighConfidence() {
  "use server";
  const drafts = await prisma.invoice.findMany({
    where: {
      status: "DRAFT",
      parseConfidence: { gte: 0.8 },
    },
  });

  for (const draft of drafts) {
    await prisma.invoice.update({
      where: { id: draft.id },
      data: { status: "CONFIRMED" },
    });
    await logAudit({
      entityType: "Invoice",
      entityId: draft.id,
      action: "UPDATE",
      changes: { status: { old: "DRAFT", new: "CONFIRMED" } },
    });
  }
  redirect("/invoices/drafts");
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function confidenceBadge(confidence: number | null) {
  if (confidence === null) return null;
  const variant = confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";
  const label = confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
  return (
    <Badge variant={variant} dot>
      {label} ({Math.round(confidence * 100)}%)
    </Badge>
  );
}

export default async function DraftInvoicesPage() {
  const drafts = await getDraftInvoices();

  const highConfidenceCount = drafts.filter(
    (d) => d.parseConfidence !== null && d.parseConfidence >= 0.8
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Draft Invoices"
        description="Review auto-parsed invoices from email before confirming"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Vendor Invoices", href: "/invoices" },
          { label: "Drafts" },
        ]}
        actions={
          <>
            {highConfidenceCount > 0 && (
              <form action={confirmAllHighConfidence}>
                <Button type="submit" variant="outline">
                  Confirm All High-Confidence ({highConfidenceCount})
                </Button>
              </form>
            )}
            <Button asChild variant="ghost">
              <Link href="/invoices">Back to Invoices</Link>
            </Button>
          </>
        }
      />

      {drafts.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No draft invoices pending review"
          description="Draft invoices are created automatically when emails with PDF attachments are processed."
        />
      ) : (
        <div className="space-y-4">
          {drafts.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">
                      {invoice.invoiceNumber}
                    </CardTitle>
                    {confidenceBadge(invoice.parseConfidence)}
                    <span className="text-sm text-muted-foreground">
                      {PLATFORMS.find((p) => p.value === invoice.vendor)
                        ?.label || invoice.vendor}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/invoices/${invoice.id}`}>Review</Link>
                    </Button>
                    <form action={confirmDraft}>
                      <input type="hidden" name="id" value={invoice.id} />
                      <Button type="submit" size="sm">
                        Confirm
                      </Button>
                    </form>
                    <form action={discardDraft}>
                      <input type="hidden" name="id" value={invoice.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        Discard
                      </Button>
                    </form>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Date:</span>{" "}
                    {formatDate(invoice.invoiceDate)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span>{" "}
                    {formatCurrency(Number(invoice.totalAmount))}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Line Items:</span>{" "}
                    {invoice._count.lineItems}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source:</span>{" "}
                    {invoice.emailSubject || "Email"}
                  </div>
                </div>

                {invoice.lineItems.length > 0 && (
                  <Table className="mt-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.lineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.campaignName}</TableCell>
                          <TableCell>{item.platform || "–"}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(item.amount))}
                          </TableCell>
                          <TableCell>
                            {confidenceBadge(item.confidence)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {invoice.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {invoice.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { syncInvoiceAllocations } from "@/lib/invoice-matching";
import { pushInvoiceToConcur } from "@/lib/concur/invoices";

export async function syncInvoiceToConcur(formData: FormData) {
  const id = formData.get("id") as string;

  // If this is a retry, clear the previous failure so the push isn't blocked.
  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { concurInvoiceId: true, concurSyncStatus: true },
  });

  if (existing?.concurSyncStatus === "SYNC_FAILED") {
    await prisma.invoice.update({
      where: { id },
      data: {
        concurSyncStatus: "NOT_SYNCED",
        concurLastSyncError: null,
      },
    });
  }

  try {
    await pushInvoiceToConcur(id);
  } catch (err) {
    // Surface the failure on the invoice so the UI can show it. pushInvoiceToConcur
    // by itself doesn't update state on direct throw (only the bulk runner does).
    console.error("Manual Concur sync failed:", err);
    await prisma.invoice.update({
      where: { id },
      data: {
        concurSyncStatus: "SYNC_FAILED",
        concurLastSyncAt: new Date(),
        concurLastSyncError: String(err).slice(0, 1000),
      },
    });
  }

  redirect(`/invoices/${id}`);
}

export async function togglePaidStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const currentStatus = formData.get("currentStatus") === "true";

  await prisma.invoice.update({
    where: { id },
    data: {
      isPaid: !currentStatus,
      paidDate: !currentStatus ? new Date() : null,
    },
  });

  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "UPDATE",
    changes: { isPaid: { old: currentStatus, new: !currentStatus } },
  });

  redirect(`/invoices/${id}`);
}

export async function deleteInvoice(formData: FormData) {
  const id = formData.get("id") as string;

  await prisma.invoice.delete({
    where: { id },
  });

  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "DELETE",
  });

  redirect("/invoices");
}

export async function confirmDraft(formData: FormData) {
  const id = formData.get("id") as string;

  // Sync allocations from line item assignments before confirming
  await syncInvoiceAllocations(id);

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

  redirect(`/invoices/${id}`);
}

export async function discardDraft(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.invoice.delete({ where: { id } });
  await logAudit({
    entityType: "Invoice",
    entityId: id,
    action: "DELETE",
  });
  redirect("/invoices/drafts");
}

export async function bulkAssignLineItems(
  invoiceId: string,
  assignments: Array<{ lineItemId: string; mbaId: string | null }>
) {
  await prisma.$transaction(
    assignments.map((a) =>
      prisma.vendorInvoiceLineItem.update({
        where: { id: a.lineItemId },
        data: { mbaId: a.mbaId },
      })
    )
  );

  // Sync allocations to reflect the new assignments
  await syncInvoiceAllocations(invoiceId);

  await logAudit({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "UPDATE",
    changes: {
      lineItemAssignments: {
        old: null,
        new: assignments.map((a) => ({
          lineItemId: a.lineItemId,
          mbaId: a.mbaId,
        })),
      },
    },
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

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

const PLATFORM_VALUES = [
  "GOOGLE_ADS",
  "META",
  "BING",
  "TIKTOK",
  "LINKEDIN",
  "OTHER",
] as const;
type PlatformValue = (typeof PLATFORM_VALUES)[number];

export async function updateInvoicePlatform(
  invoiceId: string,
  platform: PlatformValue
) {
  if (!PLATFORM_VALUES.includes(platform)) {
    throw new Error(`Invalid platform: ${platform}`);
  }

  const existing = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { vendor: true },
  });
  if (existing.vendor === platform) return;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { vendor: platform },
  });

  await logAudit({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "UPDATE",
    changes: { vendor: { old: existing.vendor, new: platform } },
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

export async function updateInvoiceClient(
  invoiceId: string,
  clientId: string | null
) {
  const existing = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { detectedClientId: true, detectedClientName: true },
  });

  if (clientId === null) {
    if (existing.detectedClientId === null) return;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { detectedClientId: null, detectedClientName: null },
    });
    await logAudit({
      entityType: "Invoice",
      entityId: invoiceId,
      action: "UPDATE",
      changes: {
        detectedClientId: { old: existing.detectedClientId, new: null },
        detectedClientName: { old: existing.detectedClientName, new: null },
      },
    });
    revalidatePath(`/invoices/${invoiceId}`);
    return;
  }

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { id: true, name: true },
  });

  if (
    existing.detectedClientId === client.id &&
    existing.detectedClientName === client.name
  ) {
    return;
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      detectedClientId: client.id,
      detectedClientName: client.name,
    },
  });

  await logAudit({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "UPDATE",
    changes: {
      detectedClientId: { old: existing.detectedClientId, new: client.id },
      detectedClientName: { old: existing.detectedClientName, new: client.name },
    },
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

/**
 * Remove a single MBA allocation by unmapping every line item that
 * routed to that MBA, then re-syncing allocations from line items.
 * Lets the user reverse one mis-assignment without going row by row
 * through the line items table.
 */
export async function clearMbaAllocation(allocationId: string) {
  const allocation = await prisma.invoiceAllocation.findUniqueOrThrow({
    where: { id: allocationId },
    select: { invoiceId: true, mbaId: true, amount: true },
  });

  await prisma.vendorInvoiceLineItem.updateMany({
    where: { invoiceId: allocation.invoiceId, mbaId: allocation.mbaId },
    data: { mbaId: null },
  });

  await syncInvoiceAllocations(allocation.invoiceId);

  await logAudit({
    entityType: "InvoiceAllocation",
    entityId: allocationId,
    action: "DELETE",
    changes: {
      mbaId: { old: allocation.mbaId, new: null },
      amount: { old: Number(allocation.amount), new: 0 },
    },
  });

  revalidatePath(`/invoices/${allocation.invoiceId}`);
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

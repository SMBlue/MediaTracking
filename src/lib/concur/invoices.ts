/**
 * SAP Concur Invoice (Payment Request) v3 API.
 *
 * Pushes confirmed vendor invoices to Concur with pre-allocated line items
 * and project assignments, so finance only needs to review and approve.
 *
 * Endpoint: POST /api/v3.0/invoice/paymentrequest
 */

import { prisma } from "../db";
import { logAudit } from "../audit";
import { getConcurClient } from "./client";
import { CONCUR_API_PATHS } from "./constants";
import { invoiceToConcurPaymentRequest } from "./mappers";
import type { ConcurInvoiceResponse } from "./types";

/**
 * Push a single confirmed invoice to Concur.
 *
 * @param invoiceId - The MBA Tracker invoice ID
 * @returns The Concur PaymentRequestId
 */
export async function pushInvoiceToConcur(
  invoiceId: string
): Promise<string> {
  // Load invoice with allocations and MBA data
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      allocations: {
        include: {
          mba: {
            include: {
              client: true,
            },
          },
        },
      },
    },
  });

  // Guard: only push confirmed invoices
  if (invoice.status !== "CONFIRMED") {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} is ${invoice.status}, not CONFIRMED`
    );
  }

  // Guard: don't push if already synced
  if (invoice.concurInvoiceId) {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} already has Concur ID: ${invoice.concurInvoiceId}`
    );
  }

  // Guard: must have allocations
  if (invoice.allocations.length === 0) {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} has no allocations — cannot push to Concur without MBA assignments`
    );
  }

  // Concur vendor code must be looked up from the Concur Vendor v3.1 list.
  // For now, require it via env or future per-vendor mapping.
  const vendorCode = process.env.CONCUR_DEFAULT_VENDOR_CODE;
  if (!vendorCode) {
    throw new Error(
      "CONCUR_DEFAULT_VENDOR_CODE not set. Need to map MBA Tracker vendor → Concur VendorCode."
    );
  }

  // Map to Concur format
  const concurInvoice = invoiceToConcurPaymentRequest(
    {
      vendor: invoice.vendor,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalAmount: Number(invoice.totalAmount),
      currency: invoice.currency,
    },
    invoice.allocations.map((a) => ({
      amount: Number(a.amount),
      mba: {
        name: a.mba.name,
        concurProjectCode: a.mba.concurProjectCode,
        concurClientCode: a.mba.concurClientCode,
        concurProjectOfficeCode: a.mba.concurProjectOfficeCode,
        client: { name: a.mba.client.name },
      },
    })),
    { vendorCode }
  );

  // Push to Concur
  const client = getConcurClient();
  const response = await client.post<ConcurInvoiceResponse>(
    CONCUR_API_PATHS.INVOICE_CREATE,
    concurInvoice
  );

  // Update invoice with Concur ID
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      concurInvoiceId: response.ID,
      concurSyncStatus: "SYNCED",
      concurLastSyncAt: new Date(),
      concurLastSyncError: null,
    },
  });

  // Audit log
  await logAudit({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "UPDATE",
    changes: {
      concurSyncStatus: { old: "NOT_SYNCED", new: "SYNCED" },
      concurInvoiceId: { old: null, new: response.ID },
    },
  });

  return response.ID;
}

/**
 * Push all confirmed, un-synced invoices to Concur.
 * Returns counts of successes and failures.
 */
export async function pushPendingInvoices(): Promise<{
  pushed: number;
  failed: number;
  errors: string[];
}> {
  const result = { pushed: 0, failed: 0, errors: [] as string[] };

  const pendingInvoices = await prisma.invoice.findMany({
    where: {
      status: "CONFIRMED",
      concurSyncStatus: "NOT_SYNCED",
      // Must have at least one allocation
      allocations: { some: {} },
    },
    select: { id: true, invoiceNumber: true },
  });

  for (const invoice of pendingInvoices) {
    try {
      await pushInvoiceToConcur(invoice.id);
      result.pushed++;
    } catch (err) {
      result.failed++;
      const errorMsg = `Failed to push invoice ${invoice.invoiceNumber}: ${err}`;
      result.errors.push(errorMsg);

      // Mark as failed so we can surface in UI
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          concurSyncStatus: "SYNC_FAILED",
          concurLastSyncAt: new Date(),
          concurLastSyncError: String(err),
        },
      });
    }
  }

  return result;
}

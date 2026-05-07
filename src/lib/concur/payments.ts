/**
 * SAP Concur Payment Status Pull.
 *
 * Polls the Invoice Payment Request Digest v3 API for payment status updates
 * on invoices that have been pushed to Concur.
 *
 * Endpoint: GET /api/v3.0/invoice/paymentrequestdigests
 */

import { prisma } from "../db";
import { logAudit } from "../audit";
import { getConcurClient } from "./client";
import { CONCUR_API_PATHS, DIGEST_PAGE_SIZE } from "./constants";
import type { ConcurDigestPage } from "./types";

/**
 * Pull payment status from Concur for all synced invoices.
 * Updates isPaid/paidDate on matched invoices.
 */
export async function pullPaymentStatus(): Promise<{
  checked: number;
  updated: number;
  errors: string[];
}> {
  const result = { checked: 0, updated: 0, errors: [] as string[] };

  // Get all invoices that have been pushed to Concur but not yet marked paid
  const syncedInvoices = await prisma.invoice.findMany({
    where: {
      concurInvoiceId: { not: null },
      concurSyncStatus: "SYNCED",
      isPaid: false,
    },
    select: {
      id: true,
      invoiceNumber: true,
      concurInvoiceId: true,
    },
  });

  if (syncedInvoices.length === 0) return result;

  // Build lookup: Concur ID -> our invoice
  const concurIdToInvoice = new Map(
    syncedInvoices.map((inv) => [inv.concurInvoiceId!, inv])
  );

  // Fetch paid invoices from Concur digest
  const client = getConcurClient();
  let offset = 0;

  while (true) {
    const digest = await client.get<ConcurDigestPage>(
      `${CONCUR_API_PATHS.INVOICE_DIGEST}?paymentStatus=PAID&limit=${DIGEST_PAGE_SIZE}&offset=${offset}`
    );

    for (const item of digest.Items) {
      result.checked++;
      const invoice = concurIdToInvoice.get(item.PaymentRequestId);
      if (!invoice) continue;

      try {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            isPaid: true,
            paidDate: item.PaidDate ? new Date(item.PaidDate) : new Date(),
            concurSyncStatus: "PAYMENT_RECEIVED",
            concurLastSyncAt: new Date(),
          },
        });

        await logAudit({
          entityType: "Invoice",
          entityId: invoice.id,
          action: "UPDATE",
          changes: {
            isPaid: { old: false, new: true },
            concurSyncStatus: { old: "SYNCED", new: "PAYMENT_RECEIVED" },
          },
        });

        result.updated++;
      } catch (err) {
        result.errors.push(
          `Failed to update payment for invoice ${invoice.invoiceNumber}: ${err}`
        );
      }
    }

    // Check if there are more pages
    if (
      !digest.NextPage ||
      digest.Items.length < DIGEST_PAGE_SIZE
    ) {
      break;
    }
    offset += DIGEST_PAGE_SIZE;
  }

  return result;
}

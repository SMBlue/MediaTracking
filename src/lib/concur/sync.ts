/**
 * SAP Concur Sync Orchestration.
 *
 * Sequences all Concur sync operations:
 * 1. Sync MBA projects to Concur's project list
 * 2. Push confirmed invoices to Concur
 * 3. Pull payment status back from Concur
 *
 * Called by the /api/cron/sync-concur route.
 */

import { prisma } from "../db";
import { logAudit } from "../audit";
import { createProject, projectExists } from "./lists";
import { pushPendingInvoices } from "./invoices";
import { pullPaymentStatus } from "./payments";
import { BSD_OFFICES, DEFAULT_CONCUR_OFFICE_CODE } from "./constants";

export interface ConcurSyncResult {
  projectsSynced: number;
  invoicesPushed: number;
  invoicesFailed: number;
  paymentsUpdated: number;
  errors: string[];
}

/**
 * Main sync: run all Concur sync phases sequentially.
 */
export async function syncWithConcur(): Promise<ConcurSyncResult> {
  const result: ConcurSyncResult = {
    projectsSynced: 0,
    invoicesPushed: 0,
    invoicesFailed: 0,
    paymentsUpdated: 0,
    errors: [],
  };

  // --- Phase 1: Sync MBA projects to Concur list ---
  try {
    const mbas = await prisma.mBA.findMany({
      where: {
        netsuiteProjectNumber: { not: null },
        concurClientCode: { not: null }, // need client code to nest under
        concurProjectId: null, // not yet synced to Concur
      },
      include: { client: true },
    });

    for (const mba of mbas) {
      try {
        // Check if it already exists at level 2 under this client
        const existing = await projectExists(
          mba.netsuiteProjectNumber!,
          mba.concurClientCode!
        );

        if (existing) {
          await prisma.mBA.update({
            where: { id: mba.id },
            data: {
              concurProjectId: existing.id,
              concurProjectCode: existing.shortCode,
              concurSyncStatus: "SYNCED",
            },
          });
        } else {
          const displayName = `${mba.client.name} - ${mba.name}`;
          const officeCode =
            mba.concurProjectOfficeCode || DEFAULT_CONCUR_OFFICE_CODE;
          const officeName = BSD_OFFICES[officeCode] || "Unknown";
          const created = await createProject({
            clientShortCode: mba.concurClientCode!,
            clientName: mba.client.name,
            projectNumber: mba.netsuiteProjectNumber!,
            displayName,
            officeShortCode: officeCode,
            officeName,
          });

          await prisma.mBA.update({
            where: { id: mba.id },
            data: {
              concurProjectId: created.project.id,
              concurProjectCode: created.project.shortCode,
              concurSyncStatus: "SYNCED",
            },
          });

          await logAudit({
            entityType: "MBA",
            entityId: mba.id,
            action: "UPDATE",
            changes: {
              concurProjectId: { old: null, new: created.project.id },
              concurSyncStatus: { old: null, new: "SYNCED" },
            },
          });
        }

        result.projectsSynced++;
      } catch (err) {
        result.errors.push(
          `Failed to sync project for MBA ${mba.mbaNumber}: ${err}`
        );

        await prisma.mBA.update({
          where: { id: mba.id },
          data: { concurSyncStatus: "FAILED" },
        });
      }
    }
  } catch (err) {
    result.errors.push(`Project sync phase failed: ${err}`);
  }

  // --- Phase 2: Push confirmed invoices ---
  try {
    const pushResult = await pushPendingInvoices();
    result.invoicesPushed = pushResult.pushed;
    result.invoicesFailed = pushResult.failed;
    result.errors.push(...pushResult.errors);
  } catch (err) {
    result.errors.push(`Invoice push phase failed: ${err}`);
  }

  // --- Phase 3: Pull payment status ---
  try {
    const paymentResult = await pullPaymentStatus();
    result.paymentsUpdated = paymentResult.updated;
    result.errors.push(...paymentResult.errors);
  } catch (err) {
    result.errors.push(`Payment pull phase failed: ${err}`);
  }

  return result;
}

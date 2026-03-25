/**
 * NetSuite Sync Orchestration for MBA Tracker.
 * Syncs client invoices and payment status from NetSuite.
 * Auto-imports journal entries as credit rollovers.
 */

import { prisma } from "../db";
import { isNetsuiteConfigured } from "./tba-client";
import {
  fetchClientInvoicesForProjects,
  fetchJournalEntriesForProjects,
} from "./queries";

export interface NetsuiteSyncResult {
  mbasChecked: number;
  paymentsUpdated: number;
  rolloversCreated: number;
  invoicesUpserted: number;
  errors: string[];
}

/**
 * Main sync: fetch client invoices and JEs from NetSuite for all MBAs
 * that have a netsuiteProjectNumber set.
 */
export async function syncFromNetsuite(): Promise<NetsuiteSyncResult> {
  const result: NetsuiteSyncResult = {
    mbasChecked: 0,
    paymentsUpdated: 0,
    rolloversCreated: 0,
    invoicesUpserted: 0,
    errors: [],
  };

  if (!isNetsuiteConfigured()) {
    result.errors.push("NetSuite credentials not configured");
    return result;
  }

  // Get all MBAs with NS project numbers
  const mbas = await prisma.mBA.findMany({
    where: {
      netsuiteProjectNumber: { not: null },
    },
    select: {
      id: true,
      netsuiteProjectNumber: true,
      clientPaid: true,
      clientPaidAmount: true,
    },
  });

  const projectNumbers = mbas
    .map((m) => m.netsuiteProjectNumber!)
    .filter(Boolean);

  if (projectNumbers.length === 0) {
    return result;
  }

  result.mbasChecked = mbas.length;

  // Build lookup: projectNumber -> mbaId
  const projectToMba = new Map<string, string>();
  for (const mba of mbas) {
    if (mba.netsuiteProjectNumber) {
      projectToMba.set(mba.netsuiteProjectNumber, mba.id);
    }
  }

  // --- Sync Client Invoices ---
  try {
    const invoices = await fetchClientInvoicesForProjects(projectNumbers);

    // Group invoices by project to determine payment status
    const invoicesByProject = new Map<
      string,
      typeof invoices
    >();

    for (const inv of invoices) {
      // Find the project number from our MBAs that matches this invoice's project
      const mba = mbas.find(
        (m) => m.netsuiteProjectNumber === inv.projectName ||
          String(inv.projectId) === m.netsuiteProjectNumber
      );

      if (!mba?.netsuiteProjectNumber) continue;

      const existing = invoicesByProject.get(mba.netsuiteProjectNumber) || [];
      existing.push(inv);
      invoicesByProject.set(mba.netsuiteProjectNumber, existing);

      // Upsert the invoice record
      const mbaId = projectToMba.get(mba.netsuiteProjectNumber);
      if (!mbaId) continue;

      try {
        await prisma.netsuiteClientInvoice.upsert({
          where: { netsuiteId: inv.transactionId },
          create: {
            mbaId,
            netsuiteId: inv.transactionId,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: new Date(inv.invoiceDate),
            amount: inv.amount,
            status: inv.status,
            paidDate:
              inv.status === "paidInFull" ? new Date() : null,
          },
          update: {
            amount: inv.amount,
            status: inv.status,
            paidDate:
              inv.status === "paidInFull" ? new Date() : null,
          },
        });
        result.invoicesUpserted++;
      } catch (err) {
        result.errors.push(
          `Failed to upsert invoice ${inv.invoiceNumber}: ${err}`
        );
      }
    }

    // Update MBA payment status based on invoices
    for (const [projectNumber, projectInvoices] of invoicesByProject) {
      const mbaId = projectToMba.get(projectNumber);
      if (!mbaId) continue;

      const totalInvoiced = projectInvoices.reduce(
        (sum, inv) => sum + inv.amount,
        0
      );
      const allPaid = projectInvoices.every(
        (inv) => inv.status === "paidInFull"
      );
      const latestPaidDate = projectInvoices
        .filter((inv) => inv.status === "paidInFull")
        .sort(
          (a, b) =>
            new Date(b.invoiceDate).getTime() -
            new Date(a.invoiceDate).getTime()
        )[0]?.invoiceDate;

      const mba = mbas.find((m) => m.id === mbaId);
      if (!mba) continue;

      // Only update if status actually changed
      if (
        mba.clientPaid !== allPaid ||
        Number(mba.clientPaidAmount || 0) !== totalInvoiced
      ) {
        try {
          await prisma.mBA.update({
            where: { id: mbaId },
            data: {
              clientPaid: allPaid,
              clientPaidAmount: totalInvoiced,
              clientPaidDate: allPaid && latestPaidDate
                ? new Date(latestPaidDate)
                : null,
            },
          });
          result.paymentsUpdated++;
        } catch (err) {
          result.errors.push(
            `Failed to update payment for MBA ${mbaId}: ${err}`
          );
        }
      }
    }
  } catch (err) {
    result.errors.push(`Client invoice sync failed: ${err}`);
  }

  // --- Sync Journal Entries (Rollovers) ---
  try {
    const journalEntries =
      await fetchJournalEntriesForProjects(projectNumbers);

    // Get existing rollovers with netsuiteRef to avoid duplicates
    const existingRefs = new Set(
      (
        await prisma.creditRollover.findMany({
          where: { netsuiteRef: { not: null } },
          select: { netsuiteRef: true },
        })
      ).map((r) => r.netsuiteRef)
    );

    for (const je of journalEntries) {
      const refKey = `JE-${je.transactionId}`;
      if (existingRefs.has(refKey)) continue;

      // Find MBAs for both projects
      const fromMbaId = [...projectToMba.entries()].find(
        ([pn]) =>
          pn === je.fromProjectName || pn === String(je.fromProjectId)
      )?.[1];
      const toMbaId = [...projectToMba.entries()].find(
        ([pn]) =>
          pn === je.toProjectName || pn === String(je.toProjectId)
      )?.[1];

      if (!fromMbaId || !toMbaId || fromMbaId === toMbaId) continue;

      try {
        await prisma.creditRollover.create({
          data: {
            fromMbaId,
            toMbaId,
            amount: je.amount,
            type: "JOURNAL_ENTRY",
            description: je.memo || `NetSuite JE ${je.transactionId}`,
            netsuiteRef: refKey,
          },
        });
        result.rolloversCreated++;
        existingRefs.add(refKey);
      } catch (err) {
        result.errors.push(
          `Failed to create rollover from JE ${je.transactionId}: ${err}`
        );
      }
    }
  } catch (err) {
    result.errors.push(`Journal entry sync failed: ${err}`);
  }

  return result;
}

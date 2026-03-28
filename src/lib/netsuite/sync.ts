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
  fetchVendorBillsByInvoiceNumbers,
  fetchRecentVendorBills,
  fetchAdVendorBills,
  isAdVendor,
  getAdVendorPlatform,
} from "./queries";

export interface UnmatchedAdBill {
  invoiceNumber: string;
  vendorName: string;
  platform: string | null;
  amount: number;
  invoiceDate: string;
  status: string;
}

export interface NetsuiteSyncResult {
  mbasChecked: number;
  paymentsUpdated: number;
  rolloversCreated: number;
  invoicesUpserted: number;
  vendorBillsMatched: number;
  unmatchedAdBills: UnmatchedAdBill[];
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
    vendorBillsMatched: 0,
    unmatchedAdBills: [],
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

  // Client invoice + JE sync requires project numbers; vendor bill sync does not
  const hasProjects = projectNumbers.length > 0;

  result.mbasChecked = mbas.length;

  // Build lookup: projectNumber -> mbaId
  const projectToMba = new Map<string, string>();
  for (const mba of mbas) {
    if (mba.netsuiteProjectNumber) {
      projectToMba.set(mba.netsuiteProjectNumber, mba.id);
    }
  }

  // --- Sync Client Invoices (requires project numbers) ---
  if (hasProjects) try {
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

  // --- Sync Journal Entries (Rollovers, requires project numbers) ---
  if (hasProjects) try {
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

  // --- Sync Vendor Bill Payment Status ---
  try {
    // Get all unpaid invoices from our database
    const unpaidInvoices = await prisma.invoice.findMany({
      where: { isPaid: false },
      select: { id: true, invoiceNumber: true, vendor: true, totalAmount: true },
    });

    if (unpaidInvoices.length > 0) {
      const invoiceNumbers = unpaidInvoices.map((inv) => inv.invoiceNumber);

      // First try matching by invoice number
      let vendorBills = await fetchVendorBillsByInvoiceNumbers(invoiceNumbers);

      // Build a lookup: invoice number -> vendor bill
      const billsByNumber = new Map<string, typeof vendorBills[0]>();
      for (const bill of vendorBills) {
        billsByNumber.set(bill.invoiceNumber, bill);
      }

      // If we didn't match many, also fetch recent bills for fuzzy matching
      const matchedCount = unpaidInvoices.filter((inv) =>
        billsByNumber.has(inv.invoiceNumber)
      ).length;

      if (matchedCount < unpaidInvoices.length * 0.5) {
        // Fetch bills from the last 6 months for broader matching
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const afterDate = sixMonthsAgo.toISOString().split("T")[0];
        const recentBills = await fetchRecentVendorBills(afterDate);

        for (const bill of recentBills) {
          if (!billsByNumber.has(bill.invoiceNumber)) {
            billsByNumber.set(bill.invoiceNumber, bill);
          }
        }
      }

      // Match and update
      for (const invoice of unpaidInvoices) {
        const bill = billsByNumber.get(invoice.invoiceNumber);
        if (!bill) continue;

        const isPaid = bill.status === "paidInFull";

        try {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              isPaid,
              paidDate: isPaid && bill.paidDate ? new Date(bill.paidDate) : null,
            },
          });
          result.vendorBillsMatched++;
        } catch (err) {
          result.errors.push(
            `Failed to update vendor bill status for invoice ${invoice.invoiceNumber}: ${err}`
          );
        }
      }
    }
  } catch (err) {
    result.errors.push(`Vendor bill sync failed: ${err}`);
  }

  // --- Find Ad Vendor Bills in NetSuite Not in Our System ---
  try {
    // Look back 6 months for ad vendor bills
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const afterDate = sixMonthsAgo.toISOString().split("T")[0];

    const adBills = await fetchAdVendorBills(afterDate);

    // Get all our invoice numbers for comparison
    const allInvoices = await prisma.invoice.findMany({
      select: { invoiceNumber: true },
    });
    const ourInvoiceNumbers = new Set(allInvoices.map((i) => i.invoiceNumber));

    // Find ad bills we don't have
    for (const bill of adBills) {
      if (!ourInvoiceNumbers.has(bill.invoiceNumber)) {
        result.unmatchedAdBills.push({
          invoiceNumber: bill.invoiceNumber,
          vendorName: bill.vendorName,
          platform: getAdVendorPlatform(bill.vendorName),
          amount: bill.amount,
          invoiceDate: bill.invoiceDate,
          status: bill.status,
        });
      }
    }
  } catch (err) {
    result.errors.push(`Ad vendor bill reconciliation failed: ${err}`);
  }

  return result;
}

/**
 * NetSuite SuiteQL queries for MBA Tracker.
 * Fetches client invoices, payment status, and journal entries by project number.
 */

import { createNetSuiteClient } from "./tba-client";

// --- Validation ---

function assertSafeString(value: string, name: string): void {
  if (/['";\-\-]/.test(value)) {
    throw new Error(`Invalid ${name}: contains unsafe characters`);
  }
}

// --- Types ---

export interface NetsuiteInvoiceRow {
  transactionId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  status: string;
  projectId: string;
  projectName: string;
}

export interface NetsuiteJournalEntryRow {
  transactionId: string;
  tranDate: string;
  memo: string;
  fromProjectId: string;
  fromProjectName: string;
  toProjectId: string;
  toProjectName: string;
  amount: number;
}

// --- Client Invoice Queries ---

/**
 * Fetch client invoices from NetSuite for a given project number.
 * These are invoices sent TO clients (CustInvc), not vendor invoices.
 */
export async function fetchClientInvoices(
  projectNumber: string
): Promise<NetsuiteInvoiceRow[]> {
  assertSafeString(projectNumber, "projectNumber");
  const client = createNetSuiteClient();

  const rows = await client.queryAll<{
    transaction_id: string;
    invoice_number: string;
    invoice_date: string;
    amount: string;
    status: string;
    project_id: string;
    project_name: string;
  }>(`
    SELECT t.id AS transaction_id,
           t.tranid AS invoice_number,
           t.trandate AS invoice_date,
           t.foreigntotal AS amount,
           t.statusref AS status,
           j.id AS project_id,
           j.companyname AS project_name
    FROM transaction t
    JOIN transactionline tl ON tl.transaction = t.id
    LEFT JOIN job j ON tl.entity = j.id
    WHERE t.type = 'CustInvc'
      AND t.posting = 'T'
      AND j.entityid = '${projectNumber}'
    GROUP BY t.id, t.tranid, t.trandate, t.foreigntotal, t.statusref, j.id, j.companyname
    ORDER BY t.trandate DESC
  `);

  return rows.map((r) => ({
    transactionId: String(r.transaction_id),
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    amount: parseFloat(String(r.amount)) || 0,
    status: r.status,
    projectId: String(r.project_id),
    projectName: r.project_name,
  }));
}

/**
 * Fetch all client invoices for multiple project numbers in one query.
 * More efficient than calling fetchClientInvoices per MBA.
 */
export async function fetchClientInvoicesForProjects(
  projectNumbers: string[]
): Promise<NetsuiteInvoiceRow[]> {
  if (projectNumbers.length === 0) return [];

  projectNumbers.forEach((pn) => assertSafeString(pn, "projectNumber"));
  const client = createNetSuiteClient();

  const inClause = projectNumbers.map((pn) => `'${pn}'`).join(", ");

  const rows = await client.queryAll<{
    transaction_id: string;
    invoice_number: string;
    invoice_date: string;
    amount: string;
    status: string;
    project_id: string;
    project_name: string;
  }>(`
    SELECT t.id AS transaction_id,
           t.tranid AS invoice_number,
           t.trandate AS invoice_date,
           t.foreigntotal AS amount,
           t.statusref AS status,
           j.id AS project_id,
           j.companyname AS project_name
    FROM transaction t
    JOIN transactionline tl ON tl.transaction = t.id
    LEFT JOIN job j ON tl.entity = j.id
    WHERE t.type = 'CustInvc'
      AND t.posting = 'T'
      AND j.entityid IN (${inClause})
    GROUP BY t.id, t.tranid, t.trandate, t.foreigntotal, t.statusref, j.id, j.companyname
    ORDER BY t.trandate DESC
  `);

  return rows.map((r) => ({
    transactionId: String(r.transaction_id),
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    amount: parseFloat(String(r.amount)) || 0,
    status: r.status,
    projectId: String(r.project_id),
    projectName: r.project_name,
  }));
}

/**
 * Fetch journal entries that involve transfers between projects.
 * Used to auto-detect credit rollovers between MBAs.
 * Looks for JEs where debit and credit lines reference different projects.
 */
export async function fetchJournalEntriesForProjects(
  projectNumbers: string[]
): Promise<NetsuiteJournalEntryRow[]> {
  if (projectNumbers.length === 0) return [];

  projectNumbers.forEach((pn) => assertSafeString(pn, "projectNumber"));
  const client = createNetSuiteClient();

  const inClause = projectNumbers.map((pn) => `'${pn}'`).join(", ");

  // Find JEs where one line debits project A and another credits project B
  const rows = await client.queryAll<{
    transaction_id: string;
    tran_date: string;
    memo: string;
    from_project_id: string;
    from_project_name: string;
    to_project_id: string;
    to_project_name: string;
    amount: string;
  }>(`
    SELECT dr.transaction AS transaction_id,
           t.trandate AS tran_date,
           t.memo,
           j_from.id AS from_project_id,
           j_from.companyname AS from_project_name,
           j_to.id AS to_project_id,
           j_to.companyname AS to_project_name,
           dr.debit AS amount
    FROM transactionline dr
    JOIN transaction t ON dr.transaction = t.id
    JOIN transactionline cr ON cr.transaction = dr.transaction
      AND cr.id != dr.id
    LEFT JOIN job j_from ON dr.entity = j_from.id
    LEFT JOIN job j_to ON cr.entity = j_to.id
    WHERE t.type = 'Journal'
      AND t.posting = 'T'
      AND dr.debit > 0
      AND cr.credit > 0
      AND j_from.id IS NOT NULL
      AND j_to.id IS NOT NULL
      AND j_from.id != j_to.id
      AND (j_from.entityid IN (${inClause}) OR j_to.entityid IN (${inClause}))
    GROUP BY dr.transaction, t.trandate, t.memo,
             j_from.id, j_from.companyname, j_to.id, j_to.companyname, dr.debit
    ORDER BY t.trandate DESC
  `);

  return rows.map((r) => ({
    transactionId: String(r.transaction_id),
    tranDate: r.tran_date,
    memo: r.memo || "",
    fromProjectId: String(r.from_project_id),
    fromProjectName: r.from_project_name,
    toProjectId: String(r.to_project_id),
    toProjectName: r.to_project_name,
    amount: parseFloat(String(r.amount)) || 0,
  }));
}

/**
 * NetSuite SuiteQL queries for MBA Tracker.
 * Fetches client invoices, payment status, and journal entries by project number.
 */

import { createNetSuiteClient } from "./tba-client";

// --- Validation ---

function assertSafeString(value: string, name: string): void {
  // Block SQL injection chars but allow hyphens (common in invoice numbers and dates)
  if (/['";]/.test(value)) {
    throw new Error(`Invalid ${name}: contains unsafe characters`);
  }
}

function assertSafeDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${value}"`);
  }
}

/** Convert YYYY-MM-DD to M/D/YYYY (NetSuite SuiteQL date format) */
function toNsDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

// --- Types ---

export interface NetsuiteVendorBillRow {
  transactionId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  status: string; // e.g. "paidInFull", "open", "pendingApproval"
  vendorName: string;
  paidDate: string | null;
}

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

// --- Ad Platform Vendor Mapping ---

/**
 * Maps NetSuite vendor names to our Platform enum.
 * Only ad/media platform vendors — excludes operational vendors like rent, payroll, etc.
 */
const NS_AD_VENDOR_MAP: Record<string, string> = {
  "META PLATFORMS INC.": "META",
  "META PLATFORMS INC. (UK)": "META",
  "GOOGLE": "GOOGLE_ADS",
  "GOOGLE (UK)": "GOOGLE_ADS",
  "MICROSOFT IRELAND OPERATIONS LIMITED": "BING",
  "MICROSOFT ONLINE": "BING",
  "LINKEDIN CORPORATION": "LINKEDIN",
  "TIKTOK INC.": "TIKTOK",
  "REDDIT INC.": "OTHER",
  "SPOTIFY USA INC": "OTHER",
  "SPOTIFY AB": "OTHER",
  "NEXTDOOR, INC.": "OTHER",
  "PINTEREST INC": "OTHER",
  "QUORA, INC": "OTHER",
  "STACKADAPT INC": "OTHER",
  "TABOOLA, INC.": "OTHER",
  "OUTBRAIN, INC.": "OTHER",
  "AMAZON MEDIA GROUP": "OTHER",
  "ROKU, INC": "OTHER",
  "HULU, LLC": "OTHER",
  "X CORP (TWITTER)": "OTHER",
};

/** Check if a NetSuite vendor name is a known ad platform */
export function isAdVendor(vendorName: string): boolean {
  return vendorName in NS_AD_VENDOR_MAP;
}

/** Get the Platform enum value for a NetSuite ad vendor */
export function getAdVendorPlatform(vendorName: string): string | null {
  return NS_AD_VENDOR_MAP[vendorName] ?? null;
}

// --- Vendor Bill Helpers ---

/** Map NetSuite VendBill status codes to human-readable values */
function mapVendBillStatus(code: string): string {
  switch (code) {
    case "A": return "open";
    case "B": return "paidInFull";
    case "C": return "cancelled";
    case "D": return "pendingApproval";
    default: return code;
  }
}

// --- Vendor Bill Queries ---

/**
 * Fetch vendor bills from NetSuite and their payment status.
 * These are bills FROM vendors (Meta, Google, etc.) TO the agency.
 * Matches against our Invoice records by invoice number.
 */
export async function fetchVendorBillsByInvoiceNumbers(
  invoiceNumbers: string[]
): Promise<NetsuiteVendorBillRow[]> {
  if (invoiceNumbers.length === 0) return [];

  invoiceNumbers.forEach((n) => assertSafeString(n, "invoiceNumber"));
  const client = createNetSuiteClient();

  // Batch in groups of 200 to avoid query length limits
  const allRows: NetsuiteVendorBillRow[] = [];

  for (let i = 0; i < invoiceNumbers.length; i += 200) {
    const batch = invoiceNumbers.slice(i, i + 200);
    const inClause = batch.map((n) => `'${n}'`).join(", ");

    const rows = await client.queryAll<{
      id: string;
      tranid: string;
      trandate: string;
      foreigntotal: string;
      status: string;
      vendor_name: string;
      lastmodifieddate: string;
    }>(`
      SELECT t.id, t.tranid, t.trandate, t.foreigntotal, t.status,
             BUILTIN.DF(t.entity) AS vendor_name,
             t.lastmodifieddate
      FROM transaction t
      WHERE t.type = 'VendBill'
        AND t.tranid IN (${inClause})
      ORDER BY t.trandate DESC
    `);

    allRows.push(
      ...rows.map((r) => ({
        transactionId: String(r.id),
        invoiceNumber: r.tranid,
        invoiceDate: r.trandate,
        amount: Math.abs(parseFloat(String(r.foreigntotal)) || 0),
        status: mapVendBillStatus(r.status),
        vendorName: r.vendor_name || "",
        paidDate: r.status === "B" ? r.lastmodifieddate : null,
      }))
    );
  }

  return allRows;
}

/**
 * Fetch ALL vendor bills from NetSuite within a date range.
 * Used as a broader search when invoice numbers don't match exactly.
 */
export async function fetchRecentVendorBills(
  afterDate: string // YYYY-MM-DD
): Promise<NetsuiteVendorBillRow[]> {
  assertSafeDate(afterDate);
  const client = createNetSuiteClient();

  const rows = await client.queryAll<{
    id: string;
    tranid: string;
    trandate: string;
    foreigntotal: string;
    status: string;
    vendor_name: string;
    lastmodifieddate: string;
  }>(`
    SELECT t.id, t.tranid, t.trandate, t.foreigntotal, t.status,
           BUILTIN.DF(t.entity) AS vendor_name,
           t.lastmodifieddate
    FROM transaction t
    WHERE t.type = 'VendBill'
      AND t.trandate >= '${toNsDate(afterDate)}'
    ORDER BY t.trandate DESC
  `);

  return rows.map((r) => ({
    transactionId: String(r.id),
    invoiceNumber: r.tranid,
    invoiceDate: r.trandate,
    amount: Math.abs(parseFloat(String(r.foreigntotal)) || 0),
    status: mapVendBillStatus(r.status),
    vendorName: r.vendor_name || "",
    paidDate: r.status === "B" ? r.lastmodifieddate : null,
  }));
}

/**
 * Fetch only ad-platform vendor bills from NetSuite within a date range.
 * Filters to known ad vendors (Meta, Google, Microsoft, etc.) client-side
 * since SuiteQL doesn't support IN clauses on BUILTIN.DF.
 */
export async function fetchAdVendorBills(
  afterDate: string // YYYY-MM-DD
): Promise<NetsuiteVendorBillRow[]> {
  const allBills = await fetchRecentVendorBills(afterDate);
  return allBills.filter((b) => isAdVendor(b.vendorName));
}

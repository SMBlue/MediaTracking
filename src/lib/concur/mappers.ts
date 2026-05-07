/**
 * Data transformation between MBA Tracker models and Concur API formats.
 *
 * Maps Invoice + InvoiceAllocations + MBAs → Concur Payment Request (Invoice v3).
 *
 * The MBA Tracker model has:
 *   Invoice → InvoiceAllocation[] → MBA
 *
 * The Concur model is:
 *   Invoice → LineItem[] → Allocation[] → cost objects (Client, Project, Office)
 *
 * Strategy: emit ONE Concur LineItem per MBA Tracker allocation, with a single
 * 100% Allocation pointing to that MBA's Client/Project/Office in Concur.
 */

import { CONCUR_DEFAULTS, CUSTOM_FIELD_MAP } from "./constants";
import type {
  ConcurInvoiceCreate,
  ConcurInvoiceLineItem,
} from "./types";

interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: Date;
  totalAmount: number;
  currency: string;
}

interface AllocationData {
  amount: number;
  mba: {
    name: string;
    /** NetSuite project number (level-1 client code lives separately) */
    concurProjectCode: string | null;
    /** Concur level-1 Client list shortCode (e.g., "270709" for AARP) */
    concurClientCode?: string | null;
    /** Concur level-3 office shortCode (e.g., "5" for Washington DC) */
    concurProjectOfficeCode?: string | null;
    client: { name: string };
  };
}

interface BuildOptions {
  /** Concur vendor code from the Vendor v3.1 API. Required. */
  vendorCode: string;
  /** Vendor address code (usually same as vendor code) */
  vendorAddressCode?: string;
  /** Department shortCode for header + line (e.g., "19" = Media) */
  departmentCode?: string;
  /** Subsidiary shortCode (e.g., "1" = BSD Inc) */
  subsidiaryCode?: string;
  /** Office shortCode (e.g., "1" = NY) — the BSD office handling the invoice */
  officeCode?: string;
  /** Business Unit shortCode (e.g., "1" = Strategy) */
  buCode?: string;
  /** Expense type code (e.g., "2503" = Accrued Media) */
  expenseTypeCode?: string;
}

/**
 * Map an Invoice with its allocations to a Concur Payment Request.
 *
 * @param invoice - The invoice record
 * @param allocations - Invoice allocations with MBA data
 * @param options - Concur-specific config (vendor, defaults)
 */
export function invoiceToConcurPaymentRequest(
  invoice: InvoiceData,
  allocations: AllocationData[],
  options: BuildOptions
): ConcurInvoiceCreate {
  const department =
    options.departmentCode || CONCUR_DEFAULTS.DEFAULT_DEPARTMENT_CODE;
  const subsidiary =
    options.subsidiaryCode || CONCUR_DEFAULTS.DEFAULT_SUBSIDIARY_CODE;
  const office = options.officeCode || CONCUR_DEFAULTS.DEFAULT_OFFICE_CODE;
  const bu = options.buCode || CONCUR_DEFAULTS.DEFAULT_BU_CODE;
  const expenseType =
    options.expenseTypeCode || CONCUR_DEFAULTS.DEFAULT_EXPENSE_TYPE_CODE;

  const lineItems: ConcurInvoiceLineItem[] = allocations.map((allocation) => {
    const line: ConcurInvoiceLineItem = {
      Description: `${allocation.mba.client.name} - ${allocation.mba.name}`,
      ExpenseTypeCode: expenseType,
      Quantity: "1",
      UnitPrice: allocation.amount.toFixed(2),
      [CUSTOM_FIELD_MAP.LINE_DEPARTMENT]: department,
      [CUSTOM_FIELD_MAP.LINE_OFFICE]: office,
      [CUSTOM_FIELD_MAP.LINE_BU]: bu,
    };

    // Add a single 100% allocation pointing to the MBA's Client/Project/Office
    const allocationCustom: Record<string, string | undefined> = {
      Percentage: "100",
    };
    if (allocation.mba.concurClientCode) {
      allocationCustom[CUSTOM_FIELD_MAP.ALLOC_CLIENT] =
        allocation.mba.concurClientCode;
    }
    if (allocation.mba.concurProjectCode) {
      allocationCustom[CUSTOM_FIELD_MAP.ALLOC_PROJECT] =
        allocation.mba.concurProjectCode;
    }
    if (allocation.mba.concurProjectOfficeCode) {
      allocationCustom[CUSTOM_FIELD_MAP.ALLOC_PROJECT_OFFICE] =
        allocation.mba.concurProjectOfficeCode;
    }

    // Only include allocations if we have a project/client to point to
    if (allocation.mba.concurClientCode && allocation.mba.concurProjectCode) {
      (line as ConcurInvoiceLineItem & {
        Allocations?: Record<string, unknown>[];
      }).Allocations = [allocationCustom];
    }

    return line;
  });

  return {
    Name: `${invoice.vendor} - ${invoice.invoiceNumber}`,
    CountryCode: "US",
    InvoiceAmount: invoice.totalAmount.toFixed(2),
    CurrencyCode: invoice.currency,
    InvoiceDate: invoice.invoiceDate.toISOString().split("T")[0],
    InvoiceNumber: invoice.invoiceNumber,
    LedgerCode: CONCUR_DEFAULTS.LEDGER_CODE,
    VendorRemitToIdentifier: {
      VendorCode: options.vendorCode,
      AddressCode: options.vendorAddressCode || options.vendorCode,
    },
    LineItems: lineItems,
    [CUSTOM_FIELD_MAP.HEADER_DEPARTMENT]: department,
    [CUSTOM_FIELD_MAP.HEADER_SUBSIDIARY]: subsidiary,
    [CUSTOM_FIELD_MAP.HEADER_OFFICE]: office,
    [CUSTOM_FIELD_MAP.HEADER_BU]: bu,
  };
}

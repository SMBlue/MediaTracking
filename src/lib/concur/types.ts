/**
 * SAP Concur API type definitions.
 * Based on Concur Professional edition APIs:
 * - Invoice (Payment Request) v3
 * - List Management v4
 * - Payment Request Digest v3
 * - OAuth 2.0
 */

// --- OAuth 2.0 ---

export interface ConcurTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  id_token?: string;
  geolocation: string;
}

// --- List Management v4 ---

export interface ConcurList {
  id: string;
  value: string;
  levelCount: number;
  searchCriteria: string;
  displayFormat: string;
  category: {
    id: string;
    type: string;
  };
  isDeleted: boolean;
}

export interface ConcurListItem {
  id: string;
  code: string; // long code
  shortCode: string;
  value: string;
  parentId?: string;
  level: number;
  isDeleted: boolean;
  lists: { id: string }[];
}

export interface ConcurListItemCreate {
  listId: string;
  shortCode: string;
  value: string;
  parentId?: string;
  parentCode?: string;
}

export interface ConcurBulkRequest {
  requests: {
    shortCode: string;
    value: string;
    parentCode?: string;
  }[];
}

export interface ConcurBulkResponse {
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILURE";
  recordsSucceeded: number;
  recordsFailed: number;
  errors?: { message: string }[];
}

export interface ConcurListPage<T> {
  content: T[];
  page: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

// --- Invoice (Payment Request) v3 ---

export interface ConcurVendorIdentifier {
  VendorCode?: string;
  VendorName?: string;
  AddressCode?: string;
  Address1?: string;
  PostalCode?: string;
  Name?: string;
}

export interface ConcurInvoiceLineItem {
  Description: string;
  ExpenseTypeCode: string;
  Quantity: string;
  UnitPrice: string;
  // Custom fields — mapping is instance-specific
  // e.g., Custom3 = Project, Custom5 = Department
  [key: `Custom${number}`]: string | undefined;
}

export interface ConcurInvoiceCreate {
  Name: string;
  CountryCode: string;
  InvoiceAmount: string;
  CurrencyCode?: string;
  InvoiceDate?: string;
  InvoiceNumber?: string;
  VendorRemitToIdentifier: ConcurVendorIdentifier;
  LedgerCode?: string;
  EmployeeLoginId?: string;
  LineItems: ConcurInvoiceLineItem[];
  // Header-level custom fields
  [key: `Custom${number}`]: string | undefined;
}

export interface ConcurInvoiceResponse {
  ID: string;
  URI: string;
  ApprovalStatusCode?: string;
  PaymentStatusCode?: string;
}

// --- Payment Request Digest v3 ---

export interface ConcurPaymentDigest {
  PaymentRequestId: string;
  PaymentRequestUri: string;
  ApprovalStatusCode: string;
  PaymentStatusCode: string;
  Total: string;
  CurrencyCode: string;
  PaidDate?: string;
  VendorName: string;
  PaymentMethod?: string;
  InvoiceNumber?: string;
  ExtractedDate?: string;
  LastModifiedDate: string;
}

export interface ConcurDigestPage {
  Items: ConcurPaymentDigest[];
  NextPage?: string;
  TotalCount: number;
}

// --- Expense Report v4 (for future use) ---

export interface ConcurExpenseReportCreate {
  name: string;
  businessPurpose: string;
  reportDate?: string;
  startDate?: string;
  endDate?: string;
  countryCode: string;
  policyId: string;
  currencyCode?: string;
}

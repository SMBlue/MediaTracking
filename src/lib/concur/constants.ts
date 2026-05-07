/**
 * SAP Concur API constants and configuration.
 *
 * IMPORTANT: Custom field mappings (CUSTOM_FIELD_MAP) are instance-specific.
 * The values below are placeholders — update them after getting the actual
 * field mapping from your Concur admin.
 */

// API path prefixes
export const CONCUR_API_PATHS = {
  TOKEN: "/oauth2/v0/token",
  LISTS: "/list/v4/lists",
  LIST_ITEMS: "/list/v4/items",
  LIST_TOP_LEVEL: (listId: string) => `/list/v4/lists/${listId}/children`,
  LIST_ITEM_CHILDREN: (itemId: string) => `/list/v4/items/${itemId}/children`,
  LIST_BULK: (listId: string) => `/list/v4/lists/${listId}/bulk`,
  INVOICE_CREATE: "/api/v3.0/invoice/paymentrequest",
  INVOICE_DIGEST: "/api/v3.0/invoice/paymentrequestdigests",
} as const;

/**
 * Concur invoice custom field mapping for BSD.
 * Discovered through API testing against the BSD sandbox.
 * Confirmed working values via successful POST /api/v3.0/invoice/paymentrequest
 *
 * HEADER:
 * - Custom1: Department          (required, list, e.g., "19" = Media)
 * - Custom2: Subsidiary          (list, e.g., "1" = BSD Inc)
 * - Custom3: Billable            (Yes/No, defaults to "No")
 * - Custom4: Office              (list, e.g., "1" = New York)
 * - Custom5: Business Unit       (required, list, e.g., "1" = Strategy)
 *
 * LINE ITEM:
 * - Custom1: Department          (list)
 * - Custom3: Billable            (Yes/No)
 * - Custom4: Office              (list)
 * - Custom5: Business Unit       (list)
 * - Custom12: Amortization Sched (list, e.g., "610")
 * - Custom16: Service Period     (list, e.g., "4" = April 2016)
 * - Custom2, 8-11, 13, 14, 17, 20: free text
 * - Custom18, 19: dates (YYYY-MM-DD)
 * - Allocations[]: cost object splits — see ALLOCATION below
 *
 * ALLOCATION (within LineItem.Allocations):
 * - Percentage: must sum to 100 across allocations
 * - Custom6: Client              (level 1 of *BSD-Client-Project, e.g., "270709" = AARP)
 * - Custom7: Project             (level 2, connected to Custom6, e.g., "695055")
 * - Custom8: Project Office      (level 3, connected to Custom7, e.g., "5" = DC)
 */
export const CUSTOM_FIELD_MAP = {
  // Header
  HEADER_DEPARTMENT: "Custom1",
  HEADER_SUBSIDIARY: "Custom2",
  HEADER_BILLABLE: "Custom3",
  HEADER_OFFICE: "Custom4",
  HEADER_BU: "Custom5",
  // Line item
  LINE_DEPARTMENT: "Custom1",
  LINE_BILLABLE: "Custom3",
  LINE_OFFICE: "Custom4",
  LINE_BU: "Custom5",
  LINE_AMORTIZATION: "Custom12",
  LINE_SERVICE_PERIOD: "Custom16",
  // Allocation (project assignments)
  ALLOC_CLIENT: "Custom6",
  ALLOC_PROJECT: "Custom7",
  ALLOC_PROJECT_OFFICE: "Custom8",
} as const;

/**
 * Default values for required header Custom fields when pushing invoices.
 * These are placeholders — for real invoices, derive from the MBA data.
 */
export const CONCUR_DEFAULTS = {
  DEFAULT_DEPARTMENT_CODE: "8",      // Operations
  DEFAULT_SUBSIDIARY_CODE: "1",      // Blue State Digital, Inc.
  DEFAULT_OFFICE_CODE: "1",          // New York
  DEFAULT_BU_CODE: "3",              // Corporate
  DEFAULT_EXPENSE_TYPE_CODE: "2147", // Cost of Services : Billable Media
  LEDGER_CODE: "NetSuite",
} as const;

/**
 * Concur list IDs for required fields.
 * These are UUIDs from the List Management API — get them from the admin
 * or by calling GET /list/v4/lists.
 */
export const CONCUR_LIST_IDS = {
  // *BSD-Client-Project — 3-level hierarchy (Client → Project → ?)
  // This is where NetSuite project numbers live in Concur
  PROJECTS: "421c86ee-27f7-f54c-97e7-e21fb13f034d",
  // *BSD-Departments (NS)
  DEPARTMENTS: "f6498487-b195-044c-87d8-338b087460dd",
  // *BSD-Business Unit/ Class (NS)
  BUSINESS_UNITS: "4a7c5d5e-9c8f-1c4d-ace4-a3f91457ce20",
  // *BSD-Offices (NS) — used as client_location
  CLIENT_LOCATIONS: "aa8cdb42-e32d-9844-bb8c-3958a9ef54aa",
  // *BSD-Vendor Name (NS)
  VENDORS: "a836aa6f-dd9f-dd44-8425-6e94687bd623",
  // *BSD-Subsidiary
  SUBSIDIARY: "e78ac3c2-d5bc-bf43-9ba0-1a2c8455d0bb",
  // *BSD-Is this Billable? (NS)
  BILLABLE: "d6f5589d-d382-a344-a793-e7fd87954b76",
  // *BSD-Service Period (BSD)
  SERVICE_PERIOD: "155dc6e9-2163-0d47-ac51-e792cdeabcac",
  // No standalone "Clients" list — clients are level 1 of the Client-Project hierarchy
  CLIENTS: "421c86ee-27f7-f54c-97e7-e21fb13f034d",
} as const;

/**
 * Maps our Platform enum to Concur expense type codes.
 * These codes must match what's configured in your Concur instance.
 * Get the actual codes from admin or GET /invoice/localizeddata.
 */
export const PLATFORM_TO_EXPENSE_TYPE: Record<string, string> = {
  META: "DIGAD",           // TODO: get actual code
  GOOGLE_ADS: "DIGAD",    // TODO: get actual code
  BING: "DIGAD",           // TODO: get actual code
  TIKTOK: "DIGAD",         // TODO: get actual code
  LINKEDIN: "DIGAD",       // TODO: get actual code
  OTHER: "DIGAD",          // TODO: get actual code
};

/**
 * Maps our Platform enum to vendor names for Concur.
 */
export const PLATFORM_TO_VENDOR: Record<string, string> = {
  META: "Meta Platforms, Inc.",
  GOOGLE_ADS: "Google LLC",
  BING: "Microsoft Corporation",
  TIKTOK: "TikTok Inc.",
  LINKEDIN: "LinkedIn Corporation",
  OTHER: "Other",
};

/**
 * BSD office shortCode → display name. Used when creating level-3 office
 * entries under new Concur projects. Source: *BSD-Offices (NS) list.
 */
export const BSD_OFFICES: Record<string, string> = {
  "1": "New York",
  "2": "Boston",
  "3": "Los Angeles",
  "4": "London",
  "5": "Washington DC",
  "10": "Oakland",
  "11": "West Coast",
};

/** Default office for new MBAs when not otherwise determined. */
export const DEFAULT_CONCUR_OFFICE_CODE = "1"; // New York

// Token refresh buffer — refresh 5 minutes before actual expiry
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Rate limit: max items per bulk list request
export const LIST_BULK_MAX_ITEMS = 250;

// Invoice digest default page size
export const DIGEST_PAGE_SIZE = 1000;

// Max retries for transient errors
export const MAX_RETRIES = 3;

// Base delay for exponential backoff (ms)
export const RETRY_BASE_DELAY_MS = 1000;

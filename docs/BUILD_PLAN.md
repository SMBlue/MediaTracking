# MBA Tracker — Phase 2a Build Plan

> **Purpose:** Detailed, step-by-step implementation plan for autonomous overnight build.
> **Scope:** Phase 2a features (no external integrations — pure CRUD & UI)
> **Reference:** `docs/requirements.md` for full feature specs

---

## 0. Setup for Autonomous Build

### Progress tracking

This file serves as the progress tracker. Each task has a checkbox. At the start of each new context window, Claude should:

1. Read this file (`docs/BUILD_PLAN.md`)
2. Read `docs/requirements.md` for specs
3. Read `prisma/schema.prisma` for current schema state
4. Read `CLAUDE.md` for project conventions
5. Find the first unchecked task and resume from there
6. After completing each task, edit this file to check it off
7. Run `npm run build` after completing each major section to verify no regressions

### Prompt to resume

Paste this at the start of a new conversation to continue the build:

```
Read docs/BUILD_PLAN.md and resume building from the first unchecked task. Read docs/requirements.md, CLAUDE.md, and prisma/schema.prisma for context. Check off tasks as you complete them. Run `npm run build` after each major section. Commit after each completed section. After each section, run the verification checks listed in the Testing section for that feature.
```

---

## 1. Schema Changes

All new models and field additions needed for Phase 2a.

### Tasks

- [x] **1.1** Add `netsuiteProjectNumber` field to MBA model
  - `netsuiteProjectNumber String?`
  - This is prep for F1 (NetSuite integration) but just a nullable string for now

- [x] **1.2** Add `ChangeOrder` model
  ```prisma
  model ChangeOrder {
    id            String   @id @default(cuid())
    mbaId         String
    amount        Decimal  @db.Decimal(15, 2) // positive = increase, negative = decrease
    description   String
    effectiveDate DateTime @db.Date
    netsuiteRef   String?
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt

    mba MBA @relation(fields: [mbaId], references: [id], onDelete: Cascade)
  }
  ```
  - Add `changeOrders ChangeOrder[]` relation to MBA model

- [x] **1.3** Add `CreditRollover` model
  ```prisma
  model CreditRollover {
    id          String       @id @default(cuid())
    fromMbaId   String
    toMbaId     String
    amount      Decimal      @db.Decimal(15, 2)
    type        RolloverType
    description String?
    netsuiteRef String?
    createdAt   DateTime     @default(now())
    updatedAt   DateTime     @updatedAt

    fromMba MBA @relation("CreditsOut", fields: [fromMbaId], references: [id], onDelete: Cascade)
    toMba   MBA @relation("CreditsIn", fields: [toMbaId], references: [id], onDelete: Cascade)
  }

  enum RolloverType {
    JOURNAL_ENTRY
    CREDIT_MEMO
    CASH_CREDIT
  }
  ```
  - Add `creditsOut CreditRollover[] @relation("CreditsOut")` to MBA
  - Add `creditsIn CreditRollover[] @relation("CreditsIn")` to MBA

- [x] **1.4** Add `VendorInvoiceLineItem` model
  ```prisma
  model VendorInvoiceLineItem {
    id           String   @id @default(cuid())
    invoiceId    String
    campaignName String
    platform     String?  // sub-platform like "Instagram" vs "Facebook"
    amount       Decimal  @db.Decimal(15, 2)
    mbaId        String?  // null until mapped
    createdAt    DateTime @default(now())

    invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
    mba     MBA?    @relation(fields: [mbaId], references: [id], onDelete: SetNull)
  }
  ```
  - Add `lineItems VendorInvoiceLineItem[]` to Invoice
  - Add `vendorLineItems VendorInvoiceLineItem[]` to MBA

- [x] **1.5** Add `ReconciliationRecord` model
  ```prisma
  model ReconciliationRecord {
    id           String        @id @default(cuid())
    mbaId        String        @unique
    status       ReconStatus   @default(PENDING)
    finalBalance Decimal?      @db.Decimal(15, 2)
    outcome      ReconOutcome?
    rolloverId   String?
    notes        String?
    confirmedBy  String?
    confirmedAt  DateTime?
    createdAt    DateTime      @default(now())
    updatedAt    DateTime      @updatedAt

    mba MBA @relation(fields: [mbaId], references: [id], onDelete: Cascade)
  }

  enum ReconStatus {
    PENDING
    IN_REVIEW
    CONFIRMED
    CLOSED
  }

  enum ReconOutcome {
    REFUND
    ROLLOVER
    CLOSED_ZERO
  }
  ```
  - Add `reconciliation ReconciliationRecord?` to MBA

- [x] **1.6** Add `RECONCILING` to MBAStatus enum
  ```prisma
  enum MBAStatus {
    DRAFT
    ACTIVE
    RECONCILING
    CLOSED
  }
  ```

- [x] **1.7** Update `EntityType` in `src/lib/audit.ts`
  - Add: `"ChangeOrder" | "CreditRollover" | "ReconciliationRecord" | "VendorInvoiceLineItem"`

- [x] **1.8** Run `npx prisma@5 db push` to apply schema changes
- [x] **1.9** Run `npx prisma@5 generate` to regenerate client
- [x] **1.10** Run `npm run build` — expect type errors from `RECONCILING` status in existing code

### Schema verification & fixups
- [x] **1.11** Fix all references to MBAStatus that don't handle `RECONCILING`:
  - `src/app/(dashboard)/mbas/page.tsx` — status badge rendering: add purple/blue style for RECONCILING
  - `src/app/(dashboard)/mbas/[id]/page.tsx` — status select dropdown: add RECONCILING option
  - `src/app/(dashboard)/mbas/[id]/page.tsx` — `updateMBAStatus` action: allow RECONCILING as valid input
  - `src/app/(dashboard)/mbas/new/page.tsx` — status select on create form: add RECONCILING option (though rarely used at creation)
- [x] **1.12** Run `npm run build` — must pass cleanly now
- [x] **1.13** Commit: "Add schema for change orders, rollovers, line items, and reconciliation"

---

## 2. Change Orders (F4)

Allow users to add/view change orders on an MBA, adjusting the effective budget.

**Requirement reference:** F4.1–F4.4 in `docs/requirements.md`

### Tasks

- [x] **2.1** Create shared budget calculation helper `src/lib/budget.ts`
  ```ts
  export function calculateEffectiveBudget(mba: {
    budget: Decimal | number;
    changeOrders?: { amount: Decimal | number }[];
    creditsIn?: { amount: Decimal | number }[];
    creditsOut?: { amount: Decimal | number }[];
  }): number
  ```
  - Formula: `Number(budget) + sum(changeOrders) + sum(creditsIn) - sum(creditsOut)`
  - This centralizes the calculation so MBA detail, list, and dashboard all agree
  - Handle undefined arrays gracefully (treat as empty)

- [x] **2.2** Update MBA detail page data fetching (`src/app/(dashboard)/mbas/[id]/page.tsx`)
  - In `getMBA()`, add to the include:
    ```ts
    changeOrders: { orderBy: { effectiveDate: "asc" } }
    ```
  - Note: ascending order for running total display

- [x] **2.3** Update budget calculation on MBA detail page
  - Import and use `calculateEffectiveBudget()`
  - Replace raw `budget` with `effectiveBudget` in remaining/percent calculations
  - When change orders exist, show in the Budget card:
    - Line 1 (large): Effective Budget amount
    - Line 2 (small, muted): "Original: $X" only when different from effective
  - Update all derived values: remaining, percentUsed, progress bar

- [x] **2.4** Add Change Orders section to MBA detail page
  - New Card between the progress bar and Client Payment sections
  - Header: "Change Orders" with a count badge
  - Table columns: Date | Description | Amount | Running Budget
  - Running Budget = start from original budget, add each change order chronologically
  - Amount column: green text with "+" prefix for positive, red text with "-" prefix for negative
  - Empty state: "No change orders" text
  - "Add Change Order" button in the card header (right side)

- [x] **2.5** Add inline form for creating a change order
  - Below the table, collapsible/inline form (always visible if simple, or behind "Add Change Order" toggle)
  - Fields:
    - Amount: number input (required, non-zero, can be negative)
    - Description: text input (required, e.g., "Q2 budget increase")
    - Effective Date: date input (default: today)
  - Submit button: "Add Change Order"

- [x] **2.6** Create server action `addChangeOrder`
  - Location: `src/app/(dashboard)/mbas/[id]/page.tsx` (colocated with other actions)
  - Parse FormData: mbaId (hidden), amount, description, effectiveDate
  - Validation:
    - amount cannot be 0
    - description cannot be empty/whitespace
    - effectiveDate required
    - mbaId must exist
  - Create ChangeOrder via Prisma
  - Audit: `logAudit({ entityType: "ChangeOrder", entityId: record.id, action: "CREATE" })`
  - `redirect(/mbas/${mbaId})`

- [x] **2.7** Add delete button per change order row
  - Small "x" or trash icon button per row
  - No confirmation dialog needed (audit log preserves history)

- [x] **2.8** Create server action `deleteChangeOrder`
  - Parse FormData: changeOrderId, mbaId (for redirect)
  - Fetch the record first (to capture amount/description for audit)
  - Delete by ID
  - Audit: `logAudit({ entityType: "ChangeOrder", entityId: id, action: "DELETE", changes: { amount: { old: X, new: null }, description: { old: "...", new: null } } })`
  - `redirect(/mbas/${mbaId})`

- [x] **2.9** Update MBA list page (`src/app/(dashboard)/mbas/page.tsx`)
  - Add `changeOrders: true` to the include in `getMBAs()`
  - Import `calculateEffectiveBudget` from `@/lib/budget`
  - Use it for the budget column: `const budget = calculateEffectiveBudget(mba)`
  - Update the totals reduce to use effective budget
  - No visual changes needed beyond the number being correct

- [x] **2.10** Update dashboard (`src/app/(dashboard)/page.tsx`)
  - Add `changeOrders: true` to the include in `getDashboardStats()`
  - Import `calculateEffectiveBudget`
  - Replace `Number(mba.budget)` with `calculateEffectiveBudget(mba)` in totalBudget calc
  - Update remaining, outstanding from clients, etc.

- [x] **2.11** Run `npm run build` — verify clean

### Testing: Change Orders

- [ ] **2.T1** **Build verification**: `npm run build` passes with zero errors
- [ ] **2.T2** **Calculation correctness** (via dev server at localhost:3003):
  - Create an MBA with budget $100,000
  - Add change order +$25,000 ("Q2 budget increase") → effective budget shows $125,000
  - Add change order -$10,000 ("Scope reduction") → effective budget shows $115,000
  - Remaining = $115,000 minus any invoiced amounts
  - Delete the -$10,000 change order → effective budget returns to $125,000
- [ ] **2.T3** **Running total display**: Verify the Change Orders table shows running budget:
  - Row 1: +$25,000, Running: $125,000
  - Row 2: -$10,000, Running: $115,000
- [ ] **2.T4** **List page propagation**: MBA list Budget column shows $115,000 (not $100,000)
- [ ] **2.T5** **Dashboard propagation**: Total Budget card includes change order adjustments
- [ ] **2.T6** **Audit trail**: Audit log page shows entries for change order CREATE and DELETE
- [ ] **2.T7** **Validation edge cases**:
  - Submit with amount = 0 → rejected (error or no-op)
  - Submit with empty description → rejected
  - Submit with all valid data → success
- [ ] **2.T8** **No regression**: MBA with zero change orders displays exactly as before (Budget card shows just "Budget", not "Effective Budget")
- [x] **2.T9** Commit: "Add change order support to MBAs"

---

## 3. Credit/Rollover Between MBAs (F3)

Track money moving from one MBA to another.

**Requirement reference:** F3.1–F3.5 in `docs/requirements.md`
**Business rule:** Fees are NOT charged on rollovers — already paid on original MBA. Rollover is pure media spend.

### Tasks

- [x] **3.1** Update MBA detail page query to include rollover data
  - In `getMBA()`, add to include:
    ```ts
    creditsOut: {
      include: { toMba: { include: { client: true } } },
      orderBy: { createdAt: "desc" }
    },
    creditsIn: {
      include: { fromMba: { include: { client: true } } },
      orderBy: { createdAt: "desc" }
    }
    ```

- [x] **3.2** Add "Credits & Rollovers" section to MBA detail page
  - New Card section after Change Orders
  - Two subsections with headers:
    - **Credits Received** (creditsIn): money coming in from other MBAs
    - **Credits Sent** (creditsOut): money going out to other MBAs
  - Table per subsection: MBA # (link) | Client | Amount | Type | Date | Description | Delete
  - Type displayed as badge: "Journal Entry", "Credit Memo", "Cash Credit"
  - Subtotals for each direction
  - Empty state per direction: "No credits received" / "No credits sent"

- [x] **3.3** Add "Transfer Credit" form on MBA detail page
  - Located in the Credits & Rollovers card
  - Fields:
    - **Direction**: "Send FROM this MBA" or "Receive INTO this MBA" (radio/toggle)
    - **Other MBA**: Select dropdown
      - Default: show MBAs from the same client
      - Option/toggle to show all MBAs across clients
      - Display format: "Client Name - MBA-YYYY-NNN (Campaign Name)"
    - **Amount**: Number input (positive, required)
    - **Type**: Select: Journal Entry, Credit Memo, Cash Credit
    - **Description**: Text input (optional)
  - Submit button: "Transfer Credit"
  - Need to fetch list of other MBAs for the dropdown — use a data-fetching function

- [x] **3.4** Create server action `createRollover`
  - Parse FormData: direction, otherMbaId, amount, type, description, currentMbaId
  - Determine fromMbaId/toMbaId based on direction
  - Validation:
    - fromMbaId !== toMbaId
    - amount > 0
    - type is valid enum (JOURNAL_ENTRY, CREDIT_MEMO, CASH_CREDIT)
    - Both MBAs exist
  - Create CreditRollover record
  - Audit logging (three entries):
    1. `entityType: "CreditRollover", action: "CREATE"` on the rollover record
    2. `entityType: "MBA", entityId: fromMbaId, action: "UPDATE"` with changes noting the credit out
    3. `entityType: "MBA", entityId: toMbaId, action: "UPDATE"` with changes noting the credit in
  - `redirect(/mbas/${currentMbaId})`

- [x] **3.5** Update `calculateEffectiveBudget()` in `src/lib/budget.ts`
  - Should already handle creditsIn/creditsOut from the initial implementation in 2.1
  - Verify: `effectiveBudget = Number(budget) + sum(changeOrders) + sum(creditsIn) - sum(creditsOut)`

- [x] **3.6** Update MBA detail page budget display to show rollover breakdown
  - When rollovers exist, the Budget card subtitle expands:
    - "Original: $100,000 + Change Orders: $25,000 + Credits In: $90,000 − Credits Out: $0"
    - Only show non-zero items
  - Keep it concise — one line of small text, not a separate card

- [x] **3.7** Update MBA list page query to include rollovers
  - Add `creditsIn: true, creditsOut: true` to include in `getMBAs()`
  - `calculateEffectiveBudget()` already handles them

- [x] **3.8** Update dashboard query to include rollovers
  - Add `creditsIn: true, creditsOut: true` to include in `getDashboardStats()`
  - Budget calculation already uses `calculateEffectiveBudget()`

- [x] **3.9** Create server action `deleteRollover`
  - Parse FormData: rolloverId, currentMbaId (for redirect)
  - Fetch the record (to get fromMbaId, toMbaId, amount for audit)
  - Delete the record
  - Audit: log DELETE on the CreditRollover, and UPDATE on both MBAs
  - `redirect(/mbas/${currentMbaId})`

- [x] **3.10** Run `npm run build` — verify clean

### Testing: Rollovers

- [ ] **3.T1** **Build verification**: `npm run build` passes
- [ ] **3.T2** **Basic rollover flow** (dev server):
  - Create Client "Test Corp" with two MBAs: MBA-A ($100k) and MBA-B ($50k)
  - On MBA-A detail page, create rollover: Send $20k FROM MBA-A to MBA-B, type Journal Entry
  - MBA-A effective budget = $80k ($100k - $20k out)
  - MBA-B effective budget = $70k ($50k + $20k in)
  - MBA-A "Credits Sent" section shows: MBA-B, $20k, Journal Entry
  - MBA-B "Credits Received" section shows: MBA-A, $20k, Journal Entry
- [ ] **3.T3** **Combined change order + rollover**:
  - MBA-A: $100k budget + $25k change order + $20k credit out = $105k effective
  - Budget card subtitle: "Original: $100,000 + Change Orders: $25,000 − Credits Out: $20,000"
  - All pages agree on $105k
- [ ] **3.T4** **Delete rollover**:
  - Delete the $20k rollover from MBA-A detail page
  - MBA-A returns to $125k (budget + change order), MBA-B returns to $50k
  - Rollover row disappears from both MBA detail pages
  - Audit log shows DELETE entries
- [ ] **3.T5** **Validation**:
  - Cannot select the same MBA as source and destination
  - Amount = 0 or negative → rejected
  - Both MBA fields required
- [ ] **3.T6** **Cross-client rollover**: Select an MBA from a different client → should work
- [ ] **3.T7** **Receive direction**: Use "Receive INTO this MBA" direction → fromMbaId is the other MBA, toMbaId is current
- [ ] **3.T8** **List page and dashboard**: Budget columns and totals reflect rollovers correctly
- [x] **3.T9** Commit: "Add credit/rollover tracking between MBAs"

---

## 4. NetSuite Project Number on MBA (F1 prep)

Simple field addition — enables future NetSuite linking.

### Tasks

- [x] **4.1** Update MBA create form (`src/app/(dashboard)/mbas/new/page.tsx`)
  - Add optional text input after the Status select
  - Label: "NetSuite Project #"
  - Placeholder: "e.g., 4504"
  - Name: "netsuiteProjectNumber"

- [x] **4.2** Update `createMBA` server action to save `netsuiteProjectNumber`
  - Read from FormData, save as string or null if empty

- [x] **4.3** Add editable NetSuite Project # on MBA detail page
  - Small inline form near the page header (below client name / dates line)
  - Display: "NS Project: 4504" or "NS Project: Not set"
  - Click to edit: text input + Save button
  - Server action `updateNetsuiteProject(formData)` — update the field, audit log

- [x] **4.4** Show NetSuite Project # on MBA list page
  - New narrow column after "Name", header: "NS #"
  - Show value or "–" if not set
  - Small/muted text to not take too much space

- [x] **4.5** Run `npm run build` — verify clean

### Testing: NetSuite Project Number

- [ ] **4.T1** **Build verification**: `npm run build` passes
- [ ] **4.T2** Create MBA with NS# "4504" → shows on detail and list pages
- [ ] **4.T3** Create MBA without NS# → shows "–" on list, "Not set" on detail
- [ ] **4.T4** Edit: set NS# on existing MBA → saves and displays
- [ ] **4.T5** Edit: clear NS# (set to empty) → returns to "Not set"
- [x] **4.T6** Commit: "Add NetSuite project number field to MBAs"

---

## 5. Vendor Invoice Line Items + CSV Upload (F2 partial)

Break invoices into campaign-level line items. Add CSV upload as an ingestion method.

**Requirement reference:** F2.4, F2.6, F2.7 in `docs/requirements.md`

### Tasks

- [x] **5.1** Update invoice creation form (`src/app/(dashboard)/invoices/new/form.tsx`)
  - This is a `"use client"` component — add state management for line items
  - Add "Line Items" section between Notes and MBA Allocations
  - Each line item row: campaignName (text input), amount (number input), platform (text input, optional)
  - "+ Add Line Item" button and "x" remove button per row
  - Show running total of line items
  - Warning banner (yellow, non-blocking) when line items total != invoice totalAmount:
    - "Line items total ($45,000) doesn't match invoice total ($50,000)"
  - Green text when they match: "Line items match invoice total"

- [x] **5.2** Update `POST /api/invoices` route (`src/app/api/invoices/route.ts`)
  - Accept optional `lineItems` array in request body:
    ```ts
    lineItems?: { campaignName: string; amount: number; platform?: string; mbaId?: string }[]
    ```
  - Create VendorInvoiceLineItem records in the same transaction
  - Backwards compatible: if lineItems is absent or empty, works exactly as before
  - Update the form's `handleSubmit` to include lineItems in the JSON body

- [x] **5.3** Update invoice detail page (`src/app/(dashboard)/invoices/[id]/page.tsx`)
  - Add `lineItems: { include: { mba: { include: { client: true } } }, orderBy: { createdAt: "asc" } }` to the invoice query
  - New "Line Items" Card section:
    - Table: Campaign Name | Platform | Amount | MBA Assignment
    - MBA column: show assigned MBA or "Unmapped" badge
    - "Assign MBA" action per line item (dropdown of active MBAs → server action)
  - Totals: sum of line items vs invoice total (with match/mismatch indicator)
  - Empty state: "No line items recorded for this invoice"

- [x] **5.4** Create server action `updateLineItemMBA` (in invoice detail page)
  - Takes: lineItemId, mbaId (or empty string to unmap)
  - Updates `VendorInvoiceLineItem.mbaId`
  - Audit: log UPDATE on VendorInvoiceLineItem
  - Redirect back to invoice page

- [x] **5.5** Create CSV upload component (`src/components/csv-upload.tsx`)
  - `"use client"` component
  - Props: `onImport: (lineItems: { campaignName: string; amount: number; platform?: string }[]) => void`
  - UI:
    - File drop zone / file input (.csv files)
    - On file select: parse CSV client-side
    - Column detection (case-insensitive, flexible):
      - `campaign_name` or `campaign` or `name` or `description` → campaignName
      - `amount` or `cost` or `spend` or `total` → amount
      - `platform` or `channel` or `network` (optional) → platform
    - Show preview table with parsed data
    - Error states:
      - No recognizable columns → "Could not detect columns. Expected: campaign_name, amount"
      - Empty file → "CSV file is empty"
      - Rows with missing/invalid amount → highlight row with warning, still importable
    - "Import N line items" button → calls onImport callback
    - "Cancel" button → dismisses
  - CSV parsing: handle quoted values, trim whitespace, skip empty rows

- [x] **5.6** Integrate CSV upload into invoice form
  - Add toggle at top of Line Items section: "Manual" | "Import CSV"
  - When "Import CSV" selected: show CSVUpload component
  - On import: switch to "Manual" mode, populate lineItems state with parsed data
  - User can then edit any line item in the form before saving

- [x] **5.7** Update MBA detail page vendor invoices table
  - Add `lineItems: true` to the invoice include in `getMBA()` (nested through invoiceAllocations → invoice)
  - For invoices with line items:
    - Show line item count as a small badge: "3 items"
    - Add expandable row detail (click to expand)
    - Expanded view: mini-table with campaign name, platform, amount
  - Invoices without line items: no badge, no expand

- [x] **5.8** Update invoice list page (`src/app/(dashboard)/invoices/page.tsx`)
  - Add `_count: { select: { lineItems: true } }` or include lineItems to the query
  - Show line item count per invoice row as subtle text: "3 items"

- [x] **5.9** Run `npm run build` — verify clean

### Testing: Invoice Line Items & CSV Upload

- [ ] **5.T1** **Build verification**: `npm run build` passes
- [ ] **5.T2** **Create invoice WITH line items manually**:
  - New invoice: Meta, $50,000, 3 line items:
    - "Brand Awareness" $20k (platform: "Facebook")
    - "Retargeting" $15k (platform: "Instagram")
    - "Prospecting" $15k (platform: "Facebook")
  - Line items total indicator shows green (matches $50k)
  - Save → invoice detail page shows all 3 line items
  - Campaign names, amounts, platforms all correct
- [ ] **5.T3** **Create invoice WITHOUT line items** (backwards compatibility):
  - Create invoice with only total + MBA allocation, zero line items
  - Saves successfully
  - Invoice detail shows "No line items" message
  - Existing invoices created before this feature still render correctly
- [ ] **5.T4** **Line item total mismatch**:
  - Enter total $50,000 but line items summing to $45,000
  - Yellow warning appears showing the mismatch
  - Save still works (warning, not blocker)
- [ ] **5.T5** **Map line items to MBAs on invoice detail page**:
  - Assign each line to an MBA via dropdown
  - Refresh page → assignments persist
  - Change an assignment → updates
  - Clear an assignment → shows "Unmapped"
- [ ] **5.T6** **CSV upload - happy path**:
  - Create test CSV:
    ```csv
    campaign_name,amount,platform
    Brand Campaign,20000,Facebook
    Retargeting,15000,Instagram
    Prospecting,15000,Facebook
    ```
  - Switch to "Import CSV" mode, upload file
  - Preview shows 3 rows correctly
  - Click "Import 3 line items" → form switches to Manual with 3 pre-filled rows
  - Edit one amount, add the invoice total, save
  - Invoice detail shows correct data
- [ ] **5.T7** **CSV upload - alternative column names**:
  - CSV with headers `campaign,cost` (no platform column)
  - Parses correctly, platform left empty
- [ ] **5.T8** **CSV upload - error cases**:
  - File with no recognizable columns (e.g., `foo,bar,baz`) → error message
  - Empty CSV → error message
  - CSV with some missing amounts → rows flagged but importable
- [ ] **5.T9** **MBA detail page - expandable invoice rows**:
  - Invoice with line items shows "3 items" badge and is expandable
  - Expanded view shows campaign breakdown
  - Invoice without line items has no badge and no expand
- [ ] **5.T10** **Invoice list page**: Line item count visible per invoice
- [x] **5.T11** Commit: "Add vendor invoice line items and CSV upload"

---

## 6. Reconciliation Workflow (F5)

Structured close-out process for finished MBAs.

**Requirement reference:** F5.1–F5.5 in `docs/requirements.md`

### Tasks

- [x] **6.1** Update MBA detail page query to include reconciliation
  - Add `reconciliation: true` to the include in `getMBA()`

- [x] **6.2** Add "Start Reconciliation" button on MBA detail page
  - Conditions for visibility:
    - MBA status is ACTIVE
    - No ReconciliationRecord exists for this MBA
  - Button location: near the status controls at the top, or as a distinct action
  - Text: "Start Reconciliation"

- [x] **6.3** Create server action `startReconciliation`
  - Create ReconciliationRecord:
    - status: PENDING
    - finalBalance: calculated as effectiveBudget - totalInvoiced (snapshot at start)
  - Update MBA status to RECONCILING
  - Audit: CREATE on ReconciliationRecord, UPDATE (status) on MBA
  - Redirect back

- [x] **6.4** Create reconciliation panel on MBA detail page
  - Shows when `mba.reconciliation` exists
  - Styled distinctly (e.g., border-l-4 with purple/blue accent color)
  - **Header**: "Reconciliation" + status badge (PENDING: yellow, IN_REVIEW: blue, CONFIRMED: green, CLOSED: gray)
  - **Summary info**:
    - Campaign end date and days elapsed since
    - Final balance (remaining amount)
    - Vendor invoices count for this MBA
    - Unallocated invoice amount warning (if any invoices not fully allocated)
  - **Outcome selector** (when status is PENDING or IN_REVIEW):
    - Select dropdown: "Select outcome..." / ROLLOVER / REFUND / CLOSED_ZERO
    - Labels: "Roll over to next MBA" / "Refund client" / "Close (zero balance)"
  - **Notes**: Text area (always editable until CLOSED)
  - **Action buttons** (progressive, only show the next valid action):
    - PENDING → "Mark In Review" button
    - IN_REVIEW → "Confirm Reconciliation" button (requires outcome to be set)
    - CONFIRMED → "Close MBA" button
    - CLOSED → no action buttons (display "Reconciliation complete" message)

- [x] **6.5** Create server actions for reconciliation
  - `updateReconciliation(formData)`:
    - Updates: outcome, notes, finalBalance
    - Does NOT change status (that's done by specific transition actions)
    - Audit: UPDATE on ReconciliationRecord
  - `advanceReconciliation(formData)`:
    - Single action that handles all state transitions based on current status
    - PENDING → IN_REVIEW: just update status
    - IN_REVIEW → CONFIRMED: require outcome is set, set confirmedAt = now(), confirmedBy = user email
    - CONFIRMED → CLOSED: set recon status CLOSED, set MBA status CLOSED
    - Validate: don't allow skipping steps or going backwards
    - Audit: UPDATE on ReconciliationRecord, and on MBA when status changes

- [x] **6.6** Handle ROLLOVER outcome after confirmation
  - When recon status = CONFIRMED and outcome = ROLLOVER:
    - Show prominent "Create Rollover" button/banner
    - Text: "This MBA has $X remaining. Transfer to another MBA?"
    - Button links to the rollover form (Section 3) with pre-filled data:
      - Direction: "Send FROM this MBA"
      - Amount: finalBalance value
    - After rollover is created, user returns to close the reconciliation

- [x] **6.7** Handle REFUND outcome
  - When outcome = REFUND:
    - Show refund amount (= finalBalance)
    - Notes field serves as the place to record refund details
    - No system integration — purely informational

- [x] **6.8** Handle CLOSED_ZERO outcome
  - When outcome = CLOSED_ZERO:
    - Simple — no rollover or refund prompts
    - Just confirm and close

- [x] **6.9** Add "Needs Reconciliation" indicator to MBA list page
  - Calculate: ACTIVE MBAs where `endDate < (today - 60 days)`
  - Show count at top of list page: "N MBAs may need reconciliation" (info banner, clickable)
  - Optional: add a filter that shows only these MBAs

- [x] **6.10** Dashboard: add "Needs Reconciliation" card
  - New card in the overview section (or modify existing stats grid)
  - Count of ACTIVE MBAs past end date by 60+ days
  - Clickable → navigates to MBA list (ideally filtered)

- [x] **6.11** Run `npm run build` — verify clean

### Testing: Reconciliation

- [ ] **6.T1** **Build verification**: `npm run build` passes
- [ ] **6.T2** **Start reconciliation on ACTIVE MBA**:
  - Click "Start Reconciliation" on an active MBA with $30k remaining
  - MBA status changes to RECONCILING
  - Reconciliation panel appears with PENDING status
  - Final balance shows $30,000
  - "Start Reconciliation" button disappears
- [ ] **6.T3** **Full state machine: PENDING → IN_REVIEW → CONFIRMED → CLOSED**:
  - PENDING: click "Mark In Review" → status changes to IN_REVIEW
  - IN_REVIEW: select outcome = CLOSED_ZERO, click "Confirm" → status CONFIRMED
  - CONFIRMED: click "Close MBA" → recon CLOSED, MBA status CLOSED
  - Verify each transition creates audit log entries
- [ ] **6.T4** **Cannot skip steps**:
  - When PENDING: only "Mark In Review" available, not "Confirm" or "Close"
  - When IN_REVIEW: cannot "Close MBA" directly
  - When CONFIRMED: cannot go back to IN_REVIEW
- [ ] **6.T5** **ROLLOVER outcome flow**:
  - Start recon on MBA with $15k remaining
  - Mark In Review → set outcome ROLLOVER → Confirm
  - "Create Rollover" button appears with $15k pre-filled
  - Complete the rollover to another MBA
  - Return and Close MBA
  - Source MBA is CLOSED, destination MBA has $15k more
- [ ] **6.T6** **REFUND outcome flow**:
  - Start recon on MBA with $5k remaining
  - Set outcome REFUND → Confirm → record notes about refund → Close
  - MBA is CLOSED, notes preserved
- [ ] **6.T7** **CLOSED_ZERO outcome**:
  - MBA with $0 remaining → start recon → CLOSED_ZERO → confirm → close
  - Clean close, no prompts for rollover/refund
- [ ] **6.T8** **Button visibility rules**:
  - "Start Reconciliation" only appears on ACTIVE MBAs (not DRAFT, CLOSED, RECONCILING)
  - RECONCILING MBA shows the reconciliation panel, not the start button
- [ ] **6.T9** **Confirm requires outcome**:
  - Try to confirm without selecting an outcome → should be blocked or show error
- [ ] **6.T10** **"Needs Reconciliation" indicators**:
  - MBA with endDate 90 days ago, status ACTIVE → included in count
  - MBA with endDate 30 days ago, status ACTIVE → NOT included
  - MBA with endDate 90 days ago, status CLOSED → NOT included
  - Dashboard card shows correct count
  - MBA list banner shows correct count
- [ ] **6.T11** **Reconciliation panel info accuracy**:
  - Days since campaign ended: matches reality
  - Vendor invoice count: matches actual invoices allocated to this MBA
  - Final balance: matches effectiveBudget - totalInvoiced
- [x] **6.T12** Commit: "Add reconciliation workflow for MBA close-out"

---

## 7. Integration Testing & End-to-End QA

All QA is done in a real browser via Chrome DevTools MCP. Dev server must be running.

### Setup

- [x] **7.0** Start dev server and open app in Chrome:
  - Run `npm run dev -- -p 3003` in background
  - Use `mcp__chrome-devtools__navigate_page` to open `http://localhost:3003`
  - Use `mcp__chrome-devtools__take_snapshot` to get the a11y tree (preferred over screenshots for verifying text/numbers)
  - Use `mcp__chrome-devtools__take_screenshot` for visual checks (layout, colors, badges)
  - If login is required, use `mcp__chrome-devtools__fill` + `mcp__chrome-devtools__click` to authenticate first

### Browser QA method

For each test below, the process is:
1. **Navigate** to the page (`navigate_page`)
2. **Snapshot** the a11y tree (`take_snapshot`) to read text content and find element UIDs
3. **Interact** using `click`, `fill`, `fill_form` with UIDs from the snapshot
4. **Verify** by taking a new snapshot after the action and checking the expected text/values appear
5. **Screenshot** for visual verification where styling matters (badges, colors, warning banners)

### Full lifecycle test (in-browser)

- [x] **7.1** **Complete MBA lifecycle** — perform ALL steps in the actual browser:
  1. Navigate to `/clients/new`, create client "QA Test Corp"
     - Fill form, submit, verify redirect to client page
  2. Navigate to `/mbas/new`, create MBA-A: $200,000, NS# "9001", ACTIVE
     - Select client "QA Test Corp", fill budget/dates, submit
     - Take snapshot of MBA detail → verify budget shows $200,000
  3. On MBA-A detail, add change order +$50,000 "Q2 budget increase"
     - Fill change order form, submit
     - Take snapshot → verify effective budget = $250,000
     - Screenshot the change orders table → verify running total display
  4. On MBA-A detail, log spend: Meta $30k for current month
     - Fill spend form, submit
     - Take snapshot → verify spend shows $30,000
  5. Navigate to `/invoices/new`, create Meta invoice $80,000 with 3 line items
     - Fill invoice header fields
     - Add 3 line items: "Brand Awareness" $30k, "Retargeting" $25k, "Prospecting" $25k
     - Add MBA allocation: MBA-A = $80,000
     - Submit, verify redirect to invoice list
  6. Navigate to the new invoice detail page
     - Take snapshot → verify 3 line items displayed with correct amounts
     - Map each line item to MBA-A via dropdown
     - Take snapshot → verify all show "MBA-A" assignment
  7. Navigate to `/invoices/new`, create Google invoice $40,000 (NO line items)
     - Allocate to MBA-A, submit
  8. Navigate to MBA-A detail
     - Take snapshot and verify these EXACT numbers:
       - Effective budget: $250,000
       - Vendor invoiced: $120,000
       - Remaining: $130,000
       - Spend: $30,000
     - Screenshot the budget cards for visual verification
  9. On MBA-A detail, mark client payment received ($250k)
     - Fill payment form, submit
     - Take snapshot → verify "Received" badge
  10. Navigate to `/mbas/new`, create MBA-B: $100,000 for "QA Test Corp"
  11. Navigate back to MBA-A detail, click "Start Reconciliation"
      - Take snapshot → verify RECONCILING status, reconciliation panel with PENDING
      - Verify final balance shows $130,000
  12. Set outcome to ROLLOVER, click "Mark In Review", then "Confirm"
      - Take snapshot at each step → verify status transitions
  13. Click "Create Rollover" → fill $130k to MBA-B
      - Submit, verify redirect
  14. Navigate to MBA-B detail
      - Take snapshot → verify effective budget = $230,000 ($100k + $130k credit)
      - Verify "Credits Received" section shows $130k from MBA-A
  15. Navigate back to MBA-A, click "Close MBA"
      - Take snapshot → verify MBA status = CLOSED
  16. Navigate to dashboard (`/`)
      - Take snapshot → verify numbers are consistent
      - Screenshot the dashboard for visual check
  17. Navigate to `/audit`
      - Take snapshot → verify audit entries for all operations performed

### Regression checks (in-browser)

- [x] **7.2** **Pre-existing features still work**:
  - [x] Navigate to `/mbas` → click "+ Add Client" → fill modal → submit → verify client appears
  - [x] Navigate to `/mbas/new` → create MBA → verify auto-generated number and redirect
  - [x] Navigate to MBA detail → log spend (fill platform/month/amount) → verify it appears in table
  - [x] Navigate to `/invoices/new` → create invoice with allocation, NO line items → verify saves
  - [ ] Navigate to invoice detail → toggle paid status → take snapshot → verify "Paid" badge
  - [x] Navigate to `/audit` → take snapshot → verify recent entries visible
  - [ ] Navigate to `/mbas?client=X` → verify filter works (only that client's MBAs shown)

- [x] **7.3** **Budget consistency across ALL pages** (use MBA with change orders AND rollovers):
  Record the expected effective budget number, then:
  - [x] Navigate to MBA detail → take snapshot → extract budget number
  - [x] Navigate to `/mbas` → take snapshot → find the MBA row, extract budget number
  - [x] On same page, check the totals row includes this budget
  - [x] Navigate to `/` (dashboard) → take snapshot → extract Total Budget number
  - [x] All values must be mathematically consistent

- [ ] **7.4** **Cascade deletion safety**:
  - Navigate to a test MBA detail that has change orders, rollovers, invoices
  - Delete the MBA (if delete exists) or delete the client
  - Navigate to `/mbas`, `/invoices`, `/audit` → take snapshots → verify no errors, no orphan data

- [x] **7.5** **Empty states** (in-browser):
  - [x] Create a fresh MBA with nothing attached → navigate to detail
      - Take snapshot → verify "No change orders", "No credits", "No vendor invoices"
      - Verify "Start Reconciliation" button IS visible
  - [ ] Navigate to an invoice with no line items → verify "No line items" message

- [ ] **7.6** **Visual verification** (screenshots):
  - [ ] Screenshot MBA detail page with change orders → verify green/red coloring on amounts
  - [ ] Screenshot MBA with negative remaining → verify red text
  - [ ] Screenshot reconciliation panel → verify distinct styling (border, status badges)
  - [ ] Screenshot MBA list with RECONCILING status → verify badge color differs from ACTIVE/CLOSED

### Code quality audit

- [x] **7.7** `npm run build` — final production build, zero errors
- [x] **7.8** Grep verification — all new pages have `export const dynamic = "force-dynamic"`:
  ```bash
  grep -rL "force-dynamic" src/app/\(dashboard\)/ --include="page.tsx"
  ```
  Any page files listed here are MISSING the directive — fix them.
- [x] **7.9** Grep verification — all server actions have audit logging:
  ```bash
  grep -A 20 '"use server"' src/app/\(dashboard\)/ --include="*.tsx" | grep -c "logAudit"
  ```
  Count of logAudit calls should roughly match count of server actions.
- [x] **7.10** No leftover debug code:
  ```bash
  grep -rn "console.log\|TODO\|FIXME\|HACK\|XXX" src/ --include="*.tsx" --include="*.ts"
  ```
  Review any results — remove debug logs, address TODOs or document them.
- [x] **7.11** Decimal handling: verify all new Decimal fields use `Number()` for display, not `.toString()` (which preserves trailing zeros)
- [x] **7.12** Update `CLAUDE.md` with:
  - New models added to schema
  - New lib file: `src/lib/budget.ts`
  - New component: `src/components/csv-upload.tsx`
  - Updated entity types for audit logging
- [x] **7.13** Stop dev server, clean up any test data created during QA

- [x] **7.14** Final commit: "Phase 2a complete — change orders, rollovers, line items, reconciliation"

---

## Patterns to Follow

These are established patterns from the existing codebase. Follow them exactly.

### Server Actions
- Defined as `async function` with `"use server"` directive
- Parse FormData, validate, Prisma operation, audit log, `redirect()`
- See `addSpendEntry` in `src/app/(dashboard)/mbas/[id]/page.tsx` as reference

### Page Structure
- Every dashboard page starts with `export const dynamic = "force-dynamic"`
- Data fetching via async functions at top of file (e.g., `getMBA()`)
- Server components with forms using server actions
- Uses shadcn Card, Table, Button, Input, Label, Select components

### Formatting
- Currency: `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`
- Dates: `toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })`
- IDs: cuid via Prisma `@default(cuid())`

### Audit Logging
- Import `logAudit` and `computeChanges` from `@/lib/audit`
- Log CREATE, UPDATE, DELETE actions
- Entity types: "Client", "MBA", "Invoice", "SpendEntry", "InvoiceAllocation", "ChangeOrder", "CreditRollover", "ReconciliationRecord", "VendorInvoiceLineItem"

### Database
- Use `prisma` from `@/lib/db`
- Decimals: `@db.Decimal(15, 2)` — convert with `Number()` for display
- Dates: `@db.Date` for date-only fields

### UI Components Available
- `@/components/ui/card` — Card, CardContent, CardHeader, CardTitle
- `@/components/ui/button` — Button (variants: default, outline, destructive)
- `@/components/ui/input` — Input
- `@/components/ui/label` — Label
- `@/components/ui/select` — Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- `@/components/ui/table` — Table, TableBody, TableCell, TableHead, TableHeader, TableRow
- `@/components/ui/dialog` — Dialog (for modals)
- `lucide-react` for icons

### File Locations
- Pages: `src/app/(dashboard)/`
- API routes: `src/app/api/`
- Components: `src/components/`
- Lib: `src/lib/`
- Schema: `prisma/schema.prisma`

### Testing Approach (Chrome DevTools MCP + build checks)
This project has no automated test framework. Verification uses Chrome DevTools MCP for real browser testing:

1. **`npm run build`** — TypeScript compilation catches type errors, bad imports, and server/client boundary violations. Run after every section.
2. **Chrome DevTools browser testing** — Dev server on port 3003, Chrome DevTools MCP tools for real interaction:
   - `mcp__chrome-devtools__navigate_page` — load pages by URL
   - `mcp__chrome-devtools__take_snapshot` — get a11y tree to read text content, find element UIDs, verify data
   - `mcp__chrome-devtools__take_screenshot` — visual checks for layout, colors, badges, styling
   - `mcp__chrome-devtools__fill` / `mcp__chrome-devtools__fill_form` — fill form inputs and selects
   - `mcp__chrome-devtools__click` — click buttons, links, submit forms
   - `mcp__chrome-devtools__evaluate_script` — run JS in page for complex checks
3. **Prisma operations** — `db push` + `generate` confirms schema validity
4. **Grep-based code audits** — verify patterns (audit logging, force-dynamic, etc.) are consistent
5. **QA flow**: Navigate → Snapshot (read content) → Interact (fill/click) → Snapshot again (verify result) → Screenshot (visual check)

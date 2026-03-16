# MBA Tracker — Feature Requirements & Architecture

> Derived from stakeholder meeting (transcript: `docs/audio2443011771 copy 3.txt`)
> Participants: Stephen (product/engineering), Gail (finance), Svetlana (finance leadership), Eric (advertising/media)

---

## 1. Current State

### What exists today
- Google Sheets per client with one tab per MBA
- NetSuite for invoicing clients and recording vendor payments
- Concur for vendor invoice approval and payment
- MavenLink for time tracking (limited media use)
- Manual email-based workflow for mapping vendor invoice line items to MBAs

### Pain points identified
- Manual data entry across multiple systems (Sheets, NetSuite, Concur)
- Downloading/exporting charts and reports repeatedly
- Carrying data between sheets manually
- Reconciliation is time-consuming, especially for clients with many tabs (e.g., MJFF with 100+ campaign line items)
- Same project number shared across multiple MBAs (Airbnb edge case)
- No real-time visibility into MBA status for the media team
- 60-day lag on campaign close-out and reconciliation

### What's already built (Phase 1 prototype)
- Client and MBA CRUD
- Spend entry logging by platform/month
- Vendor invoice creation with multi-MBA allocation
- Client payment tracking (paid/unpaid + date)
- Dashboard with budget utilization stats
- Audit log for all changes

---

## 2. Process Map (as described by finance)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. MBA CREATION                                                     │
│    Client requests work → MBA created with budget → Client signs    │
│    MBA may be: lump sum, by platform, or by objective               │
├─────────────────────────────────────────────────────────────────────┤
│ 2. FINANCE INTAKE                                                   │
│    Susan receives signed MBA →                                      │
│      a) Creates tab in Google Sheet (MBA details, budget)           │
│      b) Creates client invoice in NetSuite (project + GL code)      │
│    One project per MBA in NetSuite (usually)                        │
├─────────────────────────────────────────────────────────────────────┤
│ 3. CLIENT INVOICING                                                 │
│    Invoice sent to client immediately (prepaid model)               │
│    Sent via NetSuite or sometimes email                             │
│    Media team CC'd on all client invoices                           │
├─────────────────────────────────────────────────────────────────────┤
│ 4. CLIENT PAYMENT                                                   │
│    Susan monitors bank → marks invoice paid in NetSuite → updates   │
│    Google Sheet                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 5. MEDIA SPEND                                                      │
│    Media team sets up campaigns on platforms based on MBA budget     │
│    One campaign per MBA per platform (no cross-MBA campaigns)       │
├─────────────────────────────────────────────────────────────────────┤
│ 6. VENDOR INVOICES                                                  │
│    Platforms send monthly invoices (one per client per platform)     │
│    Invoice arrives at mediacounting@ →                               │
│      a) Forwarded to media team: "where does this go?"              │
│      b) Media team maps line items (campaigns) to MBAs via email    │
│      c) Finance enters in Concur, splits by project/tab             │
│      d) Ads team approves invoice in Concur                         │
│      e) Finance leadership approves → payment scheduled             │
│      f) Concur syncs to NetSuite next day                           │
├─────────────────────────────────────────────────────────────────────┤
│ 7. RECONCILIATION (~60 days after campaign end)                     │
│    Finance verifies all vendor invoices received                    │
│    Sends to media team: "are we missing anything?"                  │
│    Calculates final spend vs. budget                                │
│    Emails media team with remaining balance                         │
│    Media team decides: refund client or roll into next MBA          │
├─────────────────────────────────────────────────────────────────────┤
│ 8. CREDITS & ROLLOVERS                                              │
│    Underspend → credit memo or journal entry in NetSuite            │
│    Options: a) Credit on next invoice (client pays less)            │
│             b) Journal entry moving funds between projects          │
│    MBA contract allows rollover by default                          │
│    Rollover amount documented in next MBA                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature Requirements

### Phase 2: Core Workflow (build next)

#### F1. NetSuite Integration
**Goal:** Eliminate dual data entry between the tracker and NetSuite.

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| F1.1 | Import client invoices from NetSuite by project number | High | Each MBA = one project in NetSuite |
| F1.2 | Sync client payment status from NetSuite | High | Susan marks paid in NetSuite; tracker should reflect it |
| F1.3 | Import journal entries for credit rollovers | Medium | Journal entries contain from/to project numbers |
| F1.4 | Read-only initially; no writes back to NetSuite | — | Reduce risk; NetSuite remains system of record |

**Data available in NetSuite per invoice:**
- Project number (= MBA identifier)
- GL account (one code for all media pass-through)
- Invoice amount (total only, no platform-level breakout)
- Payment status
- Journal entries with source/destination project numbers

**What NetSuite does NOT have:**
- Platform/vendor-level breakout of spend
- Campaign-level detail

#### F2. Vendor Invoice Ingestion
**Goal:** Reduce manual work getting platform invoices into the system and mapping them to MBAs.

**Primary ingestion: Email inbox monitoring (mediainvoices@)**
Every vendor invoice already arrives at this address regardless of platform. Monitoring this single inbox captures 100% of invoices without per-platform API integrations.

**Ingestion flow:**
1. Scheduled job checks mediainvoices@ via Google Workspace API
2. Pull new emails with PDF/document attachments
3. Extract line items (campaign name + amount) using LLM with structured output
4. Auto-detect client and platform from invoice content
5. Create draft invoice in tracker with parsed line items
6. Media team reviews, maps line items to MBAs, and confirms
7. Mark email as processed to prevent re-import

**Fallback tiers (when auto-parsing fails or is incomplete):**

| Tier | Trigger | User action |
|------|---------|-------------|
| 1. Auto-parsed | Email ingested, PDF parsed successfully | Review & confirm pre-filled line items, map to MBAs |
| 2. Manual edit | Parsing errors or missing data flagged | Edit individual line items inline (fix amounts, campaign names) |
| 3. CSV upload | PDF couldn't be parsed at all, or bulk entry needed | Upload a CSV export from the ad platform's billing UI |
| 4. Manual entry | No document available, or one-off adjustment | Enter invoice + line items by hand (existing flow) |

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| F2.1 | Monitor mediainvoices@ inbox for new invoices | High | Google Workspace API; scheduled check |
| F2.2 | Extract line items from invoice PDFs (LLM + structured output) | High | Each line = campaign name + amount |
| F2.3 | Auto-detect client and platform from invoice | High | Match to existing clients in system |
| F2.4 | Present parsed line items for review and MBA mapping | High | Media team assigns each line to an MBA |
| F2.5 | Flag low-confidence parses for manual review | High | Don't silently accept bad data |
| F2.6 | Allow inline editing of any parsed line item | High | Fix amounts, names, add/remove lines |
| F2.7 | CSV upload as alternative ingestion method | Medium | Standard columns: campaign, amount, platform |
| F2.8 | Manual invoice + line item entry (existing flow) | — | Already built; serves as final fallback |
| F2.9 | Support Meta's Instagram prefix convention | Low | "Instagram-" prefix on campaign names |
| F2.10 | Deduplication: skip already-processed emails | High | Track email message IDs |

**Invoice structure (from transcript):**
- One invoice per client per platform per month
- Line items are at the campaign level
- Each line item maps to exactly one MBA (no line-item splitting needed)
- One invoice may span multiple MBAs for the same client

#### F3. MBA-to-MBA Credit & Rollover
**Goal:** Track money moving between MBAs cleanly so totals tie out.

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| F3.1 | Record credit/rollover from one MBA to another | High | Amount, source MBA, destination MBA |
| F3.2 | Adjust MBA available budget to include incoming rollovers | High | Budget = original + rollover in |
| F3.3 | Show rollover history on MBA detail page | Medium | "Received $X from MBA-2024-015" |
| F3.4 | Import rollovers from NetSuite journal entries | Medium | JE contains both project numbers |
| F3.5 | Support both credit memo (client pays less) and JE (internal transfer) | Medium | Two different mechanisms |

**Business rules:**
- Rollover amount is documented in the next MBA contract
- MBA contract says: "This MBA is $100,000 plus rollover of $90,000"
- Fees are NOT charged on rollover amounts — client already paid fees on the original MBA (all fees are prepaid)
- Rollover is purely media spend dollars, no additional fee component
- Credits from platforms (small refunds) accrue and roll forward, not applied retroactively

#### F4. Change Orders
**Goal:** Track budget modifications to existing MBAs.

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| F4.1 | Record change orders on an MBA (amount, date, description) | High | Positive (increase) or negative (decrease) |
| F4.2 | Adjust MBA total budget to include change orders | High | Budget = original + sum(change orders) |
| F4.3 | Change orders do NOT create new MBAs or tabs | — | Same project, same tab |
| F4.4 | Negative change order = credit memo to client in NetSuite | Low | For awareness/display only |

#### F5. Reconciliation Workflow
**Goal:** Structured close-out process instead of ad-hoc emails.

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| F5.1 | Flag MBA for reconciliation (~60 days after end date) | Medium | Automatic prompt or manual trigger |
| F5.2 | Reconciliation checklist: all vendor invoices received? | Medium | Compare expected vs. actual invoices |
| F5.3 | Calculate final remaining balance | High | Already partially built |
| F5.4 | Record reconciliation outcome (refund, rollover, or close) | Medium | Links to F3 for rollovers |
| F5.5 | Notify media team for confirmation | Low | Email or in-app notification |

### Phase 3: Enhanced Visibility (already partially built)

#### F7. Dashboard Enhancements

| ID | Requirement | Priority | Notes |
|----|------------|----------|-------|
| F7.1 | Cash position: money received from clients vs. money paid to vendors | High | Finance needs this for cash management |
| F7.2 | Outstanding client invoices (sent but unpaid) | High | Already partially built |
| F7.3 | MBA status timeline (created → invoiced → paid → spending → reconciled) | Medium | Visual workflow tracker |
| F7.4 | Alerts for MBAs approaching budget limit | Medium | Configurable threshold |

### Out of Scope (for now)
- UK/international operations and multi-currency support (solve US first)
- MavenLink integration (not all MBAs have MavenLink projects)
- Salesforce integration (media pass-through doesn't flow through Salesforce)
- Fee calculation and management fee tracking (separate from media pass-through)
- Platform API integrations for real-time spend data (future phase)

---

## 4. Data Model Changes

### New models needed

```
ChangeOrder
  id            String
  mbaId         String → MBA
  amount        Decimal        // positive = increase, negative = decrease
  description   String
  effectiveDate DateTime
  netsuiteRef   String?        // reference to NetSuite invoice/credit memo
  createdAt     DateTime
  updatedAt     DateTime

CreditRollover
  id            String
  fromMbaId     String → MBA
  toMbaId       String → MBA
  amount        Decimal
  type          Enum(JOURNAL_ENTRY, CREDIT_MEMO, CASH_CREDIT)
  description   String?
  netsuiteRef   String?        // NetSuite journal entry ID
  createdAt     DateTime
  updatedAt     DateTime

VendorInvoiceLineItem
  id            String
  invoiceId     String → Invoice
  campaignName  String
  platform      String?        // Meta, Google, etc. (sub-platform like Instagram)
  amount        Decimal
  mbaId         String? → MBA  // null until mapped
  createdAt     DateTime

ReconciliationRecord
  id            String
  mbaId         String → MBA
  status        Enum(PENDING, IN_REVIEW, CONFIRMED, CLOSED)
  finalBalance  Decimal
  outcome       Enum(REFUND, ROLLOVER, CLOSED_ZERO)
  rolloverId    String? → CreditRollover
  notes         String?
  confirmedBy   String?
  confirmedAt   DateTime?
  createdAt     DateTime
  updatedAt     DateTime
```

### Changes to existing models

```
MBA (add fields)
  netsuiteProjectNumber  String?    // the project ID in NetSuite
  changeOrders           ChangeOrder[]
  creditsIn              CreditRollover[] (toMba)
  creditsOut             CreditRollover[] (fromMba)
  reconciliation         ReconciliationRecord?

Invoice (add fields)
  lineItems              VendorInvoiceLineItem[]
  concurStatus           String?    // approval status from Concur
  concurId               String?    // reference ID in Concur
```

### Updated budget calculation
```
Effective Budget = MBA.budget
                 + sum(ChangeOrder.amount)
                 + sum(CreditRollover.amount WHERE toMbaId = this)

Amount Spent    = sum(InvoiceAllocation.amount WHERE mbaId = this)

Remaining       = Effective Budget - Amount Spent

Credits Out     = sum(CreditRollover.amount WHERE fromMbaId = this)
```

---

## 5. Architecture

### System integration map

```
                         ┌──────────────┐
                         │  MBA Tracker  │
                         │   (Next.js)   │
                         └──────┬───────┘
                                │
                ┌───────────────┼───────────────┐
                │                               │
                ▼                               ▼
        ┌──────────────┐              ┌──────────────────┐
        │   NetSuite   │              │  mediainvoices@  │
        │    (read)    │              │  Email Inbox     │
        └──────────────┘              └────────┬─────────┘
                                               │
        Data pulled:                   ┌───────▼────────┐
        - Projects                     │  PDF Parsing   │
        - Client invoices              │  (LLM-based)   │
        - Vendor invoices              └───────┬────────┘
          (via Concur→NS sync)                 │
        - Payment status               Fallbacks:
        - Journal entries               - Manual edit
          (rollovers)                   - CSV upload
                                        - Manual entry
```

### Integration approach
1. **Email inbox (mediainvoices@)** — Primary vendor invoice ingestion. Google Workspace API to poll for new emails, extract PDF attachments, parse with LLM. All vendor invoices already land here regardless of platform — single integration covers everything.
2. **NetSuite REST API** — Financial data integration. Read project data, client invoices, payment status, and journal entries. Scheduled sync (e.g., every 15 min) or on-demand refresh.

**Why not Concur?** Concur syncs to NetSuite within a day. All vendor invoice data (amounts, project breakouts, payment status) lands in NetSuite after processing. The only thing Concur uniquely provides is real-time approval workflow status (~1-2 day window), which isn't critical. One integration is simpler to build and maintain.

### Sync strategy
- **Pull, don't push.** Tracker reads from external systems; never writes back.
- **NetSuite is system of record** for financial transactions.
- **Tracker is system of record** for MBA-to-campaign mapping (the part Sheets does today).
- **Idempotent syncs.** Use NetSuite IDs as keys to avoid duplicates.

---

## 6. Implementation Priority

### Now (Phase 2a) — No integrations needed
1. **Change orders on MBAs** (F4) — Pure CRUD, updates budget calc
2. **Credit/rollover between MBAs** (F3.1–F3.3) — Pure CRUD, critical for accurate tracking
3. **NetSuite project number field on MBA** (F1 prep) — Just a field, enables future linking
4. **Vendor invoice line items + CSV upload** (F2.4, F2.6, F2.7) — Line-item model, mapping UI, CSV fallback
5. **Reconciliation workflow** (F5) — Status tracking and close-out process

### Next (Phase 2b) — Email ingestion + NetSuite
6. **Email inbox monitoring** (F2.1) — Poll mediainvoices@, pull attachments
7. **PDF parsing with LLM** (F2.2, F2.3, F2.5) — Extract line items, flag low-confidence parses
8. **Inline editing of parsed invoices** (F2.6) — Manual correction fallback
9. **NetSuite API connection** (F1.1–F1.3) — Import client invoices, payments, journal entries
10. **Auto-import rollovers from journal entries** (F3.4)
11. **Dashboard cash position view** (F7.1–F7.2)

---

## 7. Open Questions

| # | Question | Who to ask | Notes |
|---|----------|-----------|-------|
| 1 | Why do some clients (Airbnb) share one project number across multiple MBAs? | Susan/Sean | May need a many-to-many MBA↔Project mapping |
| 2 | What NetSuite API access do we currently have? What permission level? | IT/Finance | Need read access to projects, invoices, journal entries |
| ~~3~~ | ~~How are fees calculated on rollovers?~~ | — | **Resolved:** No fees on rollovers. Client pays all fees upfront on the original MBA. Rollover is pure media spend. |
| 5 | Is there a standard naming convention for campaigns that could auto-match to MBAs? | Eric | Would enable automated line-item mapping |
| 6 | What does the media team's internal spend tracker look like? | Eric | May be a data source for real-time spend |
| 7 | How are UK invoices and multi-currency handled today? | Gail | Deferred but need to understand scope |

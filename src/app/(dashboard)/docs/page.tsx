import Link from "next/link";
import {
  Briefcase,
  Receipt,
  Activity,
  ClipboardList,
  LayoutDashboard,
  Users,
  Settings2,
  BookOpen,
  Megaphone,
  Calculator,
  HelpCircle,
  Zap,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Documentation — MBA Tracker",
};

const tocSections = [
  { id: "quick-start", label: "Quick start", icon: BookOpen },
  { id: "automation", label: "What’s automated", icon: Zap },
  { id: "concepts", label: "Core concepts", icon: HelpCircle },
  { id: "pages", label: "Page-by-page guide", icon: LayoutDashboard },
  { id: "mba-flow", label: "MBA lifecycle", icon: Briefcase },
  { id: "invoice-flow", label: "Vendor invoice flow", icon: Receipt },
  { id: "ads-team", label: "For the ads team", icon: Megaphone },
  { id: "finance-team", label: "For the finance team", icon: Calculator },
  { id: "glossary", label: "Glossary", icon: BookOpen },
  { id: "faq", label: "Troubleshooting & FAQ", icon: HelpCircle },
];

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Documentation"
        description="How the MBA Tracker works, page by page, and what each team should know."
      />

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-8 self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 mb-3">
            On this page
          </p>
          <nav className="space-y-0.5">
            {tocSections.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <Icon className="size-3.5 opacity-70" />
                  {s.label}
                </a>
              );
            })}
          </nav>
        </aside>

        <div className="space-y-12 min-w-0">
          <QuickStart />
          <Automation />
          <Concepts />
          <PageGuide />
          <MBAFlow />
          <InvoiceFlow />
          <AdsTeamGuide />
          <FinanceTeamGuide />
          <Glossary />
          <FAQ />
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-sm mt-1.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm leading-relaxed text-foreground/90 space-y-3">
      {children}
    </div>
  );
}

function Step({
  n,
  title,
  auto,
  children,
}: {
  n: number;
  title: string;
  auto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="size-6 shrink-0 rounded-full bg-bs-cobalt/10 text-bs-cobalt text-xs font-semibold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{title}</p>
          {auto !== undefined && <AutoBadge auto={auto} />}
        </div>
        <div className="text-sm text-muted-foreground mt-1 space-y-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function AutoBadge({ auto }: { auto: boolean }) {
  return auto ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-bs-cobalt/10 text-bs-cobalt">
      <Zap className="size-2.5" />
      Automated
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-bs-teal/20 text-bs-teal-dark">
      You do this
    </span>
  );
}

function FlowDiagram({
  title,
  description,
  rows,
}: {
  title: string;
  description?: string;
  rows: Array<{
    lane: "auto" | "manual" | "handoff";
    label: string;
    detail?: string;
  }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <p className="text-sm font-semibold">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-2 border-t border-border bg-secondary/30">
        <div className="px-4 py-2 border-r border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-bs-cobalt flex items-center gap-1">
            <Zap className="size-3" /> Automated
          </p>
        </div>
        <div className="px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-bs-teal-dark">
            You do this
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, i) => (
          <FlowRow
            key={i}
            row={row}
            isLast={i === rows.length - 1}
            nextLane={rows[i + 1]?.lane}
          />
        ))}
      </div>
    </div>
  );
}

function FlowRow({
  row,
  isLast,
  nextLane,
}: {
  row: { lane: "auto" | "manual" | "handoff"; label: string; detail?: string };
  isLast: boolean;
  nextLane?: "auto" | "manual" | "handoff";
}) {
  if (row.lane === "handoff") {
    return (
      <div className="grid grid-cols-2">
        <div className="px-4 py-2 border-r border-border flex items-center justify-end gap-2 text-[11px] text-muted-foreground italic">
          {row.label}
          <ArrowRight className="size-3.5 text-bs-cobalt" />
        </div>
        <div className="px-4 py-2" />
      </div>
    );
  }

  const isAuto = row.lane === "auto";
  const card = (
    <div
      className={`rounded-md border p-3 ${
        isAuto
          ? "border-bs-cobalt/20 bg-bs-light-blue/30"
          : "border-bs-teal/30 bg-bs-teal/10"
      }`}
    >
      <p className="text-sm font-medium leading-snug">{row.label}</p>
      {row.detail && (
        <p className="text-xs text-muted-foreground mt-1">{row.detail}</p>
      )}
    </div>
  );

  const showConnector = !isLast && nextLane && nextLane !== "handoff" && nextLane === row.lane;

  return (
    <div className="grid grid-cols-2 relative">
      <div
        className={`px-4 py-3 border-r border-border ${
          isAuto ? "" : "bg-muted/20"
        }`}
      >
        {isAuto ? card : null}
        {isAuto && showConnector && (
          <div className="flex justify-center mt-2 -mb-1">
            <ArrowDown className="size-3.5 text-bs-cobalt/60" />
          </div>
        )}
      </div>
      <div className={`px-4 py-3 ${isAuto ? "bg-muted/20" : ""}`}>
        {!isAuto ? card : null}
        {!isAuto && showConnector && (
          <div className="flex justify-center mt-2 -mb-1">
            <ArrowDown className="size-3.5 text-bs-teal-dark/60" />
          </div>
        )}
      </div>
    </div>
  );
}

function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "tip";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: "bg-bs-light-blue/40 border-bs-cobalt/15",
    warn: "bg-bs-coral/10 border-bs-coral/20",
    tip: "bg-bs-teal/15 border-bs-teal/25",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${styles}`}>
      <p className="text-sm font-semibold mb-1">{title}</p>
      <div className="text-sm text-foreground/85 space-y-2">{children}</div>
    </div>
  );
}

/* ---------------- Quick start ---------------- */

function QuickStart() {
  return (
    <Section
      id="quick-start"
      title="Quick start"
      description="A 60-second tour for first-time users."
    >
      <Prose>
        <p>
          MBA Tracker is where Blue State plans, tracks, and reconciles paid
          media. Each <strong>MBA</strong> (Media Buying Agreement) is a budget
          container for a client engagement.
        </p>
        <p>
          <strong>Most of the pipeline runs on its own.</strong> MBAs are
          auto-created from signed contracts; vendor invoices are auto-parsed
          from email; NetSuite and Concur stay in sync automatically. Your job
          is mostly to <strong>review, allocate, and reconcile</strong>.
        </p>
        <p>The day-to-day flow:</p>
      </Prose>
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <Step n={1} auto title="MBA is created from the signed contract">
          <p>
            A signed media buy emailed to the contracts inbox is parsed,
            matched to a NetSuite project, and saved as an active MBA. See{" "}
            <a href="#automation" className="underline">
              What’s automated
            </a>{" "}
            for the full pipeline.
          </p>
        </Step>
        <Step n={2} auto title="Vendor invoices arrive and get parsed">
          <p>
            Platforms email invoices to{" "}
            <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">
              mediainvoices@bluestate.co
            </code>
            . Automation pulls the inbox, Claude parses line items, and drafts
            land in the queue.
          </p>
        </Step>
        <Step n={3} auto={false} title="Review drafts, allocate to MBAs">
          <p>
            Open{" "}
            <Link href="/invoices/drafts" className="underline">
              Vendor Invoices → Drafts
            </Link>
            , confirm the parse, and assign each line item to the MBA it
            belongs to. This is the one step the system can’t do for you.
          </p>
        </Step>
        <Step n={4} auto={false} title="Track client payment & cash position">
          <p>
            The NetSuite sync auto-updates the MBA’s Client Paid / Amount
            Paid / Paid Date when NS reports its client invoices as Paid In
            Full. You only need to update manually for tranches NS hasn’t
            recorded yet. The{" "}
            <Link href="/" className="underline">
              Overview
            </Link>{" "}
            shows what’s owed to vendors vs. what clients have paid us.
          </p>
        </Step>
        <Step n={5} auto={false} title="Reconcile and close">
          <p>
            ~60 days after the end date, decide: refund the client, roll the
            credit forward to a new MBA, or close at zero.
          </p>
        </Step>
      </div>
    </Section>
  );
}

/* ---------------- What’s automated ---------------- */

function Automation() {
  return (
    <Section
      id="automation"
      title="What’s automated vs what you do"
      description="Most of the pipeline runs on its own. Here’s what happens without you, and where you actually need to step in."
    >
      <Callout tone="tip" title="The short version">
        <p>
          MBAs are auto-created from signed contracts emailed to a shared
          inbox. Vendor invoices are auto-parsed from{" "}
          <code className="text-xs bg-secondary/60 px-1 rounded">
            mediainvoices@bluestate.co
          </code>
          . Sync jobs handle NetSuite and Concur in both directions. Your real
          job is three things: <strong>review</strong> what the parsers
          created, <strong>allocate</strong> invoice line items to the right
          MBA, and <strong>reconcile</strong> at close-out.
        </p>
      </Callout>

      <FlowDiagram
        title="How an MBA gets created"
        description="From signed contract to active MBA — mostly hands-off."
        rows={[
          {
            lane: "auto",
            label: "Signed contract emailed in",
            detail:
              "PDF lands in the shared inbox the contracts pipeline watches.",
          },
          {
            lane: "auto",
            label: "Automation picks up the email",
            detail: "The contracts inbox is checked on a schedule.",
          },
          {
            lane: "auto",
            label: "Claude parses the contract",
            detail:
              "Extracts client, project name, budget, currency, start/end dates, with a confidence score.",
          },
          {
            lane: "auto",
            label: "NetSuite match attempt",
            detail:
              "Finds the matching NetSuite project; auto-fills NS project # and Concur client code (level 1).",
          },
          {
            lane: "auto",
            label: "MBA created (status: ACTIVE)",
            detail:
              "Default Concur office code applied. Audit log records the create.",
          },
          {
            lane: "handoff",
            label: "Now it needs you",
          },
          {
            lane: "manual",
            label: "Spot-check the auto-created MBA",
            detail:
              "Open the MBA and confirm budget, dates, and NetSuite link look right. Fix the Concur office code if the default isn’t correct.",
          },
          {
            lane: "handoff",
            label: "While campaigns run",
          },
          {
            lane: "auto",
            label: "NetSuite sync pulls client invoices",
            detail:
              "Each sync run pulls client invoices for the MBA’s NetSuite project. They show up in the “NetSuite Client Invoices” table on the MBA detail page.",
          },
          {
            lane: "auto",
            label: "MBA client-paid status updates from NetSuite",
            detail:
              "When NS reports invoices as Paid In Full, the MBA’s Client Paid / Amount Paid / Paid Date fields update automatically.",
          },
          {
            lane: "handoff",
            label: "You can still update manually",
          },
          {
            lane: "manual",
            label: "Override or fill in client payment",
            detail:
              "For tranches NS hasn’t recorded yet, update Amount Paid on the MBA detail page.",
          },
          {
            lane: "manual",
            label: "Reconcile at end-of-flight",
            detail:
              "Decide refund / rollover / close-at-zero, then set status to Closed.",
          },
        ]}
      />

      <FlowDiagram
        title="How a vendor invoice gets paid"
        description="From inbox PDF to allocated, approved, and paid — your only required step is allocation."
        rows={[
          {
            lane: "auto",
            label: "Vendor emails PDF",
            detail: "Sent to mediainvoices@bluestate.co (or forwarded from @bluestate.co).",
          },
          {
            lane: "auto",
            label: "Automation pulls the inbox",
            detail: "Runs every few hours.",
          },
          {
            lane: "auto",
            label: "Claude parses line items",
            detail:
              "Extracts campaign name + amount per line; scores parse confidence high/medium/low.",
          },
          {
            lane: "auto",
            label: "Draft invoice appears in /invoices/drafts",
            detail: "Sidebar nav shows a red draft count badge.",
          },
          {
            lane: "handoff",
            label: "Now it needs you",
          },
          {
            lane: "manual",
            label: "Review the parse",
            detail:
              "Skim line items. High-confidence drafts can be bulk-confirmed; low-confidence ones may need edits.",
          },
          {
            lane: "manual",
            label: "Allocate lines to MBAs",
            detail:
              "The one step that always needs a human — the system can’t guess which MBA a campaign belongs to.",
          },
          {
            lane: "manual",
            label: "Confirm the draft",
            detail: "Promotes from DRAFT to CONFIRMED.",
          },
          {
            lane: "handoff",
            label: "Hands back to automation",
          },
          {
            lane: "auto",
            label: "Concur sync pushes the invoice",
            detail: "Sent for approval through the normal Concur workflow.",
          },
          {
            lane: "auto",
            label: "NetSuite vendor-bill match flips paid status",
            detail:
              "When the bill posts in NetSuite as Paid In Full, automation matches it by invoice number and updates Paid / Paid Date on the invoice. This is the primary path.",
          },
          {
            lane: "auto",
            label: "Concur payment sync as a secondary path",
            detail:
              "Payments recorded through Concur also flow back and update matched invoices. You can still mark paid manually if neither source has caught up yet.",
          },
        ]}
      />

      <Callout tone="info" title="When you do need to enter things manually">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>One-off MBAs</strong> that didn’t come through a signed
            contract email — use{" "}
            <Link href="/mbas/new" className="underline">
              + New MBA
            </Link>
            .
          </li>
          <li>
            <strong>Invoices that arrive as CSVs or odd formats</strong> — use{" "}
            <Link href="/invoices/new" className="underline">
              + New Invoice
            </Link>{" "}
            with CSV upload or manual entry.
          </li>
          <li>
            <strong>Change orders, credits, rollovers</strong> — recorded by
            finance on the MBA detail page.
          </li>
          <li>
            <strong>Client payment amounts</strong> — clients usually pay in
            tranches; finance updates the running total.
          </li>
        </ul>
      </Callout>
    </Section>
  );
}

/* ---------------- Core concepts ---------------- */

function Concepts() {
  return (
    <Section
      id="concepts"
      title="Core concepts"
      description="The handful of ideas the rest of the app is built on."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <ConceptCard
          title="MBA"
          body="A Media Buying Agreement — one client, one budget, one start/end window. Everything in the tracker hangs off an MBA."
        />
        <ConceptCard
          title="Effective budget"
          body="Original budget + change orders + credits in − credits out. This is the number to compare invoiced spend against, not the original budget."
        />
        <ConceptCard
          title="Vendor invoice"
          body="A bill from a media platform (Meta, Google, etc.). Has line items per campaign; each line gets allocated to one MBA."
        />
        <ConceptCard
          title="Allocation"
          body="The link between an invoice line item and an MBA. An invoice can split across multiple MBAs."
        />
        <ConceptCard
          title="Change order"
          body="A signed adjustment to an MBA’s budget mid-flight. Recorded with a date so the trail is auditable."
        />
        <ConceptCard
          title="Credit / rollover"
          body="Money moved between MBAs — e.g. unused budget rolling into next quarter, or a credit memo against a different project."
        />
        <ConceptCard
          title="Client payment"
          body="What the client has paid Blue State for the MBA. Tracked separately from vendor spend; clients often pay in chunks."
        />
        <ConceptCard
          title="Reconciliation"
          body="The closeout step at the end of an MBA: vendor totals are final, client has paid, and we decide whether to refund, roll forward, or close at zero."
        />
      </div>
    </Section>
  );
}

function ConceptCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

/* ---------------- Page-by-page guide ---------------- */

function PageGuide() {
  return (
    <Section
      id="pages"
      title="Page-by-page guide"
      description="What each section of the app does and what you can do there."
    >
      <PageDoc
        icon={LayoutDashboard}
        title="Overview"
        href="/"
        purpose="The single screen that answers ‘where do we stand?’ — KPIs, cash position by client, sync status, and shortcuts."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>KPI strip</strong> across active MBAs only: active count,
            effective budget, vendor invoiced (% of budget), client paid (% of
            budget), and net cash flow (paid − invoiced).
          </li>
          <li>
            <strong>Alerts</strong> — Reconciliation banner if any active MBA
            ended 60+ days ago, plus an outstanding-balance banner if clients
            owe us money. Both only show when triggered.
          </li>
          <li>
            <strong>Cash Position by Client</strong> — One row per client with
            MBA count, effective budget, vendor invoiced, remaining, client
            paid, outstanding, and net. Sorted by outstanding (largest first).
            Click a client name to drill in.
          </li>
          <li>
            <strong>Sync Activity</strong> — Last run for Email Ingestion and
            NetSuite Sync, with counts. Click into the sync log to inspect.
          </li>
          <li>
            <strong>Quick Actions</strong> — Shortcuts to create an MBA, add a
            client, or record an invoice manually.
          </li>
        </ul>
        <Callout tone="tip" title="How to read net cash flow">
          <p>
            Positive net = clients have paid us more than we’ve been invoiced
            by vendors (we’re cash-positive on the work). Negative net = we’re
            financing the spend until the client pays.
          </p>
        </Callout>
      </PageDoc>

      <PageDoc
        icon={Briefcase}
        title="MBAs"
        href="/mbas"
        purpose="The list of every Media Buying Agreement, filterable by client."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Table columns: client, MBA #, NetSuite project #, name, budget,
            invoiced (%), remaining, status, client-paid status.
          </li>
          <li>
            <strong>Client filter dropdown</strong> at the top. With a client
            selected you also see an “Edit Client” shortcut.
          </li>
          <li>
            <strong>+ New MBA</strong> creates a fresh agreement. <strong>+
            Add Client</strong> opens an inline modal so you don’t lose your
            place.
          </li>
          <li>
            Click <strong>View</strong> on any row to open the MBA detail page.
          </li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={Briefcase}
        title="MBA detail"
        href="/mbas/[id]"
        purpose="Everything about a single MBA — header info, change orders, credits, invoices, and client payment."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Header card</strong> (editable): MBA #, name, budget,
            currency, dates, status, client, NetSuite project #.
          </li>
          <li>
            <strong>Budget summary</strong> — Effective budget (with the
            change-order/rollover breakdown), invoiced amount with %, and
            remaining (turns red if you’ve gone over).
          </li>
          <li>
            <strong>Change Orders</strong> — Add or remove signed budget
            adjustments. Each entry has a date, description, and amount.
          </li>
          <li>
            <strong>Credits & Rollovers</strong> — Two tables: credits received
            from another MBA, and credits sent out. Use the transfer form to
            move money between MBAs (Journal Entry, Credit Memo, or Cash
            Credit).
          </li>
          <li>
            <strong>NetSuite Client Invoices</strong> — Read-only list pulled
            from NetSuite by project number, with paid/open status.
          </li>
          <li>
            <strong>Concur Project Sync</strong> — Set the Concur client code
            (level 1) and office code (level 3); push the project to Concur.
          </li>
          <li>
            <strong>Client Payment</strong> — Mark Outstanding / Paid, set the
            paid date and amount. Variance against budget is shown.
          </li>
          <li>
            <strong>Vendor Invoices</strong> — All invoices allocated to this
            MBA, with a quick “+ Add Invoice” shortcut.
          </li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={Receipt}
        title="Vendor Invoices"
        href="/invoices"
        purpose="Every confirmed vendor invoice, plus alerts for things needing attention."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Top banners</strong> — drafts pending review, total unpaid
            (red), total credit notes (blue).
          </li>
          <li>
            Table columns: type (Invoice / Credit), invoice #, platform, date,
            total (with line-item count), MBAs allocated to (red if any
            unallocated), paid status, Concur sync status.
          </li>
          <li>
            <strong>+ New Invoice</strong> records one manually (or via CSV
            upload). <strong>Review Drafts</strong> opens the bulk-review page.
          </li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={Receipt}
        title="Invoice detail"
        href="/invoices/[id]"
        purpose="Review a single invoice — its line items, MBA allocations, payment status, and Concur sync."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            If the invoice is a <Badge variant="draft">draft</Badge>, a banner
            at the top shows the parser confidence and a Confirm / Discard
            pair.
          </li>
          <li>
            <strong>Mark as Paid / Unpaid</strong> button toggles payment
            status and stamps the paid date.
          </li>
          <li>
            <strong>Line Items</strong> — One row per parsed campaign with
            amount and confidence. Use the dropdown on each line to assign it
            to an MBA.
          </li>
          <li>
            <strong>MBA Allocations</strong> — Rolled-up view of how the total
            splits across MBAs. The total row tells you whether everything is
            allocated.
          </li>
          <li>
            <strong>Concur sync</strong> — Push the invoice to Concur for
            approval and watch its sync status.
          </li>
          <li>
            <strong>Danger zone</strong> — Delete the invoice (also removes
            its allocations).
          </li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={Receipt}
        title="Draft invoices"
        href="/invoices/drafts"
        purpose="Bulk-review every auto-parsed invoice from email."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            One card per draft, each showing parsed line items, confidence
            badge (<Badge variant="high">high</Badge>{" "}
            <Badge variant="medium">medium</Badge>{" "}
            <Badge variant="low">low</Badge>), and the source email subject.
          </li>
          <li>
            <strong>Review</strong> opens the full detail page; <strong>
            Confirm</strong> accepts the parse as-is; <strong>Discard</strong>
            deletes it.
          </li>
          <li>
            <strong>Confirm All High-Confidence</strong> bulk-confirms anything
            scored ≥ 80%. Use cautiously — you still need to allocate line
            items afterward.
          </li>
        </ul>
        <Callout tone="warn" title="Confidence is not allocation">
          <p>
            “Confirm” only means “the parse looks right.” You still need to
            open each invoice and assign its line items to MBAs.
          </p>
        </Callout>
      </PageDoc>

      <PageDoc
        icon={Users}
        title="Clients"
        href="/clients/[id]"
        purpose="Per-client detail. There’s no separate clients list — manage clients via the MBAs page filter."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>Edit client name.</li>
          <li>
            See every MBA for the client in one table (with status, budget,
            and a View link).
          </li>
          <li>
            <strong>Danger zone</strong> — Deleting a client cascades and
            removes its MBAs and allocations. Don’t use this casually.
          </li>
          <li>
            Add a new client at <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">/clients/new</code>{" "}
            or via the “+ Add Client” modal on the MBAs page.
          </li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={Activity}
        title="Sync Log"
        href="/sync-log"
        purpose="History of every automated sync: Concur, NetSuite, and email ingestion."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Three collapsible cards — one per sync. Each shows the last 30
            runs.
          </li>
          <li>
            Per run you see: started, status (Running / Completed / Failed),
            duration, sync-specific counts, and error details (expandable).
          </li>
          <li>
            <strong>Concur</strong>: projects synced, invoices pushed,
            payments updated.
          </li>
          <li>
            <strong>NetSuite</strong>: MBAs checked, payments updated,
            rollovers created.
          </li>
          <li>
            <strong>Email Ingestion</strong>: emails found, processed, and
            invoices created.
          </li>
          <li>This page is read-only. Automation runs on a schedule.</li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={ClipboardList}
        title="Audit Log"
        href="/audit"
        purpose="Who changed what, when. The 100 most recent CREATE / UPDATE / DELETE actions on every entity."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Columns: timestamp, action badge, entity type + ID, user, and a
            field-level diff (old → new) for updates.
          </li>
          <li>Read-only. Use it to debug “wait, who changed that budget?”</li>
        </ul>
      </PageDoc>

      <PageDoc
        icon={Settings2}
        title="Concur Setup"
        href="/concur-setup"
        purpose="One-time OAuth handshake to wire the tracker to SAP Concur."
      >
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Generate a <strong>Company Request Token</strong> in Concur
            (Authentication Admin → Company Request Token). It’s valid for 24
            hours and single-use.
          </li>
          <li>
            Paste it in the first card and click <strong>Exchange Token</strong>.
            The tracker swaps it for a refresh token that auto-renews.
          </li>
          <li>
            Use <strong>Test Connection</strong> to verify the connection and
            list the available Concur lists.
          </li>
          <li>
            Once connected, MBA detail pages can push projects to Concur and
            invoice detail pages can push invoices for approval.
          </li>
        </ul>
      </PageDoc>
    </Section>
  );
}

function PageDoc({
  icon: Icon,
  title,
  href,
  purpose,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string;
  purpose: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Icon className="size-4 text-bs-cobalt" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{purpose}</CardDescription>
          </div>
          <code className="text-[11px] text-muted-foreground bg-secondary/60 px-2 py-1 rounded shrink-0">
            {href}
          </code>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-foreground/90 space-y-3">{children}</div>
      </CardContent>
    </Card>
  );
}

/* ---------------- MBA flow ---------------- */

function MBAFlow() {
  return (
    <Section
      id="mba-flow"
      title="MBA lifecycle"
      description="Every MBA moves through four statuses. Here’s what each one means and what should happen there."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <StatusCard
          badge={<Badge variant="draft">DRAFT</Badge>}
          title="Draft"
          body="Created in the tracker but not yet active. Use this when the agreement is still being signed or details are still moving. No spend should be allocated yet."
        />
        <StatusCard
          badge={<Badge variant="active" dot>ACTIVE</Badge>}
          title="Active"
          body="Campaigns are running, vendor invoices are coming in, and allocations are being made. Most MBAs sit here for the full campaign window."
        />
        <StatusCard
          badge={<Badge variant="reconciling" dot>RECONCILING</Badge>}
          title="Reconciling"
          body="Spend is over but the close-out isn’t done. Final invoices need to land, the client needs to pay in full, and you decide refund / rollover / zero."
        />
        <StatusCard
          badge={<Badge variant="closed" dot>CLOSED</Badge>}
          title="Closed"
          body="Fully reconciled. Read-only and out of the active rollups. The audit log still shows the history."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How the budget math works</CardTitle>
        </CardHeader>
        <CardContent>
          <Prose>
            <p>
              On the MBA detail page, the <strong>Effective Budget</strong>{" "}
              shown is not the contracted budget — it’s:
            </p>
            <pre className="text-xs bg-secondary/60 rounded-md p-3 overflow-x-auto">
{`Effective Budget = Original Budget
                 + Σ Change Orders
                 + Σ Credits In
                 − Σ Credits Out

Remaining        = Effective Budget − Σ Vendor Invoice Allocations`}
            </pre>
            <p>
              That’s the number to compare against vendor spend and against
              what the client has paid. The original budget alone won’t tell
              you where you really stand mid-flight.
            </p>
          </Prose>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation outcomes</CardTitle>
          <CardDescription>
            When an MBA ends, one of three things happens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2 list-disc pl-5">
            <li>
              <strong>Refund</strong> — The client paid more than was actually
              spent. Issue a credit memo or refund and close.
            </li>
            <li>
              <strong>Rollover</strong> — Unspent budget moves into a new MBA
              for the same client. Use the Credits & Rollovers section on the
              new MBA to record the credit-in.
            </li>
            <li>
              <strong>Closed at zero</strong> — Spend matched budget. Mark
              client paid, status to closed.
            </li>
          </ul>
        </CardContent>
      </Card>
    </Section>
  );
}

function StatusCard({
  badge,
  title,
  body,
}: {
  badge: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold">{title}</p>
        {badge}
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ---------------- Vendor invoice flow ---------------- */

function InvoiceFlow() {
  return (
    <Section
      id="invoice-flow"
      title="Vendor invoice flow"
      description="From inbox to fully allocated and paid."
    >
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <Step n={1} auto title="Vendor sends an invoice">
          <p>
            Platforms email PDFs to{" "}
            <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">
              mediainvoices@bluestate.co
            </code>
            . Forwarded invoices from{" "}
            <code className="text-xs bg-secondary/60 px-1.5 py-0.5 rounded">
              @bluestate.co
            </code>{" "}
            addresses are processed too.
          </p>
        </Step>
        <Step n={2} auto title="Auto-parse">
          <p>
            A scheduled job pulls the inbox, extracts each PDF, and asks
            Claude to parse line items (campaign + amount). Each line gets a
            confidence score; the invoice is saved as a{" "}
            <Badge variant="draft">draft</Badge>.
          </p>
        </Step>
        <Step n={3} auto={false} title="Review the draft">
          <p>
            Open <Link href="/invoices/drafts" className="underline">Vendor
            Invoices → Drafts</Link>. Skim the parse, fix any miscategorised
            lines, then Confirm or Discard. High-confidence drafts can be
            bulk-confirmed.
          </p>
        </Step>
        <Step n={4} auto={false} title="Allocate to MBAs">
          <p>
            On the invoice detail page, assign every line item to the MBA it
            belongs to. The “MBA Allocations” totals row tells you whether the
            full invoice is allocated. Unallocated lines show in red on the
            invoices list.
          </p>
        </Step>
        <Step n={5} auto title="Push to Concur">
          <p>
            Concur sync pushes confirmed invoices for approval. Sync status
            and any errors are visible on the detail page and in the Sync
            Log. You can also trigger a manual sync from the invoice page.
          </p>
        </Step>
        <Step n={6} auto title="Paid status flows back from NetSuite and Concur">
          <p>
            The NetSuite sync matches our invoices to NS vendor bills by
            invoice number and flips <strong>Paid</strong> / <strong>Paid
            Date</strong> when NS reports Paid In Full — this is the primary
            path. Concur payments also flow back through its sync as a
            secondary source. You can still hit <strong>Mark as Paid</strong>{" "}
            manually if neither has caught up.
          </p>
        </Step>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Callout tone="info" title="Other ways to record invoices">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>CSV upload</strong> from the New Invoice page when a
              vendor sends a spreadsheet instead of a PDF.
            </li>
            <li>
              <strong>Manual entry</strong> for one-off cases. You can add
              line items inline or leave them blank and reconcile later.
            </li>
          </ul>
        </Callout>
        <Callout tone="warn" title="Credit notes">
          <p>
            Refunds from vendors should be recorded with type{" "}
            <Badge variant="credit">credit</Badge>. They reduce vendor
            invoiced totals on the dashboard and on each MBA.
          </p>
        </Callout>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Splitting an invoice across MBAs</CardTitle>
        </CardHeader>
        <CardContent>
          <Prose>
            <p>
              Vendors don’t always invoice per project. A single Meta invoice
              might cover three different MBAs. Each line item gets assigned
              to one MBA, so just dropdown-select the right MBA per line. The
              MBA Allocations summary at the bottom shows the resulting split.
            </p>
            <p>
              If a single line item actually covers multiple MBAs, split it
              into multiple lines (same campaign, divided amounts) before
              allocating.
            </p>
          </Prose>
        </CardContent>
      </Card>
    </Section>
  );
}

/* ---------------- Ads team ---------------- */

function AdsTeamGuide() {
  return (
    <Section
      id="ads-team"
      title="For the ads team"
      description="The bits of the tracker that affect campaign delivery."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Callout tone="tip" title="Watch the remaining budget on the MBA">
          <p>
            The MBA detail page shows live remaining budget — original plus
            change orders, minus everything vendors have already invoiced.
            Don’t pace against the contracted budget alone.
          </p>
        </Callout>
        <Callout tone="tip" title="Flag overages early">
          <p>
            If invoiced spend approaches 100% before the end date, raise it
            with finance so a change order can be papered before more spend
            lands.
          </p>
        </Callout>
        <Callout tone="info" title="Use consistent campaign names">
          <p>
            The auto-parser maps line items to MBAs based on campaign names.
            Keeping naming conventions tight in platforms (Meta, Google,
            etc.) makes draft review faster and reduces miscategorised lines.
          </p>
        </Callout>
        <Callout tone="info" title="Help triage drafts">
          <p>
            If a vendor sends a multi-MBA invoice you recognise, jump into{" "}
            <Link href="/invoices/drafts" className="underline">drafts</Link>{" "}
            and allocate the lines — finance can’t always tell which campaign
            belongs to which MBA without you.
          </p>
        </Callout>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What you can ignore</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>
              The Overview’s by-client table and the Audit Log are mostly
              finance/leadership tools.
            </li>
            <li>
              Concur Setup is a one-time admin task; you don’t need to touch
              it.
            </li>
            <li>
              Client payment fields on the MBA — finance owns those.
            </li>
          </ul>
        </CardContent>
      </Card>
    </Section>
  );
}

/* ---------------- Finance team ---------------- */

function FinanceTeamGuide() {
  return (
    <Section
      id="finance-team"
      title="For the finance team"
      description="Reconciliation, billing, and reporting touchpoints."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Callout tone="tip" title="Start the week on the Overview">
          <p>
            The <Link href="/" className="underline">Overview</Link> is the
            fastest read on what’s owed by clients vs. what’s owed to vendors.
            The by-client table is sorted by outstanding balance, largest
            first.
          </p>
        </Callout>
        <Callout tone="tip" title="Track partial client payments">
          <p>
            Clients often pay in chunks. On the MBA detail page, update the{" "}
            <strong>Amount Paid</strong> field as each tranche lands — leave
            status as Outstanding until paid in full.
          </p>
        </Callout>
        <Callout tone="info" title="Reconcile within 60 days of end date">
          <p>
            The dashboard banner flags MBAs that ended 60+ days ago and
            haven’t been closed out. Use it as a worklist.
          </p>
        </Callout>
        <Callout tone="info" title="NetSuite is the source of truth">
          <p>
            NetSuite Sync brings client invoices and journal entries into the
            tracker (read-only). If something looks wrong, fix it in NetSuite
            and let the next sync pick it up rather than editing around it.
          </p>
        </Callout>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Common finance workflows</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium">Recording a change order</p>
              <p className="text-muted-foreground mt-1">
                On the MBA detail page → Change Orders → enter date, amount
                (positive or negative), and a short description. The
                effective budget updates immediately.
              </p>
            </div>
            <div>
              <p className="font-medium">Rolling unused budget into a new MBA</p>
              <p className="text-muted-foreground mt-1">
                On the source MBA → Credits & Rollovers → Transfer Credit →
                direction “Send”, pick the destination MBA, set the amount and
                type (Journal Entry / Credit Memo / Cash Credit). It records
                as Credit Out on the source and Credit In on the destination.
              </p>
            </div>
            <div>
              <p className="font-medium">Closing out an MBA</p>
              <p className="text-muted-foreground mt-1">
                Confirm all vendor invoices are in and allocated. Mark client
                payment as Paid with the final amount. Decide refund /
                rollover / zero. Set status to Closed.
              </p>
            </div>
            <div>
              <p className="font-medium">Pushing a project to Concur</p>
              <p className="text-muted-foreground mt-1">
                On the MBA detail page → Concur Project Sync → fill in client
                code (level 1) and office code (level 3) → Save → Sync. After
                that, individual invoices can be pushed for approval from
                their detail pages.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

/* ---------------- Glossary ---------------- */

function Glossary() {
  const terms: { term: string; def: string }[] = [
    {
      term: "MBA",
      def: "Media Buying Agreement. The contract and budget container for a client engagement.",
    },
    {
      term: "MBA #",
      def: "Auto-generated identifier in the format MBA-YYYY-NNN.",
    },
    {
      term: "Effective budget",
      def: "Original budget + change orders + credits in − credits out. The number to compare spend against.",
    },
    {
      term: "Change order",
      def: "A signed adjustment to an MBA’s budget recorded with date, amount, and description.",
    },
    {
      term: "Credit / rollover",
      def: "Money moved between MBAs (journal entry, credit memo, or cash credit).",
    },
    {
      term: "Vendor invoice",
      def: "A bill from a media platform. Has line items per campaign; each line is allocated to one MBA.",
    },
    {
      term: "Credit note",
      def: "A negative invoice from a vendor — a refund or correction. Reduces invoiced totals.",
    },
    {
      term: "Allocation",
      def: "The link between an invoice line item and an MBA.",
    },
    {
      term: "Confidence",
      def: "How sure the auto-parser is about a line item. High ≥ 80%, medium 50–79%, low < 50%.",
    },
    {
      term: "Reconciliation",
      def: "Closing out an MBA after the campaign ends — refund, rollover, or close at zero.",
    },
    {
      term: "Client paid amount",
      def: "Total Blue State has received from the client for this MBA. Updated in chunks as tranches arrive.",
    },
    {
      term: "Outstanding",
      def: "Effective budget − client paid amount. What the client still owes us.",
    },
    {
      term: "NetSuite project #",
      def: "The system-of-record project ID in NetSuite. Links the MBA to client invoices and journal entries.",
    },
    {
      term: "Concur client / office code",
      def: "Level 1 and level 3 list codes used when pushing the MBA to Concur as a project.",
    },
  ];
  return (
    <Section id="glossary" title="Glossary">
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {terms.map((t) => (
          <div
            key={t.term}
            className="grid gap-1 md:grid-cols-[180px_1fr] p-4"
          >
            <p className="text-sm font-semibold">{t.term}</p>
            <p className="text-sm text-muted-foreground">{t.def}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- FAQ ---------------- */

function FAQ() {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "An invoice from a vendor never showed up as a draft. What now?",
      a: (
        <>
          <p>
            Check <Link href="/sync-log" className="underline">Sync Log →
            Email Ingestion</Link> for the most recent run. If the run shows
            errors, the email may not have been sent to{" "}
            <code className="text-xs bg-secondary/60 px-1 rounded">
              mediainvoices@bluestate.co
            </code>{" "}
            (or wasn’t forwarded from a{" "}
            <code className="text-xs bg-secondary/60 px-1 rounded">
              @bluestate.co
            </code>{" "}
            address). You can also record the invoice manually at{" "}
            <Link href="/invoices/new" className="underline">
              /invoices/new
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      q: "The parse confidence is low. Do I trust it?",
      a: (
        <p>
          Open the invoice detail page and check each line against the source
          PDF. Low confidence usually means the parser couldn’t read the
          campaign-name column cleanly. Edit the line items, allocate, then
          confirm.
        </p>
      ),
    },
    {
      q: "Why is an MBA showing remaining budget in red?",
      a: (
        <p>
          Allocated vendor invoices have exceeded the effective budget.
          Either record the change order that authorised the overage, or flag
          to the client lead.
        </p>
      ),
    },
    {
      q: "Can I delete an MBA or client?",
      a: (
        <p>
          Yes, from the danger zone on the detail page — but it cascades.
          Deleting a client deletes its MBAs and their allocations. Almost
          always safer to set status to Closed.
        </p>
      ),
    },
    {
      q: "Concur sync says failed. What do I do?",
      a: (
        <p>
          Open the invoice or MBA detail page and read the sync error. The
          most common causes are missing client/office codes on the MBA, or
          an expired Concur token (re-run the exchange at{" "}
          <Link href="/concur-setup" className="underline">
            /concur-setup
          </Link>
          ). The Sync Log shows the full error history.
        </p>
      ),
    },
    {
      q: "A client paid us in two tranches. How do I record that?",
      a: (
        <p>
          On the MBA detail page, update the <strong>Amount Paid</strong>{" "}
          field as each tranche arrives. Leave status as Outstanding until the
          full effective-budget amount has been received, then mark Paid.
        </p>
      ),
    },
    {
      q: "Where do I see who changed something?",
      a: (
        <p>
          <Link href="/audit" className="underline">Audit Log</Link> shows the
          last 100 actions with timestamps, the user, and the field-level
          diff for updates.
        </p>
      ),
    },
  ];
  return (
    <Section id="faq" title="Troubleshooting & FAQ">
      <div className="space-y-3">
        {items.map((it) => (
          <div
            key={it.q}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="text-sm font-semibold mb-1.5">{it.q}</p>
            <div className="text-sm text-muted-foreground">{it.a}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

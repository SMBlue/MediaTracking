# MBA Tracker

A web application for tracking Media Buying Agreements (MBAs) and invoices for a digital marketing agency.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Supabase
- **ORM**: Prisma 5
- **Auth**: Supabase Auth (email/password)
- **UI**: shadcn/ui + Tailwind CSS
- **Hosting**: Vercel
- **Email Parsing**: Gmail API + Claude API (optional, for auto-ingestion)

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Protected routes with nav
│   │   ├── page.tsx          # Dashboard with stats
│   │   ├── clients/          # Client CRUD
│   │   ├── mbas/             # MBA CRUD
│   │   └── invoices/         # Invoice CRUD + allocation + drafts
│   ├── login/                # Login page
│   ├── signup/               # Signup page
│   └── api/
│       ├── mbas/             # GET active MBAs
│       ├── invoices/         # POST create invoice
│       └── cron/             # Vercel cron jobs
│           └── process-invoices/  # Email ingestion (every 4hrs)
├── components/
│   ├── ui/                   # shadcn components
│   └── nav.tsx               # Navigation with sign out + draft badge
├── lib/
│   ├── db.ts                 # Prisma client
│   ├── audit.ts              # Audit logging
│   ├── budget.ts             # Budget calculations
│   ├── gmail.ts              # Gmail API integration
│   ├── pdf-parser.ts         # PDF text extraction + Claude parsing
│   ├── invoice-matching.ts   # Client/platform matching
│   └── supabase/
│       ├── client.ts         # Browser Supabase client
│       └── server.ts         # Server Supabase client
├── middleware.ts             # Auth middleware (redirects)
prisma/
└── schema.prisma             # Database schema
```

## Key Commands

```bash
npm run dev -- -p 3003        # Start dev server on port 3003
npm run build                 # Production build
npx prisma@5 generate         # Regenerate Prisma client
npx prisma@5 db push          # Push schema to database
```

## Database Schema

Core models:
- **Client** - Advertiser/customer
- **MBA** - Media Buying Agreement (budget container)
- **Invoice** - Vendor invoice
- **InvoiceAllocation** - Links invoices to MBAs (supports splitting)
- **ChangeOrder** - Budget modifications to existing MBAs (positive or negative)
- **CreditRollover** - Money transfers between MBAs (journal entry, credit memo, cash credit)
- **VendorInvoiceLineItem** - Campaign-level line items on vendor invoices
- **ReconciliationRecord** - Close-out workflow for finished MBAs
- **EmailSyncLog** - Tracks each cron run (counts, errors, timestamps)

Key calculation:
```
Effective Budget = MBA Budget + Sum(Change Orders) + Sum(Credits In) - Sum(Credits Out)
MBA Remaining = Effective Budget - Sum(Invoice Allocations)
```

## Environment Variables

```env
# Supabase Database (Prisma)
DATABASE_URL="postgresql://..."      # Connection pooler (port 6543)
DIRECT_URL="postgresql://..."        # Direct connection (port 5432)

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL="https://[project-id].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."

# Email Ingestion (all optional — features degrade gracefully)
GMAIL_CLIENT_ID="..."
GMAIL_CLIENT_SECRET="..."
GMAIL_REFRESH_TOKEN="..."
ANTHROPIC_API_KEY="..."
CRON_SECRET="..."                    # Vercel sets automatically for cron jobs
```

## Notes

- Use Prisma v5 (not v7) due to Node.js version compatibility
- All dashboard pages use `export const dynamic = "force-dynamic"` to avoid build-time DB queries
- Supabase connection uses `us-west-2` region pooler
- Invoice form uses client-side data fetching with Suspense boundary
- Email ingestion credentials are optional; all features degrade gracefully when missing
- Invoice status: DRAFT (auto-parsed from email) → CONFIRMED (reviewed by user)
- Confidence thresholds: >= 0.8 high (green), 0.5-0.79 medium (yellow), < 0.5 low (red)

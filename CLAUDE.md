# MBA Tracker

A web application for tracking Media Buying Agreements (MBAs), invoices, and spend for a digital marketing agency.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Supabase
- **ORM**: Prisma 5
- **Auth**: Supabase Auth (email/password)
- **UI**: shadcn/ui + Tailwind CSS
- **Hosting**: Vercel (planned)

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Protected routes with nav
│   │   ├── page.tsx          # Dashboard with stats
│   │   ├── clients/          # Client CRUD
│   │   ├── mbas/             # MBA CRUD + spend entry
│   │   └── invoices/         # Invoice CRUD + allocation
│   ├── login/                # Login page
│   ├── signup/               # Signup page
│   └── api/
│       ├── mbas/             # GET active MBAs
│       └── invoices/         # POST create invoice
├── components/
│   ├── ui/                   # shadcn components
│   └── nav.tsx               # Navigation with sign out
├── lib/
│   ├── db.ts                 # Prisma client
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
- **SpendEntry** - Actual spend logged by platform/month
- **Invoice** - Vendor invoice
- **InvoiceAllocation** - Links invoices to MBAs (supports splitting)

Key calculation:
```
MBA Remaining = MBA Budget - Sum(Invoice Allocations)
```

## Environment Variables

```env
# Supabase Database (Prisma)
DATABASE_URL="postgresql://..."      # Connection pooler (port 6543)
DIRECT_URL="postgresql://..."        # Direct connection (port 5432)

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL="https://[project-id].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."
```

## Notes

- Use Prisma v5 (not v7) due to Node.js version compatibility
- All dashboard pages use `export const dynamic = "force-dynamic"` to avoid build-time DB queries
- Supabase connection uses `us-west-2` region pooler
- Invoice form uses client-side data fetching with Suspense boundary

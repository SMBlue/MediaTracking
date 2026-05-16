import { NextRequest, NextResponse } from "next/server";
import { isGmailConfigured } from "@/lib/gmail";
import { isClaudeConfigured } from "@/lib/pdf-parser";
import { syncInvoices } from "@/lib/invoices/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_EMAILS_PER_RUN = 100;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Gmail credentials not configured",
    });
  }
  if (!isClaudeConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Anthropic API key not configured",
    });
  }

  const afterDate = request.nextUrl.searchParams.get("after") ?? undefined;
  const result = await syncInvoices({
    maxEmailsPerRun: MAX_EMAILS_PER_RUN,
    afterDate,
  });

  return NextResponse.json({
    status: "completed",
    emailsFound: result.emailsFound,
    emailsProcessed: result.emailsProcessed,
    invoicesCreated: result.invoicesCreated,
    emailsSkipped: result.emailsSkipped,
    errors: result.errors.length,
  });
}

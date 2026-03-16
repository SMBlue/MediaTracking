import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGmailConfigured } from "@/lib/gmail";
import { isClaudeConfigured } from "@/lib/pdf-parser";

export const dynamic = "force-dynamic";

export async function POST() {
  // Require authenticated user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "Gmail credentials not configured" },
      { status: 400 }
    );
  }

  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: "Anthropic API key not configured" },
      { status: 400 }
    );
  }

  // Trigger the cron handler by making an internal request
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3003";

  const response = await fetch(`${baseUrl}/api/cron/process-invoices`, {
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });

  const result = await response.json();
  return NextResponse.json(result);
}

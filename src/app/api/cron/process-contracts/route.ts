import { NextRequest, NextResponse } from "next/server";
import { isContractsGmailConfigured } from "@/lib/contracts/gmail";
import { syncContracts } from "@/lib/contracts/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isContractsGmailConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Contracts Gmail credentials not configured",
    });
  }

  try {
    const result = await syncContracts();
    return NextResponse.json({ status: "completed", ...result });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: String(err) },
      { status: 500 }
    );
  }
}

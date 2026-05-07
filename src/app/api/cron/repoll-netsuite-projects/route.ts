import { NextRequest, NextResponse } from "next/server";
import { isNetsuiteConfigured } from "@/lib/netsuite/tba-client";
import { repollNetsuiteForUnlinkedMbas } from "@/lib/netsuite/repoll-projects";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isNetsuiteConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "NetSuite not configured",
    });
  }

  try {
    const result = await repollNetsuiteForUnlinkedMbas();
    return NextResponse.json({ status: "completed", ...result });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: String(err) },
      { status: 500 }
    );
  }
}

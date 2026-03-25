import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isNetsuiteConfigured } from "@/lib/netsuite/tba-client";
import { syncFromNetsuite } from "@/lib/netsuite/sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isNetsuiteConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "NetSuite credentials not configured",
    });
  }

  const syncLog = await prisma.netsuiteSyncLog.create({ data: {} });

  try {
    const result = await syncFromNetsuite();

    await prisma.netsuiteSyncLog.update({
      where: { id: syncLog.id },
      data: {
        completedAt: new Date(),
        mbasChecked: result.mbasChecked,
        paymentsUpdated: result.paymentsUpdated,
        rolloversCreated: result.rolloversCreated,
        errors: result.errors.length > 0 ? result.errors.join("\n") : null,
        status: result.errors.length > 0 ? "COMPLETED" : "COMPLETED",
      },
    });

    return NextResponse.json({
      status: "completed",
      ...result,
    });
  } catch (err) {
    await prisma.netsuiteSyncLog.update({
      where: { id: syncLog.id },
      data: {
        completedAt: new Date(),
        errors: String(err),
        status: "FAILED",
      },
    });

    return NextResponse.json(
      { status: "failed", error: String(err) },
      { status: 500 }
    );
  }
}

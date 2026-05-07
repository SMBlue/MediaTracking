import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isConcurConfigured } from "@/lib/concur/auth";
import { syncWithConcur } from "@/lib/concur/sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConcurConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "Concur credentials not configured",
    });
  }

  const syncLog = await prisma.concurSyncLog.create({ data: {} });

  try {
    const result = await syncWithConcur();

    await prisma.concurSyncLog.update({
      where: { id: syncLog.id },
      data: {
        completedAt: new Date(),
        projectsSynced: result.projectsSynced,
        invoicesPushed: result.invoicesPushed,
        paymentsUpdated: result.paymentsUpdated,
        errors: result.errors.length > 0 ? result.errors.join("\n") : null,
        status: result.errors.length > 0 ? "COMPLETED" : "COMPLETED",
      },
    });

    return NextResponse.json({
      status: "completed",
      ...result,
    });
  } catch (err) {
    await prisma.concurSyncLog.update({
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

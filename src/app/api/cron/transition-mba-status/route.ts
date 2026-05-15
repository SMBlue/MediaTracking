import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { calculateEffectiveBudget } from "@/lib/budget";
import { decideReconciliationTransition } from "@/lib/mba/transitions";

export const dynamic = "force-dynamic";

/**
 * Daily transition pass. Flips ACTIVE MBAs into RECONCILING when either
 * the end date has passed or the allocations have reached the effective
 * budget — whichever fires first. See src/lib/mba/transitions.ts and
 * the 2026-05-14 review notes.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();

  const candidates = await prisma.mBA.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      status: true,
      endDate: true,
      budget: true,
      changeOrders: { select: { amount: true } },
      creditsIn: { select: { amount: true } },
      creditsOut: { select: { amount: true } },
      invoiceAllocations: { select: { amount: true } },
    },
  });

  let transitioned = 0;
  const reasons: Record<string, number> = {};

  for (const mba of candidates) {
    const effectiveBudget = calculateEffectiveBudget({
      budget: mba.budget,
      changeOrders: mba.changeOrders,
      creditsIn: mba.creditsIn,
      creditsOut: mba.creditsOut,
    });

    const allocatedTotal = mba.invoiceAllocations.reduce(
      (sum, a) => sum + Number(a.amount),
      0
    );

    const decision = decideReconciliationTransition(
      {
        id: mba.id,
        status: mba.status,
        endDate: mba.endDate,
        effectiveBudget,
        allocatedTotal,
      },
      today
    );

    if (!decision.transition) continue;

    await prisma.mBA.update({
      where: { id: mba.id },
      data: { status: "RECONCILING" },
    });

    await logAudit({
      entityType: "MBA",
      entityId: mba.id,
      action: "UPDATE",
      changes: {
        status: { old: "ACTIVE", new: "RECONCILING" },
        transitionReason: { old: null, new: decision.reason },
      },
    });

    transitioned++;
    reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
  }

  return NextResponse.json({
    status: "completed",
    candidates: candidates.length,
    transitioned,
    reasons,
  });
}

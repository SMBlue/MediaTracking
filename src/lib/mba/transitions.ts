/**
 * Pure predicates for MBA status transitions.
 *
 * Confirmed by Gail on the 2026-05-14 call: an MBA flips into
 * RECONCILING when either of these fire (whichever happens first):
 *   1. The MBA's end date has passed.
 *   2. The total allocated against it has reached its effective budget.
 *
 * Effective budget = base budget + change orders + credits in - credits out.
 * Same formula as src/lib/budget.ts.
 *
 * The cron at src/app/api/cron/transition-mba-status/ uses these
 * predicates and is the only writer of this transition.
 */

export type TransitionMba = {
  id: string;
  status: "DRAFT" | "ACTIVE" | "RECONCILING" | "CLOSED";
  endDate: Date;
  effectiveBudget: number;
  allocatedTotal: number;
};

export type TransitionDecision =
  | { transition: true; reason: "end_date" | "balance_zero" | "both" }
  | { transition: false };

const SMALL = 0.005; // allocation totals can drift by sub-cent from Decimal math

export function decideReconciliationTransition(
  mba: TransitionMba,
  today: Date
): TransitionDecision {
  if (mba.status !== "ACTIVE") return { transition: false };

  // Compare by UTC calendar day so timezone offsets don't shift the
  // transition by ±1 day. MBA.endDate is @db.Date (no time component),
  // which Prisma surfaces as a UTC-midnight Date.
  const endDatePassed = ymdUtc(mba.endDate) < ymdUtc(today);
  const balanceZero = mba.allocatedTotal + SMALL >= mba.effectiveBudget;

  if (endDatePassed && balanceZero) return { transition: true, reason: "both" };
  if (endDatePassed) return { transition: true, reason: "end_date" };
  if (balanceZero) return { transition: true, reason: "balance_zero" };
  return { transition: false };
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

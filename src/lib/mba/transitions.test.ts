import { describe, it, expect } from "vitest";
import {
  decideReconciliationTransition,
  type TransitionMba,
} from "./transitions";

const TODAY = new Date("2026-05-14T12:00:00Z");

function mba(overrides: Partial<TransitionMba> = {}): TransitionMba {
  return {
    id: "mba-1",
    status: "ACTIVE",
    endDate: new Date("2026-06-30"),
    effectiveBudget: 100_000,
    allocatedTotal: 0,
    ...overrides,
  };
}

describe("decideReconciliationTransition", () => {
  it("does nothing when MBA is still in flight and under budget", () => {
    expect(decideReconciliationTransition(mba(), TODAY)).toEqual({
      transition: false,
    });
  });

  it("flips when the end date has passed", () => {
    expect(
      decideReconciliationTransition(mba({ endDate: new Date("2026-04-01") }), TODAY)
    ).toEqual({ transition: true, reason: "end_date" });
  });

  it("does NOT flip on the end-date day itself (end-date is inclusive)", () => {
    expect(
      decideReconciliationTransition(
        mba({ endDate: new Date("2026-05-14") }),
        TODAY
      )
    ).toEqual({ transition: false });
  });

  it("flips when allocations reach the effective budget", () => {
    expect(
      decideReconciliationTransition(mba({ allocatedTotal: 100_000 }), TODAY)
    ).toEqual({ transition: true, reason: "balance_zero" });
  });

  it("flips when allocations exceed the effective budget", () => {
    expect(
      decideReconciliationTransition(mba({ allocatedTotal: 101_000 }), TODAY)
    ).toEqual({ transition: true, reason: "balance_zero" });
  });

  it("tolerates sub-cent Decimal drift on the balance check", () => {
    expect(
      decideReconciliationTransition(
        mba({ allocatedTotal: 99_999.999 }),
        TODAY
      )
    ).toMatchObject({ transition: true, reason: "balance_zero" });
  });

  it("reports both reasons when both fire", () => {
    expect(
      decideReconciliationTransition(
        mba({ endDate: new Date("2026-04-01"), allocatedTotal: 100_000 }),
        TODAY
      )
    ).toEqual({ transition: true, reason: "both" });
  });

  it("never transitions an MBA that is not ACTIVE", () => {
    expect(
      decideReconciliationTransition(
        mba({ status: "RECONCILING", endDate: new Date("2026-04-01") }),
        TODAY
      )
    ).toEqual({ transition: false });
    expect(
      decideReconciliationTransition(
        mba({ status: "CLOSED", allocatedTotal: 100_000 }),
        TODAY
      )
    ).toEqual({ transition: false });
    expect(
      decideReconciliationTransition(
        mba({ status: "DRAFT", allocatedTotal: 100_000 }),
        TODAY
      )
    ).toEqual({ transition: false });
  });
});

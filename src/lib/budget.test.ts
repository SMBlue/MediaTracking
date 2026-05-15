import { describe, it, expect } from "vitest";
import { calculateEffectiveBudget } from "./budget";

describe("calculateEffectiveBudget", () => {
  it("returns the base budget when no adjustments are present", () => {
    expect(calculateEffectiveBudget({ budget: 10000 })).toBe(10000);
  });

  it("adds change orders to the base budget", () => {
    expect(
      calculateEffectiveBudget({
        budget: 10000,
        changeOrders: [{ amount: 500 }, { amount: 250 }],
      })
    ).toBe(10750);
  });

  it("adds credits in and subtracts credits out", () => {
    expect(
      calculateEffectiveBudget({
        budget: 10000,
        creditsIn: [{ amount: 1000 }],
        creditsOut: [{ amount: 300 }],
      })
    ).toBe(10700);
  });

  it("combines change orders, credits in, and credits out", () => {
    expect(
      calculateEffectiveBudget({
        budget: 10000,
        changeOrders: [{ amount: 500 }],
        creditsIn: [{ amount: 200 }, { amount: 100 }],
        creditsOut: [{ amount: 50 }],
      })
    ).toBe(10750);
  });

  it("handles negative change orders (reductions)", () => {
    expect(
      calculateEffectiveBudget({
        budget: 10000,
        changeOrders: [{ amount: -2000 }],
      })
    ).toBe(8000);
  });

  it("treats Decimal-like inputs the same as numbers", () => {
    expect(
      calculateEffectiveBudget({
        budget: 10000,
        changeOrders: [{ amount: "500" as unknown as number }],
        creditsIn: [{ amount: "100" as unknown as number }],
      })
    ).toBe(10600);
  });
});

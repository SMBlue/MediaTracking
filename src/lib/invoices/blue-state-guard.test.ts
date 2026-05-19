import { describe, it, expect } from "vitest";
import { isBlueStateAgency } from "./blue-state-guard";

describe("isBlueStateAgency", () => {
  it("matches every Blue State variant Claude has returned in production", () => {
    const variants = [
      "Blue State, LLC",
      "BLUE STATE DIGITAL, INC.",
      "Blue State",
      "Blue State Digital",
      "Blue State, Llc",
      "Blue State (London)",
      "Blue State Digital Inc.",
      "Blue State Digital, Inc.",
      "BlueState",
    ];
    for (const v of variants) {
      expect(isBlueStateAgency(v), `should match "${v}"`).toBe(true);
    }
  });

  it("ignores null and undefined", () => {
    expect(isBlueStateAgency(null)).toBe(false);
    expect(isBlueStateAgency(undefined)).toBe(false);
  });

  it("ignores the empty string", () => {
    expect(isBlueStateAgency("")).toBe(false);
  });

  it("does not match real client names", () => {
    const realClients = [
      "Michael J. Fox Foundation",
      "Airbnb, Inc.",
      "NDRC",
      "USA for UNHCR",
      "Water.org",
      "Plan International",
      "9/11 Memorial & Museum",
    ];
    for (const c of realClients) {
      expect(isBlueStateAgency(c), `must not match "${c}"`).toBe(false);
    }
  });

  it("does not match strings that merely contain 'blue' or 'state'", () => {
    expect(isBlueStateAgency("Bluebird Foundation")).toBe(false);
    expect(isBlueStateAgency("State Farm")).toBe(false);
  });
});

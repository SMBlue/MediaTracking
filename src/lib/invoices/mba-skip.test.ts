import { describe, it, expect } from "vitest";
import { looksLikeMbaContract } from "./mba-skip";

describe("looksLikeMbaContract", () => {
  it("matches the canonical 'Signed Blue State MBA' filename pattern", () => {
    expect(
      looksLikeMbaContract(
        "Signed Blue State MBA __ MJFF PPMI BLAAC PD May - June FY26.pdf",
        "Signed MBAs: MJFF PPMI May - June"
      )
    ).toBe(true);
  });

  it("matches even when only the subject signals an MBA", () => {
    expect(
      looksLikeMbaContract(
        "agreement.pdf",
        "Signed MBA: MJFF Fundraising Houston"
      )
    ).toBe(true);
  });

  it("matches when only the filename signals an MBA", () => {
    expect(
      looksLikeMbaContract(
        "Signed Blue State MBA - Airbnb UK.pdf",
        "Fw: New contract"
      )
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      looksLikeMbaContract("SIGNED BLUE STATE MBA - x.pdf", "FW: SIGNED MBA")
    ).toBe(true);
  });

  it("does not match real invoice filenames", () => {
    expect(
      looksLikeMbaContract(
        "Invoice_INV-4302292.pdf",
        "Your invoice from Spotify"
      )
    ).toBe(false);
    expect(
      looksLikeMbaContract(
        "Transaction_26645103.pdf",
        "Your Google Ads documents are ready"
      )
    ).toBe(false);
  });

  it("tolerates a missing subject", () => {
    expect(
      looksLikeMbaContract("Signed Blue State MBA - foo.pdf", null)
    ).toBe(true);
    expect(looksLikeMbaContract("invoice.pdf", null)).toBe(false);
  });
});

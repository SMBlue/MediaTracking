import { describe, it, expect } from "vitest";
import { findKnownVendor, KNOWN_VENDORS, type KnownVendor } from "./known-vendors";

describe("findKnownVendor", () => {
  it("returns null when the seed list is empty", () => {
    expect(KNOWN_VENDORS).toHaveLength(0);
    expect(
      findKnownVendor({
        fromAddress: "billing@meta.com",
        subject: "Your invoice from Meta",
      })
    ).toBeNull();
  });

  it("matches on from-domain when populated", () => {
    const fixture: KnownVendor = {
      canonicalName: "Meta Platforms, Inc.",
      platform: "META",
      matchers: { fromDomains: ["meta.com"] },
    };
    KNOWN_VENDORS.push(fixture);
    try {
      expect(
        findKnownVendor({ fromAddress: "billing@meta.com" })
      ).toEqual({ canonicalName: "Meta Platforms, Inc.", platform: "META" });
    } finally {
      KNOWN_VENDORS.length = 0;
    }
  });

  it("matches on filename fragment", () => {
    KNOWN_VENDORS.push({
      canonicalName: "Spotify",
      platform: "OTHER",
      matchers: { filenameFragments: ["spotify_invoice"] },
    });
    try {
      expect(
        findKnownVendor({
          fromAddress: "noreply@example.com",
          attachmentFilenames: ["spotify_invoice_2026Q2.pdf"],
        })
      ).toEqual({ canonicalName: "Spotify", platform: "OTHER" });
    } finally {
      KNOWN_VENDORS.length = 0;
    }
  });

  it("returns the first matching vendor when multiple could apply", () => {
    KNOWN_VENDORS.push(
      {
        canonicalName: "Google Ads",
        platform: "GOOGLE_ADS",
        matchers: { subjectFragments: ["google ads"] },
      },
      {
        canonicalName: "Catch-all",
        platform: "OTHER",
        matchers: { subjectFragments: ["google"] },
      }
    );
    try {
      const hit = findKnownVendor({ subject: "Your Google Ads invoice" });
      expect(hit?.canonicalName).toBe("Google Ads");
    } finally {
      KNOWN_VENDORS.length = 0;
    }
  });
});

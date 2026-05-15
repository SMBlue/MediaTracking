import { describe, it, expect } from "vitest";
import { planParseUnits } from "./parse-units";

describe("planParseUnits", () => {
  it("returns a single body-only unit when no attachments are present", () => {
    const units = planParseUnits([]);
    expect(units).toHaveLength(1);
    expect(units[0]).toEqual({ attachmentFilename: null, attachments: [] });
  });

  it("returns one unit per attachment with that attachment isolated", () => {
    const units = planParseUnits([
      { filename: "spotify_a.pdf", mimeType: "application/pdf", content: "A" },
      { filename: "spotify_b.pdf", mimeType: "application/pdf", content: "B" },
    ]);
    expect(units).toHaveLength(2);
    expect(units[0].attachmentFilename).toBe("spotify_a.pdf");
    expect(units[0].attachments).toHaveLength(1);
    expect(units[0].attachments[0].content).toBe("A");
    expect(units[1].attachmentFilename).toBe("spotify_b.pdf");
    expect(units[1].attachments[0].content).toBe("B");
  });

  it("preserves attachment order so DB rows are deterministic across re-runs", () => {
    const units = planParseUnits([
      { filename: "z.pdf", mimeType: "application/pdf", content: "z" },
      { filename: "a.pdf", mimeType: "application/pdf", content: "a" },
    ]);
    expect(units.map((u) => u.attachmentFilename)).toEqual(["z.pdf", "a.pdf"]);
  });

  it("handles a single attachment (most common case)", () => {
    const units = planParseUnits([
      { filename: "meta.pdf", mimeType: "application/pdf", content: "M" },
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].attachmentFilename).toBe("meta.pdf");
  });
});

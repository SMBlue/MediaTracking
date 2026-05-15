import { describe, it, expect } from "vitest";
import { matchClientFromString } from "./match-client";

const CLIENTS = [
  {
    id: "c-mjff",
    name: "Michael J Fox Foundation",
    nameAliases: ["MJFF", "Michael J. Fox", "Fox Foundation"],
  },
  {
    id: "c-ndrc",
    name: "NDRC",
    nameAliases: ["Natural Resources Defense Council"],
  },
  {
    id: "c-indivisible-action",
    name: "Indivisible Action",
    nameAliases: [],
  },
  {
    id: "c-indivisible-project",
    name: "Indivisible Project",
    nameAliases: [],
  },
  {
    id: "c-fos-feminista",
    name: "Fos Feminista",
    nameAliases: ["Fos Feminist"],
  },
];

describe("matchClientFromString", () => {
  it("returns null for empty input", () => {
    expect(matchClientFromString(null, CLIENTS)).toBeNull();
    expect(matchClientFromString("", CLIENTS)).toBeNull();
    expect(matchClientFromString("   ", CLIENTS)).toBeNull();
  });

  it("matches exact normalized client name", () => {
    expect(matchClientFromString("Michael J Fox Foundation", CLIENTS))
      .toMatchObject({ clientId: "c-mjff", reason: "exact" });
  });

  it("matches case-insensitive and punctuation-insensitive", () => {
    expect(matchClientFromString("michael j. fox foundation!", CLIENTS))
      .toMatchObject({ clientId: "c-mjff" });
  });

  it("matches an alias before falling back to substring", () => {
    expect(matchClientFromString("MJFF", CLIENTS))
      .toMatchObject({ clientId: "c-mjff", reason: "alias" });
  });

  it("matches a vendor-misspelled name via alias", () => {
    expect(matchClientFromString("Fos Feminist", CLIENTS))
      .toMatchObject({ clientId: "c-fos-feminista", reason: "alias" });
  });

  it("falls back to substring when needle contains client name", () => {
    expect(
      matchClientFromString("The Fox Foundation - Q2 2026", CLIENTS)
    ).toMatchObject({ clientId: "c-mjff", reason: "substring" });
  });

  it("falls back to substring when client name contains needle", () => {
    expect(matchClientFromString("NDRC", CLIENTS))
      .toMatchObject({ clientId: "c-ndrc", reason: "exact" });
    expect(matchClientFromString("Natural Resources", CLIENTS))
      .toMatchObject({ clientId: "c-ndrc", reason: "substring" });
  });

  it("returns the first candidate when substring is ambiguous", () => {
    const hit = matchClientFromString("Indivisible", CLIENTS);
    expect(hit?.reason).toBe("substring");
    expect(["c-indivisible-action", "c-indivisible-project"]).toContain(
      hit?.clientId
    );
  });

  it("returns null when nothing plausibly matches", () => {
    expect(matchClientFromString("Acme Corp", CLIENTS)).toBeNull();
  });

  it("ignores empty aliases", () => {
    const clients = [{ id: "x", name: "Foo", nameAliases: ["", "  "] }];
    expect(matchClientFromString("Foo", clients))
      .toMatchObject({ clientId: "x", reason: "exact" });
    expect(matchClientFromString("", clients)).toBeNull();
  });
});

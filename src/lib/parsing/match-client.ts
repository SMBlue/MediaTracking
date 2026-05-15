export type ClientCandidate = {
  id: string;
  name: string;
  nameAliases?: string[];
};

export type ClientMatch = {
  clientId: string;
  canonicalName: string;
  /** Why the match resolved. Used for telemetry and tests; not surfaced in UI. */
  reason: "exact" | "alias" | "substring";
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a free-form client name (as written on a vendor invoice) to a
 * canonical Client row. Returns null when nothing matches above the
 * substring bar — the caller stores the raw string in detectedClientName
 * so the user can disambiguate manually.
 *
 * Matching priority:
 *   1. Exact normalized match against Client.name
 *   2. Exact normalized match against any Client.nameAliases entry
 *   3. Substring match in either direction against name or aliases
 *
 * First win at each tier breaks ties; ambiguous matches at the substring
 * tier intentionally still return the first candidate — the user
 * corrects via the inline-editable Client field on the invoice detail.
 */
export function matchClientFromString(
  raw: string | null | undefined,
  clients: ClientCandidate[]
): ClientMatch | null {
  if (!raw) return null;
  const needle = normalize(raw);
  if (!needle) return null;

  const normalized = clients.map((c) => ({
    ref: c,
    nameNorm: normalize(c.name),
    aliasNorms: (c.nameAliases ?? []).map(normalize).filter(Boolean),
  }));

  for (const c of normalized) {
    if (c.nameNorm === needle) {
      return { clientId: c.ref.id, canonicalName: c.ref.name, reason: "exact" };
    }
  }

  for (const c of normalized) {
    if (c.aliasNorms.includes(needle)) {
      return { clientId: c.ref.id, canonicalName: c.ref.name, reason: "alias" };
    }
  }

  for (const c of normalized) {
    const targets = [c.nameNorm, ...c.aliasNorms];
    const hit = targets.some(
      (t) => t.length > 0 && (needle.includes(t) || t.includes(needle))
    );
    if (hit) {
      return {
        clientId: c.ref.id,
        canonicalName: c.ref.name,
        reason: "substring",
      };
    }
  }

  return null;
}

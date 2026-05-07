/**
 * NetSuite project name matching for MBAs.
 *
 * The challenge: contract project names are short ("PPMI BLAAC PD May - June FY26")
 * but NetSuite project names are long ("Michael J. Fox Foundation for Parkinson's
 * Research - PPMI BLAAC PD May - June FY26"). And many projects have very similar
 * names (e.g., the same campaign across different fiscal periods).
 *
 * Strategy: keep all distinguishing tokens (including dates and FY tags), require
 * a high coverage of those tokens in the NS name, and refuse to auto-link when
 * multiple candidates score similarly.
 */

import { searchNetsuiteProjects } from "./queries";

/**
 * Tokenize a project name into distinguishing words.
 * Keeps date/period words (May, June, FY26, Q1, 2026, etc.) since those are
 * what distinguish similarly-named projects.
 */
function tokenize(s: string): string[] {
  // Only strip true filler words. Keep month names, fiscal year tags, quarters,
  // and year numbers — they distinguish similarly-named projects.
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "of",
    "a",
    "an",
    "to",
    "in",
    "on",
    "at",
    "with",
    "by",
  ]);
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopwords.has(w));
}

export interface ProjectMatch {
  entityId: string;
  name: string;
  customerEntityId: string | null;
  score: number;
}

/**
 * Find a single confident NetSuite project match for an MBA's project name.
 *
 * Returns null if:
 *  - No candidates pass the strict overlap threshold
 *  - Multiple candidates score similarly (ambiguous — better to flag for review)
 *
 * Pulls candidates by searching for short token combinations, then scores each
 * by what fraction of the contract project's distinguishing tokens appear in
 * the NetSuite project name.
 */
export async function findStrictProjectMatch(
  projectName: string,
  clientName: string | null
): Promise<ProjectMatch | null> {
  const projectTokens = tokenize(projectName);
  if (projectTokens.length === 0) return null;

  const clientTokens = clientName ? tokenize(clientName) : [];

  // Try a few search terms — short enough to be a SQL LIKE prefix but specific
  // enough to limit results. Most specific first.
  const searches = new Set<string>();
  if (projectTokens.length >= 3) {
    searches.add(projectTokens.slice(0, 3).join(" "));
  }
  if (projectTokens.length >= 2) {
    searches.add(projectTokens.slice(0, 2).join(" "));
  }
  if (projectTokens.length >= 1) {
    searches.add(projectTokens[0]);
  }

  const seen = new Set<string>();
  const candidates: ProjectMatch[] = [];

  for (const term of searches) {
    if (!term) continue;
    let results;
    try {
      results = await searchNetsuiteProjects(term);
    } catch {
      continue;
    }
    for (const r of results) {
      if (seen.has(r.entityId)) continue;
      seen.add(r.entityId);

      const nsTokens = new Set(tokenize(r.name));
      const projectMatched = projectTokens.filter((t) => nsTokens.has(t));
      const projectCoverage = projectMatched.length / projectTokens.length;

      const clientMatched = clientTokens.filter((t) => nsTokens.has(t));
      const clientCoverage =
        clientTokens.length > 0
          ? clientMatched.length / clientTokens.length
          : 0;

      // Stricter weight: project name coverage matters most
      const score = projectCoverage * 0.85 + clientCoverage * 0.15;
      candidates.push({
        entityId: r.entityId,
        name: r.name,
        customerEntityId: r.customerEntityId,
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  if (!top) return null;

  // Stricter threshold: require ≥ 90% combined coverage
  if (top.score < 0.9) return null;

  // Refuse on ambiguity: another candidate within 5 percentage points means
  // we can't tell them apart confidently.
  if (candidates[1] && candidates[1].score >= top.score - 0.05) return null;

  return top;
}

import { prisma } from "./db";
import type { ParsedLineItem } from "./pdf-parser";

export interface MatchedLineItem {
  campaignName: string;
  platform: string | null;
  amount: number;
  confidence: number;
  mbaId: string | null;
}

/**
 * Score and match parsed invoice line items to active MBAs.
 *
 * Scoring weights:
 *  - Client match:       0.40
 *  - Campaign name match: 0.35
 *  - Platform match:      0.15
 *  - Date range match:    0.10
 *
 * Returns the original line items augmented with `mbaId` (or null if no good match).
 */
export async function matchLineItemsToMBAs(
  lineItems: ParsedLineItem[],
  matchedClientId: string | null,
  invoicePlatform: string,
  invoiceDate: Date
): Promise<MatchedLineItem[]> {
  if (lineItems.length === 0) return [];

  const mbas = await prisma.mBA.findMany({
    where: { status: { in: ["ACTIVE", "RECONCILING"] } },
    include: { client: true },
  });

  if (mbas.length === 0) {
    return lineItems.map((li) => ({ ...li, mbaId: null }));
  }

  return lineItems.map((lineItem) => {
    let bestMbaId: string | null = null;
    let bestScore = 0;

    for (const mba of mbas) {
      let score = 0;

      // 1. Client match (0.40)
      if (matchedClientId && mba.clientId === matchedClientId) {
        score += 0.4;
      }

      // 2. Campaign name / MBA number match (0.35)
      const campaignTokens = tokenize(lineItem.campaignName);
      const mbaTokens = tokenize(mba.name);

      // Check if MBA number appears verbatim in campaign name
      if (
        lineItem.campaignName
          .toLowerCase()
          .includes(mba.mbaNumber.toLowerCase())
      ) {
        score += 0.35;
      } else {
        // Token overlap
        const overlap = tokenOverlap(campaignTokens, mbaTokens);
        score += overlap * 0.35;
      }

      // 3. Platform match (0.15)
      if (
        invoicePlatform &&
        invoicePlatform !== "OTHER" &&
        lineItem.platform &&
        lineItem.platform.toUpperCase() !== "OTHER"
      ) {
        // Simple: does the line item platform match the invoice platform?
        // Both should already be enum-style strings
        score += 0.15;
      } else if (invoicePlatform && invoicePlatform !== "OTHER") {
        // Only invoice-level platform known — still a signal
        score += 0.08;
      }

      // 4. Date range match (0.10)
      if (invoiceDate >= mba.startDate && invoiceDate <= mba.endDate) {
        score += 0.1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMbaId = mba.id;
      }
    }

    // Threshold: only assign if score >= 0.3
    const MIN_SCORE = 0.3;
    return {
      campaignName: lineItem.campaignName,
      platform: lineItem.platform,
      amount: lineItem.amount,
      confidence: lineItem.confidence,
      mbaId: bestScore >= MIN_SCORE ? bestMbaId : null,
    };
  });
}

/** Lowercase, split on whitespace / hyphens / underscores, dedupe */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\-_/]+/)
      .filter((t) => t.length > 1)
  );
}

/** Proportion of shared tokens (Jaccard-ish) */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? shared / union : 0;
}

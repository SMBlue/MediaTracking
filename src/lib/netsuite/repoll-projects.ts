/**
 * Re-poll NetSuite for project codes for MBAs that don't have one yet.
 *
 * When a contract arrives, we attempt to match its project name to an existing
 * NetSuite project. If finance hasn't created the NS project yet, the MBA sits
 * in our DB with `netsuiteProjectNumber = null`. This function periodically
 * re-checks NetSuite to fill in the gap once the project is created.
 *
 * Uses the same strict matching as the contracts pipeline — we only auto-link
 * when the match is unambiguous.
 */

import { prisma } from "../db";
import { logAudit } from "../audit";
import { findStrictProjectMatch } from "./project-matching";
import { isNetsuiteConfigured } from "./tba-client";
import { DEFAULT_CONCUR_OFFICE_CODE } from "../concur/constants";

export interface RepollResult {
  mbasChecked: number;
  mbasMatched: number;
  errors: string[];
  matches: { mbaNumber: string; projectName: string; nsEntityId: string }[];
}

/**
 * Find all MBAs without a NetSuite project number and try to match them.
 * Updates the MBA in place when a confident match is found.
 */
export async function repollNetsuiteForUnlinkedMbas(): Promise<RepollResult> {
  const result: RepollResult = {
    mbasChecked: 0,
    mbasMatched: 0,
    errors: [],
    matches: [],
  };

  if (!isNetsuiteConfigured()) {
    result.errors.push("NetSuite not configured");
    return result;
  }

  const unlinked = await prisma.mBA.findMany({
    where: { netsuiteProjectNumber: null },
    include: { client: true },
  });

  result.mbasChecked = unlinked.length;
  if (unlinked.length === 0) return result;

  for (const mba of unlinked) {
    try {
      const match = await findStrictProjectMatch(mba.name, mba.client.name);
      if (!match) continue;

      await prisma.mBA.update({
        where: { id: mba.id },
        data: {
          netsuiteProjectNumber: match.entityId,
          // NS customer internal id is the Concur level-1 client shortCode
          concurClientCode: match.customerEntityId ?? undefined,
          // Default office if not already set
          concurProjectOfficeCode:
            mba.concurProjectOfficeCode ?? DEFAULT_CONCUR_OFFICE_CODE,
        },
      });

      await logAudit({
        entityType: "MBA",
        entityId: mba.id,
        action: "UPDATE",
        changes: {
          netsuiteProjectNumber: { old: null, new: match.entityId },
          concurClientCode: { old: null, new: match.customerEntityId },
        },
      });

      result.mbasMatched++;
      result.matches.push({
        mbaNumber: mba.mbaNumber,
        projectName: mba.name,
        nsEntityId: match.entityId,
      });
    } catch (err) {
      result.errors.push(`Failed for MBA ${mba.mbaNumber}: ${err}`);
    }
  }

  return result;
}

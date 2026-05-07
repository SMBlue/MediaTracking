/**
 * Contracts sync orchestration.
 *
 * Pipeline:
 *  1. Fetch unprocessed contract emails from mediareconbot@bluestate.co
 *  2. For each PDF attachment, parse with Claude
 *  3. For each parsed contract, find/create the Client and try to match
 *     a NetSuite project by name → get netsuiteProjectNumber
 *  4. Create the MBA record (links contract → DB)
 *  5. Mark the email as processed
 *
 * The Concur project sync runs separately (cron) and picks up MBAs that
 * have netsuiteProjectNumber + concurClientCode set.
 */

import { prisma } from "../db";
import { logAudit } from "../audit";
import {
  fetchUnprocessedContracts,
  downloadContractAttachment,
  markContractEmailProcessed,
  isContractsGmailConfigured,
} from "./gmail";
import { analyzeContractWithClaude } from "./parser";
import { isNetsuiteConfigured } from "../netsuite/tba-client";
import { findStrictProjectMatch } from "../netsuite/project-matching";
import { DEFAULT_CONCUR_OFFICE_CODE } from "../concur/constants";

export interface ContractsSyncResult {
  emailsFound: number;
  attachmentsProcessed: number;
  mbasCreated: number;
  mbasMatchedToNetsuite: number;
  errors: string[];
}

/**
 * Main entry point — process all pending contract emails.
 */
export async function syncContracts(): Promise<ContractsSyncResult> {
  const result: ContractsSyncResult = {
    emailsFound: 0,
    attachmentsProcessed: 0,
    mbasCreated: 0,
    mbasMatchedToNetsuite: 0,
    errors: [],
  };

  if (!isContractsGmailConfigured()) {
    result.errors.push("Contracts Gmail not configured");
    return result;
  }

  const emails = await fetchUnprocessedContracts(25);
  result.emailsFound = emails.length;

  for (const email of emails) {
    let allAttachmentsSucceeded = true;

    for (const attachment of email.attachments) {
      try {
        result.attachmentsProcessed++;

        // 1. Download + parse PDF
        const buffer = await downloadContractAttachment(
          email.id,
          attachment.attachmentId
        );
        const analysis = await analyzeContractWithClaude(
          {
            subject: email.subject,
            from: email.from,
            bodyText: email.bodyText,
          },
          buffer,
          attachment.filename
        );

        if (analysis.classification !== "contract" || !analysis.contract) {
          // Not a contract — skip but don't fail the email
          continue;
        }

        const c = analysis.contract;

        // 2. Find or create the client
        if (!c.clientName) {
          result.errors.push(
            `${attachment.filename}: no clientName extracted, skipping`
          );
          allAttachmentsSucceeded = false;
          continue;
        }

        const client = await findOrCreateClient(c.clientName);

        // 3. Try to match a NetSuite project by name (strict — null when not confident)
        let netsuiteProjectNumber: string | null = null;
        let concurClientCode: string | null = null;
        let netsuiteMatchInfo = "";
        if (isNetsuiteConfigured() && c.projectName) {
          try {
            const match = await findStrictProjectMatch(
              c.projectName,
              c.clientName
            );
            if (match) {
              netsuiteProjectNumber = match.entityId;
              // NS customer entityid IS the Concur level-1 client shortCode.
              concurClientCode = match.customerEntityId;
              netsuiteMatchInfo = `matched NS project ${match.entityId}: ${match.name}`;
              result.mbasMatchedToNetsuite++;
            } else {
              netsuiteMatchInfo = `no confident NS match for "${c.projectName}"`;
            }
          } catch (err) {
            netsuiteMatchInfo = `NS lookup failed: ${err}`;
          }
        }

        // 4. Create the MBA
        const mbaNumber = await generateMbaNumber();
        const mba = await prisma.mBA.create({
          data: {
            mbaNumber,
            clientId: client.id,
            name: c.projectName || attachment.filename,
            budget: c.budget ?? 0,
            currency: c.currency || "USD",
            startDate: c.startDate ? new Date(c.startDate) : new Date(),
            endDate: c.endDate ? new Date(c.endDate) : new Date(),
            status: "ACTIVE",
            netsuiteProjectNumber,
            concurClientCode,
            concurProjectOfficeCode: DEFAULT_CONCUR_OFFICE_CODE,
            contractEmailId: email.id,
            contractAttachmentId: attachment.attachmentId,
            contractParsedAt: new Date(),
            contractParseConfidence: c.overallConfidence,
          },
        });

        await logAudit({
          entityType: "MBA",
          entityId: mba.id,
          action: "CREATE",
        });

        result.mbasCreated++;
        console.log(
          `Created MBA ${mbaNumber} (${c.projectName}) — ${netsuiteMatchInfo}`
        );
      } catch (err) {
        const msg = `Failed to process ${attachment.filename}: ${err}`;
        console.error(msg);
        result.errors.push(msg);
        allAttachmentsSucceeded = false;
      }
    }

    // Only mark email as processed if we got through all its attachments cleanly
    if (allAttachmentsSucceeded) {
      try {
        await markContractEmailProcessed(email.id);
      } catch (err) {
        result.errors.push(`Failed to label email ${email.id}: ${err}`);
      }
    }
  }

  return result;
}

/**
 * Find an existing client by name, or create a new one.
 * Uses case-insensitive substring matching on the name.
 */
async function findOrCreateClient(name: string) {
  const trimmed = name.trim();
  // Exact match first
  const exact = await prisma.client.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (exact) return exact;

  // Substring match
  const partial = await prisma.client.findFirst({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        // Also try matching on words (in case of slight variations)
      ],
    },
  });
  if (partial) return partial;

  return prisma.client.create({ data: { name: trimmed } });
}

/**
 * Generate a sequential MBA number like "MBA-2026-005".
 */
async function generateMbaNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MBA-${year}-`;

  const latest = await prisma.mBA.findFirst({
    where: { mbaNumber: { startsWith: prefix } },
    orderBy: { mbaNumber: "desc" },
    select: { mbaNumber: true },
  });

  let next = 1;
  if (latest?.mbaNumber) {
    const parts = latest.mbaNumber.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) next = num + 1;
  }

  return `${prefix}${String(next).padStart(3, "0")}`;
}

/**
 * Heuristic for skipping signed-MBA PDFs that get forwarded to the
 * invoice mailbox by mistake. Subjects consistently include "Signed
 * MBA(s)" and filenames consistently start with "Signed Blue State
 * MBA". Conservative — matches when either the filename or subject
 * signals "this is an MBA, not an invoice".
 *
 * Used as a pre-Claude filter in src/lib/invoices/sync.ts. Saves one
 * Claude call per misrouted attachment.
 */
export function looksLikeMbaContract(
  filename: string,
  subject: string | null | undefined
): boolean {
  const f = filename.toLowerCase();
  const s = (subject ?? "").toLowerCase();
  const filenameMatches =
    f.includes("signed blue state mba") || f.includes("signed mba");
  const subjectMatches = s.includes("signed mba") || s.includes("signed mbas");
  return filenameMatches || subjectMatches;
}

/**
 * Reject "Blue State" as a campaign client on a vendor invoice.
 *
 * Vendor invoices land at mediainvoices@bluestate.co and list "Blue
 * State, LLC" or similar in the bill-to block. Claude sometimes
 * confuses that with the campaign's client — but Blue State is the
 * agency, not a client. Used as a hard guard at ingestion regardless
 * of what the analyzer prompt returned.
 */
export function isBlueStateAgency(
  name: string | null | undefined
): boolean {
  if (!name) return false;
  return /blue\s*state/i.test(name);
}

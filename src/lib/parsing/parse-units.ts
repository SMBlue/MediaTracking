/**
 * Decides how many separate Claude analyses to run per inbound email.
 *
 * Background: a single Gmail message can carry multiple invoice PDFs
 * (e.g., two Spotify invoices in one campaign-recap email). The old
 * ingestion path bundled every attachment into one Claude call, which
 * produced one Invoice row — merging two distinct invoices into one.
 *
 * Rule: one parse unit per parseable attachment. Emails with no
 * attachments still yield one unit so body-only invoices still ingest.
 */

export type ParseAttachment = {
  filename: string;
  mimeType: string;
  content: string | Buffer;
};

export type ParseUnit = {
  /** Becomes Invoice.attachmentFilename. Null for body-only ingestion. */
  attachmentFilename: string | null;
  /** Sent to analyzeEmailWithClaude alongside the email context. */
  attachments: ParseAttachment[];
};

export function planParseUnits(downloaded: ParseAttachment[]): ParseUnit[] {
  if (downloaded.length === 0) {
    return [{ attachmentFilename: null, attachments: [] }];
  }
  return downloaded.map((a) => ({
    attachmentFilename: a.filename,
    attachments: [a],
  }));
}

import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface ParsedLineItem {
  campaignName: string;
  platform: string | null;
  amount: number;
  confidence: number;
}

export interface ParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string; // ISO date string
  totalAmount: number;
  clientName: string | null;
  platform: string | null;
  lineItems: ParsedLineItem[];
  overallConfidence: number;
}

export interface EmailAnalysis {
  classification: "invoice" | "not_invoice";
  reason: string;
  invoice: ParsedInvoice | null;
}

export interface EmailContext {
  subject: string;
  from: string;
  bodyText: string;
}

/**
 * Extract text from a PDF buffer.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

/**
 * Analyze a full email with Claude — classify it, and if it's an invoice, parse it.
 * Handles PDFs (via extracted text) and images (via Claude's vision).
 */
export async function analyzeEmailWithClaude(
  emailContext: EmailContext,
  attachments: { filename: string; mimeType: string; content: string | Buffer }[]
): Promise<EmailAnalysis> {
  if (!isClaudeConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const anthropic = new Anthropic();

  // Build the content array for Claude
  const contentParts: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  // Add the system context as text
  contentParts.push({
    type: "text",
    text: `You are an intelligent email analyzer for a digital marketing agency's invoice tracking system.

Your job is to look at an email and its attachments and determine:
1. Does this email contain a vendor invoice (a bill for media spend, advertising services, etc.)?
2. If yes, extract structured invoice data.

This inbox (mediainvoices@) receives all kinds of documents — invoices, MBAs (media buying agreements), contracts, change orders, insertion orders, reports, and general correspondence. Only actual invoices should be parsed.

An invoice typically has: an invoice number, a date, line items with amounts, and a total. MBAs, contracts, and IOs are NOT invoices.

EMAIL CONTEXT:
From: ${emailContext.from}
Subject: ${emailContext.subject}
${emailContext.bodyText ? `\nEmail body:\n${emailContext.bodyText}` : ""}

ATTACHMENTS: ${attachments.length} file(s)
${attachments.map((a) => `- ${a.filename} (${a.mimeType})`).join("\n")}

Respond with a JSON object (no markdown, just JSON):

If this is NOT an invoice:
{
  "classification": "not_invoice",
  "reason": "brief explanation of what this document is instead",
  "invoice": null
}

If this IS an invoice:
{
  "classification": "invoice",
  "reason": "brief description",
  "invoice": {
    "vendor": "vendor/platform name",
    "invoiceNumber": "invoice number",
    "invoiceDate": "YYYY-MM-DD",
    "totalAmount": 0.00,
    "clientName": "client/advertiser name or null",
    "platform": "META|GOOGLE_ADS|BING|TIKTOK|LINKEDIN|OTHER",
    "lineItems": [
      {
        "campaignName": "campaign or line item description",
        "platform": "META|GOOGLE_ADS|BING|TIKTOK|LINKEDIN|OTHER|null",
        "amount": 0.00,
        "confidence": 0.0-1.0
      }
    ],
    "overallConfidence": 0.0-1.0
  }
}

Confidence scoring:
- 1.0: Clearly labeled, unambiguous data
- 0.8: High certainty, standard format
- 0.5: Some inference needed
- 0.3: Significant guessing
- 0.0: Unable to determine`,
  });

  // Add attachment content
  for (const attachment of attachments) {
    if (typeof attachment.content === "string") {
      // Text content (extracted from PDF)
      contentParts.push({
        type: "text",
        text: `\n--- Content of ${attachment.filename} ---\n${attachment.content}`,
      });
    } else if (
      attachment.mimeType.startsWith("image/") &&
      Buffer.isBuffer(attachment.content)
    ) {
      // Image content — use Claude's vision
      const mediaType = attachment.mimeType as
        | "image/png"
        | "image/jpeg"
        | "image/webp"
        | "image/gif";
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: attachment.content.toString("base64"),
        },
      });
      contentParts.push({
        type: "text",
        text: `(Above image is: ${attachment.filename})`,
      });
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: contentParts }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Parse the JSON response, stripping any markdown fencing
  let jsonText = content.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const result = JSON.parse(jsonText) as EmailAnalysis;

  // Auto-detect platform from attachment text if not set
  if (result.invoice) {
    if (!result.invoice.platform || result.invoice.platform === "OTHER") {
      const allText = attachments
        .filter((a) => typeof a.content === "string")
        .map((a) => a.content as string)
        .join(" ");
      const detected = detectPlatform(allText + " " + emailContext.subject);
      if (detected) {
        result.invoice.platform = detected;
      }
    }
  }

  return result;
}

// Keep the old function for backwards compatibility but it now delegates
export async function parseInvoiceWithClaude(
  pdfText: string
): Promise<ParsedInvoice> {
  const result = await analyzeEmailWithClaude(
    { subject: "", from: "", bodyText: "" },
    [{ filename: "invoice.pdf", mimeType: "application/pdf", content: pdfText }]
  );

  if (!result.invoice) {
    throw new Error(`Not an invoice: ${result.reason}`);
  }

  return result.invoice;
}

const PLATFORM_DETECTION: Record<string, string> = {
  meta: "META",
  facebook: "META",
  instagram: "META",
  google: "GOOGLE_ADS",
  "google ads": "GOOGLE_ADS",
  bing: "BING",
  microsoft: "BING",
  tiktok: "TIKTOK",
  linkedin: "LINKEDIN",
};

/**
 * Detect the ad platform from text content.
 */
function detectPlatform(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [keyword, platform] of Object.entries(PLATFORM_DETECTION)) {
    if (lower.includes(keyword)) {
      return platform;
    }
  }
  return null;
}

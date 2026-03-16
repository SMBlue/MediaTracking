import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";

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
 * Extract text from a PDF buffer.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

/**
 * Parse invoice text using Claude API for structured extraction.
 */
export async function parseInvoiceWithClaude(
  pdfText: string
): Promise<ParsedInvoice> {
  if (!isClaudeConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are an invoice parser for a digital marketing agency. Extract structured data from this invoice text.

Return a JSON object with exactly this structure (no markdown, just JSON):
{
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

Confidence scoring:
- 1.0: Clearly labeled, unambiguous data
- 0.8: High certainty, standard format
- 0.5: Some inference needed
- 0.3: Significant guessing
- 0.0: Unable to determine

Invoice text:
${pdfText}`,
      },
    ],
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

  const parsed = JSON.parse(jsonText) as ParsedInvoice;

  // Auto-detect platform if not set
  if (!parsed.platform || parsed.platform === "OTHER") {
    const detected = detectPlatform(pdfText);
    if (detected) {
      parsed.platform = detected;
    }
  }

  return parsed;
}

/**
 * Detect the ad platform from invoice text content.
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

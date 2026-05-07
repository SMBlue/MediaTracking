/**
 * Parse MBA contract PDFs using Claude.
 *
 * Contracts arrive at contracts@bluestate.co (forwarded to mediareconbot@).
 * Each PDF describes one MBA (Media Buying Agreement) for a specific client/project.
 * We extract structured data so we can create the MBA record in our DB.
 */

import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";

export interface ParsedContract {
  /** Client name as it appears on the contract (e.g., "Michael J. Fox Foundation") */
  clientName: string | null;
  /** MBA project name (e.g., "PPMI BLAAC PD May-June FY26") */
  projectName: string | null;
  /** Total budget for this MBA in dollars (e.g., 50000) */
  budget: number | null;
  /** Currency (default USD) */
  currency: string;
  /** Project start date (ISO YYYY-MM-DD) */
  startDate: string | null;
  /** Project end date (ISO YYYY-MM-DD) */
  endDate: string | null;
  /** Project lead / point of contact at BSD */
  projectLead: string | null;
  /** Free-text notes (e.g., scope summary) */
  notes: string | null;
  /** Confidence score 0-1 across all extracted fields */
  overallConfidence: number;
}

export interface ContractAnalysis {
  classification: "contract" | "not_contract";
  reason: string;
  contract: ParsedContract | null;
}

export interface ContractEmailContext {
  subject: string;
  from: string;
  bodyText: string;
}

const SYSTEM_PROMPT = `You are extracting structured data from a Media Buying Agreement (MBA) contract for Blue State, a digital marketing agency.

Your job:
1. Determine whether the attached PDF is a signed MBA contract.
2. If yes, extract the structured fields below.

A signed MBA typically includes:
- A specific client name (e.g., "Michael J. Fox Foundation", "AARP", "Airbnb")
- A project name describing the scope or campaign (e.g., "PPMI BLAAC PD May-June FY26")
- Budget / fees / total contract value
- Service period (start and end dates)
- Project lead at Blue State (often listed as "Project Lead" or "Account Lead")

NOT contracts: invoices, change orders, status reports, internal correspondence.

EXTRACT (use null when not present):
- clientName: The client's organization name as written on the contract
- projectName: The full project / campaign / MBA name
- budget: Total contract value in dollars (numeric only, no $ or commas)
- currency: ISO currency code, default "USD"
- startDate: Project start date in YYYY-MM-DD format
- endDate: Project end date in YYYY-MM-DD format
- projectLead: Name of BSD project lead (or null)
- notes: 1-sentence scope summary
- overallConfidence: 0.0-1.0, how confident you are in the extracted data

Return JSON only, in this exact shape:
{
  "classification": "contract" | "not_contract",
  "reason": "...",
  "contract": null  // when not_contract
  // OR full ParsedContract object when classification = contract
}`;

export async function analyzeContractWithClaude(
  emailContext: ContractEmailContext,
  pdfBuffer: Buffer,
  filename: string
): Promise<ContractAnalysis> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic();

  // Extract text from the PDF
  let pdfText: string;
  try {
    const result = await pdfParse(pdfBuffer);
    pdfText = result.text;
  } catch (err) {
    return {
      classification: "not_contract",
      reason: `PDF parse failed: ${err}`,
      contract: null,
    };
  }

  if (!pdfText.trim()) {
    return {
      classification: "not_contract",
      reason: "PDF has no extractable text",
      contract: null,
    };
  }

  const userPrompt = `EMAIL CONTEXT:
From: ${emailContext.from}
Subject: ${emailContext.subject}
${emailContext.bodyText ? `\nEmail body:\n${emailContext.bodyText.slice(0, 2000)}` : ""}

ATTACHMENT FILENAME: ${filename}

PDF TEXT:
${pdfText.slice(0, 50000)}

Analyze and return JSON only.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  // Strip code fences if present
  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  let parsed: ContractAnalysis;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse Claude response as JSON: ${err}\nResponse: ${raw.slice(0, 500)}`
    );
  }

  return parsed;
}

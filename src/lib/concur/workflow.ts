/**
 * SAP Concur Invoice workflow transitions.
 *
 * Today the Concur Invoice push lands a Payment Request in the BSD
 * "Unassigned Queue" by default. Finance has to manually advance it
 * through media-planner submission before they can do APGL Coding.
 * See docs/concur-apgl-routing.md for the full picture.
 *
 * advanceToAPGL is the seam for skipping that intermediate step. It is
 * a no-op unless CONCUR_ROUTE_TO_APGL=true so we can merge this without
 * affecting production until the BSD sandbox call is confirmed.
 */

import { getConcurClient } from "./client";
import { CONCUR_API_PATHS } from "./constants";

export type AdvanceResult =
  | { status: "skipped"; reason: string }
  | { status: "advanced"; approvalStatusName: string };

export type AdvanceConfig = {
  enabled: boolean;
  /** Workflow step name to advance to. From CONCUR_APGL_APPROVAL_STATUS_NAME. */
  approvalStatusName: string | null;
};

export function readAdvanceConfigFromEnv(): AdvanceConfig {
  return {
    enabled: process.env.CONCUR_ROUTE_TO_APGL === "true",
    approvalStatusName: process.env.CONCUR_APGL_APPROVAL_STATUS_NAME ?? null,
  };
}

/**
 * Move a newly-created Payment Request into the APGL Coding step.
 *
 * Returns `skipped` when disabled or misconfigured; throws on Concur API
 * failure so the caller decides whether to retry or surface.
 */
export async function advanceToAPGL(
  paymentRequestId: string,
  config: AdvanceConfig = readAdvanceConfigFromEnv()
): Promise<AdvanceResult> {
  if (!config.enabled) {
    return { status: "skipped", reason: "CONCUR_ROUTE_TO_APGL not enabled" };
  }
  if (!config.approvalStatusName) {
    return {
      status: "skipped",
      reason: "CONCUR_APGL_APPROVAL_STATUS_NAME not set",
    };
  }

  const client = getConcurClient();
  // Concur's WF action endpoint takes { ApprovalStatusName, Comment? }.
  // Payload shape is unconfirmed until sandbox testing — see investigation doc.
  await client.request(CONCUR_API_PATHS.INVOICE_WF_ACTION(paymentRequestId), {
    method: "POST",
    body: {
      ApprovalStatusName: config.approvalStatusName,
      Comment: "Pre-allocated by MBA Tracker; skipping Unassigned Queue.",
    },
  });

  return { status: "advanced", approvalStatusName: config.approvalStatusName };
}

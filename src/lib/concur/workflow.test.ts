import { describe, it, expect, vi, beforeEach } from "vitest";
import { advanceToAPGL, readAdvanceConfigFromEnv } from "./workflow";

const requestMock = vi.fn();
vi.mock("./client", () => ({
  getConcurClient: () => ({ request: requestMock }),
}));

describe("readAdvanceConfigFromEnv", () => {
  beforeEach(() => {
    delete process.env.CONCUR_ROUTE_TO_APGL;
    delete process.env.CONCUR_APGL_APPROVAL_STATUS_NAME;
  });

  it("is disabled by default", () => {
    expect(readAdvanceConfigFromEnv()).toEqual({
      enabled: false,
      approvalStatusName: null,
    });
  });

  it("flips on when CONCUR_ROUTE_TO_APGL=true", () => {
    process.env.CONCUR_ROUTE_TO_APGL = "true";
    process.env.CONCUR_APGL_APPROVAL_STATUS_NAME = "APGL Coding";
    expect(readAdvanceConfigFromEnv()).toEqual({
      enabled: true,
      approvalStatusName: "APGL Coding",
    });
  });

  it("ignores other truthy values for the gate", () => {
    process.env.CONCUR_ROUTE_TO_APGL = "1";
    expect(readAdvanceConfigFromEnv().enabled).toBe(false);
  });
});

describe("advanceToAPGL", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("skips when disabled and does not call Concur", async () => {
    const result = await advanceToAPGL("pr-123", {
      enabled: false,
      approvalStatusName: "APGL Coding",
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "CONCUR_ROUTE_TO_APGL not enabled",
    });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("skips when no approvalStatusName is configured", async () => {
    const result = await advanceToAPGL("pr-123", {
      enabled: true,
      approvalStatusName: null,
    });
    expect(result.status).toBe("skipped");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("posts to the workflow endpoint when enabled and configured", async () => {
    requestMock.mockResolvedValue({});
    const result = await advanceToAPGL("pr-123", {
      enabled: true,
      approvalStatusName: "APGL Coding",
    });

    expect(result).toEqual({
      status: "advanced",
      approvalStatusName: "APGL Coding",
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
    const [path, options] = requestMock.mock.calls[0];
    expect(path).toBe("/api/v3.0/invoice/paymentrequestwfaction/pr-123");
    expect(options.method).toBe("POST");
    expect(options.body.ApprovalStatusName).toBe("APGL Coding");
  });

  it("propagates Concur errors so the caller can decide on rollback", async () => {
    requestMock.mockRejectedValue(new Error("Concur 400: bad transition"));
    await expect(
      advanceToAPGL("pr-123", {
        enabled: true,
        approvalStatusName: "APGL Coding",
      })
    ).rejects.toThrow("bad transition");
  });
});

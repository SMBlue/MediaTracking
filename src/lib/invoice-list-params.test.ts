import { describe, it, expect } from "vitest";
import {
  parseInvoiceListParams,
  paramsToInvoiceWhere,
  paramsToInvoiceOrderBy,
} from "./invoice-list-params";

describe("parseInvoiceListParams", () => {
  it("defaults to invoiceDate desc with no filters when empty", () => {
    expect(parseInvoiceListParams({})).toEqual({
      sort: "invoiceDate",
      dir: "desc",
      clientId: null,
      platform: null,
      paid: null,
      vendorContains: null,
    });
  });

  it("accepts valid sort fields", () => {
    expect(parseInvoiceListParams({ sort: "totalAmount", dir: "asc" })).toMatchObject({
      sort: "totalAmount",
      dir: "asc",
    });
  });

  it("rejects unknown sort fields and falls back to invoiceDate", () => {
    expect(parseInvoiceListParams({ sort: "evilField" })).toMatchObject({
      sort: "invoiceDate",
    });
  });

  it("rejects unknown platforms", () => {
    expect(parseInvoiceListParams({ platform: "MYSPACE" })).toMatchObject({
      platform: null,
    });
  });

  it("only accepts paid|unpaid for paid filter", () => {
    expect(parseInvoiceListParams({ paid: "paid" }).paid).toBe("paid");
    expect(parseInvoiceListParams({ paid: "yes" }).paid).toBeNull();
  });

  it("trims and ignores empty vendor input", () => {
    expect(parseInvoiceListParams({ vendor: "  spotify " }).vendorContains).toBe(
      "spotify"
    );
    expect(parseInvoiceListParams({ vendor: "  " }).vendorContains).toBeNull();
  });

  it("takes first element when a param is duplicated as an array", () => {
    expect(parseInvoiceListParams({ platform: ["META", "OTHER"] })).toMatchObject({
      platform: "META",
    });
  });
});

describe("paramsToInvoiceWhere", () => {
  it("includes status=CONFIRMED by default", () => {
    const where = paramsToInvoiceWhere({
      sort: "invoiceDate",
      dir: "desc",
      clientId: null,
      platform: null,
      paid: null,
      vendorContains: null,
    });
    expect(where).toEqual({ status: "CONFIRMED" });
  });

  it("layers in filters when present", () => {
    const where = paramsToInvoiceWhere({
      sort: "invoiceDate",
      dir: "desc",
      clientId: "c-1",
      platform: "META",
      paid: "unpaid",
      vendorContains: "spotify",
    });
    expect(where).toMatchObject({
      status: "CONFIRMED",
      detectedClientId: "c-1",
      vendor: "META",
      isPaid: false,
      detectedVendorName: { contains: "spotify", mode: "insensitive" },
    });
  });
});

describe("paramsToInvoiceOrderBy", () => {
  it("uses the parsed field and direction", () => {
    expect(
      paramsToInvoiceOrderBy({
        sort: "totalAmount",
        dir: "asc",
        clientId: null,
        platform: null,
        paid: null,
        vendorContains: null,
      })
    ).toEqual({ totalAmount: "asc" });
  });
});

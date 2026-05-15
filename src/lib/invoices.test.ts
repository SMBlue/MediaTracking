import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();

vi.mock("./db", () => ({
  prisma: {
    invoice: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import { getUnallocatedInvoices } from "./invoices";

describe("getUnallocatedInvoices", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("returns zero when no confirmed invoices exist", async () => {
    findManyMock.mockResolvedValue([]);
    expect(await getUnallocatedInvoices()).toEqual({
      count: 0,
      unallocatedAmount: 0,
    });
  });

  it("excludes invoices whose allocations cover the total", async () => {
    findManyMock.mockResolvedValue([
      {
        totalAmount: 1000,
        allocations: [{ amount: 600 }, { amount: 400 }],
      },
    ]);
    expect(await getUnallocatedInvoices()).toEqual({
      count: 0,
      unallocatedAmount: 0,
    });
  });

  it("counts and sums partially allocated invoices", async () => {
    findManyMock.mockResolvedValue([
      { totalAmount: 1000, allocations: [{ amount: 250 }] },
      { totalAmount: 500, allocations: [] },
    ]);
    expect(await getUnallocatedInvoices()).toEqual({
      count: 2,
      unallocatedAmount: 1250,
    });
  });

  it("tolerates sub-cent drift on the full-allocation check", async () => {
    findManyMock.mockResolvedValue([
      { totalAmount: 1000, allocations: [{ amount: 999.999 }] },
    ]);
    expect(await getUnallocatedInvoices()).toEqual({
      count: 0,
      unallocatedAmount: 0,
    });
  });

  it("only inspects CONFIRMED invoices", async () => {
    findManyMock.mockResolvedValue([]);
    await getUnallocatedInvoices();
    const call = findManyMock.mock.calls[0][0];
    expect(call.where.status).toBe("CONFIRMED");
  });
});

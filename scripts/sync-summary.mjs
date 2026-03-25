import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const invoices = await p.invoice.findMany({
  where: { sourceType: "EMAIL_PARSED" },
  include: { lineItems: { select: { id: true } } },
  orderBy: { invoiceDate: "desc" },
});

console.log("=== INVOICE SUMMARY ===");
console.log("Total draft invoices:", invoices.length);

const byVendor = {};
for (const inv of invoices) {
  byVendor[inv.vendor] = (byVendor[inv.vendor] || 0) + 1;
}
console.log("\nBy vendor:");
Object.entries(byVendor)
  .sort((a, b) => b[1] - a[1])
  .forEach(([v, c]) => console.log("  " + v + ":", c));

const totalAmount = invoices.reduce(
  (sum, inv) => sum + Number(inv.totalAmount),
  0
);
console.log(
  "\nTotal amount:",
  totalAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })
);
console.log(
  "Total line items:",
  invoices.reduce((sum, inv) => sum + inv.lineItems.length, 0)
);

const log = await p.emailSyncLog.findFirst({ orderBy: { startedAt: "desc" } });
if (log.errors) {
  const errs = log.errors.split("\n");
  console.log("\n=== ERRORS (" + errs.length + ") ===");
  const dupes = errs.filter((e) => e.includes("Unique constraint"));
  const nulls = errs.filter((e) => e.includes("must not be null"));
  const other = errs.filter(
    (e) =>
      !e.includes("Unique constraint") && !e.includes("must not be null")
  );
  if (dupes.length) console.log("Duplicate invoice numbers:", dupes.length);
  if (nulls.length) console.log("Missing required fields:", nulls.length);
  if (other.length) {
    console.log("Other errors:", other.length);
    other.forEach((e) => console.log("  ", e.substring(0, 150)));
  }
}

await p.$disconnect();

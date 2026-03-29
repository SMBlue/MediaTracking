import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const log = await p.emailSyncLog.findFirst({ orderBy: { startedAt: "desc" } });
if (log && log.errors) {
  const errs = log.errors.split("\n");
  console.log("Total errors:", errs.length);
  const dupes = errs.filter((e) => e.includes("Unique constraint"));
  const parse = errs.filter((e) => e.includes("JSON") || e.includes("parse"));
  const other = errs.filter(
    (e) =>
      !e.includes("Unique constraint") &&
      !e.includes("JSON") &&
      !e.includes("parse")
  );
  if (dupes.length) console.log("Duplicates:", dupes.length);
  if (parse.length) console.log("Parse errors:", parse.length);
  if (other.length) {
    console.log("Other errors:", other.length);
    other.slice(0, 10).forEach((e) => console.log("  " + e.substring(0, 200)));
  }
} else {
  console.log("No errors in latest sync log");
}

await p.$disconnect();

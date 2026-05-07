/**
 * Concur API exploration script.
 * Reads access token from DB and runs various analyses.
 *
 * Usage:
 *   node scripts/concur-explore.mjs [command]
 *
 * Commands:
 *   tree      - Walk the project list and analyze level-3 coverage (default)
 *   lists     - List all available Concur lists
 *   form      - Fetch invoice form metadata (custom field mapping)
 *   offices   - List all items in the *BSD-Offices (NS) list
 */

import { PrismaClient } from "@prisma/client";

const PROJECT_LIST_ID = "421c86ee-27f7-f54c-97e7-e21fb13f034d";
const OFFICES_LIST_ID = "aa8cdb42-e32d-9844-bb8c-3958a9ef54aa";

const prisma = new PrismaClient();

async function getAccessToken() {
  const token = await prisma.concurToken.findFirst();
  if (!token) {
    throw new Error("No Concur token in DB. Run initial token exchange first.");
  }

  const expiresAt = new Date(token.expiresAt);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (now.getTime() >= expiresAt.getTime() - fiveMinutes) {
    console.log("Access token expired or expiring soon — refreshing...");
    const refreshed = await refreshToken(token);
    return { accessToken: refreshed.access_token, geolocation: token.geolocation };
  }

  return { accessToken: token.accessToken, geolocation: token.geolocation };
}

async function refreshToken(stored) {
  const clientId = process.env.CONCUR_CLIENT_ID;
  const clientSecret = process.env.CONCUR_CLIENT_SECRET;

  const response = await fetch(`${stored.geolocation}/oauth2/v0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  await prisma.concurToken.update({
    where: { id: stored.id },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      geolocation: data.geolocation,
    },
  });
  return data;
}

async function concurGet(path) {
  const { accessToken, geolocation } = await getAccessToken();
  const response = await fetch(`${geolocation}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Concur API error: ${response.status} ${response.statusText} on ${path}\n${await response.text()}`
    );
  }
  return response.json();
}

async function getAllPages(pathBase) {
  const all = [];
  let page = 1;
  while (true) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const result = await concurGet(`${pathBase}${sep}page=${page}`);
    all.push(...(result.content || []));
    if (page >= (result.page?.totalPages || 1)) break;
    page++;
  }
  return all;
}

async function analyzeProjectTree() {
  console.log("=== Walking BSD-Client-Project tree ===\n");
  const clients = await getAllPages(`/list/v4/lists/${PROJECT_LIST_ID}/children`);
  console.log(`Level 1 (clients): ${clients.length}`);

  let totalProjects = 0;
  let projectsWithLocations = 0;
  let projectsWithoutLocations = 0;
  const sampleEmpty = [];
  const sampleFull = [];

  let i = 0;
  for (const client of clients) {
    i++;
    process.stdout.write(`\r[${i}/${clients.length}] Checking ${client.value.slice(0, 40)}...`);

    const projects = await getAllPages(`/list/v4/items/${client.id}/children`);
    for (const project of projects) {
      totalProjects++;
      const locations = await getAllPages(`/list/v4/items/${project.id}/children`);
      if (locations.length > 0) {
        projectsWithLocations++;
        if (sampleFull.length < 5) {
          sampleFull.push({
            client: client.value,
            project: project.value,
            locationCount: locations.length,
            locations: locations.map(l => l.value),
          });
        }
      } else {
        projectsWithoutLocations++;
        if (sampleEmpty.length < 5) {
          sampleEmpty.push({
            client: client.value,
            project: project.value,
          });
        }
      }
    }
  }

  console.log("\n\n=== Results ===");
  console.log(`Total clients (L1):          ${clients.length}`);
  console.log(`Total projects (L2):         ${totalProjects}`);
  console.log(`Projects WITH locations:     ${projectsWithLocations}`);
  console.log(`Projects WITHOUT locations:  ${projectsWithoutLocations}`);
  const pct = totalProjects > 0 ? Math.round((projectsWithLocations / totalProjects) * 100) : 0;
  console.log(`Percent with locations:      ${pct}%`);

  console.log("\n=== Sample projects WITH locations ===");
  for (const s of sampleFull) {
    console.log(`  ${s.client} > ${s.project}`);
    console.log(`    Locations (${s.locationCount}): ${s.locations.join(", ")}`);
  }

  console.log("\n=== Sample projects WITHOUT locations ===");
  for (const s of sampleEmpty) {
    console.log(`  ${s.client} > ${s.project}`);
  }
}

async function listLists() {
  console.log("=== All Concur Lists ===\n");
  const lists = await getAllPages("/list/v4/lists");
  for (const l of lists) {
    console.log(`${l.value} — ${l.id} (levels: ${l.levelCount}, type: ${l.category?.type})`);
  }
}

async function getInvoiceFormMetadata() {
  console.log("=== Trying various endpoints to find form/field metadata ===\n");

  const endpoints = [
    "/api/v3.0/invoice/localizeddata?type=expenseType&language=en-US",
    "/api/v3.0/invoice/localizeddata?type=ledgerCode&language=en-US",
    "/api/v3.0/invoice/forms",
    "/api/v3.0/invoice/formfields",
    "/api/v3.0/invoice/customfields",
    "/api/v3.0/expense/formfields",
    "/forms/v1/invoice",
    "/api/v4.0/invoice/forms",
    "/invoice/v4/forms",
    "/expense/v4/forms",
    "/api/v3.0/common/listdata?id=421c86ee-27f7-f54c-97e7-e21fb13f034d",
  ];

  for (const ep of endpoints) {
    try {
      const data = await concurGet(ep);
      console.log(`\n✓ ${ep}`);
      const json = JSON.stringify(data, null, 2);
      console.log(json.slice(0, 2000));
      if (json.length > 2000) console.log(`...[truncated, total ${json.length} chars]`);
    } catch (e) {
      const msg = e.message.split("\n")[0].slice(0, 80);
      console.log(`✗ ${ep}: ${msg}`);
    }
  }
}

async function listOffices() {
  console.log("=== *BSD-Offices (NS) ===\n");
  const items = await getAllPages(`/list/v4/lists/${OFFICES_LIST_ID}/children`);
  console.log(`Total: ${items.length}\n`);
  for (const item of items) {
    console.log(`  ${item.shortCode}: ${item.value}`);
  }
}

async function inspectInvoices() {
  console.log("=== Searching for invoices in Concur sandbox ===\n");

  // Try several different searches in case the data is in unexpected states
  const searches = [
    "user=ALL&createDateAfter=2024-01-01&limit=10",
    "user=ALL&createDateAfter=2020-01-01&limit=5",
    "user=ALL&approvalStatus=A_PAID&limit=5",
    "user=ALL&approvalStatus=A_APPR&limit=5",
    "createDateAfter=2024-01-01&limit=10",  // without user=ALL for comparison
  ];

  let totalFound = 0;
  let digest = null;
  for (const filter of searches) {
    try {
      const result = await concurGet(`/api/v3.0/invoice/paymentrequestdigests?${filter}`);
      const count = result.Items?.length || 0;
      console.log(`  ${filter} → ${count} items (total: ${result.TotalCount || 0})`);
      if (count > 0 && !digest) {
        digest = result;
      }
      totalFound += count;
    } catch (e) {
      console.log(`  ${filter} → ERROR: ${e.message.split("\n")[0].slice(0, 80)}`);
    }
  }

  if (!digest || !digest.Items || digest.Items.length === 0) {
    console.log("\nNo invoices found across any status. Sandbox really is empty.");
    return;
  }

  console.log(`\nUsing first batch with ${digest.Items.length} items. Inspecting:\n`);

  if (!digest.Items || digest.Items.length === 0) {
    console.log("No invoices found in sandbox.");
    return;
  }

  console.log(`Found ${digest.Items.length} invoices in digest. Inspecting each:\n`);

  for (const summary of digest.Items) {
    console.log("---");
    console.log(`Invoice: ${summary.VendorName} - ${summary.InvoiceNumber || "(no num)"}`);
    console.log(`  PaymentRequestId: ${summary.PaymentRequestId}`);
    console.log(`  ApprovalStatus: ${summary.ApprovalStatusCode}`);
    console.log(`  PaymentStatus: ${summary.PaymentStatusCode}`);

    try {
      const detail = await concurGet(
        `/api/v3.0/invoice/paymentrequest/${summary.PaymentRequestId}`
      );

      // Show all Custom fields on header
      const headerCustoms = {};
      for (const k of Object.keys(detail)) {
        if (/^Custom\d+$/.test(k) && detail[k] != null && detail[k] !== "") {
          headerCustoms[k] = detail[k];
        }
      }
      if (Object.keys(headerCustoms).length > 0) {
        console.log(`  Header Custom fields:`);
        for (const [k, v] of Object.entries(headerCustoms)) {
          console.log(`    ${k}: ${JSON.stringify(v)}`);
        }
      }

      // Show line items and their Custom fields
      if (detail.LineItems && detail.LineItems.length > 0) {
        console.log(`  Line items (${detail.LineItems.length}):`);
        for (let i = 0; i < detail.LineItems.length; i++) {
          const line = detail.LineItems[i];
          console.log(`    [${i}] ${line.Description?.slice(0, 60) || "(no desc)"} - $${line.UnitPrice || line.TotalPrice}`);
          const lineCustoms = {};
          for (const k of Object.keys(line)) {
            if (/^Custom\d+$/.test(k) && line[k] != null && line[k] !== "") {
              lineCustoms[k] = line[k];
            }
          }
          for (const [k, v] of Object.entries(lineCustoms)) {
            console.log(`        ${k}: ${JSON.stringify(v)}`);
          }
        }
      }
    } catch (e) {
      console.log(`  Failed to fetch detail: ${e.message.slice(0, 100)}`);
    }
  }
}

async function pushTestInvoice() {
  console.log("=== Pushing test invoice to discover field mapping ===\n");

  const { accessToken, geolocation } = await getAccessToken();

  // Minimal line item — drop Custom3 and add nothing speculative
  const lineItem = {
    Description: "MBA Tracker test - DO NOT PROCESS",
    ExpenseTypeCode: "2503",
    Quantity: "1",
    UnitPrice: "1.00",
    Custom1: "19",
    Custom4: "1",
    Custom5: "1",
  };

  const invoice = {
    Name: "MBA Tracker Test Invoice - DO NOT PROCESS",
    CountryCode: "US",
    InvoiceAmount: "1.00",
    CurrencyCode: "USD",
    InvoiceDate: new Date().toISOString().split("T")[0],
    InvoiceNumber: `TEST-${Date.now()}`,
    LedgerCode: "NetSuite",
    VendorRemitToIdentifier: {
      // Use a real vendor from /api/v3.1/invoice/vendors
      VendorCode: "209950",
      AddressCode: "209950",
    },
    LineItems: [lineItem],
  };
  // Use codes from BSD's List Codes documentation
  invoice.Custom1 = "19";  // Department: Media (per doc)
  invoice.Custom2 = "1";   // Subsidiary: BSD Inc
  invoice.Custom4 = "1";   // Office: New York
  invoice.Custom5 = "1";   // BU: Strategy (per doc)

  console.log("Request body:");
  console.log(JSON.stringify(invoice, null, 2));
  console.log("\nPosting to /api/v3.0/invoice/paymentrequest...\n");

  const response = await fetch(
    `${geolocation}/api/v3.0/invoice/paymentrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(invoice),
    }
  );

  const text = await response.text();
  console.log(`Status: ${response.status} ${response.statusText}`);
  console.log("Response body:");
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

const command = process.argv[2] || "tree";

try {
  if (command === "tree") await analyzeProjectTree();
  else if (command === "lists") await listLists();
  else if (command === "form") await getInvoiceFormMetadata();
  else if (command === "offices") await listOffices();
  else if (command === "invoices") await inspectInvoices();
  else if (command === "test-push") await pushTestInvoice();
  else console.log(`Unknown command: ${command}\nAvailable: tree, lists, form, offices, invoices, test-push`);
} catch (err) {
  console.error("\nERROR:", err.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

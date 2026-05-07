/**
 * Trigger Concur project sync directly without the cron endpoint.
 * Replicates the logic from src/lib/concur/sync.ts Phase 1.
 */

import { PrismaClient } from "@prisma/client";

const PROJECT_LIST_ID = "421c86ee-27f7-f54c-97e7-e21fb13f034d";
const prisma = new PrismaClient();

async function getAccessToken() {
  const stored = await prisma.concurToken.findFirst();
  if (!stored) throw new Error("No Concur token");

  const expiresAt = new Date(stored.expiresAt);
  if (Date.now() >= expiresAt.getTime() - 5 * 60 * 1000) {
    const res = await fetch(`${stored.geolocation}/oauth2/v0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CONCUR_CLIENT_ID,
        client_secret: process.env.CONCUR_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: stored.refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`);
    const data = await res.json();
    await prisma.concurToken.update({
      where: { id: stored.id },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        geolocation: data.geolocation,
      },
    });
    return { accessToken: data.access_token, geolocation: data.geolocation };
  }
  return { accessToken: stored.accessToken, geolocation: stored.geolocation };
}

async function concurFetch(method, path, body) {
  const { accessToken, geolocation } = await getAccessToken();
  const res = await fetch(`${geolocation}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function getAllChildren(itemOrListUrl) {
  const all = [];
  let page = 1;
  while (true) {
    const sep = itemOrListUrl.includes("?") ? "&" : "?";
    const data = await concurFetch("GET", `${itemOrListUrl}${sep}page=${page}`);
    all.push(...(data.content || []));
    if (page >= (data.page?.totalPages || 1)) break;
    page++;
  }
  return all;
}

async function syncProjects() {
  const mbas = await prisma.mBA.findMany({
    where: {
      netsuiteProjectNumber: { not: null },
      concurClientCode: { not: null },
      concurProjectId: null,
    },
    include: { client: true },
  });

  console.log(`Found ${mbas.length} MBAs to sync to Concur.\n`);

  for (const mba of mbas) {
    console.log(`-- ${mba.mbaNumber}: ${mba.client.name} - ${mba.name} --`);
    console.log(`   NS=${mba.netsuiteProjectNumber}, ConcurClient=${mba.concurClientCode}, Office=${mba.concurProjectOfficeCode}`);

    try {
      // Step 1: find level-1 client
      const clients = await getAllChildren(`/list/v4/lists/${PROJECT_LIST_ID}/children`);
      const sanitizedClient = mba.concurClientCode.replace(/-/g, "_");
      const clientItem = clients.find(c => c.shortCode === sanitizedClient);
      if (!clientItem) {
        console.log(`   ❌ Client shortCode ${mba.concurClientCode} not found in Concur`);
        continue;
      }
      console.log(`   ✓ Found client: ${clientItem.value}`);

      // Step 2: check if project already exists under this client
      const existingProjects = await getAllChildren(`/list/v4/items/${clientItem.id}/children`);
      const sanitizedProject = mba.netsuiteProjectNumber.replace(/-/g, "_");
      let projectItem = existingProjects.find(p => p.shortCode === sanitizedProject);

      if (projectItem) {
        console.log(`   ⓘ Project already exists: ${projectItem.value} (id=${projectItem.id})`);
      } else {
        // Create level-2 project
        const displayName = `${mba.client.name} - ${mba.name}`;
        projectItem = await concurFetch("POST", "/list/v4/items", {
          listId: PROJECT_LIST_ID,
          parentId: clientItem.id,
          shortCode: sanitizedProject,
          value: displayName,
        });
        console.log(`   ✓ Created project: ${projectItem.value} (id=${projectItem.id})`);
      }

      // Step 3: optionally create level-3 office
      if (mba.concurProjectOfficeCode) {
        const existingOffices = await getAllChildren(`/list/v4/items/${projectItem.id}/children`);
        const officeMap = { "1": "New York", "2": "Boston", "3": "Los Angeles", "4": "London", "5": "Washington DC", "10": "Oakland", "11": "West Coast" };
        const officeName = officeMap[mba.concurProjectOfficeCode] || "Unknown";
        const existingOffice = existingOffices.find(o => o.shortCode === mba.concurProjectOfficeCode);
        if (existingOffice) {
          console.log(`   ⓘ Office already exists: ${existingOffice.value}`);
        } else {
          const officeItem = await concurFetch("POST", "/list/v4/items", {
            listId: PROJECT_LIST_ID,
            parentId: projectItem.id,
            shortCode: mba.concurProjectOfficeCode,
            value: officeName,
          });
          console.log(`   ✓ Created office: ${officeItem.value}`);
        }
      }

      // Step 4: update MBA with the Concur IDs
      await prisma.mBA.update({
        where: { id: mba.id },
        data: {
          concurProjectId: projectItem.id,
          concurProjectCode: projectItem.shortCode,
          concurSyncStatus: "SYNCED",
        },
      });
      console.log(`   ✓ Updated DB`);
    } catch (err) {
      console.log(`   ❌ Error: ${err.message.slice(0, 250)}`);
      await prisma.mBA.update({
        where: { id: mba.id },
        data: { concurSyncStatus: "FAILED" },
      });
    }
    console.log();
  }
}

try {
  await syncProjects();
} finally {
  await prisma.$disconnect();
}

/**
 * SAP Concur List Management API v4.
 *
 * Used to:
 * - Create projects in Concur's project list (from NetSuite project numbers)
 * - Query existing list items for deduplication
 *
 * Endpoints:
 * - GET  /list/v4/lists              — list all lists
 * - POST /list/v4/items              — create a single list item
 * - POST /list/v4/lists/{id}/bulk    — bulk create items (up to 250)
 */

import { getConcurClient } from "./client";
import {
  CONCUR_API_PATHS,
  CONCUR_LIST_IDS,
  LIST_BULK_MAX_ITEMS,
} from "./constants";
import type {
  ConcurList,
  ConcurListItem,
  ConcurListItemCreate,
  ConcurBulkResponse,
  ConcurListPage,
} from "./types";

/**
 * Fetch all available lists (useful for discovering list IDs during setup).
 */
export async function getLists(): Promise<ConcurList[]> {
  const client = getConcurClient();
  const allLists: ConcurList[] = [];
  let page = 1;

  while (true) {
    const result = await client.get<ConcurListPage<ConcurList>>(
      `${CONCUR_API_PATHS.LISTS}?page=${page}`
    );
    allLists.push(...result.content);
    if (page >= result.page.totalPages) break;
    page++;
  }

  return allLists;
}

/**
 * Fetch top-level items (level 1) in a specific list.
 * For hierarchical lists, use getItemChildren() to drill into nested items.
 */
export async function getListItems(listId: string): Promise<ConcurListItem[]> {
  const client = getConcurClient();
  const allItems: ConcurListItem[] = [];
  let page = 1;

  while (true) {
    const result = await client.get<ConcurListPage<ConcurListItem>>(
      `${CONCUR_API_PATHS.LIST_TOP_LEVEL(listId)}?page=${page}`
    );
    allItems.push(...result.content);
    if (page >= result.page.totalPages) break;
    page++;
  }

  return allItems;
}

/**
 * Fetch children of a specific list item (next level down in the hierarchy).
 */
export async function getItemChildren(
  itemId: string
): Promise<ConcurListItem[]> {
  const client = getConcurClient();
  const allItems: ConcurListItem[] = [];
  let page = 1;

  while (true) {
    const result = await client.get<ConcurListPage<ConcurListItem>>(
      `${CONCUR_API_PATHS.LIST_ITEM_CHILDREN(itemId)}?page=${page}`
    );
    allItems.push(...result.content);
    if (page >= result.page.totalPages) break;
    page++;
  }

  return allItems;
}

/**
 * Sanitize a string for use as a Concur list item shortCode.
 * Concur does not allow hyphens in codes.
 */
function sanitizeShortCode(code: string): string {
  return code.replace(/-/g, "_");
}

/**
 * Create a level-2 project under a level-1 client in Concur's 3-level
 * *BSD-Client-Project list (Client → Project → Office). If the level-1
 * client doesn't exist, it is auto-created using `clientName`.
 *
 * @returns The created level-2 ConcurListItem (and optionally a level-3 child)
 */
export async function createProject(input: {
  /** level-1 shortCode (NS customer entityid, e.g., "270709" for AARP) */
  clientShortCode: string;
  /** Display name to use if we need to auto-create the level-1 client */
  clientName: string;
  /** NetSuite project number — becomes the level-2 shortCode */
  projectNumber: string;
  /** Project display name (level-2 value) */
  displayName: string;
  /** Optional level-3 office to nest under the new project */
  officeShortCode?: string;
  officeName?: string;
}): Promise<{
  project: ConcurListItem;
  office?: ConcurListItem;
}> {
  const listId = CONCUR_LIST_IDS.PROJECTS;
  if (!listId) {
    throw new Error("CONCUR_LIST_IDS.PROJECTS is not configured.");
  }

  const concurClient = getConcurClient();

  // Step 1: find or create level-1 client
  const clients = await getListItems(listId);
  const sanitizedClientCode = sanitizeShortCode(input.clientShortCode);
  let clientItem = clients.find((c) => c.shortCode === sanitizedClientCode);

  if (!clientItem) {
    const newClient: ConcurListItemCreate = {
      listId,
      shortCode: sanitizedClientCode,
      value: input.clientName,
    };
    clientItem = await concurClient.post<ConcurListItem>(
      CONCUR_API_PATHS.LIST_ITEMS,
      newClient
    );
  }

  // Step 2: create level-2 project under the client
  const projectPayload: ConcurListItemCreate = {
    listId,
    parentId: clientItem.id,
    shortCode: sanitizeShortCode(input.projectNumber),
    value: input.displayName,
  };
  const project = await concurClient.post<ConcurListItem>(
    CONCUR_API_PATHS.LIST_ITEMS,
    projectPayload
  );

  // Step 3: optionally create level-3 office under the project
  let office: ConcurListItem | undefined;
  if (input.officeShortCode && input.officeName) {
    const officePayload: ConcurListItemCreate = {
      listId,
      parentId: project.id,
      shortCode: sanitizeShortCode(input.officeShortCode),
      value: input.officeName,
    };
    office = await concurClient.post<ConcurListItem>(
      CONCUR_API_PATHS.LIST_ITEMS,
      officePayload
    );
  }

  return { project, office };
}

/**
 * Bulk-create projects in Concur's project list.
 * Splits into batches of 250 (Concur's max per request).
 *
 * @param projects - Array of { projectNumber, displayName }
 * @returns Results for each batch
 */
export async function bulkCreateProjects(
  projects: { projectNumber: string; displayName: string }[]
): Promise<ConcurBulkResponse[]> {
  const listId = CONCUR_LIST_IDS.PROJECTS;
  if (!listId) {
    throw new Error(
      "CONCUR_LIST_IDS.PROJECTS is not configured. Get the project list ID from your Concur admin."
    );
  }

  const client = getConcurClient();
  const results: ConcurBulkResponse[] = [];

  // Split into batches
  for (let i = 0; i < projects.length; i += LIST_BULK_MAX_ITEMS) {
    const batch = projects.slice(i, i + LIST_BULK_MAX_ITEMS);
    const response = await client.post<ConcurBulkResponse>(
      CONCUR_API_PATHS.LIST_BULK(listId),
      {
        requests: batch.map((p) => ({
          shortCode: sanitizeShortCode(p.projectNumber),
          value: p.displayName,
        })),
      }
    );
    results.push(response);
  }

  return results;
}

/**
 * Check if a project already exists at level 2 of the *BSD-Client-Project list.
 *
 * Projects live at level 2 (under their level-1 client). We must walk into
 * each client to find them — `getListItems` only returns top-level (level-1)
 * items so we can't just check the top of the list.
 *
 * @param projectNumber - the level-2 shortCode to look for
 * @param clientShortCode - optional level-1 to limit the search; if omitted,
 *                          checks every client (slower but works)
 */
export async function projectExists(
  projectNumber: string,
  clientShortCode?: string
): Promise<ConcurListItem | null> {
  const listId = CONCUR_LIST_IDS.PROJECTS;
  if (!listId) return null;

  const code = sanitizeShortCode(projectNumber);
  const clients = await getListItems(listId);

  // If we know the client, only walk that one
  const clientsToSearch = clientShortCode
    ? clients.filter(
        (c) => c.shortCode === sanitizeShortCode(clientShortCode)
      )
    : clients;

  for (const client of clientsToSearch) {
    const projects = await getItemChildren(client.id);
    const match = projects.find((p) => p.shortCode === code);
    if (match) return match;
  }

  return null;
}

import { prisma } from "./db";

/**
 * Try to match a parsed client name to an existing client in the database.
 * Uses case-insensitive substring matching.
 */
export async function matchClient(
  clientName: string | null
): Promise<{ id: string; name: string } | null> {
  if (!clientName) return null;

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
  });

  const normalized = clientName.toLowerCase().trim();

  // Exact match first
  const exact = clients.find(
    (c) => c.name.toLowerCase().trim() === normalized
  );
  if (exact) return exact;

  // Substring match (client name appears in parsed name or vice versa)
  const partial = clients.find(
    (c) =>
      normalized.includes(c.name.toLowerCase().trim()) ||
      c.name.toLowerCase().trim().includes(normalized)
  );
  if (partial) return partial;

  return null;
}

/**
 * Map a platform string from parsing to a valid Prisma Platform enum value.
 */
export function mapPlatform(
  platform: string | null
): "META" | "GOOGLE_ADS" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER" {
  if (!platform) return "OTHER";
  const valid = ["META", "GOOGLE_ADS", "BING", "TIKTOK", "LINKEDIN", "OTHER"];
  const upper = platform.toUpperCase();
  return valid.includes(upper)
    ? (upper as "META" | "GOOGLE_ADS" | "BING" | "TIKTOK" | "LINKEDIN" | "OTHER")
    : "OTHER";
}

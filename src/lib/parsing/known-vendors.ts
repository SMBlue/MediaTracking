import type { Platform } from "@prisma/client";

export type KnownVendor = {
  canonicalName: string;
  platform: Platform | null;
  matchers: {
    fromDomains?: string[];
    subjectFragments?: string[];
    bodyFragments?: string[];
    filenameFragments?: string[];
  };
};

// Populated by the media team — keep entries narrow and high-confidence.
// First match wins; order is not significant otherwise.
export const KNOWN_VENDORS: KnownVendor[] = [];

function lower(value: string): string {
  return value.toLowerCase();
}

function anyHit(
  candidate: string | null | undefined,
  needles: string[] | undefined
): boolean {
  if (!candidate || !needles?.length) return false;
  const haystack = lower(candidate);
  return needles.some((needle) => haystack.includes(lower(needle)));
}

export type VendorHintInput = {
  fromAddress?: string | null;
  subject?: string | null;
  body?: string | null;
  attachmentFilenames?: string[];
};

export type VendorHint = {
  canonicalName: string;
  platform: Platform | null;
};

export function findKnownVendor(input: VendorHintInput): VendorHint | null {
  const fromDomain = input.fromAddress?.split("@")[1];
  const filenameJoined = (input.attachmentFilenames ?? []).join(" | ");

  for (const vendor of KNOWN_VENDORS) {
    const { matchers } = vendor;
    if (
      anyHit(fromDomain, matchers.fromDomains) ||
      anyHit(input.subject, matchers.subjectFragments) ||
      anyHit(input.body, matchers.bodyFragments) ||
      anyHit(filenameJoined, matchers.filenameFragments)
    ) {
      return { canonicalName: vendor.canonicalName, platform: vendor.platform };
    }
  }
  return null;
}

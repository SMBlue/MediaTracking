import { getSupabaseAdmin } from "../supabase/admin";

export const CONTRACTS_BUCKET = "mba-contracts";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

export function buildContractPath(mbaId: string, filename: string): string {
  return `${mbaId}/${safeFilename(filename)}`;
}

export async function uploadContractPdf(params: {
  mbaId: string;
  filename: string;
  buffer: Buffer;
}): Promise<{ path: string; size: number }> {
  const path = buildContractPath(params.mbaId, params.filename);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, params.buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload contract PDF: ${error.message}`);
  }

  return { path, size: params.buffer.byteLength };
}

export async function getContractSignedUrl(
  path: string,
  expiresInSeconds = 60 * 10
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL: ${error?.message ?? "no URL returned"}`
    );
  }
  return data.signedUrl;
}

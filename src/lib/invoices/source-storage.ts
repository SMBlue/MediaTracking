/**
 * Storage helpers for persisted vendor invoice sources.
 * Parallel to src/lib/contracts/storage.ts.
 */

import { getSupabaseAdmin } from "../supabase/admin";

export const INVOICE_SOURCES_BUCKET = "invoice-sources";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

export function buildInvoiceSourcePath(invoiceId: string, filename: string): string {
  return `${invoiceId}/${safeFilename(filename)}`;
}

export async function uploadInvoiceSourcePdf(params: {
  invoiceId: string;
  filename: string;
  buffer: Buffer;
}): Promise<{ path: string; size: number }> {
  const path = buildInvoiceSourcePath(params.invoiceId, params.filename);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(INVOICE_SOURCES_BUCKET)
    .upload(path, params.buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload invoice source PDF: ${error.message}`);
  }

  return { path, size: params.buffer.byteLength };
}

export async function getInvoiceSourceSignedUrl(
  path: string,
  expiresInSeconds = 60 * 10
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(INVOICE_SOURCES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL: ${error?.message ?? "no URL returned"}`
    );
  }
  return data.signedUrl;
}

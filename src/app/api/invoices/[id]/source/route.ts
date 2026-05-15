import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getInvoiceSourceSignedUrl } from "@/lib/invoices/source-storage";

export const dynamic = "force-dynamic";

/**
 * Returns the persisted invoice source as JSON:
 *   { kind: "pdf", url, filename }  – signed Supabase Storage URL
 *   { kind: "email", body }          – body-only invoices
 *   { kind: "none" }                 – ingested before PR #18 / nothing persisted
 *
 * Auth is enforced by the dashboard middleware on /api/* routes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      sourcePdfPath: true,
      sourcePdfFilename: true,
      sourceEmailBodyText: true,
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.sourcePdfPath) {
    try {
      const url = await getInvoiceSourceSignedUrl(invoice.sourcePdfPath);
      return NextResponse.json({
        kind: "pdf",
        url,
        filename: invoice.sourcePdfFilename,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to sign URL: ${err}` },
        { status: 500 }
      );
    }
  }

  if (invoice.sourceEmailBodyText) {
    return NextResponse.json({
      kind: "email",
      body: invoice.sourceEmailBodyText,
    });
  }

  return NextResponse.json({ kind: "none" });
}

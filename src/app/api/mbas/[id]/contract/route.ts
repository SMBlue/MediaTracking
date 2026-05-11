import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getContractSignedUrl } from "@/lib/contracts/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const mba = await prisma.mBA.findUnique({
    where: { id },
    select: { contractPdfPath: true },
  });

  if (!mba?.contractPdfPath) {
    return NextResponse.json(
      { message: "No contract PDF on file for this MBA" },
      { status: 404 }
    );
  }

  try {
    const url = await getContractSignedUrl(mba.contractPdfPath);
    return NextResponse.redirect(url, { status: 307 });
  } catch (err) {
    console.error("Failed to sign contract URL:", err);
    return NextResponse.json(
      { message: "Failed to generate contract URL" },
      { status: 500 }
    );
  }
}

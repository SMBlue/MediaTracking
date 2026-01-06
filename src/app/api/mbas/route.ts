import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const mbas = await prisma.mBA.findMany({
      where: { status: "ACTIVE" },
      include: {
        client: {
          select: { name: true },
        },
      },
      orderBy: [{ client: { name: "asc" } }, { mbaNumber: "asc" }],
    });

    return NextResponse.json(mbas);
  } catch (error) {
    console.error("Failed to fetch MBAs:", error);
    return NextResponse.json(
      { message: "Failed to fetch MBAs" },
      { status: 500 }
    );
  }
}

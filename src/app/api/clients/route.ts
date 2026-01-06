import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { message: "Client name is required" },
        { status: 400 }
      );
    }

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
      },
    });

    await logAudit({
      entityType: "Client",
      entityId: client.id,
      action: "CREATE",
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Failed to create client:", error);
    return NextResponse.json(
      { message: "Failed to create client" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clients);
  } catch (error) {
    console.error("Failed to fetch clients:", error);
    return NextResponse.json(
      { message: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}

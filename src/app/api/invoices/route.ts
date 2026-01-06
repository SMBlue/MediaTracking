import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      type,
      vendor,
      invoiceNumber,
      invoiceDate,
      totalAmount,
      currency,
      isPaid,
      notes,
      allocations,
    } = body;

    // Validate required fields
    if (!vendor || !invoiceNumber || !invoiceDate || totalAmount === undefined) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create invoice with allocations in a transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          type: type || "INVOICE",
          vendor,
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          totalAmount,
          currency: currency || "USD",
          isPaid: isPaid || false,
          notes: notes || null,
        },
      });

      // Create allocations if provided
      if (allocations && allocations.length > 0) {
        await tx.invoiceAllocation.createMany({
          data: allocations.map(
            (alloc: { mbaId: string; amount: number }) => ({
              invoiceId: newInvoice.id,
              mbaId: alloc.mbaId,
              amount: alloc.amount,
            })
          ),
        });
      }

      return newInvoice;
    });

    // Log the audit event
    await logAudit({
      entityType: "Invoice",
      entityId: invoice.id,
      action: "CREATE",
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);

    // Check for unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { message: "An invoice with this number already exists for this vendor" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

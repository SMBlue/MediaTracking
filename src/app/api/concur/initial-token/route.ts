/**
 * One-time setup endpoint to exchange a Concur Company Request Token
 * for a refresh token, which is then stored in the database.
 *
 * Usage: POST /api/concur/initial-token with { requestToken: "..." }
 *
 * SECURITY: This route should be removed after initial setup.
 * It is gated by authenticated user check.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initialTokenExchange, isConcurConfigured } from "@/lib/concur/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Require authenticated user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConcurConfigured()) {
    return NextResponse.json(
      {
        error:
          "Concur credentials not configured. Set CONCUR_CLIENT_ID, CONCUR_CLIENT_SECRET, CONCUR_COMPANY_UUID in .env",
      },
      { status: 400 }
    );
  }

  // Check if already exchanged
  const existing = await prisma.concurToken.findFirst();
  if (existing) {
    return NextResponse.json(
      {
        error:
          "A Concur token already exists. Delete it from the ConcurToken table first if you need to re-exchange.",
      },
      { status: 409 }
    );
  }

  let body: { requestToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.requestToken) {
    return NextResponse.json(
      { error: "Missing requestToken in request body" },
      { status: 400 }
    );
  }

  // Diagnostic: show prefix and length so we can see if the token was truncated
  const tokenPrefix = body.requestToken.slice(0, 5);
  const tokenLength = body.requestToken.length;
  const startsWithAt = body.requestToken.startsWith("at-");

  try {
    await initialTokenExchange(body.requestToken);

    const token = await prisma.concurToken.findFirst();
    return NextResponse.json({
      status: "success",
      geolocation: token?.geolocation,
      expiresAt: token?.expiresAt,
    });
  } catch (err) {
    // Show env credential summary (last 4 chars only) to debug pairing issues
    const clientId = process.env.CONCUR_CLIENT_ID || "";
    const clientSecret = process.env.CONCUR_CLIENT_SECRET || "";
    const companyUuid = process.env.CONCUR_COMPANY_UUID || "";

    return NextResponse.json(
      {
        status: "failed",
        error: String(err),
        diagnostic: {
          tokenPrefix,
          tokenLength,
          startsWithAt,
          envCheck: {
            clientIdSuffix: clientId.slice(-4),
            clientIdLength: clientId.length,
            clientSecretSuffix: clientSecret.slice(-4),
            clientSecretLength: clientSecret.length,
            companyUuidSuffix: companyUuid.slice(-4),
            companyUuidLength: companyUuid.length,
            tokenUrl: process.env.CONCUR_GEOLOCATION || "https://us2.api.concursolutions.com (default - production)",
          },
        },
      },
      { status: 500 }
    );
  }
}

/**
 * SAP Concur OAuth 2.0 token management.
 *
 * Handles:
 * - Initial token exchange (one-time, from Company Request Token)
 * - Access token retrieval with automatic refresh
 * - Refresh token rotation (Concur issues a new refresh token on every use)
 *
 * Tokens are stored in the ConcurToken database table, not env vars,
 * because refresh tokens rotate on every use and must be persisted.
 */

import { prisma } from "../db";
import { CONCUR_API_PATHS, TOKEN_REFRESH_BUFFER_MS } from "./constants";
import type { ConcurTokenResponse } from "./types";

function getTokenUrl(): string {
  // Use geolocation from stored token if available, otherwise env
  return (
    process.env.CONCUR_GEOLOCATION ||
    "https://us2.api.concursolutions.com"
  );
}

/**
 * One-time initial token exchange.
 * Call this once with the Company Request Token from the admin.
 * After this, use getAccessToken() for all API calls.
 */
export async function initialTokenExchange(
  requestToken: string
): Promise<void> {
  const clientId = process.env.CONCUR_CLIENT_ID;
  const clientSecret = process.env.CONCUR_CLIENT_SECRET;
  const companyUuid = process.env.CONCUR_COMPANY_UUID;

  if (!clientId || !clientSecret || !companyUuid) {
    throw new Error("Missing CONCUR_CLIENT_ID, CONCUR_CLIENT_SECRET, or CONCUR_COMPANY_UUID");
  }

  const baseUrl = getTokenUrl();
  const response = await fetch(`${baseUrl}${CONCUR_API_PATHS.TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "password",
      username: companyUuid,
      password: requestToken,
      credtype: "authtoken",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Concur initial token exchange failed: ${response.status} ${errorText}`
    );
  }

  const data: ConcurTokenResponse = await response.json();

  // Delete any existing tokens and store the new one
  await prisma.concurToken.deleteMany({});
  await prisma.concurToken.create({
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      geolocation: data.geolocation,
    },
  });

  console.log(
    `Concur token exchange successful. Geolocation: ${data.geolocation}`
  );
}

/**
 * Refresh the access token using the stored refresh token.
 * CRITICAL: Concur issues a new refresh token on every refresh.
 * We must persist the new refresh token before doing anything else.
 */
async function refreshAccessToken(
  storedToken: { id: string; refreshToken: string; geolocation: string }
): Promise<string> {
  const clientId = process.env.CONCUR_CLIENT_ID;
  const clientSecret = process.env.CONCUR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing CONCUR_CLIENT_ID or CONCUR_CLIENT_SECRET");
  }

  const response = await fetch(
    `${storedToken.geolocation}${CONCUR_API_PATHS.TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: storedToken.refreshToken,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Concur token refresh failed: ${response.status} ${errorText}`
    );
  }

  const data: ConcurTokenResponse = await response.json();

  // Persist new tokens immediately — refresh token is single-use
  await prisma.concurToken.update({
    where: { id: storedToken.id },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      geolocation: data.geolocation,
    },
  });

  return data.access_token;
}

/**
 * Get a valid access token for API calls.
 * Automatically refreshes if the token is expired or about to expire.
 * Returns { accessToken, geolocation } for use by the HTTP client.
 */
export async function getAccessToken(): Promise<{
  accessToken: string;
  geolocation: string;
}> {
  const storedToken = await prisma.concurToken.findFirst();

  if (!storedToken) {
    throw new Error(
      "No Concur token found. Run initialTokenExchange() first."
    );
  }

  const now = new Date();
  const expiresAt = new Date(storedToken.expiresAt);
  const needsRefresh =
    now.getTime() >= expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS;

  if (needsRefresh) {
    const newAccessToken = await refreshAccessToken(storedToken);
    // Re-read to get potentially updated geolocation
    const updated = await prisma.concurToken.findFirst();
    return {
      accessToken: newAccessToken,
      geolocation: updated?.geolocation || storedToken.geolocation,
    };
  }

  return {
    accessToken: storedToken.accessToken,
    geolocation: storedToken.geolocation,
  };
}

/**
 * Check if Concur credentials are configured.
 */
export function isConcurConfigured(): boolean {
  return !!(
    process.env.CONCUR_CLIENT_ID &&
    process.env.CONCUR_CLIENT_SECRET
  );
}

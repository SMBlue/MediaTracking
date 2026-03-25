/**
 * NetSuite Token-Based Authentication (TBA) Client
 * Ported from BSD Rev Mgmt pipeline-manager project.
 * Uses OAuth 1.0a with HMAC-SHA256 for server-to-server authentication.
 */

import { createHmac, randomBytes } from "crypto";

interface NetSuiteTBAConfig {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

interface SuiteQLResponse<T = Record<string, unknown>> {
  items: T[];
  hasMore: boolean;
  totalResults: number;
  count: number;
  offset: number;
}

export class NetSuiteTBAClient {
  private config: NetSuiteTBAConfig;
  private baseUrl: string;

  constructor(config: NetSuiteTBAConfig) {
    this.config = config;
    this.baseUrl = `https://${config.accountId}.suitetalk.api.netsuite.com`;
  }

  private generateOAuthSignature(
    method: string,
    baseUrl: string,
    oauthParams: Record<string, string>,
    queryParams?: Record<string, string>
  ): string {
    const allParams = { ...oauthParams, ...queryParams };

    const sortedParams = Object.keys(allParams)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`
      )
      .join("&");

    const signatureBaseString = [
      method.toUpperCase(),
      encodeURIComponent(baseUrl),
      encodeURIComponent(sortedParams),
    ].join("&");

    const signingKey = [
      encodeURIComponent(this.config.consumerSecret),
      encodeURIComponent(this.config.tokenSecret),
    ].join("&");

    return createHmac("sha256", signingKey)
      .update(signatureBaseString)
      .digest("base64");
  }

  private generateAuthHeader(method: string, fullUrl: string): string {
    const [baseUrl, queryString] = fullUrl.split("?");
    const queryParams: Record<string, string> = {};
    if (queryString) {
      for (const pair of queryString.split("&")) {
        const [key, value] = pair.split("=");
        queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_token: this.config.tokenId,
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: "1.0",
    };

    const signature = this.generateOAuthSignature(
      method,
      baseUrl,
      oauthParams,
      queryParams
    );

    const headerParts: string[] = [
      `realm="${this.config.accountId}"`,
    ];

    const allOauthEntries: Record<string, string> = {
      ...oauthParams,
      oauth_signature: signature,
    };
    Object.keys(allOauthEntries)
      .sort()
      .forEach((key) => {
        headerParts.push(
          `${key}="${encodeURIComponent(allOauthEntries[key])}"`
        );
      });

    return "OAuth " + headerParts.join(", ");
  }

  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || "GET";

    const authHeader = this.generateAuthHeader(method, url);

    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Prefer: "transient",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NetSuite API request failed: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("json")) {
      return response.json();
    }

    return response.text() as T;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("/services/rest/record/v1/metadata-catalog");
      return true;
    } catch (error) {
      console.error("NetSuite TBA connection test failed:", error);
      return false;
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SuiteQLResponse<T>> {
    const queryParams: string[] = [];
    if (options?.limit != null) queryParams.push(`limit=${options.limit}`);
    if (options?.offset != null) queryParams.push(`offset=${options.offset}`);

    const qs = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
    const endpoint = `/services/rest/query/v1/suiteql${qs}`;

    return this.request<SuiteQLResponse<T>>(endpoint, {
      method: "POST",
      body: JSON.stringify({ q: sql }),
    });
  }

  async queryAll<T = Record<string, unknown>>(
    sql: string,
    pageSize: number = 1000
  ): Promise<T[]> {
    const allItems: T[] = [];
    let offset = 0;

    while (true) {
      const result = await this.query<T>(sql, { limit: pageSize, offset });
      allItems.push(...(result.items || []));
      if (!result.hasMore) break;
      offset += pageSize;
    }

    return allItems;
  }
}

export function isNetsuiteConfigured(): boolean {
  return !!(
    process.env.NETSUITE_ACCOUNT_ID &&
    process.env.NETSUITE_CONSUMER_KEY &&
    process.env.NETSUITE_CONSUMER_SECRET &&
    process.env.NETSUITE_TOKEN_ID &&
    process.env.NETSUITE_TOKEN_SECRET
  );
}

export function createNetSuiteClient(): NetSuiteTBAClient {
  return new NetSuiteTBAClient({
    accountId: process.env.NETSUITE_ACCOUNT_ID!,
    consumerKey: process.env.NETSUITE_CONSUMER_KEY!,
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET!,
    tokenId: process.env.NETSUITE_TOKEN_ID!,
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET!,
  });
}

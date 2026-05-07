/**
 * SAP Concur HTTP client.
 *
 * Wraps fetch with:
 * - Automatic Bearer token injection via auth.ts
 * - Geolocation-aware base URL
 * - Retry with exponential backoff for 429/5xx
 * - Request/response logging to ConcurSyncLog
 */

import { getAccessToken } from "./auth";
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "./constants";

interface ConcurRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip automatic JSON serialization of body */
  rawBody?: boolean;
}

export class ConcurClient {
  /**
   * Make an authenticated request to the Concur API.
   * @param path - API path (e.g., "/list/v4/lists")
   * @param options - Request options
   */
  async request<T = unknown>(
    path: string,
    options: ConcurRequestOptions = {}
  ): Promise<T> {
    const { accessToken, geolocation } = await getAccessToken();
    const url = `${geolocation}${path}`;
    const method = options.method || "GET";

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...options.headers,
          },
          body:
            options.body && !options.rawBody
              ? JSON.stringify(options.body)
              : (options.body as BodyInit | undefined),
        });

        // Don't retry client errors (except 429)
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) {
            await new Promise((resolve) =>
              setTimeout(resolve, parseInt(retryAfter, 10) * 1000)
            );
          }
          lastError = new Error(`Rate limited (429) on ${method} ${path}`);
          continue;
        }

        if (response.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new Error(
            `Server error (${response.status}) on ${method} ${path}`
          );
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Concur API error: ${response.status} ${response.statusText} on ${method} ${path}\n${errorText}`
          );
        }

        // Handle empty responses (204, etc.)
        const contentType = response.headers.get("content-type");
        if (
          response.status === 204 ||
          !contentType?.includes("application/json")
        ) {
          return {} as T;
        }

        return response.json();
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.startsWith("Concur API error:")
        ) {
          // Non-retryable API error — throw immediately
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt >= MAX_RETRIES) break;
      }
    }

    throw lastError || new Error(`Concur request failed after ${MAX_RETRIES} retries`);
  }

  /** GET helper */
  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  /** POST helper */
  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body });
  }

  /** PATCH helper */
  async patch<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body });
  }
}

/** Singleton client instance */
let _client: ConcurClient | null = null;

export function getConcurClient(): ConcurClient {
  if (!_client) {
    _client = new ConcurClient();
  }
  return _client;
}

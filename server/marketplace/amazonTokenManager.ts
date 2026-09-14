/**
 * Amazon Creators API OAuth 2.0 Token Manager
 *
 * Implements token lifecycle management:
 * - Token acquisition via OAuth 2.0 client credentials
 * - In-memory caching and reuse
 * - Proactive refresh before expiration
 * - Error handling for 401, 403, 429
 * - Exponential backoff on retries
 */

import { CapabilityState } from "./types";

export interface AmazonTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface AmazonTokenFetchOptions {
  credentialId: string;
  credentialSecret: string;
  credentialVersion?: string;
  tokenEndpoint?: string;
}

export type CustomTokenFetcher = (
  options: AmazonTokenFetchOptions
) => Promise<AmazonTokenResponse>;

export class AmazonTokenManager {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private inFlightTokenPromise: Promise<string> | null = null;
  private lastError: { state: CapabilityState; message: string; timestamp: number } | null = null;
  private customFetcher: CustomTokenFetcher | null = null;

  // Refresh proactive buffer in ms (refresh 60 seconds before actual expiration)
  private readonly REFRESH_BUFFER_MS = 60 * 1000;

  constructor(customFetcher?: CustomTokenFetcher) {
    if (customFetcher) {
      this.customFetcher = customFetcher;
    }
  }

  /**
   * Set a custom token fetcher (primarily for unit tests and sandboxing)
   */
  public setCustomFetcher(fetcher: CustomTokenFetcher | null): void {
    this.customFetcher = fetcher;
  }

  /**
   * Checks whether required credentials are set in the environment
   */
  public hasCredentials(): boolean {
    const credentialId = process.env.AMAZON_CREATORS_CREDENTIAL_ID;
    const credentialSecret = process.env.AMAZON_CREATORS_CREDENTIAL_SECRET;
    return Boolean(credentialId && credentialSecret);
  }

  /**
   * Get current capability state of Amazon Token Manager
   */
  public getCapabilityState(): { state: CapabilityState; message: string } {
    if (!this.hasCredentials()) {
      return {
        state: "not_configured",
        message: "Amazon Creators API credentials (AMAZON_CREATORS_CREDENTIAL_ID / AMAZON_CREATORS_CREDENTIAL_SECRET) not configured.",
      };
    }

    if (this.lastError && Date.now() - this.lastError.timestamp < 5 * 60 * 1000) {
      return {
        state: this.lastError.state,
        message: this.lastError.message,
      };
    }

    return {
      state: "available",
      message: "Amazon Creators API token manager configured and ready.",
    };
  }

  /**
   * Invalidate the current cached token (called on HTTP 401 Unauthorized)
   */
  public invalidateToken(reason = "Token invalidated"): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.inFlightTokenPromise = null;
  }

  /**
   * Obtains a valid Bearer token, reusing existing unexpired token or fetching a fresh one.
   * Concurrent callers share the same in-flight token request promise.
   */
  public async getAccessToken(): Promise<string> {
    const now = Date.now();

    // 1. Reuse valid cached token if not expired
    if (this.cachedToken && now < this.tokenExpiresAt - this.REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }

    // 2. Share in-flight request if one is currently resolving
    if (this.inFlightTokenPromise) {
      return this.inFlightTokenPromise;
    }

    // 3. Request fresh token with credentials
    const credentialId = process.env.AMAZON_CREATORS_CREDENTIAL_ID;
    const credentialSecret = process.env.AMAZON_CREATORS_CREDENTIAL_SECRET;
    const credentialVersion = process.env.AMAZON_CREATORS_CREDENTIAL_VERSION || "2.1";

    if (!credentialId || !credentialSecret) {
      const err = new Error("Missing required Amazon Creators API credentials");
      this.lastError = {
        state: "not_configured",
        message: err.message,
        timestamp: now,
      };
      throw err;
    }

    this.inFlightTokenPromise = (async () => {
      let attempts = 0;
      const maxAttempts = 3;
      let delayMs = 500;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const tokenData = await this.fetchOAuthToken({
            credentialId,
            credentialSecret,
            credentialVersion,
          });

          this.cachedToken = tokenData.access_token;
          // expires_in is in seconds
          this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
          this.lastError = null;

          return this.cachedToken;
        } catch (err: any) {
          const status = err?.status || err?.statusCode || 0;

          if (status === 401) {
            this.lastError = {
              state: "authentication_failed",
              message: `Amazon OAuth 401 Unauthorized: Invalid Credential ID or Secret. ${err.message || ""}`,
              timestamp: Date.now(),
            };
            throw err;
          }

          if (status === 403) {
            this.lastError = {
              state: "restricted",
              message: `Amazon OAuth 403 Forbidden: Account or scope restricted for Creators API. ${err.message || ""}`,
              timestamp: Date.now(),
            };
            throw err;
          }

          if (status === 429) {
            this.lastError = {
              state: "rate_limited",
              message: "Amazon OAuth token endpoint returned 429 Too Many Requests.",
              timestamp: Date.now(),
            };
            // Exponential backoff
            if (attempts < maxAttempts) {
              await new Promise((res) => setTimeout(res, delayMs));
              delayMs *= 2;
              continue;
            }
            throw err;
          }

          if (attempts >= maxAttempts) {
            this.lastError = {
              state: "authentication_failed",
              message: `Failed to acquire Amazon Creators token: ${err.message || "Network Error"}`,
              timestamp: Date.now(),
            };
            throw err;
          }

          await new Promise((res) => setTimeout(res, delayMs));
          delayMs *= 2;
        }
      }

      throw new Error("Unable to obtain Amazon Creators API OAuth token");
    })().finally(() => {
      this.inFlightTokenPromise = null;
    });

    return this.inFlightTokenPromise;
  }

  /**
   * Network execution for Amazon OAuth token endpoint
   */
  private async fetchOAuthToken(options: AmazonTokenFetchOptions): Promise<AmazonTokenResponse> {
    if (this.customFetcher) {
      return await this.customFetcher(options);
    }

    const tokenUrl = options.tokenEndpoint || "https://api.amazon.com/auth/o2/token";
    const bodyParams = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: options.credentialId,
      client_secret: options.credentialSecret,
      scope: "creators::catalog",
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Listofa-Amazon-Migrated/2.0",
        ...(options.credentialVersion ? { "x-credential-version": options.credentialVersion } : {}),
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error: any = new Error(
        `Amazon Token Request Failed: HTTP ${response.status} - ${errorText.slice(0, 300)}`
      );
      error.status = response.status;
      throw error;
    }

    return (await response.json()) as AmazonTokenResponse;
  }

  /**
   * Helper for tests to inspect internal state
   */
  public getInternalState() {
    return {
      hasCachedToken: Boolean(this.cachedToken),
      tokenExpiresAt: this.tokenExpiresAt,
      timeUntilExpiryMs: Math.max(0, this.tokenExpiresAt - Date.now()),
      hasInFlight: Boolean(this.inFlightTokenPromise),
      lastError: this.lastError,
    };
  }
}

// Singleton instance
export const amazonTokenManager = new AmazonTokenManager();

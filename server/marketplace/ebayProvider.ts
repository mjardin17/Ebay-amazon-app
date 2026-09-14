/**
 * Official eBay Catalog API & Browse API Provider
 *
 * Migrates deprecated eBay Product API to:
 * - eBay Catalog API (/commerce/catalog/v1_beta/product_summary/search) for ePID matching
 * - Preserves official eBay Browse API (/buy/browse/v1/item_summary/search)
 * - OAuth 2.0 Client Credentials Token Manager
 * - Marketplace header X-EBAY-C-MARKETPLACE-ID
 * - Centralized caching, deduplication, and rate limiting
 */

import {
  CapabilityInfo,
  CapabilityState,
  EbayBrowseSearchOptions,
  NormalizedEbayCatalogProduct,
  NormalizedEbayListing,
} from "./types";
import { marketplaceCache, MarketplaceCache } from "./cache";
import { ebayRateLimiter, MarketplaceRateLimiter } from "./rateLimiter";
import { HttpExecutor } from "./amazonProvider";

export class EbayTokenManager {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private inFlightTokenPromise: Promise<string> | null = null;
  private httpExecutor: HttpExecutor;

  constructor(httpExecutor?: HttpExecutor) {
    this.httpExecutor = httpExecutor || ((url, opts) => fetch(url, opts));
  }

  public setHttpExecutor(executor: HttpExecutor): void {
    this.httpExecutor = executor;
  }

  public hasCredentials(): boolean {
    return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
  }

  public getCapabilityState(): { state: CapabilityState; message: string } {
    if (!this.hasCredentials()) {
      return {
        state: "not_configured",
        message: "eBay API credentials (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET) not configured.",
      };
    }
    return {
      state: "available",
      message: "eBay OAuth client configured and ready.",
    };
  }

  public invalidateToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - 60000) {
      return this.cachedToken;
    }

    if (this.inFlightTokenPromise) {
      return this.inFlightTokenPromise;
    }

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const isSandbox = (process.env.EBAY_ENVIRONMENT || "").toUpperCase() === "SANDBOX";

    if (!clientId || !clientSecret) {
      const err: any = new Error("eBay credentials missing in environment");
      err.status = 503;
      err.capability = "not_configured";
      throw err;
    }

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenUrl = isSandbox
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";

    this.inFlightTokenPromise = (async () => {
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.browse https://api.ebay.com/oauth/api_scope/commerce.catalog.readonly",
      });

      const response = await this.httpExecutor(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const err: any = new Error(`eBay OAuth Failed HTTP ${response.status}: ${text.slice(0, 200)}`);
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      this.cachedToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in || 7200) * 1000;
      return this.cachedToken!;
    })().finally(() => {
      this.inFlightTokenPromise = null;
    });

    return this.inFlightTokenPromise;
  }
}

export class EbayMarketplaceProvider {
  public tokenManager: EbayTokenManager;
  private cache: MarketplaceCache;
  private rateLimiter: MarketplaceRateLimiter;
  private httpExecutor: HttpExecutor;

  constructor(
    tokenManager?: EbayTokenManager,
    cache: MarketplaceCache = marketplaceCache,
    rateLimiter: MarketplaceRateLimiter = ebayRateLimiter,
    httpExecutor?: HttpExecutor
  ) {
    this.httpExecutor = httpExecutor || ((url, opts) => fetch(url, opts));
    this.tokenManager = tokenManager || new EbayTokenManager(this.httpExecutor);
    this.cache = cache;
    this.rateLimiter = rateLimiter;
  }

  public setHttpExecutor(executor: HttpExecutor): void {
    this.httpExecutor = executor;
    this.tokenManager.setHttpExecutor(executor);
  }

  private getBaseUrl(): string {
    const isSandbox = (process.env.EBAY_ENVIRONMENT || "").toUpperCase() === "SANDBOX";
    return isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  }

  private getMarketplaceId(): string {
    return process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
  }

  /**
   * Capability Status for eBay Catalog API (Product Matching & ePID)
   */
  public async getCatalogCapabilityStatus(): Promise<CapabilityInfo> {
    const state = this.tokenManager.getCapabilityState();
    return {
      id: "ebay_catalog_matching",
      name: "eBay Catalog API (product_summary ePID Matching)",
      provider: "ebay-catalog",
      state: state.state,
      message: state.message,
      lastChecked: Date.now(),
      documentationUrl: "https://developer.ebay.com/api-docs/commerce/catalog/resources/product_summary/methods/search",
      requiredCredentials: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
    };
  }

  /**
   * Capability Status for eBay Browse API (Active Listings)
   */
  public async getBrowseCapabilityStatus(): Promise<CapabilityInfo> {
    const state = this.tokenManager.getCapabilityState();
    return {
      id: "ebay_browse_search",
      name: "eBay Browse API (item_summary search)",
      provider: "ebay-browse",
      state: state.state,
      message: state.message,
      lastChecked: Date.now(),
      documentationUrl: "https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search",
      requiredCredentials: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
    };
  }

  /**
   * 1. Official eBay Catalog API Migration:
   * Uses product_summary to locate matching catalog products and retrieve the ePID.
   * Replaces legacy decommissioned eBay Product API.
   */
  public async matchCatalogProduct(query: string): Promise<NormalizedEbayCatalogProduct | null> {
    const marketplace = this.getMarketplaceId();
    const cacheKey = `catalog-match:${query}`;
    const cached = this.cache.get<NormalizedEbayCatalogProduct | null>(
      this.cache.generateKey("ebay-catalog", marketplace, cacheKey)
    );

    if (cached) {
      return cached.response;
    }

    return this.cache.deduplicate(`ebay-catalog:${marketplace}:${cacheKey}`, async () => {
      if (!this.tokenManager.hasCredentials()) {
        const error: any = new Error("eBay credentials not configured in environment.");
        error.capability = "not_configured";
        error.status = 503;
        throw error;
      }

      const token = await this.tokenManager.getAccessToken();
      const url = `${this.getBaseUrl()}/commerce/catalog/v1_beta/product_summary/search?q=${encodeURIComponent(query)}&limit=1`;

      const response = await this.rateLimiter.execute(async () => {
        const res = await this.httpExecutor(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": marketplace,
            Accept: "application/json",
          },
        });

        if (res.status === 401) {
          this.tokenManager.invalidateToken();
          const err: any = new Error("eBay Catalog API: 401 Unauthorized token");
          err.status = 401;
          throw err;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err: any = new Error(`eBay Catalog API HTTP ${res.status}: ${text.slice(0, 200)}`);
          err.status = res.status;
          throw err;
        }

        return res;
      }, `EbayCatalogMatch_${query}`);

      const raw = await response.json();
      const firstSummary = raw?.productSummaries?.[0];

      if (!firstSummary) {
        this.cache.set("ebay-catalog", cacheKey, marketplace, null, 60 * 60 * 1000);
        return null;
      }

      const normalized: NormalizedEbayCatalogProduct = {
        epid: firstSummary.epid,
        title: firstSummary.title,
        brand: firstSummary.brand,
        mpn: firstSummary.mpn?.[0],
        gtin: firstSummary.gtin?.[0],
        primaryCategory: firstSummary.primaryCategory,
        imageUrl: firstSummary.image?.imageUrl,
        aspects: firstSummary.aspects,
        productWebUrl: firstSummary.productWebUrl,
        retrievalTimestamp: Date.now(),
        provenance: "confirmed_marketplace_api",
      };

      // Cache catalog matches for 24 hours
      this.cache.set("ebay-catalog", cacheKey, marketplace, normalized, 24 * 60 * 60 * 1000);
      return normalized;
    });
  }

  /**
   * 2. Official eBay Browse API:
   * Searches active eBay listings via item_summary/search with pagination, marketplace headers, and normalization.
   */
  public async searchBrowseItems(
    query: string,
    options: EbayBrowseSearchOptions = {}
  ): Promise<NormalizedEbayListing[]> {
    const marketplace = this.getMarketplaceId();
    const cacheKey = `browse-search:${query}:${JSON.stringify(options)}`;
    const cached = this.cache.get<NormalizedEbayListing[]>(
      this.cache.generateKey("ebay-browse", marketplace, cacheKey)
    );

    if (cached) {
      return cached.response;
    }

    return this.cache.deduplicate(`ebay-browse:${marketplace}:${cacheKey}`, async () => {
      if (!this.tokenManager.hasCredentials()) {
        const error: any = new Error("eBay credentials not configured in environment.");
        error.capability = "not_configured";
        error.status = 503;
        throw error;
      }

      const token = await this.tokenManager.getAccessToken();
      const params = new URLSearchParams({
        q: query,
        limit: String(Math.min(options.limit || 10, 50)),
        offset: String(options.offset || 0),
        ...(options.categoryId ? { category_ids: options.categoryId } : {}),
        ...(options.filter ? { filter: options.filter } : {}),
        ...(options.sort ? { sort: options.sort } : {}),
      });

      const url = `${this.getBaseUrl()}/buy/browse/v1/item_summary/search?${params.toString()}`;

      const response = await this.rateLimiter.execute(async () => {
        const res = await this.httpExecutor(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": marketplace,
            Accept: "application/json",
          },
        });

        if (res.status === 401) {
          this.tokenManager.invalidateToken();
          const err: any = new Error("eBay Browse API: 401 Unauthorized token");
          err.status = 401;
          throw err;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err: any = new Error(`eBay Browse API HTTP ${res.status}: ${text.slice(0, 200)}`);
          err.status = res.status;
          throw err;
        }

        return res;
      }, `EbayBrowseSearch_${query}`);

      const raw = await response.json();
      const itemSummaries = raw?.itemSummaries || [];
      const normalized: NormalizedEbayListing[] = itemSummaries.map((item: any) => {
        const shippingCost = item.shippingOptions?.[0]?.shippingCost?.value
          ? Number(item.shippingOptions[0].shippingCost.value)
          : 0;

        return {
          itemId: item.itemId,
          title: item.title,
          price: Number(item.price?.value || 0),
          currency: item.price?.currency || "USD",
          condition: item.condition || "Used",
          itemWebUrl: item.itemWebUrl || "",
          imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
          shippingCost,
          seller: item.seller
            ? {
                username: item.seller.username,
                feedbackPercentage: item.seller.feedbackPercentage,
                feedbackScore: item.seller.feedbackScore,
              }
            : undefined,
          buyingOptions: item.buyingOptions || ["FIXED_PRICE"],
          retrievalTimestamp: Date.now(),
          provenance: "confirmed_marketplace_api",
        };
      });

      // Cache browse results for 1 hour
      this.cache.set("ebay-browse", cacheKey, marketplace, normalized, 60 * 60 * 1000);
      return normalized;
    });
  }
}

// Singleton instance
export const ebayMarketplaceProvider = new EbayMarketplaceProvider();

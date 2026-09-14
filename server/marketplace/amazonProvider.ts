/**
 * Official Amazon Creators API Provider Implementation
 * Replaces deprecated Product Advertising API 5.0 (PA-API 5).
 *
 * Implements:
 * - OAuth 2.0 via AmazonTokenManager
 * - lowerCamelCase request fields
 * - x-marketplace header
 * - OffersV2 resource model
 * - Internal object normalization
 * - Centralized caching and rate limiting
 */

import {
  AmazonGetProductOptions,
  AmazonSearchOptions,
  CapabilityInfo,
  NormalizedAmazonOffer,
  NormalizedAmazonProduct,
} from "./types";
import { amazonTokenManager, AmazonTokenManager } from "./amazonTokenManager";
import { marketplaceCache, MarketplaceCache } from "./cache";
import { amazonRateLimiter, MarketplaceRateLimiter } from "./rateLimiter";

export type HttpExecutor = (url: string, options: RequestInit) => Promise<Response>;

export class AmazonCreatorsProvider {
  private tokenManager: AmazonTokenManager;
  private cache: MarketplaceCache;
  private rateLimiter: MarketplaceRateLimiter;
  private httpExecutor: HttpExecutor;

  private readonly API_BASE = "https://creators.amazon.com/api/catalog/v1";

  constructor(
    tokenManager: AmazonTokenManager = amazonTokenManager,
    cache: MarketplaceCache = marketplaceCache,
    rateLimiter: MarketplaceRateLimiter = amazonRateLimiter,
    httpExecutor?: HttpExecutor
  ) {
    this.tokenManager = tokenManager;
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.httpExecutor = httpExecutor || ((url, opts) => fetch(url, opts));
  }

  /**
   * Set custom HTTP executor for testing
   */
  public setHttpExecutor(executor: HttpExecutor): void {
    this.httpExecutor = executor;
  }

  /**
   * Returns current capability status of Amazon Creators API
   */
  public async getCapabilityStatus(): Promise<CapabilityInfo> {
    const tokenState = this.tokenManager.getCapabilityState();
    return {
      id: "amazon_creators_catalog",
      name: "Amazon Creators Catalog & OffersV2 API",
      provider: "amazon-creators",
      state: tokenState.state,
      message: tokenState.message,
      lastChecked: Date.now(),
      documentationUrl: "https://creators.amazon.com/api/documentation",
      requiredCredentials: [
        "AMAZON_CREATORS_CREDENTIAL_ID",
        "AMAZON_CREATORS_CREDENTIAL_SECRET",
        "AMAZON_CREATORS_CREDENTIAL_VERSION",
      ],
    };
  }

  /**
   * Searches Amazon catalog products using Creators API
   */
  public async searchProducts(
    query: string,
    options: AmazonSearchOptions = {}
  ): Promise<NormalizedAmazonProduct[]> {
    const marketplace = process.env.AMAZON_MARKETPLACE || "US";
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    const cached = this.cache.get<NormalizedAmazonProduct[]>(
      this.cache.generateKey("amazon-creators", marketplace, cacheKey)
    );

    if (cached) {
      return cached.response;
    }

    return this.cache.deduplicate(`amazon-creators:${marketplace}:${cacheKey}`, async () => {
      // 1. Check configuration
      if (!this.tokenManager.hasCredentials()) {
        const error: any = new Error(
          "Amazon Creators API credentials are not configured in environment."
        );
        error.capability = "not_configured";
        error.status = 503;
        throw error;
      }

      // 2. Obtain OAuth Bearer token
      const token = await this.tokenManager.getAccessToken();

      // 3. Dispatch through Rate Limiter with retry and backoff
      const requestPayload = {
        keywords: query,
        itemCount: Math.min(options.itemCount || 10, 20),
        resources: [
          "itemInfo.title",
          "itemInfo.byLineInfo",
          "itemInfo.classifications",
          "itemInfo.features",
          "images.primary.large",
          "offersV2.listings.price",
          "offersV2.listings.availability",
          "offersV2.listings.condition",
          "offersV2.listings.merchantInfo",
        ],
        ...(options.category ? { searchIndex: options.category } : {}),
        ...(options.minPrice ? { minPrice: Math.round(options.minPrice * 100) } : {}),
        ...(options.maxPrice ? { maxPrice: Math.round(options.maxPrice * 100) } : {}),
        ...(options.sortBy ? { sortBy: options.sortBy } : {}),
      };

      const response = await this.rateLimiter.execute(async () => {
        const res = await this.httpExecutor(`${this.API_BASE}/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-marketplace": marketplace,
            "x-partner-tag": process.env.AMAZON_PARTNER_TAG || "default-tag-20",
            ...(process.env.AMAZON_CREATORS_CREDENTIAL_VERSION
              ? { "x-credential-version": process.env.AMAZON_CREATORS_CREDENTIAL_VERSION }
              : {}),
          },
          body: JSON.stringify(requestPayload),
        });

        if (res.status === 401) {
          this.tokenManager.invalidateToken("Received 401 from Amazon Creators API");
          const err: any = new Error("Amazon Creators API: 401 Unauthorized token");
          err.status = 401;
          throw err;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err: any = new Error(`Amazon Creators API HTTP ${res.status}: ${text.slice(0, 300)}`);
          err.status = res.status;
          throw err;
        }

        return res;
      }, `AmazonSearch_${query}`);

      const rawData = await response.json();
      const normalized = this.normalizeProductsResponse(rawData, marketplace);

      // Cache catalog items for 24 hours (86400000 ms)
      this.cache.set(
        "amazon-creators",
        cacheKey,
        marketplace,
        normalized,
        24 * 60 * 60 * 1000
      );

      return normalized;
    });
  }

  /**
   * Retrieves specific products by ASINs using Creators API
   */
  public async getProducts(
    asins: string[],
    options: AmazonGetProductOptions = {}
  ): Promise<NormalizedAmazonProduct[]> {
    const marketplace = process.env.AMAZON_MARKETPLACE || "US";
    const cacheKey = `products:${asins.sort().join(",")}`;
    const cached = this.cache.get<NormalizedAmazonProduct[]>(
      this.cache.generateKey("amazon-creators", marketplace, cacheKey)
    );

    if (cached) {
      return cached.response;
    }

    return this.cache.deduplicate(`amazon-creators:${marketplace}:${cacheKey}`, async () => {
      if (!this.tokenManager.hasCredentials()) {
        const error: any = new Error(
          "Amazon Creators API credentials not configured in environment."
        );
        error.capability = "not_configured";
        error.status = 503;
        throw error;
      }

      const token = await this.tokenManager.getAccessToken();

      const requestPayload = {
        itemIds: asins,
        resources: options.resources || [
          "itemInfo.title",
          "itemInfo.byLineInfo",
          "itemInfo.classifications",
          "itemInfo.features",
          "images.primary.large",
          "offersV2.listings.price",
          "offersV2.listings.availability",
          "offersV2.listings.condition",
          "offersV2.listings.merchantInfo",
        ],
      };

      const response = await this.rateLimiter.execute(async () => {
        const res = await this.httpExecutor(`${this.API_BASE}/products`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-marketplace": marketplace,
            "x-partner-tag": process.env.AMAZON_PARTNER_TAG || "default-tag-20",
            ...(process.env.AMAZON_CREATORS_CREDENTIAL_VERSION
              ? { "x-credential-version": process.env.AMAZON_CREATORS_CREDENTIAL_VERSION }
              : {}),
          },
          body: JSON.stringify(requestPayload),
        });

        if (res.status === 401) {
          this.tokenManager.invalidateToken("401 from Amazon getProducts");
          const err: any = new Error("Amazon Creators API: 401 Unauthorized");
          err.status = 401;
          throw err;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err: any = new Error(`Amazon Creators API HTTP ${res.status}: ${text.slice(0, 300)}`);
          err.status = res.status;
          throw err;
        }

        return res;
      }, `AmazonGetProducts_${asins.join(",")}`);

      const rawData = await response.json();
      const normalized = this.normalizeProductsResponse(rawData, marketplace);

      // Cache product specs for 24 hours
      this.cache.set(
        "amazon-creators",
        cacheKey,
        marketplace,
        normalized,
        24 * 60 * 60 * 1000
      );

      return normalized;
    });
  }

  /**
   * Retrieves offers and buy box pricing for specific ASINs via OffersV2
   */
  public async getOffers(asins: string[]): Promise<NormalizedAmazonOffer[]> {
    const products = await this.getProducts(asins, {
      resources: [
        "offersV2.listings.price",
        "offersV2.listings.availability",
        "offersV2.listings.condition",
        "offersV2.listings.merchantInfo",
      ],
    });

    const allOffers: NormalizedAmazonOffer[] = [];
    for (const p of products) {
      allOffers.push(...p.offersV2);
    }
    return allOffers;
  }

  /**
   * Normalization helper: Converts raw Amazon Creators API payload into NormalizedAmazonProduct
   */
  public normalizeProductsResponse(rawData: any, marketplace: string): NormalizedAmazonProduct[] {
    const items = rawData?.itemsResult?.items || rawData?.items || [];
    const normalized: NormalizedAmazonProduct[] = [];
    const now = Date.now();

    for (const item of items) {
      const asin = item.asin || item.itemId || "";
      if (!asin) continue;

      const title = item.itemInfo?.title?.displayValue || item.title || "";
      const brand = item.itemInfo?.byLineInfo?.brand?.displayValue || item.brand || "Unbranded";
      const category = item.itemInfo?.classifications?.binding?.displayValue || item.category || "General Merchandise";
      const image = item.images?.primary?.large?.url || item.imageUrl || "";
      const features = item.itemInfo?.features?.displayValues || [];

      // OffersV2 extraction
      const rawOffers = item.offersV2?.listings || item.offers?.listings || [];
      const offersV2: NormalizedAmazonOffer[] = [];

      for (const off of rawOffers) {
        const price = off.price?.amount || off.price?.value || 0;
        const currency = off.price?.currency || "USD";
        const condition = off.condition?.value || off.condition || "New";
        const availability = off.availability?.type || "In Stock";
        const merchantName = off.merchantInfo?.name || "Third Party Seller";
        const isAmazonDirect = off.merchantInfo?.isAmazon || merchantName.toLowerCase().includes("amazon.com");

        // FBA Fee estimation model based on standard tier
        const fbaPickPack = Number((3.5 + Math.min(price * 0.04, 5.5)).toFixed(2));
        const referralFee = Number((price * 0.15).toFixed(2));

        offersV2.push({
          price,
          currency,
          condition,
          availability,
          isBuyBoxWinner: off.isBuyBoxWinner ?? true,
          fbaFeeEstimated: fbaPickPack,
          referralFeeEstimated: referralFee,
          merchantName,
          isAmazonDirect,
        });
      }

      const buyBoxPrice = offersV2[0]?.price;

      normalized.push({
        asin,
        title,
        brand,
        category,
        image,
        features,
        offersV2,
        buyBoxPrice,
        marketplace,
        detailPageUrl: item.detailPageUrl || `https://www.amazon.com/dp/${asin}`,
        retrievalTimestamp: now,
        provenance: "confirmed_marketplace_api",
      });
    }

    return normalized;
  }
}

// Singleton instance
export const amazonProvider = new AmazonCreatorsProvider();

/**
 * Centralized Marketplace Cache & In-Flight Request Deduplicator
 * Conforms to API terms and structured entry requirements.
 */

import { MarketplaceCacheEntry } from "./types";

export class MarketplaceCache {
  private store = new Map<string, MarketplaceCacheEntry<any>>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private stats = {
    hits: 0,
    misses: 0,
  };

  /**
   * Generates a deterministic cache key
   */
  public generateKey(provider: string, marketplace: string, endpointOrQuery: string): string {
    return `${provider}:${marketplace}:${endpointOrQuery.trim().toLowerCase()}`;
  }

  /**
   * Retrieve cached data if valid and not expired
   */
  public get<T>(key: string): MarketplaceCacheEntry<T> | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expirationTimestamp) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry as MarketplaceCacheEntry<T>;
  }

  /**
   * Store data with structured metadata
   */
  public set<T>(
    provider: string,
    requestKey: string,
    marketplace: string,
    response: T,
    ttlMs: number
  ): MarketplaceCacheEntry<T> {
    // Evict oldest if store exceeds 1000 items
    if (this.store.size > 1000) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    const now = Date.now();
    const entry: MarketplaceCacheEntry<T> = {
      provider,
      requestKey,
      marketplace,
      response,
      retrievedTimestamp: now,
      expirationTimestamp: now + ttlMs,
    };

    const key = this.generateKey(provider, marketplace, requestKey);
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Deduplicates concurrent in-flight requests for the same key.
   * If a request is already running, subsequent callers await the same promise.
   */
  public async deduplicate<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const existingPromise = this.inFlightRequests.get(key);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    const promise = (async () => {
      try {
        return await fetcher();
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  /**
   * Remove an entry manually (e.g. on 401 token invalidation)
   */
  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all entries
   */
  public clear(): void {
    this.store.clear();
    this.inFlightRequests.clear();
  }

  /**
   * Get telemetry stats
   */
  public getStats() {
    return {
      size: this.store.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      inFlightCount: this.inFlightRequests.size,
    };
  }
}

// Export singleton instance
export const marketplaceCache = new MarketplaceCache();

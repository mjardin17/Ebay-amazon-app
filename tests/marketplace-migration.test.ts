/**
 * Comprehensive Test Suite for Official Marketplace API Migration
 * Tests all required scenarios:
 * 1. Amazon OAuth token acquisition
 * 2. Amazon token caching
 * 3. Amazon token expiration & proactive refresh
 * 4. Amazon 401 handling
 * 5. Amazon 403 handling
 * 6. Amazon 429 handling & exponential backoff
 * 7. Amazon product search (lowerCamelCase, x-marketplace, OffersV2)
 * 8. Amazon offer retrieval
 * 9. eBay Catalog product matching (product_summary ePID retrieval)
 * 10. eBay Browse search
 * 11. API rate limiting & in-flight request deduplication
 * 12. Cache hits & cache misses
 * 13. Unavailable/restricted capabilities (Marketplace Insights restricted status)
 */

import assert from "node:assert/strict";
import { AmazonTokenManager } from "../server/marketplace/amazonTokenManager";
import { AmazonCreatorsProvider } from "../server/marketplace/amazonProvider";
import { EbayTokenManager, EbayMarketplaceProvider } from "../server/marketplace/ebayProvider";
import { MarketplaceCache } from "../server/marketplace/cache";
import { MarketplaceRateLimiter } from "../server/marketplace/rateLimiter";
import { HybridSoldHistoryProvider } from "../server/marketplace/soldHistoryProvider";
import { MarketplaceCapabilityManager } from "../server/marketplace/capabilityManager";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING OFFICIAL MARKETPLACE API MIGRATION TESTS");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`✗ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // Set mock environment variables for testing
  process.env.AMAZON_CREATORS_CREDENTIAL_ID = "test-client-id";
  process.env.AMAZON_CREATORS_CREDENTIAL_SECRET = "test-client-secret";
  process.env.AMAZON_CREATORS_CREDENTIAL_VERSION = "2.1";
  process.env.AMAZON_PARTNER_TAG = "test-partner-20";
  process.env.AMAZON_MARKETPLACE = "US";
  process.env.EBAY_CLIENT_ID = "test-ebay-client-id";
  process.env.EBAY_CLIENT_SECRET = "test-ebay-client-secret";
  process.env.EBAY_MARKETPLACE_ID = "EBAY_US";

  // 1. Amazon OAuth token acquisition
  await test("1. Amazon OAuth Token Acquisition", async () => {
    let fetchCalls = 0;
    const tokenManager = new AmazonTokenManager(async (opts) => {
      fetchCalls++;
      assert.equal(opts.credentialId, "test-client-id");
      assert.equal(opts.credentialSecret, "test-client-secret");
      return {
        access_token: "mock-bearer-token-123",
        token_type: "Bearer",
        expires_in: 3600,
      };
    });

    const token = await tokenManager.getAccessToken();
    assert.equal(token, "mock-bearer-token-123");
    assert.equal(fetchCalls, 1);
  });

  // 2. Amazon token caching
  await test("2. Amazon Token Caching (Reuses token without refetching)", async () => {
    let fetchCalls = 0;
    const tokenManager = new AmazonTokenManager(async () => {
      fetchCalls++;
      return {
        access_token: "cached-bearer-token",
        token_type: "Bearer",
        expires_in: 3600,
      };
    });

    const token1 = await tokenManager.getAccessToken();
    const token2 = await tokenManager.getAccessToken();
    const token3 = await tokenManager.getAccessToken();

    assert.equal(token1, "cached-bearer-token");
    assert.equal(token2, "cached-bearer-token");
    assert.equal(token3, "cached-bearer-token");
    assert.equal(fetchCalls, 1, "Should only fetch token once due to in-memory caching");
  });

  // 3. Amazon token expiration & proactive refresh
  await test("3. Amazon Token Expiration (Refreshes when within 60s buffer)", async () => {
    let tokenVersion = 1;
    let fetchCalls = 0;
    const tokenManager = new AmazonTokenManager(async () => {
      fetchCalls++;
      return {
        access_token: `token-v${tokenVersion++}`,
        token_type: "Bearer",
        // Token expires in 30 seconds (less than 60s proactive refresh buffer)
        expires_in: 30,
      };
    });

    const firstToken = await tokenManager.getAccessToken();
    assert.equal(firstToken, "token-v1");

    // Next call should immediately detect that token is within expiration buffer and refresh
    const secondToken = await tokenManager.getAccessToken();
    assert.equal(secondToken, "token-v2");
    assert.equal(fetchCalls, 2);
  });

  // 4. Amazon 401 handling
  await test("4. Amazon 401 Handling (Invalidates token & records auth failure)", async () => {
    const tokenManager = new AmazonTokenManager(async () => {
      const err: any = new Error("Invalid client credentials");
      err.status = 401;
      throw err;
    });

    await assert.rejects(async () => {
      await tokenManager.getAccessToken();
    }, /Invalid client credentials/);

    const capState = tokenManager.getCapabilityState();
    assert.equal(capState.state, "authentication_failed");
    assert.match(capState.message, /401 Unauthorized/);
  });

  // 5. Amazon 403 handling
  await test("5. Amazon 403 Handling (Records restricted capability state)", async () => {
    const tokenManager = new AmazonTokenManager(async () => {
      const err: any = new Error("Creators account access restricted");
      err.status = 403;
      throw err;
    });

    await assert.rejects(async () => {
      await tokenManager.getAccessToken();
    }, /Creators account access restricted/);

    const capState = tokenManager.getCapabilityState();
    assert.equal(capState.state, "restricted");
  });

  // 6. Amazon 429 handling & retry with exponential backoff
  await test("6. Amazon 429 Handling (Retries with backoff and succeeds)", async () => {
    let attempts = 0;
    const tokenManager = new AmazonTokenManager(async () => {
      attempts++;
      if (attempts === 1) {
        const err: any = new Error("Too Many Requests");
        err.status = 429;
        throw err;
      }
      return {
        access_token: "backoff-recovered-token",
        token_type: "Bearer",
        expires_in: 3600,
      };
    });

    const token = await tokenManager.getAccessToken();
    assert.equal(token, "backoff-recovered-token");
    assert.equal(attempts, 2, "Should have retried after 429 and succeeded");
  });

  // 7. Amazon product search (Creators API lowerCamelCase & OffersV2)
  await test("7. Amazon Product Search (Creators API lowerCamelCase, x-marketplace, OffersV2)", async () => {
    const tokenManager = new AmazonTokenManager(async () => ({
      access_token: "search-valid-token",
      token_type: "Bearer",
      expires_in: 3600,
    }));
    const cache = new MarketplaceCache();
    const rateLimiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 10, maxConcurrent: 2 });

    let capturedUrl = "";
    let capturedHeaders: any = {};
    let capturedBody: any = {};

    const mockHttp = async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body as string);

      return new Response(
        JSON.stringify({
          itemsResult: {
            items: [
              {
                asin: "B08N5WRWNW",
                itemInfo: {
                  title: { displayValue: "Sony WH-1000XM4 Wireless Noise Cancelling Headphones" },
                  byLineInfo: { brand: { displayValue: "Sony" } },
                  classifications: { binding: { displayValue: "Electronics" } },
                },
                images: {
                  primary: { large: { url: "https://m.media-amazon.com/images/I/71o8Q5XJS5L.jpg" } },
                },
                offersV2: {
                  listings: [
                    {
                      price: { amount: 348.0, currency: "USD" },
                      condition: { value: "New" },
                      availability: { type: "In Stock" },
                      isBuyBoxWinner: true,
                      merchantInfo: { name: "Amazon.com", isAmazon: true },
                    },
                  ],
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const provider = new AmazonCreatorsProvider(tokenManager, cache, rateLimiter, mockHttp);
    const results = await provider.searchProducts("Sony headphones", { itemCount: 5 });

    // Verify request formatting
    assert.match(capturedUrl, /\/catalog\/v1\/search$/);
    assert.equal(capturedHeaders["Authorization"], "Bearer search-valid-token");
    assert.equal(capturedHeaders["x-marketplace"], "US");
    assert.equal(capturedBody.keywords, "Sony headphones");
    assert.equal(capturedBody.itemCount, 5);
    assert(capturedBody.resources.includes("offersV2.listings.price"));

    // Verify normalization
    assert.equal(results.length, 1);
    const prod = results[0];
    assert.equal(prod.asin, "B08N5WRWNW");
    assert.equal(prod.brand, "Sony");
    assert.equal(prod.category, "Electronics");
    assert.equal(prod.buyBoxPrice, 348.0);
    assert.equal(prod.provenance, "confirmed_marketplace_api");
    assert.equal(prod.offersV2[0].isAmazonDirect, true);
  });

  // 8. Amazon offer retrieval (OffersV2)
  await test("8. Amazon Offer Retrieval via OffersV2", async () => {
    const tokenManager = new AmazonTokenManager(async () => ({
      access_token: "offer-valid-token",
      token_type: "Bearer",
      expires_in: 3600,
    }));
    const cache = new MarketplaceCache();
    const rateLimiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 10, maxConcurrent: 2 });

    const mockHttp = async () => {
      return new Response(
        JSON.stringify({
          items: [
            {
              asin: "B00004OCL8",
              offersV2: {
                listings: [
                  {
                    price: { amount: 11.99, currency: "USD" },
                    condition: { value: "New" },
                    availability: { type: "In Stock" },
                    isBuyBoxWinner: true,
                    merchantInfo: { name: "OXO Good Grips Direct", isAmazon: false },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const provider = new AmazonCreatorsProvider(tokenManager, cache, rateLimiter, mockHttp);
    const offers = await provider.getOffers(["B00004OCL8"]);

    assert.equal(offers.length, 1);
    assert.equal(offers[0].price, 11.99);
    assert.equal(offers[0].currency, "USD");
    assert.equal(offers[0].isBuyBoxWinner, true);
    assert.equal(offers[0].isAmazonDirect, false);
    assert(offers[0].fbaFeeEstimated! > 0);
  });

  // 9. eBay Catalog API product matching (product_summary & ePID)
  await test("9. eBay Catalog API (product_summary ePID matching replaces legacy Product API)", async () => {
    const cache = new MarketplaceCache();
    const rateLimiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 10, maxConcurrent: 2 });

    let capturedUrl = "";
    let capturedHeaders: any = {};

    const mockHttp = async (url: string, opts: RequestInit) => {
      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "ebay-catalog-token", expires_in: 7200 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      capturedUrl = url;
      capturedHeaders = opts.headers;

      return new Response(
        JSON.stringify({
          productSummaries: [
            {
              epid: "EPID-2309482",
              title: "Apple iPhone 13 - 128GB - Midnight (Unlocked)",
              brand: "Apple",
              mpn: ["MLPF3LL/A"],
              gtin: ["0194252707258"],
              primaryCategory: { categoryId: "9355", categoryName: "Cell Phones & Smartphones" },
              image: { imageUrl: "https://i.ebayimg.com/images/g/iphone13.jpg" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const tokenManager = new EbayTokenManager(mockHttp);
    const provider = new EbayMarketplaceProvider(tokenManager, cache, rateLimiter, mockHttp);

    const catalogMatch = await provider.matchCatalogProduct("iPhone 13 128GB Midnight");

    assert(catalogMatch !== null);
    assert.equal(catalogMatch.epid, "EPID-2309482");
    assert.equal(catalogMatch.brand, "Apple");
    assert.equal(catalogMatch.provenance, "confirmed_marketplace_api");
    assert.match(capturedUrl, /\/commerce\/catalog\/v1_beta\/product_summary\/search/);
    assert.equal(capturedHeaders["X-EBAY-C-MARKETPLACE-ID"], "EBAY_US");
  });

  // 10. eBay Browse search
  await test("10. eBay Browse API Search (item_summary/search)", async () => {
    const cache = new MarketplaceCache();
    const rateLimiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 10, maxConcurrent: 2 });

    const mockHttp = async (url: string) => {
      if (url.includes("/identity/v1/oauth2/token")) {
        return new Response(
          JSON.stringify({ access_token: "ebay-browse-token", expires_in: 7200 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          itemSummaries: [
            {
              itemId: "v1|123456789|0",
              title: "DeWalt 20V Max Cordless Drill Driver",
              price: { value: "69.99", currency: "USD" },
              condition: "New",
              itemWebUrl: "https://www.ebay.com/itm/123456789",
              shippingOptions: [{ shippingCost: { value: "5.99" } }],
              seller: { username: "tool_distributor", feedbackPercentage: "99.4", feedbackScore: 4800 },
              buyingOptions: ["FIXED_PRICE"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const tokenManager = new EbayTokenManager(mockHttp);
    const provider = new EbayMarketplaceProvider(tokenManager, cache, rateLimiter, mockHttp);

    const items = await provider.searchBrowseItems("DeWalt 20V");
    assert.equal(items.length, 1);
    assert.equal(items[0].itemId, "v1|123456789|0");
    assert.equal(items[0].price, 69.99);
    assert.equal(items[0].shippingCost, 5.99);
    assert.equal(items[0].seller?.username, "tool_distributor");
    assert.equal(items[0].provenance, "confirmed_marketplace_api");
  });

  // 11. API Rate Limiting & In-Flight Request Deduplication
  await test("11. API Rate Limiting & In-Flight Request Deduplication", async () => {
    const cache = new MarketplaceCache();
    let counter = 0;

    // Simulate concurrent identical requests
    const fetchWorker = async () => {
      return cache.deduplicate("concurrent-key", async () => {
        counter++;
        await new Promise((res) => setTimeout(res, 50));
        return { data: "shared-result", counter };
      });
    };

    const [res1, res2, res3] = await Promise.all([
      fetchWorker(),
      fetchWorker(),
      fetchWorker(),
    ]);

    assert.equal(res1.data, "shared-result");
    assert.equal(res2.data, "shared-result");
    assert.equal(res3.data, "shared-result");
    assert.equal(counter, 1, "Concurrent in-flight requests must be deduplicated into a single call");
  });

  // 12. Cache hits & cache misses
  await test("12. Cache Hits & Cache Misses Tracking", async () => {
    const cache = new MarketplaceCache();
    const key = cache.generateKey("amazon-creators", "US", "asin:B08N5WRWNW");

    // Miss 1
    const miss1 = cache.get(key);
    assert.equal(miss1, null);

    // Set with structured metadata
    cache.set("amazon-creators", "asin:B08N5WRWNW", "US", { title: "Headphones" }, 60000);

    // Hit 1
    const hit1 = cache.get<{ title: string }>(key);
    assert(hit1 !== null);
    assert.equal(hit1.response.title, "Headphones");
    assert.equal(hit1.provider, "amazon-creators");
    assert.equal(hit1.marketplace, "US");
    assert(hit1.expirationTimestamp > Date.now());

    // Hit 2
    const hit2 = cache.get(key);
    assert(hit2 !== null);

    const stats = cache.getStats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    assert.equal(stats.size, 1);
  });

  // 13. Unavailable/restricted capabilities (Marketplace Insights restricted status)
  await test("13. Unavailable / Restricted Capabilities (Marketplace Insights does not fabricate data)", async () => {
    delete process.env.EBAY_MARKETPLACE_INSIGHTS_APPROVED;

    const mockHttp = async () => new Response(JSON.stringify({}), { status: 403 });
    const tokenManager = new EbayTokenManager(mockHttp);
    const ebayProvider = new EbayMarketplaceProvider(tokenManager);
    const soldProvider = new HybridSoldHistoryProvider(ebayProvider);

    const cap = await soldProvider.getCapabilityStatus();
    assert.equal(cap.state, "restricted");
    assert.match(cap.message, /Commercial Partner Tier approval/);

    const history = await soldProvider.getSalesHistory({ query: "Game Boy Color" });
    assert.equal(history.provenance, "estimated_inferred_ai");
    assert.equal(history.status, "restricted");
    assert.equal(history.confirmedSales, undefined, "Must NOT fabricate confirmedSales array!");
    assert(history.estimatedMetrics !== undefined);
  });

  // 14. Full Capabilities Report
  await test("14. Centralized Capability Status Layer", async () => {
    const manager = new MarketplaceCapabilityManager();
    const report = await manager.getFullReport();

    assert(report.capabilities["amazon_creators_catalog"] !== undefined);
    assert(report.capabilities["ebay_catalog_matching"] !== undefined);
    assert(report.capabilities["ebay_browse_search"] !== undefined);
    assert(report.capabilities["ebay_marketplace_insights"] !== undefined);
    assert.equal(report.capabilities["amazon_paapi_5"].state, "deprecated");
    assert.equal(report.capabilities["ebay_product_api"].state, "deprecated");
  });

  console.log("=================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});

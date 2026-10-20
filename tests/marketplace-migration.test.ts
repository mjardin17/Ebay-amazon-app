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
import {
  FirecrawlResearchProvider,
  isPrivateOrReservedIp,
  isValidGtinCheckDigit,
  validateFirecrawlApiBaseUrl,
} from "../server/marketplace/firecrawlProvider";
import {
  ArbitrageEnrichmentService,
  calculateArbitrageFinancials,
  evaluateProductMatch,
  validateArbitrageEnrichmentPayload,
  validateFirecrawlExtractPayload,
  verifyResearchApiAccessToken,
} from "../server/marketplace/arbitrageEnrichment";

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
    assert(report.capabilities["firecrawl_product_research"] !== undefined);
    assert.equal(report.capabilities["amazon_paapi_5"].state, "deprecated");
    assert.equal(report.capabilities["ebay_product_api"].state, "deprecated");
  });

  // 15. Successful Firecrawl v2 Product-Page Extraction & Provenance
  await test("15. Successful Firecrawl v2 Extraction (Specs, Identifiers, Provenance, Disclaimers)", async () => {
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token-valid";
    process.env.FIRECRAWL_ENABLED = "true";

    const cache = new MarketplaceCache();
    const limiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 10, maxConcurrent: 2 });

    let capturedUrl = "";
    let capturedAuth = "";
    let capturedPayload: any = null;

    const mockHttp = async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedAuth = (opts.headers as any)["Authorization"];
      capturedPayload = JSON.parse(opts.body as string);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            markdown: "# Sony WH-1000XM4 Wireless Headphones\nPrice: $229.99",
            json: {
              title: "Sony WH-1000XM4 Wireless Noise Cancelling Overhead Headphones",
              brand: "Sony",
              model: "WH-1000XM4/B",
              category: "Audio & Headphones",
              description: "Industry-leading noise cancellation with Dual Noise Sensor technology.",
              price: 229.99,
              currency: "USD",
              availabilityText: "In Stock",
              imageUrls: ["https://example.com/images/xm4.jpg"],
              specifications: {
                Connectivity: "Bluetooth 5.0",
                "Battery Life": "30 Hours",
                Color: "Black",
              },
              identifiers: {
                // Valid 12-digit UPC-A for Sony WH-1000XM4: 027242919419 (check digit 9)
                upc: "027242919419",
                asin: "B0863TXGM3",
                mpn: "WH1000XM4/B",
              },
            },
            metadata: {
              title: "Sony WH-1000XM4 Wireless Headphones",
              sourceURL: "https://supplier.example.com/products/sony-wh-1000xm4",
              statusCode: 200,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const fcProvider = new FirecrawlResearchProvider(cache, limiter, mockHttp);
    const result = await fcProvider.extractProductPage(
      "https://supplier.example.com/products/sony-wh-1000xm4"
    );

    assert.match(capturedUrl, /\/v2\/scrape$/);
    assert.equal(capturedAuth, "Bearer mock-unit-test-token-valid");
    assert(Array.isArray(capturedPayload.formats));
    assert.equal(result.extractionStatus, "extracted");
    assert.equal(result.provenance, "extracted_public_web_firecrawl");
    assert.equal(result.brand, "Sony");
    assert.equal(result.model, "WH-1000XM4/B");
    assert.equal(result.observedPrice, 229.99);
    assert.equal(result.identifiers.upc, "027242919419");
    assert.equal(result.identifiers.asin, "B0863TXGM3");
    assert.equal(result.identifiers.identifierConfidence, "verified_format");
    assert.equal(result.specifications["Connectivity"], "Bluetooth 5.0");
    assert(result.retrievalTimestamp > 0);
    assert.equal(result.integrity.marketplaceDisclaimers.notProofOfSoldTransaction, true);
    assert.equal(result.integrity.marketplaceDisclaimers.notProofOfLiveInventory, true);
    assert.equal(result.integrity.marketplaceDisclaimers.notProofOfSellerEligibilityOrUngating, true);
    assert.equal(result.integrity.marketplaceDisclaimers.notProofOfExactFeesOrNetProfit, true);
  });

  // 16. Firecrawl Missing Credentials & Disabled Provider Behavior
  await test("16. Firecrawl Missing Credentials & Disabled Provider Graceful Behavior", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    process.env.FIRECRAWL_ENABLED = "true";

    const fcProvider = new FirecrawlResearchProvider(new MarketplaceCache());
    const unconfiguredCap = await fcProvider.getCapabilityStatus();
    assert.equal(unconfiguredCap.state, "not_configured");

    const unconfiguredRes = await fcProvider.extractProductPage("https://example.com/item/123");
    assert.equal(unconfiguredRes.extractionStatus, "not_configured");
    assert.equal(unconfiguredRes.provenance, "extracted_public_web_firecrawl");

    // Explicitly disabled even when key exists
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    process.env.FIRECRAWL_ENABLED = "false";

    const disabledCap = await fcProvider.getCapabilityStatus();
    assert.equal(disabledCap.state, "not_configured");
    assert.match(disabledCap.message, /FIRECRAWL_ENABLED=false/);

    const disabledRes = await fcProvider.extractProductPage("https://example.com/item/123");
    assert.equal(disabledRes.extractionStatus, "disabled");

    // Restore
    process.env.FIRECRAWL_ENABLED = "true";
  });

  // 17. Firecrawl Invalid Credentials (401), Rate Limiting (429), and Inaccessible Pages (404 / Anti-Bot)
  await test("17. Firecrawl 401 Auth Failure, 429 Rate Limit Retry, 404 & Anti-Bot Handling", async () => {
    process.env.FIRECRAWL_API_KEY = "mock-secret-token-do-not-leak";
    process.env.FIRECRAWL_ENABLED = "true";

    // 401 Auth Failure (must not leak secret key in error message)
    const authFailProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2, maxRetries: 1 }),
      async () => new Response("Invalid API Key mock-secret-token-do-not-leak", { status: 401 })
    );

    const authFailRes = await authFailProvider.extractProductPage("https://example.com/product/1");
    assert.equal(authFailRes.extractionStatus, "error");
    assert(!authFailRes.statusMessage.includes("mock-secret-token-do-not-leak"), "Must never leak API key");
    const capAfter401 = await authFailProvider.getCapabilityStatus();
    assert.equal(capAfter401.state, "authentication_failed");

    // 429 Rate Limit Exhausted
    let attempts429 = 0;
    const rateLimitProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({
        maxRequestsPerSecond: 20,
        maxConcurrent: 2,
        maxRetries: 1,
        initialBackoffMs: 10,
      }),
      async () => {
        attempts429++;
        return new Response("Too Many Requests", { status: 429 });
      }
    );

    const rateLimitRes = await rateLimitProvider.extractProductPage("https://example.com/product/2");
    assert.equal(rateLimitRes.extractionStatus, "rate_limited");
    assert.equal(attempts429, 2, "Should have retried once before returning rate_limited");
    const capAfter429 = await rateLimitProvider.getCapabilityStatus();
    assert.equal(capAfter429.state, "rate_limited");

    // Anti-bot / CAPTCHA wall page (must halt and report inaccessible)
    const botWallProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "Robot Check - Enter the characters you see below to continue shopping",
              metadata: { title: "Robot Check", statusCode: 200 },
            },
          }),
          { status: 200 }
        )
    );

    const botWallRes = await botWallProvider.extractProductPage("https://example.com/product/3");
    assert.equal(botWallRes.extractionStatus, "inaccessible");
    assert.match(botWallRes.statusMessage, /anti-bot/i);
  });

  // 18. Firecrawl Timeouts and Malformed Responses
  await test("18. Firecrawl Timeouts and Malformed Responses", async () => {
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    process.env.FIRECRAWL_ENABLED = "true";

    // Timeout
    const timeoutProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({
        maxRequestsPerSecond: 20,
        maxConcurrent: 2,
        maxRetries: 0,
        timeoutMs: 40,
      }),
      async () => {
        await new Promise((r) => setTimeout(r, 150));
        return new Response("{}", { status: 200 });
      }
    );

    const timeoutRes = await timeoutProvider.extractProductPage("https://example.com/slow-product");
    assert.equal(timeoutRes.extractionStatus, "error");
    assert.match(timeoutRes.statusMessage, /timed out/i);

    // Malformed non-JSON response
    const malformedProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async () => new Response("<<<NOT_VALID_JSON>>>", { status: 200 })
    );

    const malformedRes = await malformedProvider.extractProductPage("https://example.com/bad-json");
    assert.equal(malformedRes.extractionStatus, "malformed");
  });

  // 19. Invalid, Unsupported, Private/SSRF, and Auth-Gated URL Rejection
  await test("19. Invalid, Private/SSRF, and Login/Paywall URL Rejection", async () => {
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    const fcProvider = new FirecrawlResearchProvider(new MarketplaceCache());

    const badUrls = [
      "",
      "not-a-url",
      "ftp://files.example.com/item.json",
      "javascript:alert(1)",
      "http://localhost:3000/api/health",
      "http://127.0.0.1:8080/secret",
      "http://169.254.169.254/latest/meta-data/",
      "http://192.168.1.10/admin",
      "https://user:pass@example.com/product",
      "https://www.amazon.com/ap/signin",
      "https://supplier.example.com/checkout/payment",
    ];

    for (const u of badUrls) {
      const res = await fcProvider.extractProductPage(u);
      assert.equal(
        res.extractionStatus,
        "unsupported_url",
        `Expected URL "${u}" to be rejected as unsupported_url`
      );
    }
  });

  // 20. Firecrawl Cache Hits, Concurrent Deduplication, and Staleness Detection
  await test("20. Firecrawl Cache Behavior, Deduplication & Staleness Warnings", async () => {
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    const cache = new MarketplaceCache();
    const limiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 4 });
    let networkCalls = 0;

    const fcProvider = new FirecrawlResearchProvider(cache, limiter, async () => {
      networkCalls++;
      await new Promise((r) => setTimeout(r, 25));
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            json: {
              title: "DeWalt 20V Max XR Cordless Drill",
              brand: "DeWalt",
              model: "DCD791D2",
              price: 119.0,
            },
            metadata: { statusCode: 200 },
          },
        }),
        { status: 200 }
      );
    });

    // Fire 3 concurrent requests for the same URL
    const [r1, r2, r3] = await Promise.all([
      fcProvider.extractProductPage("https://supplier.example.com/dewalt-dcd791d2"),
      fcProvider.extractProductPage("https://supplier.example.com/dewalt-dcd791d2"),
      fcProvider.extractProductPage("https://supplier.example.com/dewalt-dcd791d2"),
    ]);

    assert.equal(networkCalls, 1, "Concurrent requests must be deduplicated into 1 network call");
    assert.equal(r1.title, "DeWalt 20V Max XR Cordless Drill");
    assert.equal(r2.title, "DeWalt 20V Max XR Cordless Drill");
    assert.equal(r3.isStale, false);

    // Subsequent call with staleThresholdMs = 0 should flag cached entry as stale
    await new Promise((r) => setTimeout(r, 10));
    const staleRes = await fcProvider.extractProductPage(
      "https://supplier.example.com/dewalt-dcd791d2",
      { staleThresholdMs: 0 }
    );
    assert.equal(networkCalls, 1, "Should still serve from cache");
    assert.equal(staleRes.isStale, true);
    assert(staleRes.integrity.staleDataWarnings.length > 0);
  });

  // 21. Contradictory, Inferred, and Invalid Check-Digit Identifier Detection
  await test("21. Contradictory ASIN/Price, Inferred Fields & Invalid Barcode Check-Digit Detection", async () => {
    // Verify GTIN check-digit helper
    assert.equal(isValidGtinCheckDigit("027242919419"), true, "Valid Sony UPC-A should pass");
    assert.equal(isValidGtinCheckDigit("027242919410"), false, "Corrupted check digit must fail");
    assert.equal(isValidGtinCheckDigit("000000000000"), false, "All zeros must fail");

    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    const fcProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "# Replacement Battery\nModel: DCB206",
              json: {
                title: "20V 6.0Ah Lithium Battery",
                brand: "Generic",
                price: 29.99,
                identifiers: {
                  // Invalid UPC check digit + ASIN that contradicts URL ASIN
                  upc: "123456789011",
                  asin: "B099999999",
                },
              },
              product: {
                variants: [{ price: { amount: 54.99, currency: "USD" } }],
              },
              metadata: { statusCode: 200 },
            },
          }),
          { status: 200 }
        )
    );

    // URL has ASIN B08N5WRWNW while JSON says B099999999
    const res = await fcProvider.extractProductPage("https://www.amazon.com/dp/B08N5WRWNW");
    assert.equal(res.identifiers.identifierConfidence, "contradictory");
    assert(
      res.integrity.contradictions.some((c) => c.includes("URL ASIN (B08N5WRWNW)")),
      "Should detect URL vs JSON ASIN contradiction"
    );
    assert(
      res.integrity.contradictions.some((c) => c.includes("failed standard 12-digit UPC-A")),
      "Should detect invalid UPC check digit"
    );
    assert(
      res.integrity.contradictions.some((c) => c.includes("contradicts structured product variant price")),
      "Should detect price contradiction between JSON and product block"
    );
    assert(
      res.integrity.inferredFields.some((f) => f.includes("model")),
      "Should record model inferred from markdown"
    );
  });

  // 22. Product Matching Confidence & Uncertainty (Never Silently Treating Uncertain Matches as Verified)
  await test("22. Cross-Marketplace Product Matching Uncertainty & Contradiction Guardrails", async () => {
    // Case A: Exact GTIN + Brand + Model match -> High confidence & verified
    const exactMatch = evaluateProductMatch({
      targetChannel: "eBay",
      sourceTitle: "Sony WH-1000XM4 Wireless Noise Cancelling Headphones Black",
      sourceBrand: "Sony",
      sourceModel: "WH-1000XM4",
      sourceGtin: "027242919419",
      candidateId: "EPID-SONY-XM4",
      candidateTitle: "Sony WH-1000XM4 Wireless Noise Cancelling Headphones - Black",
      candidateBrand: "Sony",
      candidateModelOrMpn: "WH-1000XM4",
      candidateGtin: "027242919419",
    });
    assert.equal(exactMatch.matchConfidence, "high");
    assert.equal(exactMatch.isVerifiedCatalogMatch, true);

    // Case B: Title similarity only (no barcode/identifier match) -> Low confidence, NOT verified
    const fuzzyTitleOnly = evaluateProductMatch({
      targetChannel: "eBay",
      sourceTitle: "Wireless Ergonomic Split Mechanical Keyboard RGB Bluetooth",
      sourceBrand: "Generic",
      candidateId: "EPID-998877",
      candidateTitle: "Wireless Split Ergonomic Mechanical Keyboard RGB Backlit",
      candidateBrand: "Generic",
    });
    assert.equal(fuzzyTitleOnly.isVerifiedCatalogMatch, false);
    assert(
      fuzzyTitleOnly.matchConfidence === "low" || fuzzyTitleOnly.matchConfidence === "unverified"
    );
    assert(fuzzyTitleOnly.uncertaintyReasons.length > 0);

    // Case C: Multi-pack mismatch (2-Pack vs Single) -> Unverified with contradiction
    const packMismatch = evaluateProductMatch({
      targetChannel: "Amazon",
      sourceTitle: "DeWalt 20V Max 6.0Ah Battery 2-Pack",
      sourceBrand: "DeWalt",
      sourceModel: "DCB206",
      candidateId: "B01M716P6P",
      candidateTitle: "DeWalt 20V Max 6.0Ah Battery Single Pack",
      candidateBrand: "DeWalt",
      candidateModelOrMpn: "DCB206",
    });
    assert.equal(packMismatch.isVerifiedCatalogMatch, false);
    assert.equal(packMismatch.matchConfidence, "unverified");
    assert(packMismatch.contradictions.some((c) => /bundle\/quantity mismatch/i.test(c)));

    // Case D: Accessory vs Main Product trap ("Case for Sony WH-1000XM4" vs "Sony WH-1000XM4")
    const accessoryTrap = evaluateProductMatch({
      targetChannel: "eBay",
      sourceTitle: "Hard Carrying Case Compatible with Sony WH-1000XM4 Headphones",
      sourceBrand: "Generic",
      candidateId: "EPID-SONY-XM4",
      candidateTitle: "Sony WH-1000XM4 Wireless Noise Cancelling Headphones",
      candidateBrand: "Sony",
    });
    assert.equal(accessoryTrap.isVerifiedCatalogMatch, false);
    assert.equal(accessoryTrap.matchConfidence, "unverified");
    assert(accessoryTrap.contradictions.some((c) => /Accessory vs\. main product/i.test(c)));
  });

  // 23. Profit Calculations & Handling of Missing, Stale, or Unprofitable Inputs
  await test("23. Profit Calculation Logic & Missing/Stale Input Guardrails", async () => {
    // 1. Missing target resale price -> insufficient_data, NOT profitable
    const missingTarget = calculateArbitrageFinancials({
      sourceCost: 25.0,
      sourceCostProvenance: "extracted_public_web_firecrawl",
      targetEbayPrice: null,
      targetEbayPriceProvenance: "missing",
      targetAmazonPrice: null,
      targetAmazonPriceProvenance: "missing",
    });
    assert.equal(missingTarget.ebay.profitabilityStatus, "insufficient_data");
    assert.equal(missingTarget.ebay.isProfitableEstimate, false);
    assert.equal(missingTarget.ebay.isConfirmedProfit, false);
    assert.equal(missingTarget.ebay.netProfitEstimate, null);

    // 2. Negative margin -> unprofitable_estimate, NOT profitable
    const unprofitable = calculateArbitrageFinancials({
      sourceCost: 45.0,
      sourceCostProvenance: "user_supplied",
      sourceShipping: 5.0,
      targetEbayPrice: 52.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      targetAmazonPrice: 55.0,
      targetAmazonPriceProvenance: "confirmed_marketplace_api",
      outboundShippingEstimate: 6.5,
      promotedRatePct: 2.0,
    });
    assert.equal(unprofitable.ebay.profitabilityStatus, "unprofitable_estimate");
    assert.equal(unprofitable.ebay.isProfitableEstimate, false);
    assert(unprofitable.ebay.netProfitEstimate! < 0);

    // 3. Valid positive spread -> profitable_estimate (still isConfirmedProfit: false with match warnings)
    const profitable = calculateArbitrageFinancials({
      sourceCost: 20.0,
      sourceCostProvenance: "extracted_public_web_firecrawl",
      sourceShipping: 2.0,
      targetEbayPrice: 59.99,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      targetAmazonPrice: 64.99,
      targetAmazonPriceProvenance: "confirmed_marketplace_api",
      outboundShippingEstimate: 6.0,
      promotedRatePct: 2.0,
      isSourceStale: false,
      ebayMatchConfidence: "medium",
    });
    assert.equal(profitable.ebay.profitabilityStatus, "profitable_estimate");
    assert.equal(profitable.ebay.isProfitableEstimate, true);
    assert.equal(profitable.ebay.isConfirmedProfit, false);
    // Verify exact eBay math: 59.99 - (20+2) - (59.99*0.1325 + 0.30 = 8.25) - (59.99*0.02 = 1.20) - 6.0 = 22.54
    assert.equal(profitable.ebay.marketplaceFee, 8.25);
    assert.equal(profitable.ebay.promotedOrPlacementFee, 1.2);
    assert.equal(profitable.ebay.netProfitEstimate, 22.54);
    assert(profitable.ebay.warnings.some((w) => /match confidence/i.test(w)));
  });

  // 24. End-to-End ArbitrageEnrichmentService Coordination (Firecrawl + Amazon + eBay)
  await test("24. End-to-End ArbitrageEnrichmentService Coordination & Fallback When Disabled", async () => {
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    process.env.FIRECRAWL_ENABLED = "true";
    process.env.AMAZON_CREATORS_CREDENTIAL_ID = "test-amz-id";
    process.env.AMAZON_CREATORS_CREDENTIAL_SECRET = "test-amz-secret";
    process.env.EBAY_CLIENT_ID = "test-ebay-id";
    process.env.EBAY_CLIENT_SECRET = "test-ebay-secret";

    const cache = new MarketplaceCache();
    const limiter = new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 4 });

    const fcProvider = new FirecrawlResearchProvider(cache, limiter, async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            json: {
              title: "Apple AirPods Pro 2nd Generation USB-C",
              brand: "Apple",
              model: "MTJV3AM/A",
              price: 139.0,
              identifiers: {
                // Valid 12-digit UPC-A for Apple: 195949052491 (check digit: 1)
                upc: "195949052491",
                mpn: "MTJV3AM/A",
              },
            },
            metadata: { statusCode: 200 },
          },
        }),
        { status: 200 }
      )
    );

    const amzTokenMgr = new AmazonTokenManager(async () => ({
      access_token: "amz-tok",
      token_type: "Bearer",
      expires_in: 3600,
    }));
    const amzProvider = new AmazonCreatorsProvider(amzTokenMgr, cache, limiter, async () =>
      new Response(
        JSON.stringify({
          itemsResult: {
            items: [
              {
                asin: "B0CHWRXH8B",
                itemInfo: {
                  title: { displayValue: "Apple AirPods Pro (2nd Generation) with MagSafe Case (USB-C)" },
                  byLineInfo: { brand: { displayValue: "Apple" } },
                },
                offersV2: {
                  listings: [{ price: { amount: 229.0, currency: "USD" } }],
                },
              },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const ebayMockHttp = async (url: string) => {
      if (url.includes("/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "ebay-tok", expires_in: 7200 }), {
          status: 200,
        });
      }
      if (url.includes("/product_summary/search")) {
        return new Response(
          JSON.stringify({
            productSummaries: [
              {
                epid: "EPID-AIRPODS-PRO2",
                title: "Apple AirPods Pro (2nd Generation) MagSafe Case USB-C MTJV3AM/A",
                brand: "Apple",
                mpn: ["MTJV3AM/A"],
                gtin: ["195949052491"],
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          itemSummaries: [
            {
              itemId: "v1|999|0",
              title: "Apple AirPods Pro 2nd Gen USB-C Sealed",
              price: { value: "205.00", currency: "USD" },
              shippingOptions: [{ shippingCost: { value: "0.00" } }],
            },
          ],
        }),
        { status: 200 }
      );
    };

    const ebayTokMgr = new EbayTokenManager(ebayMockHttp);
    const ebayProv = new EbayMarketplaceProvider(ebayTokMgr, cache, limiter, ebayMockHttp);
    const soldProv = new HybridSoldHistoryProvider(ebayProv, cache);

    const enrichmentService = new ArbitrageEnrichmentService(
      fcProvider,
      amzProvider,
      ebayProv,
      soldProv
    );

    const report = await enrichmentService.enrichArbitrageOpportunity({
      sourceUrl: "https://clearance.example.com/airpods-pro-2",
    });

    assert(report.firecrawlResearch !== null);
    assert.equal(report.firecrawlResearch.provenance, "extracted_public_web_firecrawl");
    assert.equal(
      report.marketplaceData.ebayCatalog.matchAssessment.isVerifiedCatalogMatch,
      true,
      "Exact GTIN match with eBay Catalog should mark isVerifiedCatalogMatch=true"
    );
    assert.equal(
      report.marketplaceData.amazon.matchAssessment.isVerifiedCatalogMatch,
      false,
      "Amazon search without GTIN/ASIN match must remain unverified"
    );
    assert.equal(
      report.financialEstimates.ebay.sourceCostProvenance,
      "extracted_public_web_firecrawl"
    );
    assert.equal(report.financialEstimates.ebay.isProfitableEstimate, true);
    assert.equal(report.financialEstimates.ebay.isConfirmedProfit, false);
  });

  // 25. SSRF Hardening: IPv4/IPv6 CIDR Ranges, Integer/Hex/Octal IPs, Wildcard DNS, Ports, & DNS Rebinding
  await test("25. SSRF Hardening: IPv6, Mapped IPv6, CGNAT, Integer/Octal/Hex IPs, Wildcard DNS & DNS Rebinding", async () => {
    // Direct IP checks
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("10.255.0.1"), true);
    assert.equal(isPrivateOrReservedIp("172.16.5.4"), true);
    assert.equal(isPrivateOrReservedIp("192.168.1.100"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("100.64.10.20"), true, "CGNAT 100.64.0.0/10 must be blocked");
    assert.equal(isPrivateOrReservedIp("198.18.0.5"), true, "Benchmarking 198.18.0.0/15 must be blocked");
    assert.equal(isPrivateOrReservedIp("::1"), true, "IPv6 loopback must be blocked");
    assert.equal(isPrivateOrReservedIp("fe80::1"), true, "IPv6 link-local must be blocked");
    assert.equal(isPrivateOrReservedIp("fc00::1234"), true, "IPv6 unique-local must be blocked");
    assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true, "IPv4-mapped IPv6 loopback must be blocked");
    assert.equal(isPrivateOrReservedIp("::ffff:169.254.169.254"), true, "IPv4-mapped IPv6 metadata IP must be blocked");
    assert.equal(isPrivateOrReservedIp("93.184.216.34"), false, "Public IP must be allowed");

    const provider = new FirecrawlResearchProvider();

    // Integer, hex, octal, wildcard DNS, and non-standard port URLs must be rejected
    assert.equal(provider.validatePublicProductUrl("http://2130706433/item").valid, false, "Decimal integer IP must be blocked");
    assert.equal(provider.validatePublicProductUrl("http://0x7f000001/item").valid, false, "Hex IP must be blocked");
    assert.equal(provider.validatePublicProductUrl("http://0177.0.0.1/item").valid, false, "Octal IP must be blocked");
    assert.equal(provider.validatePublicProductUrl("http://127.0.0.1.nip.io/item").valid, false, "Wildcard DNS nip.io must be blocked");
    assert.equal(provider.validatePublicProductUrl("http://169-254-169-254.sslip.io/item").valid, false, "Wildcard DNS sslip.io must be blocked");
    assert.equal(provider.validatePublicProductUrl("https://shop.example.com:8443/item").valid, false, "Non-standard port 8443 must be blocked");

    // DNS rebinding check: domain looks public syntactically but resolves to 169.254.169.254
    process.env.FIRECRAWL_API_KEY = "mock-unit-test-token";
    process.env.FIRECRAWL_ENABLED = "true";
    let httpCalled = false;
    const rebindingProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async () => {
        httpCalled = true;
        return new Response("{}", { status: 200 });
      },
      async () => [{ address: "169.254.169.254", family: 4 }]
    );

    const rebindRes = await rebindingProvider.extractProductPage("https://rebind-attacker.com/product/123");
    assert.equal(rebindRes.extractionStatus, "unsupported_url");
    assert.equal(httpCalled, false, "Must never call Firecrawl API when target hostname resolves to private/metadata IP");
    assert.match(rebindRes.statusMessage, /private or reserved IP/i);

    // Post-scrape redirect check: if target page redirected to internal IP/host in metadata.url, reject it
    const redirectTargetProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "Internal admin panel",
              metadata: {
                url: "http://169.254.169.254/latest/meta-data/",
                statusCode: 200,
              },
            },
          }),
          { status: 200 }
        ),
      async () => [{ address: "93.184.216.34", family: 4 }]
    );

    const postRedirectRes = await redirectTargetProvider.extractProductPage(
      "https://public-store.example.com/item/1"
    );
    assert.equal(postRedirectRes.extractionStatus, "inaccessible");
    assert.match(postRedirectRes.statusMessage, /redirected to a disallowed/i);
  });

  // 26. Firecrawl API Base URL Allowlist & 3xx Redirect Credential Protection
  await test("26. Firecrawl API Base URL Validation & 3xx Redirect Credential Protection", async () => {
    const origBase = process.env.FIRECRAWL_API_BASE_URL;
    const origAllowed = process.env.FIRECRAWL_ALLOWED_API_HOSTS;

    // Default https://api.firecrawl.dev/v2 is valid
    delete process.env.FIRECRAWL_API_BASE_URL;
    delete process.env.FIRECRAWL_ALLOWED_API_HOSTS;
    assert.equal(validateFirecrawlApiBaseUrl().valid, true);

    // Untrusted host must be rejected so FIRECRAWL_API_KEY cannot be exfiltrated
    assert.equal(
      validateFirecrawlApiBaseUrl("https://evil-exfil.example.com/v2").valid,
      false,
      "Untrusted Firecrawl API host must be blocked"
    );
    // Plain HTTP must be rejected
    assert.equal(
      validateFirecrawlApiBaseUrl("http://api.firecrawl.dev/v2").valid,
      false,
      "Non-HTTPS Firecrawl API URL must be blocked"
    );
    // Custom port must be rejected
    assert.equal(
      validateFirecrawlApiBaseUrl("https://api.firecrawl.dev:8443/v2").valid,
      false,
      "Non-443 port on Firecrawl API URL must be blocked"
    );

    // Verify extractProductPage refuses to send Authorization header if FIRECRAWL_API_BASE_URL is untrusted
    process.env.FIRECRAWL_API_KEY = "mock-super-secret-token";
    process.env.FIRECRAWL_API_BASE_URL = "https://attacker-collector.example.com/v2";
    let leakedAuthHeader: string | null = null;

    const untrustedBaseProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async (_url, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        leakedAuthHeader = headers?.["Authorization"] || null;
        return new Response("{}", { status: 200 });
      }
    );

    const untrustedRes = await untrustedBaseProvider.extractProductPage("https://example.com/product/99");
    assert.equal(untrustedRes.extractionStatus, "error");
    assert.equal(leakedAuthHeader, null, "Must NEVER send Authorization header to untrusted base URL");

    // Restore valid base URL and verify 3xx redirect response is blocked with redirect: "manual"
    process.env.FIRECRAWL_API_BASE_URL = "https://api.firecrawl.dev/v2";
    let capturedRedirectMode: string | undefined;
    const redirectApiProvider = new FirecrawlResearchProvider(
      new MarketplaceCache(),
      new MarketplaceRateLimiter({ maxRequestsPerSecond: 20, maxConcurrent: 2 }),
      async (_url, init) => {
        capturedRedirectMode = init?.redirect;
        return new Response("", {
          status: 302,
          headers: { Location: "https://evil.example.com/capture" },
        });
      }
    );

    const redirectApiRes = await redirectApiProvider.extractProductPage("https://example.com/product/100");
    assert.equal(capturedRedirectMode, "manual", "Fetch must use redirect: 'manual'");
    assert.equal(redirectApiRes.extractionStatus, "inaccessible");
    assert.match(redirectApiRes.statusMessage, /redirect/i);

    if (origBase !== undefined) process.env.FIRECRAWL_API_BASE_URL = origBase;
    else delete process.env.FIRECRAWL_API_BASE_URL;
    if (origAllowed !== undefined) process.env.FIRECRAWL_ALLOWED_API_HOSTS = origAllowed;
    else delete process.env.FIRECRAWL_ALLOWED_API_HOSTS;
  });

  // 27. API Route Authentication & Input Validation Guardrails
  await test("27. API Route Authentication & Input Validation Guardrails", async () => {
    const origToken = process.env.RESEARCH_API_ACCESS_TOKEN;

    // 1. Optional Token Auth
    delete process.env.RESEARCH_API_ACCESS_TOKEN;
    assert.equal(verifyResearchApiAccessToken({}).authorized, true, "Unset token allows local UI requests");

    process.env.RESEARCH_API_ACCESS_TOKEN = "sec-research-token-999";
    assert.equal(verifyResearchApiAccessToken({}).authorized, false, "Missing token when configured must fail");
    assert.equal(
      verifyResearchApiAccessToken({ "x-research-access-token": "wrong-token" }).authorized,
      false,
      "Wrong token must fail"
    );
    assert.equal(
      verifyResearchApiAccessToken({ "x-research-access-token": "sec-research-token-999" }).authorized,
      true,
      "Matching x-research-access-token must succeed"
    );
    assert.equal(
      verifyResearchApiAccessToken({ authorization: "Bearer sec-research-token-999" }).authorized,
      true,
      "Matching Bearer token must succeed"
    );

    if (origToken !== undefined) process.env.RESEARCH_API_ACCESS_TOKEN = origToken;
    else delete process.env.RESEARCH_API_ACCESS_TOKEN;

    // 2. Firecrawl Extract Payload Validation
    assert.equal(validateFirecrawlExtractPayload(null).valid, false);
    assert.equal(validateFirecrawlExtractPayload([]).valid, false);
    assert.equal(validateFirecrawlExtractPayload({ url: 12345 }).valid, false);
    assert.equal(validateFirecrawlExtractPayload({ url: "https://example.com/p", forceRefresh: "yes" }).valid, false);
    assert.equal(validateFirecrawlExtractPayload({ url: "https://example.com/p", forceRefresh: true }).valid, true);

    // 3. Arbitrage Enrichment Payload Validation
    assert.equal(validateArbitrageEnrichmentPayload({}).valid, false, "Empty object must fail");
    assert.equal(
      validateArbitrageEnrichmentPayload({ productQuery: { $ne: "" } }).valid,
      false,
      "Non-string injection object in productQuery must be rejected"
    );
    assert.equal(
      validateArbitrageEnrichmentPayload({ productQuery: "Sony XM5", sourceCost: -15 }).valid,
      false,
      "Negative sourceCost must be rejected"
    );
    assert.equal(
      validateArbitrageEnrichmentPayload({ productQuery: "Sony XM5", promotedRatePct: 95 }).valid,
      false,
      "Excessive promotedRatePct > 50% must be rejected"
    );
    assert.equal(
      validateArbitrageEnrichmentPayload({ productQuery: "Sony XM5", sourceTaxRatePct: 120 }).valid,
      false,
      "Tax rate > 100% must be rejected"
    );
    const validEnrichPayload = validateArbitrageEnrichmentPayload({
      productQuery: "  Sony WH-1000XM5  ",
      sourceCost: 180,
      sourceShipping: 5,
      sourceTaxRatePct: 7.5,
      promotedRatePct: 2,
    });
    assert.equal(validEnrichPayload.valid, true);
    assert.equal(validEnrichPayload.sanitized?.productQuery, "Sony WH-1000XM5");
    assert.equal(validEnrichPayload.sanitized?.sourceTaxRatePct, 7.5);
  });

  // 28. Financial Waterfall Edge Cases: Currency Mismatch, Taxes, Missing Shipping/Fees, Stale & Unverified Prices
  await test("28. Financial Calculations: Currency Mismatch, Taxes, Missing Fees/Shipping, and Stale/Unverified Guardrails", async () => {
    // Case A: Currency mismatch (GBP source cost vs USD target eBay price) -> must block profit calculation
    const currencyMismatchCalc = calculateArbitrageFinancials({
      sourceCost: 85.0,
      sourceCostProvenance: "extracted_public_web_firecrawl",
      sourceCurrency: "GBP",
      targetEbayPrice: 160.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      targetEbayCurrency: "USD",
    });
    assert.equal(currencyMismatchCalc.ebay.currencyMismatch, true);
    assert.equal(currencyMismatchCalc.ebay.profitabilityStatus, "insufficient_data");
    assert.equal(currencyMismatchCalc.ebay.isProfitableEstimate, false);
    assert.equal(currencyMismatchCalc.ebay.netProfitEstimate, null);
    assert(currencyMismatchCalc.ebay.warnings.some((w) => /currency mismatch/i.test(w)));

    // Case B: Sourcing sales tax calculation (8% tax on $100 cost + $10 inbound shipping = $8.80 tax)
    const taxCalc = calculateArbitrageFinancials({
      sourceCost: 100.0,
      sourceCostProvenance: "user_supplied",
      sourceShipping: 10.0,
      sourceTaxRatePct: 8.0,
      targetEbayPrice: 180.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      outboundShippingEstimate: 10.0,
      promotedRatePct: 2.0,
      ebayMatchConfidence: "high",
    });
    assert.equal(taxCalc.ebay.estimatedSourceTax, 8.8);
    // eBay FVF = 180 * 0.1325 + 0.30 = 24.15; Promoted = 180 * 0.02 = 3.60; Outbound = 10.00; Landed = 100 + 10 + 8.80 = 118.80
    // Net = 180 - 118.80 - 24.15 - 3.60 - 10.00 = 23.45
    assert.equal(taxCalc.ebay.netProfitEstimate, 23.45);
    assert.equal(taxCalc.ebay.profitabilityStatus, "profitable_estimate");

    // Case C: Explicitly missing outbound shipping (null) or missing fee schedule (null) -> insufficient_data
    const missingShippingCalc = calculateArbitrageFinancials({
      sourceCost: 40.0,
      sourceCostProvenance: "user_supplied",
      targetEbayPrice: 100.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      outboundShippingEstimate: null,
    });
    assert.equal(missingShippingCalc.ebay.profitabilityStatus, "insufficient_data");
    assert.equal(missingShippingCalc.ebay.isProfitableEstimate, false);
    assert.equal(missingShippingCalc.ebay.netProfitEstimate, null);

    const missingFeeCalc = calculateArbitrageFinancials({
      sourceCost: 40.0,
      sourceCostProvenance: "user_supplied",
      targetEbayPrice: 100.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      ebayFeeRatePct: null,
    });
    assert.equal(missingFeeCalc.ebay.profitabilityStatus, "insufficient_data");
    assert.equal(missingFeeCalc.ebay.isProfitableEstimate, false);
    assert.equal(missingFeeCalc.ebay.netProfitEstimate, null);

    // Case D: Stale scraped source price -> must NOT be marked profitable_estimate
    const staleCalc = calculateArbitrageFinancials({
      sourceCost: 40.0,
      sourceCostProvenance: "extracted_public_web_firecrawl",
      targetEbayPrice: 110.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      isSourceStale: true,
      ebayMatchConfidence: "high",
    });
    assert.equal(staleCalc.ebay.profitabilityStatus, "insufficient_data");
    assert.equal(staleCalc.ebay.isProfitableEstimate, false, "Stale scraped price must never be flagged profitable");

    // Case E: Contradictory/unverified catalog match -> must NOT be marked profitable_estimate
    const unverifiedMatchCalc = calculateArbitrageFinancials({
      sourceCost: 40.0,
      sourceCostProvenance: "user_supplied",
      targetEbayPrice: 110.0,
      targetEbayPriceProvenance: "confirmed_marketplace_api",
      ebayMatchConfidence: "unverified",
    });
    assert.equal(unverifiedMatchCalc.ebay.profitabilityStatus, "insufficient_data");
    assert.equal(
      unverifiedMatchCalc.ebay.isProfitableEstimate,
      false,
      "Unverified/contradictory catalog match must not be marked profitable without manual price override"
    );
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

# Listofa AI — Reseller & Arbitrage Suite

AI reseller suite with eBay/Amazon listings, Boxem auto-ungating, arbitrage research,
and a Pinterest marketing studio.

**This repository is the single source of truth for the product-research "scraper."**
If a scraper is being built somewhere else, it is being built in the wrong place —
everything below already lives here.

---

## The scraper (product research) — what exists today

The scraping/research layer lives in `server/marketplace/` and is reached through
these HTTP routes (all server-side; **no credentials ever reach the browser**):

| Route | Module | What it does |
| --- | --- | --- |
| `POST /api/research/firecrawl/extract` | `firecrawlProvider.ts` | Extracts a **public** product page via Firecrawl v2 `/scrape` (price, title, specs, GTIN/MPN/ASIN evidence). |
| `POST /api/research/arbitrage-enrich` | `arbitrageEnrichment.ts` | Cross-marketplace matching + profit audit: joins Firecrawl page data with Amazon/eBay API data, filters comparable listings, and computes guarded profit estimates. |
| `GET /api/marketplace/capabilities` | `capabilityManager.ts` | Reports live state of every provider (`available` / `restricted` / `not_configured` / `deprecated` / …). |
| `POST /api/marketplace/sold-history` | `soldHistoryProvider.ts` | Confirmed eBay sold history via Marketplace Insights, or an explicitly-labelled estimate. |
| `POST /api/ebay/browse-search`, `POST /api/ebay/catalog-match` | `ebayProvider.ts` | Official eBay Browse + Catalog APIs. |
| `POST /api/amazon/search`, `POST /api/amazon/get-products` | `amazonProvider.ts` | Official Amazon Creators API (OffersV2). |

Supporting modules: `cache.ts` (TTL cache + in-flight dedup), `rateLimiter.ts`
(per-provider throttling with backoff), `amazonTokenManager.ts` (OAuth).

### Important design rules baked into the code

These are deliberate and covered by tests — do not "simplify" them away:

- **No fabricated data.** Missing credentials return `not_configured`; restricted
  access returns `restricted`. The app never invents prices or sold comps.
- **Provenance is explicit.** Every payload is tagged `confirmed_marketplace_api`,
  `extracted_public_web_firecrawl`, or `estimated_inferred_ai`.
- **Firecrawl is supplementary only.** A scraped page is *never* treated as proof of
  completed sales, live inventory, or ungating eligibility.
- **SSRF hardening.** Firecrawl URLs are validated against private/loopback/CGNAT/
  reserved ranges, IPv4-mapped IPv6, integer/octal/hex IPs, and DNS-rebinding hosts;
  the API base URL is pinned to `api.firecrawl.dev` with `redirect: "manual"` so the
  bearer token can't leak to another host.
- **Credential honesty.** `getCapabilityStatus()` checks for real, non-whitespace
  credentials before reporting `available`.

### Frontend

`src/components/CrossMarketResearchPanel.tsx` and `ArbitrageResearchAgent.tsx`
surface the research results. They call the relative `/api/research/*` routes —
never an absolute localhost URL.

---

## Running it

```bash
npm install
cp .env.example .env    # then fill in the keys you have
npm run dev             # http://localhost:3000
```

Other scripts:

```bash
npm test        # 42 marketplace + research integration tests
npm run lint    # tsc --noEmit
npm run build   # vite build + bundled server -> dist/
npm start       # run the built server
```

## Configuration

Everything is optional — the app runs and degrades honestly without any keys.
See `.env.example` for the full annotated list.

| Feature | Variables |
| --- | --- |
| Firecrawl page extraction | `FIRECRAWL_API_KEY`, `FIRECRAWL_ENABLED`, `FIRECRAWL_API_BASE_URL`, `FIRECRAWL_ALLOWED_API_HOSTS`, `FIRECRAWL_TIMEOUT_MS`, `FIRECRAWL_CACHE_TTL_MS` |
| eBay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENVIRONMENT`, `EBAY_MARKETPLACE_ID`, `EBAY_MARKETPLACE_INSIGHTS_APPROVED` |
| Amazon Creators API | `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`, `AMAZON_CREATORS_CREDENTIAL_VERSION`, `AMAZON_PARTNER_TAG`, `AMAZON_MARKETPLACE` |
| AI estimation | `GEMINI_API_KEY` |
| Route hardening | `RESEARCH_API_ACCESS_TOKEN` (optional bearer/`x-research-access-token` gate on `/api/research/*`) |

Notes on access reality:

- **eBay Marketplace Insights** (confirmed sold comps) requires eBay *commercial
  partner tier* approval. Without it, sold data is labelled as an AI estimate.
- **Amazon Creators API** requires approved Associates/influencer credentials.
- `FIRECRAWL_ENABLED="false"` disables scraping entirely even with a key present.

## Repository layout

```
server.ts                      Express server + API routes
server/marketplace/
  firecrawlProvider.ts         Public page extraction (the scraper)
  arbitrageEnrichment.ts       Cross-market matching + profit audit
  amazonProvider.ts            Amazon Creators API
  ebayProvider.ts              eBay Catalog + Browse APIs
  soldHistoryProvider.ts       Sold-comps / Marketplace Insights
  amazonTokenManager.ts        OAuth tokens
  cache.ts / rateLimiter.ts    Caching, dedup, throttling
  capabilityManager.ts         Provider status reporting
  types.ts                     Shared normalized types
src/components/                React UI
tests/marketplace-migration.test.ts   42 integration tests
```

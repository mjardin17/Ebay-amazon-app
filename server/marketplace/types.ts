/**
 * Normalized Marketplace Types for Amazon Creators API & eBay Catalog / Browse APIs
 * Adheres strictly to official API schemas and internal application abstractions.
 */

export type CapabilityState =
  | "available"
  | "restricted"
  | "not_configured"
  | "deprecated"
  | "rate_limited"
  | "authentication_failed";

export type DataProvenance =
  | "confirmed_marketplace_api"
  | "extracted_public_web_firecrawl"
  | "estimated_inferred_ai";

export interface CapabilityInfo {
  id: string;
  name: string;
  provider:
    | "amazon-creators"
    | "ebay-catalog"
    | "ebay-browse"
    | "ebay-insights"
    | "resale-ai"
    | "firecrawl-research";
  state: CapabilityState;
  message: string;
  lastChecked: number;
  documentationUrl?: string;
  requiredCredentials: string[];
}

export interface MarketplaceCapabilitiesReport {
  timestamp: number;
  capabilities: Record<string, CapabilityInfo>;
}

/** Normalized Amazon Types (from Creators API) */
export interface NormalizedAmazonOffer {
  price: number;
  currency: string;
  condition: string;
  availability: string;
  isBuyBoxWinner: boolean;
  fbaFeeEstimated?: number;
  referralFeeEstimated?: number;
  merchantName?: string;
  isAmazonDirect: boolean;
}

export interface NormalizedAmazonProduct {
  asin: string;
  title: string;
  brand: string;
  category: string;
  image?: string;
  images?: string[];
  features?: string[];
  offersV2: NormalizedAmazonOffer[];
  buyBoxPrice?: number;
  marketplace: string;
  detailPageUrl?: string;
  retrievalTimestamp: number;
  provenance: DataProvenance;
}

export interface AmazonSearchOptions {
  itemCount?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "Featured" | "PriceLowToHigh" | "PriceHighToLow" | "NewestArrivals";
}

export interface AmazonGetProductOptions {
  resources?: string[];
}

/** Normalized eBay Types (from Catalog API & Browse API) */
export interface NormalizedEbayCatalogProduct {
  epid: string;
  title: string;
  brand?: string;
  mpn?: string;
  gtin?: string;
  primaryCategory?: {
    categoryId: string;
    categoryName: string;
  };
  imageUrl?: string;
  aspects?: Record<string, string[]>;
  productWebUrl?: string;
  retrievalTimestamp: number;
  provenance: DataProvenance;
}

export interface NormalizedEbayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  itemWebUrl: string;
  imageUrl?: string;
  shippingCost?: number;
  seller?: {
    username: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  buyingOptions: string[];
  retrievalTimestamp: number;
  provenance: DataProvenance;
}

export interface EbayBrowseSearchOptions {
  limit?: number;
  offset?: number;
  categoryId?: string;
  filter?: string;
  sort?: string;
}

/** Historical Sales & Sold Data Types */
export interface SalesHistoryQuery {
  query: string;
  asin?: string;
  epid?: string;
  upc?: string;
  marketplace?: string;
  lookbackDays?: number;
}

export interface ConfirmedSaleRecord {
  saleId: string;
  soldDate: string;
  soldPrice: number;
  shippingCharged: number;
  currency: string;
  channel: "eBay" | "Amazon";
  condition: string;
  listingType: "Buy It Now" | "Auction";
}

export interface EstimatedSaleMetrics {
  medianSoldPrice: number;
  lowSoldComp: number;
  highSoldComp: number;
  estimatedUnitsSold90Days: number;
  estimatedSellThroughRatePct: number;
  demandVelocity: "High Velocity" | "Moderate" | "Slow / Long Tail" | "Low Velocity";
  confidenceScorePct: number;
  marketModelNotes: string;
}

export interface SalesHistoryResult {
  query: string;
  marketplace: string;
  retrievedTimestamp: number;
  provenance: DataProvenance;
  status: "success" | "restricted" | "not_configured" | "error";
  statusMessage: string;
  confirmedSales?: ConfirmedSaleRecord[];
  estimatedMetrics?: EstimatedSaleMetrics;
}

/** Structured Cache Entry */
export interface MarketplaceCacheEntry<T> {
  provider: string;
  requestKey: string;
  marketplace: string;
  response: T;
  retrievedTimestamp: number;
  expirationTimestamp: number;
}

/**
 * Firecrawl Supplementary Public Product-Page Research Types
 *
 * Strictly separates public web extraction ("extracted_public_web_firecrawl")
 * from confirmed official marketplace API data ("confirmed_marketplace_api")
 * and AI statistical estimates ("estimated_inferred_ai").
 */

export type FirecrawlExtractionStatus =
  | "extracted"
  | "partial"
  | "inaccessible"
  | "malformed"
  | "unsupported_url"
  | "not_configured"
  | "disabled"
  | "rate_limited"
  | "error";

export type IdentifierConfidenceState =
  | "verified_format"
  | "inferred_candidate"
  | "missing"
  | "contradictory";

export interface FirecrawlIdentifierEvidence {
  upc?: string;
  ean?: string;
  gtin?: string;
  asin?: string;
  epid?: string;
  mpn?: string;
  sku?: string;
  modelNumber?: string;
  identifierConfidence: IdentifierConfidenceState;
  identifierNotes: string[];
}

export interface FirecrawlDataIntegrityReport {
  missingFields: string[];
  staleDataWarnings: string[];
  contradictions: string[];
  inferredFields: string[];
  marketplaceDisclaimers: {
    notProofOfSoldTransaction: true;
    notProofOfLiveInventory: true;
    notProofOfSellerEligibilityOrUngating: true;
    notProofOfExactFeesOrNetProfit: true;
    requiresAuthorizedApiVerification: true;
  };
}

export interface NormalizedFirecrawlProductResearch {
  sourceUrl: string;
  canonicalUrl?: string;
  domain: string;
  retrievalTimestamp: number;
  cacheExpiresAt?: number;
  isStale: boolean;
  provenance: "extracted_public_web_firecrawl";
  extractionStatus: FirecrawlExtractionStatus;
  statusMessage: string;
  confidenceScorePct: number;
  title?: string;
  brand?: string;
  model?: string;
  category?: string;
  description?: string;
  observedPrice?: number;
  observedCurrency?: string;
  observedPriceNote: string;
  observedAvailabilityText?: string;
  imageUrls: string[];
  specifications: Record<string, string>;
  identifiers: FirecrawlIdentifierEvidence;
  rawMarkdownSnippet?: string;
  integrity: FirecrawlDataIntegrityReport;
}

export interface FirecrawlExtractOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
  staleThresholdMs?: number;
}

/**
 * Cross-Marketplace Product Matching & Arbitrage Enrichment Types
 */

export type ProductMatchConfidence =
  | "high"
  | "medium"
  | "low"
  | "unverified"
  | "none";

export type MatchEvidenceBasis =
  | "gtin"
  | "asin"
  | "epid"
  | "brand_mpn"
  | "brand_model"
  | "title_similarity";

export interface CrossMarketplaceMatchAssessment {
  targetChannel: "Amazon" | "eBay";
  matchConfidence: ProductMatchConfidence;
  confidenceScorePct: number;
  isVerifiedCatalogMatch: boolean;
  matchedOn: MatchEvidenceBasis[];
  uncertaintyReasons: string[];
  contradictions: string[];
  candidateId?: string; // ASIN or ePID
  candidateTitle?: string;
  candidateBrand?: string;
  candidateUrl?: string;
  candidateProvenance?: DataProvenance;
}

export type FinancialInputProvenance =
  | DataProvenance
  | "user_supplied"
  | "missing";

export interface ChannelProfitEstimate {
  channel: "eBay" | "Amazon FBA";
  profitabilityStatus: "profitable_estimate" | "unprofitable_estimate" | "insufficient_data";
  isProfitableEstimate: boolean;
  isConfirmedProfit: false; // Always false because fees/shipping/resale include estimates or unverified inputs
  currency: string;
  sourceCurrency: string;
  targetCurrency: string;
  currencyMismatch: boolean;
  sourceCost: number | null;
  sourceCostProvenance: FinancialInputProvenance;
  sourceShipping: number;
  sourceTaxRatePct: number;
  estimatedSourceTax: number;
  targetResalePrice: number | null;
  targetResalePriceProvenance: FinancialInputProvenance;
  marketplaceFee: number | null;
  marketplaceFeeNote: string;
  fulfillmentOrPostageFee: number | null;
  fulfillmentFeeProvenance: FinancialInputProvenance;
  fulfillmentFeeNote: string;
  promotedOrPlacementFee: number;
  netProfitEstimate: number | null;
  roiPctEstimate: number | null;
  marginPctEstimate: number | null;
  breakEvenPrice: number | null;
  warnings: string[];
}

export interface ArbitrageEnrichmentRequest {
  sourceUrl?: string;
  productQuery?: string;
  brand?: string;
  model?: string;
  upc?: string;
  asin?: string;
  epid?: string;
  sourceCost?: number;
  sourceCurrency?: string;
  sourceShipping?: number;
  sourceTaxRatePct?: number;
  outboundShippingEstimate?: number | null;
  targetEbayPriceOverride?: number;
  targetAmazonPriceOverride?: number;
  promotedRatePct?: number;
  forceRefresh?: boolean;
}

export interface ArbitrageEnrichmentReport {
  timestamp: number;
  queryUsed: string;
  firecrawlResearch: NormalizedFirecrawlProductResearch | null;
  marketplaceData: {
    amazon: {
      status: CapabilityState | "skipped" | "error";
      statusMessage: string;
      products: NormalizedAmazonProduct[];
      matchAssessment: CrossMarketplaceMatchAssessment;
    };
    ebayCatalog: {
      status: CapabilityState | "skipped" | "error";
      statusMessage: string;
      catalogProduct: NormalizedEbayCatalogProduct | null;
      matchAssessment: CrossMarketplaceMatchAssessment;
    };
    ebayBrowse: {
      status: CapabilityState | "skipped" | "error";
      statusMessage: string;
      activeListings: NormalizedEbayListing[];
      activePriceStats?: {
        count: number;
        lowestPrice: number;
        medianPrice: number;
        highestPrice: number;
        note: string;
      };
    };
    ebaySoldHistory: SalesHistoryResult | null;
  };
  financialEstimates: {
    ebay: ChannelProfitEstimate;
    amazonFba: ChannelProfitEstimate;
  };
  overallSummary: {
    hasVerifiedIdentifierMatch: boolean;
    hasStaleOrContradictoryEvidence: boolean;
    missingEvidenceList: string[];
    actionableWarnings: string[];
  };
}


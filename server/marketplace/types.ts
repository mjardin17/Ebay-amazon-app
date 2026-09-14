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
  | "estimated_inferred_ai";

export interface CapabilityInfo {
  id: string;
  name: string;
  provider: "amazon-creators" | "ebay-catalog" | "ebay-browse" | "ebay-insights" | "resale-ai";
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

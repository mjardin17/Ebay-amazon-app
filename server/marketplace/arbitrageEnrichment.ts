/**
 * Cross-Marketplace Product Matching & Arbitrage Enrichment Engine
 *
 * Coordinates:
 * 1. Supplementary public product-page extraction via Firecrawl (optional)
 * 2. Official Amazon Creators API catalog & OffersV2 lookups
 * 3. Official eBay Catalog API (ePID) & Browse API (active listings) lookups
 * 4. Official/Hybrid Sold History provider lookups
 * 5. Strict product-matching confidence & uncertainty evaluation (never silently
 *    treating uncertain or fuzzy matches as verified matches)
 * 6. Transparent fee, shipping, tax, currency, and net profit estimation using the app's
 *    existing calculation formulas while preserving input provenance and refusing to
 *    mark stale, contradictory, currency-mismatched, or missing-input deals as profitable.
 */

import crypto from "node:crypto";
import {
  ArbitrageEnrichmentReport,
  ArbitrageEnrichmentRequest,
  CapabilityState,
  ChannelProfitEstimate,
  CrossMarketplaceMatchAssessment,
  FinancialInputProvenance,
  MatchEvidenceBasis,
  NormalizedAmazonProduct,
  NormalizedEbayCatalogProduct,
  NormalizedEbayListing,
  NormalizedFirecrawlProductResearch,
  ProductMatchConfidence,
  SalesHistoryResult,
} from "./types";
import { amazonProvider, AmazonCreatorsProvider } from "./amazonProvider";
import { ebayMarketplaceProvider, EbayMarketplaceProvider } from "./ebayProvider";
import { soldHistoryProvider, SoldHistoryProvider } from "./soldHistoryProvider";
import { firecrawlProvider, FirecrawlResearchProvider } from "./firecrawlProvider";

export interface RouteValidationResult<T> {
  valid: boolean;
  error?: string;
  sanitized?: T;
}

/**
 * Constant-time token verification for optional RESEARCH_API_ACCESS_TOKEN protection
 * on research routes. When RESEARCH_API_ACCESS_TOKEN is unset, returns { authorized: true }.
 */
export function verifyResearchApiAccessToken(headers: Record<string, unknown>): {
  authorized: boolean;
  error?: string;
} {
  const configuredToken = (process.env.RESEARCH_API_ACCESS_TOKEN || "").trim();
  if (!configuredToken) {
    return { authorized: true };
  }

  const headerTokenRaw =
    typeof headers["x-research-access-token"] === "string"
      ? headers["x-research-access-token"]
      : typeof headers["authorization"] === "string" &&
        headers["authorization"].toLowerCase().startsWith("bearer ")
      ? headers["authorization"].slice(7)
      : "";

  const candidate = headerTokenRaw.trim();
  if (!candidate) {
    return {
      authorized: false,
      error: "Unauthorized: valid research API access token is required.",
    };
  }

  const expectedBuf = Buffer.from(configuredToken, "utf8");
  const candidateBuf = Buffer.from(candidate, "utf8");
  if (
    expectedBuf.length !== candidateBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, candidateBuf)
  ) {
    return {
      authorized: false,
      error: "Unauthorized: invalid research API access token.",
    };
  }

  return { authorized: true };
}

/**
 * Validates and sanitizes POST /api/research/firecrawl/extract request body.
 */
export function validateFirecrawlExtractPayload(
  body: unknown
): RouteValidationResult<{ url: string; forceRefresh: boolean }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Request body must be a JSON object." };
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.url !== "string" || !raw.url.trim()) {
    return { valid: false, error: "A non-empty string 'url' is required." };
  }

  const trimmedUrl = raw.url.trim();
  if (trimmedUrl.length > 2048) {
    return { valid: false, error: "URL exceeds maximum length of 2048 characters." };
  }

  if (raw.forceRefresh !== undefined && typeof raw.forceRefresh !== "boolean") {
    return { valid: false, error: "'forceRefresh' must be a boolean when provided." };
  }

  return {
    valid: true,
    sanitized: {
      url: trimmedUrl,
      forceRefresh: Boolean(raw.forceRefresh),
    },
  };
}

/**
 * Validates and sanitizes POST /api/research/arbitrage-enrich request body.
 */
export function validateArbitrageEnrichmentPayload(
  body: unknown
): RouteValidationResult<ArbitrageEnrichmentRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Request body must be a JSON object." };
  }

  const raw = body as Record<string, unknown>;

  const stringFieldLimits: Array<{ key: keyof ArbitrageEnrichmentRequest; maxLen: number }> = [
    { key: "sourceUrl", maxLen: 2048 },
    { key: "productQuery", maxLen: 300 },
    { key: "brand", maxLen: 120 },
    { key: "model", maxLen: 120 },
    { key: "upc", maxLen: 64 },
    { key: "asin", maxLen: 64 },
    { key: "epid", maxLen: 64 },
    { key: "sourceCurrency", maxLen: 10 },
  ];

  const sanitizedStrings: Partial<Record<keyof ArbitrageEnrichmentRequest, string>> = {};

  for (const { key, maxLen } of stringFieldLimits) {
    const val = raw[key];
    if (val === undefined || val === null || val === "") continue;
    if (typeof val !== "string") {
      return {
        valid: false,
        error: `Field '${String(key)}' must be a string.`,
      };
    }
    const trimmed = val.trim();
    if (trimmed.length > maxLen) {
      return {
        valid: false,
        error: `Field '${String(key)}' exceeds maximum length of ${maxLen} characters.`,
      };
    }
    if (trimmed.length > 0) {
      sanitizedStrings[key] = trimmed;
    }
  }

  if (
    !sanitizedStrings.sourceUrl &&
    !sanitizedStrings.productQuery &&
    !sanitizedStrings.upc &&
    !sanitizedStrings.asin &&
    !sanitizedStrings.epid
  ) {
    return {
      valid: false,
      error: "Provide at least one non-empty search identifier: sourceUrl, productQuery, upc, asin, or epid.",
    };
  }

  const numericFieldRanges: Array<{
    key:
      | "sourceCost"
      | "sourceShipping"
      | "sourceTaxRatePct"
      | "outboundShippingEstimate"
      | "targetEbayPriceOverride"
      | "targetAmazonPriceOverride"
      | "promotedRatePct";
    min: number;
    max: number;
  }> = [
    { key: "sourceCost", min: 0, max: 1_000_000 },
    { key: "sourceShipping", min: 0, max: 100_000 },
    { key: "sourceTaxRatePct", min: 0, max: 100 },
    { key: "outboundShippingEstimate", min: 0, max: 100_000 },
    { key: "targetEbayPriceOverride", min: 0, max: 1_000_000 },
    { key: "targetAmazonPriceOverride", min: 0, max: 1_000_000 },
    { key: "promotedRatePct", min: 0, max: 50 },
  ];

  const sanitizedNumbers: Partial<Record<string, number>> = {};

  for (const { key, min, max } of numericFieldRanges) {
    const val = raw[key];
    if (val === undefined || val === null || val === "") continue;
    const num = typeof val === "number" ? val : typeof val === "string" ? Number(val) : NaN;
    if (!Number.isFinite(num) || num < min || num > max) {
      return {
        valid: false,
        error: `Field '${key}' must be a finite number between ${min} and ${max}.`,
      };
    }
    sanitizedNumbers[key] = num;
  }

  if (raw.forceRefresh !== undefined && typeof raw.forceRefresh !== "boolean") {
    return { valid: false, error: "'forceRefresh' must be a boolean when provided." };
  }

  return {
    valid: true,
    sanitized: {
      sourceUrl: sanitizedStrings.sourceUrl,
      productQuery: sanitizedStrings.productQuery,
      brand: sanitizedStrings.brand,
      model: sanitizedStrings.model,
      upc: sanitizedStrings.upc,
      asin: sanitizedStrings.asin,
      epid: sanitizedStrings.epid,
      sourceCurrency: sanitizedStrings.sourceCurrency,
      sourceCost: sanitizedNumbers.sourceCost,
      sourceShipping: sanitizedNumbers.sourceShipping,
      sourceTaxRatePct: sanitizedNumbers.sourceTaxRatePct,
      outboundShippingEstimate: sanitizedNumbers.outboundShippingEstimate,
      targetEbayPriceOverride: sanitizedNumbers.targetEbayPriceOverride,
      targetAmazonPriceOverride: sanitizedNumbers.targetAmazonPriceOverride,
      promotedRatePct: sanitizedNumbers.promotedRatePct,
      forceRefresh: Boolean(raw.forceRefresh),
    },
  };
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "new",
  "brand",
  "free",
  "shipping",
  "sale",
  "pack",
  "set",
  "of",
  "in",
  "to",
  "on",
  "by",
  "from",
]);

function safeTrimString(val: unknown, maxLen = 300): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : undefined;
}

function normalizeCurrencyCode(val?: string | null): string {
  if (typeof val !== "string") return "USD";
  const cleaned = val.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(cleaned)) return cleaned;
  if (cleaned === "$" || cleaned === "US$") return "USD";
  if (cleaned === "£") return "GBP";
  if (cleaned === "€") return "EUR";
  if (cleaned === "¥") return "CNY";
  return "USD";
}

function tokenizeTitle(text?: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function computeTokenOverlapRatio(sourceTitle?: string, candidateTitle?: string): number {
  const sourceTokens = new Set(tokenizeTitle(sourceTitle));
  const candidateTokens = new Set(tokenizeTitle(candidateTitle));
  if (sourceTokens.size === 0 || candidateTokens.size === 0) return 0;

  let intersection = 0;
  for (const tok of sourceTokens) {
    if (candidateTokens.has(tok)) intersection++;
  }
  const denominator = Math.min(sourceTokens.size, candidateTokens.size);
  return denominator > 0 ? intersection / denominator : 0;
}

function detectMultiPackCount(title?: string): number {
  if (!title) return 1;
  const packMatch =
    title.match(/\b(\d+)\s*[- ]?\s*(?:pack|pk|count|ct|pcs|pieces|lot|bundle|set)\b/i) ||
    title.match(/\b(?:pack|set|lot)\s+of\s+(\d+)\b/i);
  if (packMatch?.[1]) {
    const n = parseInt(packMatch[1], 10);
    if (n > 1 && n <= 500) return n;
  }
  return 1;
}

function isAccessoryOrCompatiblePhrase(title?: string): boolean {
  if (!title) return false;
  return /\b(?:compatible\s+with|replacement\s+for|case\s+for|cover\s+for|charger\s+for|adapter\s+for|mount\s+for|fits\s+)\b/i.test(
    title
  );
}

/**
 * Evaluates whether a candidate Amazon or eBay catalog product matches the researched product.
 * Never silently treats uncertain or fuzzy matches as verified matches.
 */
export function evaluateProductMatch(params: {
  targetChannel: "Amazon" | "eBay";
  sourceTitle?: string;
  sourceBrand?: string;
  sourceModel?: string;
  sourceGtin?: string;
  sourceAsin?: string;
  sourceEpid?: string;
  sourceHasContradictions?: boolean;
  candidateId?: string;
  candidateTitle?: string;
  candidateBrand?: string;
  candidateModelOrMpn?: string;
  candidateGtin?: string;
  candidateUrl?: string;
}): CrossMarketplaceMatchAssessment {
  const {
    targetChannel,
    sourceTitle,
    sourceBrand,
    sourceModel,
    sourceGtin,
    sourceAsin,
    sourceEpid,
    sourceHasContradictions,
    candidateId,
    candidateTitle,
    candidateBrand,
    candidateModelOrMpn,
    candidateGtin,
    candidateUrl,
  } = params;

  if (!candidateId && !candidateTitle) {
    return {
      targetChannel,
      matchConfidence: "none",
      confidenceScorePct: 0,
      isVerifiedCatalogMatch: false,
      matchedOn: [],
      uncertaintyReasons: [
        `No ${targetChannel} catalog candidate was returned or official ${targetChannel} API is not configured.`,
      ],
      contradictions: [],
    };
  }

  const matchedOn: MatchEvidenceBasis[] = [];
  const uncertaintyReasons: string[] = [];
  const contradictions: string[] = [];

  // 1. Identifier comparisons
  const cleanSourceGtin = (sourceGtin || "").replace(/\D/g, "");
  const cleanCandidateGtin = (candidateGtin || "").replace(/\D/g, "");
  let hasExactGtinMatch = false;

  if (cleanSourceGtin && cleanCandidateGtin) {
    if (cleanSourceGtin === cleanCandidateGtin) {
      hasExactGtinMatch = true;
      matchedOn.push("gtin");
    } else {
      contradictions.push(
        `GTIN/UPC mismatch: researched product (${cleanSourceGtin}) vs ${targetChannel} catalog (${cleanCandidateGtin}).`
      );
    }
  } else {
    uncertaintyReasons.push(
      `No cross-verified UPC/EAN/GTIN barcode match between source research and ${targetChannel} catalog.`
    );
  }

  let hasExactAsinMatch = false;
  if (targetChannel === "Amazon" && sourceAsin && candidateId) {
    if (sourceAsin.trim().toUpperCase() === candidateId.trim().toUpperCase()) {
      hasExactAsinMatch = true;
      matchedOn.push("asin");
    } else {
      contradictions.push(
        `ASIN mismatch: source ASIN (${sourceAsin.toUpperCase()}) vs Amazon catalog ASIN (${candidateId.toUpperCase()}).`
      );
    }
  }

  let hasExactEpidMatch = false;
  if (targetChannel === "eBay" && sourceEpid && candidateId) {
    if (sourceEpid.trim().toUpperCase() === candidateId.trim().toUpperCase()) {
      hasExactEpidMatch = true;
      matchedOn.push("epid");
    } else {
      contradictions.push(
        `ePID mismatch: source ePID (${sourceEpid}) vs eBay catalog ePID (${candidateId}).`
      );
    }
  }

  // 2. Brand comparison
  const normSourceBrand = (sourceBrand || "").trim().toLowerCase();
  const normCandBrand = (candidateBrand || "").trim().toLowerCase();
  const isSourceGeneric =
    !normSourceBrand || ["generic", "unbranded", "oem", "unknown"].includes(normSourceBrand);
  const isCandGeneric =
    !normCandBrand || ["generic", "unbranded", "oem", "unknown"].includes(normCandBrand);

  let brandMatches = false;
  if (!isSourceGeneric && !isCandGeneric) {
    if (
      normSourceBrand === normCandBrand ||
      normSourceBrand.includes(normCandBrand) ||
      normCandBrand.includes(normSourceBrand)
    ) {
      brandMatches = true;
    } else {
      contradictions.push(
        `Brand mismatch: researched brand "${sourceBrand}" conflicts with ${targetChannel} brand "${candidateBrand}".`
      );
    }
  } else if (isSourceGeneric !== isCandGeneric) {
    uncertaintyReasons.push(
      `Brand asymmetry: one side is "${
        isSourceGeneric ? sourceBrand || "Unbranded" : candidateBrand
      }" while the other is "${isSourceGeneric ? candidateBrand : sourceBrand}".`
    );
  } else {
    uncertaintyReasons.push("Brand is missing or generic on both source and catalog candidate.");
  }

  // 3. Model / MPN comparison
  const normSourceModel = (sourceModel || "").trim().toLowerCase();
  const normCandModel = (candidateModelOrMpn || "").trim().toLowerCase();
  const candTitleLower = (candidateTitle || "").toLowerCase();

  let modelMatches = false;
  if (normSourceModel && normCandModel) {
    if (normSourceModel === normCandModel) {
      modelMatches = true;
      matchedOn.push("brand_mpn");
    } else {
      contradictions.push(
        `Model/MPN mismatch: source model "${sourceModel}" vs ${targetChannel} MPN "${candidateModelOrMpn}".`
      );
    }
  } else if (normSourceModel && normSourceModel.length >= 3 && candTitleLower.includes(normSourceModel)) {
    modelMatches = true;
    matchedOn.push("brand_model");
  } else {
    uncertaintyReasons.push("Exact model number / MPN could not be cross-verified.");
  }

  // 4. Title similarity & bundle / accessory traps
  const overlapRatio = computeTokenOverlapRatio(sourceTitle, candidateTitle);
  if (overlapRatio >= 0.45) {
    matchedOn.push("title_similarity");
  } else if (sourceTitle && candidateTitle) {
    uncertaintyReasons.push(
      `Low title keyword overlap (${Math.round(overlapRatio * 100)}%) between source and ${targetChannel} candidate.`
    );
  }

  const sourcePack = detectMultiPackCount(sourceTitle);
  const candPack = detectMultiPackCount(candidateTitle);
  if (sourcePack !== candPack) {
    contradictions.push(
      `Bundle/quantity mismatch: source appears to be ${sourcePack}-unit while ${targetChannel} candidate appears to be ${candPack}-unit.`
    );
  }

  const sourceIsAccessory = isAccessoryOrCompatiblePhrase(sourceTitle);
  const candIsAccessory = isAccessoryOrCompatiblePhrase(candidateTitle);
  if (sourceIsAccessory !== candIsAccessory) {
    contradictions.push(
      `Accessory vs. main product mismatch: one listing is a replacement/compatible accessory while the other is a primary item.`
    );
  }

  if (sourceHasContradictions) {
    uncertaintyReasons.push(
      "Source product page extraction contained internal contradictions; match cannot be marked verified."
    );
  }

  // 5. Compute final confidence tier
  let matchConfidence: ProductMatchConfidence = "unverified";
  let confidenceScorePct = 15;
  let isVerifiedCatalogMatch = false;

  const hasExactIdentifier = hasExactGtinMatch || hasExactAsinMatch || hasExactEpidMatch;

  if (contradictions.length > 0) {
    matchConfidence = "unverified";
    confidenceScorePct = Math.max(5, 25 - contradictions.length * 10);
    isVerifiedCatalogMatch = false;
  } else if (hasExactIdentifier && !sourceHasContradictions && (brandMatches || !normSourceBrand)) {
    matchConfidence = "high";
    confidenceScorePct = brandMatches && modelMatches ? 96 : 90;
    isVerifiedCatalogMatch = true;
  } else if (brandMatches && modelMatches && overlapRatio >= 0.5) {
    matchConfidence = "medium";
    confidenceScorePct = Math.round(70 + overlapRatio * 15);
    isVerifiedCatalogMatch = false;
    uncertaintyReasons.push(
      "Matched on Brand + Model/MPN without a confirmed GTIN/ASIN/ePID barcode match; verify exact variation before purchasing."
    );
  } else if ((brandMatches && overlapRatio >= 0.5) || overlapRatio >= 0.7) {
    matchConfidence = "low";
    confidenceScorePct = Math.round(45 + overlapRatio * 20);
    isVerifiedCatalogMatch = false;
    uncertaintyReasons.push(
      "Matched primarily on title similarity; high risk of variation, generation, or edition mismatch."
    );
  } else {
    matchConfidence = "unverified";
    confidenceScorePct = Math.max(10, Math.round(overlapRatio * 40));
    isVerifiedCatalogMatch = false;
    uncertaintyReasons.push(
      "Insufficient identifier, brand, or title evidence to confirm these are the same product."
    );
  }

  return {
    targetChannel,
    matchConfidence,
    confidenceScorePct,
    isVerifiedCatalogMatch,
    matchedOn,
    uncertaintyReasons,
    contradictions,
    candidateId,
    candidateTitle,
    candidateBrand,
    candidateUrl,
    candidateProvenance: "confirmed_marketplace_api",
  };
}

/**
 * Calculates eBay and Amazon FBA fee, shipping, tax, currency, and net profit estimates
 * using the application's existing fee formulas while preserving strict data provenance.
 *
 * Guardrails enforced:
 * - Missing or non-positive sourceCost or targetResalePrice -> "insufficient_data", isProfitableEstimate = false
 * - Explicitly missing outbound shipping (null) or missing fee rate (null) -> "insufficient_data", isProfitableEstimate = false
 * - Currency mismatch between sourceCost and targetResalePrice (e.g., GBP/CNY vs USD) -> "insufficient_data", isProfitableEstimate = false
 * - Source page price contradiction (hasPriceContradiction: true) -> "insufficient_data", isProfitableEstimate = false
 * - Stale extracted web price (isSourceStale: true when sourceCostProvenance === "extracted_public_web_firecrawl") -> "insufficient_data", isProfitableEstimate = false
 * - Contradictory/unverified catalog match ("unverified") when target price is not user_supplied -> "insufficient_data", isProfitableEstimate = false
 */
export function calculateArbitrageFinancials(params: {
  sourceCost?: number | null;
  sourceCostProvenance?: FinancialInputProvenance;
  sourceCurrency?: string;
  sourceShipping?: number | null;
  sourceTaxRatePct?: number;
  targetEbayPrice?: number | null;
  targetEbayPriceProvenance?: FinancialInputProvenance;
  targetEbayCurrency?: string;
  targetAmazonPrice?: number | null;
  targetAmazonPriceProvenance?: FinancialInputProvenance;
  targetAmazonCurrency?: string;
  outboundShippingEstimate?: number | null;
  ebayFeeRatePct?: number | null;
  amazonReferralFeeRatePct?: number | null;
  promotedRatePct?: number;
  isSourceStale?: boolean;
  hasPriceContradiction?: boolean;
  ebayMatchConfidence?: ProductMatchConfidence;
  amazonMatchConfidence?: ProductMatchConfidence;
}): { ebay: ChannelProfitEstimate; amazonFba: ChannelProfitEstimate } {
  const sourceCostProv: FinancialInputProvenance = params.sourceCostProvenance || "missing";
  const targetEbayProv: FinancialInputProvenance = params.targetEbayPriceProvenance || "missing";
  const targetAmazonProv: FinancialInputProvenance =
    params.targetAmazonPriceProvenance || "missing";
  const sourceCurrency = normalizeCurrencyCode(params.sourceCurrency);
  const ebayCurrency = normalizeCurrencyCode(params.targetEbayCurrency);
  const amazonCurrency = normalizeCurrencyCode(params.targetAmazonCurrency);

  const sourceCost =
    typeof params.sourceCost === "number" && Number.isFinite(params.sourceCost) && params.sourceCost > 0
      ? Number(params.sourceCost.toFixed(2))
      : null;

  const isSourceShippingProvided =
    typeof params.sourceShipping === "number" &&
    Number.isFinite(params.sourceShipping) &&
    params.sourceShipping >= 0;
  const sourceShipping = isSourceShippingProvided
    ? Number(params.sourceShipping!.toFixed(2))
    : 0;

  const isTaxRateProvided =
    typeof params.sourceTaxRatePct === "number" &&
    Number.isFinite(params.sourceTaxRatePct) &&
    params.sourceTaxRatePct >= 0 &&
    params.sourceTaxRatePct <= 100;
  const sourceTaxRatePct = isTaxRateProvided ? Number(params.sourceTaxRatePct!.toFixed(2)) : 0;

  const estimatedSourceTax =
    sourceCost !== null
      ? Number(((sourceCost + sourceShipping) * (sourceTaxRatePct / 100)).toFixed(2))
      : 0;

  // Outbound shipping handling:
  // - If explicitly passed as null, treat shipping as missing/unknown (cannot confirm profitability).
  // - If passed as finite number >= 0, provenance is "user_supplied".
  // - If omitted (undefined), default to $6.50 with provenance "estimated_inferred_ai" and emit a warning.
  const isOutboundExplicitlyMissing = params.outboundShippingEstimate === null;
  const isOutboundUserSupplied =
    typeof params.outboundShippingEstimate === "number" &&
    Number.isFinite(params.outboundShippingEstimate) &&
    params.outboundShippingEstimate >= 0;
  const outboundShipping: number | null = isOutboundExplicitlyMissing
    ? null
    : isOutboundUserSupplied
    ? Number(params.outboundShippingEstimate!.toFixed(2))
    : 6.5;
  const outboundShippingProvenance: FinancialInputProvenance = isOutboundExplicitlyMissing
    ? "missing"
    : isOutboundUserSupplied
    ? "user_supplied"
    : "estimated_inferred_ai";

  // Clamp promoted rate safely to [0, 50]% so break-even denominator is always strictly positive
  const promotedRate =
    typeof params.promotedRatePct === "number" && Number.isFinite(params.promotedRatePct)
      ? Math.max(0, Math.min(50, params.promotedRatePct))
      : 2.0;

  const isEbayFeeExplicitlyMissing = params.ebayFeeRatePct === null;
  const ebayFeeRate =
    typeof params.ebayFeeRatePct === "number" &&
    Number.isFinite(params.ebayFeeRatePct) &&
    params.ebayFeeRatePct >= 0 &&
    params.ebayFeeRatePct < 80
      ? params.ebayFeeRatePct
      : 13.25;

  const isAmazonFeeExplicitlyMissing = params.amazonReferralFeeRatePct === null;
  const amazonReferralRate =
    typeof params.amazonReferralFeeRatePct === "number" &&
    Number.isFinite(params.amazonReferralFeeRatePct) &&
    params.amazonReferralFeeRatePct >= 0 &&
    params.amazonReferralFeeRatePct < 80
      ? params.amazonReferralFeeRatePct
      : 15.0;

  // ============================================================================
  // 1. eBay Estimate
  // ============================================================================
  const ebayPrice =
    typeof params.targetEbayPrice === "number" &&
    Number.isFinite(params.targetEbayPrice) &&
    params.targetEbayPrice > 0
      ? Number(params.targetEbayPrice.toFixed(2))
      : null;

  const ebayCurrencyMismatch = sourceCurrency !== ebayCurrency;
  const ebayWarnings: string[] = [];

  if (ebayCurrencyMismatch) {
    ebayWarnings.push(
      `Currency mismatch: source cost is in ${sourceCurrency} while target eBay price is in ${ebayCurrency}. Convert to a common currency before calculating profit.`
    );
  }
  if (params.hasPriceContradiction) {
    ebayWarnings.push(
      "Source product page contains conflicting price values; source cost cannot be trusted for profitability."
    );
  }
  if (sourceCostProv === "extracted_public_web_firecrawl") {
    ebayWarnings.push(
      "Source cost is from an extracted public web page (unverified snapshot) — confirm live supplier checkout price and stock."
    );
  }
  if (params.isSourceStale) {
    ebayWarnings.push(
      "Source product extraction is flagged as stale; price may be outdated and cannot be treated as profitable without refresh/verification."
    );
  }
  if (!isSourceShippingProvided) {
    ebayWarnings.push(
      "Inbound supplier shipping was not specified and is assumed $0.00 — verify supplier freight/shipping charges."
    );
  }
  if (sourceTaxRatePct === 0) {
    ebayWarnings.push(
      "Sourcing sales tax / import duty is set to 0% (valid only with a resale exemption certificate; otherwise factor in 6%–10% tax)."
    );
  }
  if (outboundShippingProvenance === "estimated_inferred_ai") {
    ebayWarnings.push(
      "Outbound domestic postage is a standard $6.50 estimate (package weight and dimensions not verified)."
    );
  }
  if (params.ebayMatchConfidence && params.ebayMatchConfidence !== "high") {
    ebayWarnings.push(
      `eBay product match confidence is "${params.ebayMatchConfidence}" — verify exact model/variation before relying on resale comps.`
    );
  }
  if (targetEbayProv === "estimated_inferred_ai") {
    ebayWarnings.push(
      "eBay resale price is an AI/statistical estimate (not confirmed eBay Marketplace Insights transaction logs)."
    );
  }

  const isEbayMatchContradictoryAndUnoverridden =
    params.ebayMatchConfidence === "unverified" && targetEbayProv !== "user_supplied";

  const isSourceStaleScraped =
    Boolean(params.isSourceStale) && sourceCostProv === "extracted_public_web_firecrawl";

  const cannotComputeEbayArithmetic =
    sourceCost === null ||
    ebayPrice === null ||
    outboundShipping === null ||
    isEbayFeeExplicitlyMissing ||
    ebayCurrencyMismatch ||
    Boolean(params.hasPriceContradiction);

  let ebayEstimate: ChannelProfitEstimate;
  if (cannotComputeEbayArithmetic) {
    if (sourceCost === null) ebayWarnings.push("Missing valid source unit cost.");
    if (ebayPrice === null) ebayWarnings.push("Missing verified or estimated eBay target resale price.");
    if (outboundShipping === null) ebayWarnings.push("Missing outbound domestic shipping cost estimate.");
    if (isEbayFeeExplicitlyMissing) ebayWarnings.push("Missing eBay marketplace fee schedule.");

    const denom = 1 - ebayFeeRate / 100 - promotedRate / 100;
    const breakEven =
      sourceCost !== null &&
      outboundShipping !== null &&
      !isEbayFeeExplicitlyMissing &&
      !ebayCurrencyMismatch &&
      !params.hasPriceContradiction &&
      denom > 0.05
        ? Number(
            ((sourceCost + sourceShipping + estimatedSourceTax + outboundShipping + 0.3) / denom).toFixed(2)
          )
        : null;

    ebayEstimate = {
      channel: "eBay",
      profitabilityStatus: "insufficient_data",
      isProfitableEstimate: false,
      isConfirmedProfit: false,
      currency: ebayCurrency,
      sourceCurrency,
      targetCurrency: ebayCurrency,
      currencyMismatch: ebayCurrencyMismatch,
      sourceCost,
      sourceCostProvenance: sourceCost === null ? "missing" : sourceCostProv,
      sourceShipping,
      sourceTaxRatePct,
      estimatedSourceTax,
      targetResalePrice: ebayPrice,
      targetResalePriceProvenance: ebayPrice === null ? "missing" : targetEbayProv,
      marketplaceFee: null,
      marketplaceFeeNote: `Estimated eBay Final Value Fee (${ebayFeeRate}% + $0.30)`,
      fulfillmentOrPostageFee: outboundShipping,
      fulfillmentFeeProvenance: outboundShippingProvenance,
      fulfillmentFeeNote: "Estimated domestic outbound carrier label",
      promotedOrPlacementFee: 0,
      netProfitEstimate: null,
      roiPctEstimate: null,
      marginPctEstimate: null,
      breakEvenPrice: breakEven,
      warnings: ebayWarnings,
    };
  } else {
    const ebayFvf = Number((ebayPrice * (ebayFeeRate / 100) + 0.3).toFixed(2));
    const ebayPromotedFee = Number((ebayPrice * (promotedRate / 100)).toFixed(2));
    const totalLandedCost = Number((sourceCost + sourceShipping + estimatedSourceTax).toFixed(2));
    const netProfit = Number(
      (ebayPrice - totalLandedCost - ebayFvf - ebayPromotedFee - outboundShipping).toFixed(2)
    );
    const roiPct =
      totalLandedCost > 0 ? Number(((netProfit / totalLandedCost) * 100).toFixed(1)) : 0;
    const marginPct = ebayPrice > 0 ? Number(((netProfit / ebayPrice) * 100).toFixed(1)) : 0;
    const denom = 1 - ebayFeeRate / 100 - promotedRate / 100;
    const breakEven =
      denom > 0.05
        ? Number(((totalLandedCost + outboundShipping + 0.3) / denom).toFixed(2))
        : null;

    // Never present a stale scraped price or contradictory/unverified catalog match as profitable
    const blockedByStaleOrUnverifiedMatch =
      isSourceStaleScraped || isEbayMatchContradictoryAndUnoverridden;

    const profitabilityStatus: ChannelProfitEstimate["profitabilityStatus"] =
      blockedByStaleOrUnverifiedMatch
        ? "insufficient_data"
        : netProfit > 0
        ? "profitable_estimate"
        : "unprofitable_estimate";

    ebayEstimate = {
      channel: "eBay",
      profitabilityStatus,
      isProfitableEstimate: profitabilityStatus === "profitable_estimate",
      isConfirmedProfit: false,
      currency: ebayCurrency,
      sourceCurrency,
      targetCurrency: ebayCurrency,
      currencyMismatch: false,
      sourceCost,
      sourceCostProvenance: sourceCostProv,
      sourceShipping,
      sourceTaxRatePct,
      estimatedSourceTax,
      targetResalePrice: ebayPrice,
      targetResalePriceProvenance: targetEbayProv,
      marketplaceFee: ebayFvf,
      marketplaceFeeNote: `Estimated eBay Final Value Fee (${ebayFeeRate}% + $0.30)`,
      fulfillmentOrPostageFee: outboundShipping,
      fulfillmentFeeProvenance: outboundShippingProvenance,
      fulfillmentFeeNote: "Estimated USPS/UPS domestic postage",
      promotedOrPlacementFee: ebayPromotedFee,
      netProfitEstimate: netProfit,
      roiPctEstimate: roiPct,
      marginPctEstimate: marginPct,
      breakEvenPrice: breakEven,
      warnings: ebayWarnings,
    };
  }

  // ============================================================================
  // 2. Amazon FBA Estimate
  // ============================================================================
  const amazonPrice =
    typeof params.targetAmazonPrice === "number" &&
    Number.isFinite(params.targetAmazonPrice) &&
    params.targetAmazonPrice > 0
      ? Number(params.targetAmazonPrice.toFixed(2))
      : null;

  const amazonCurrencyMismatch = sourceCurrency !== amazonCurrency;
  const amazonWarnings: string[] = [
    "Amazon brand/category ungating eligibility is NOT verified by web scraping or catalog search; verify Seller Central approval before purchasing inventory.",
  ];

  if (amazonCurrencyMismatch) {
    amazonWarnings.push(
      `Currency mismatch: source cost is in ${sourceCurrency} while target Amazon price is in ${amazonCurrency}. Convert to a common currency before calculating profit.`
    );
  }
  if (params.hasPriceContradiction) {
    amazonWarnings.push(
      "Source product page contains conflicting price values; source cost cannot be trusted for profitability."
    );
  }
  if (sourceCostProv === "extracted_public_web_firecrawl") {
    amazonWarnings.push(
      "Source cost is from an extracted public web page (unverified snapshot) — confirm wholesale invoice and supplier authorization."
    );
  }
  if (params.isSourceStale) {
    amazonWarnings.push(
      "Source product extraction is flagged as stale; price may be outdated and cannot be treated as profitable without refresh/verification."
    );
  }
  if (sourceTaxRatePct === 0) {
    amazonWarnings.push(
      "Sourcing sales tax / import duty is set to 0% (valid only with a resale exemption certificate)."
    );
  }
  if (params.amazonMatchConfidence && params.amazonMatchConfidence !== "high") {
    amazonWarnings.push(
      `Amazon catalog match confidence is "${params.amazonMatchConfidence}" — verify exact ASIN and UPC before listing.`
    );
  }

  const isAmazonMatchContradictoryAndUnoverridden =
    params.amazonMatchConfidence === "unverified" && targetAmazonProv !== "user_supplied";

  const cannotComputeAmazonArithmetic =
    sourceCost === null ||
    amazonPrice === null ||
    isOutboundExplicitlyMissing ||
    isAmazonFeeExplicitlyMissing ||
    amazonCurrencyMismatch ||
    Boolean(params.hasPriceContradiction);

  let amazonEstimate: ChannelProfitEstimate;
  if (cannotComputeAmazonArithmetic) {
    if (sourceCost === null) amazonWarnings.push("Missing valid source unit cost.");
    if (amazonPrice === null) amazonWarnings.push("Missing verified or estimated Amazon Buy Box price.");
    if (isOutboundExplicitlyMissing) amazonWarnings.push("Missing fulfillment / inbound shipping fee estimate.");
    if (isAmazonFeeExplicitlyMissing) amazonWarnings.push("Missing Amazon referral fee schedule.");

    const denom = 1 - amazonReferralRate / 100 - 0.04;
    const breakEven =
      sourceCost !== null &&
      !isOutboundExplicitlyMissing &&
      !isAmazonFeeExplicitlyMissing &&
      !amazonCurrencyMismatch &&
      !params.hasPriceContradiction &&
      denom > 0.05
        ? Number(
            ((sourceCost + sourceShipping + estimatedSourceTax + 3.5 + 0.21) / denom).toFixed(2)
          )
        : null;

    amazonEstimate = {
      channel: "Amazon FBA",
      profitabilityStatus: "insufficient_data",
      isProfitableEstimate: false,
      isConfirmedProfit: false,
      currency: amazonCurrency,
      sourceCurrency,
      targetCurrency: amazonCurrency,
      currencyMismatch: amazonCurrencyMismatch,
      sourceCost,
      sourceCostProvenance: sourceCost === null ? "missing" : sourceCostProv,
      sourceShipping,
      sourceTaxRatePct,
      estimatedSourceTax,
      targetResalePrice: amazonPrice,
      targetResalePriceProvenance: amazonPrice === null ? "missing" : targetAmazonProv,
      marketplaceFee: null,
      marketplaceFeeNote: `Estimated Amazon Referral Fee (${amazonReferralRate}%)`,
      fulfillmentOrPostageFee: null,
      fulfillmentFeeProvenance: isOutboundExplicitlyMissing ? "missing" : "estimated_inferred_ai",
      fulfillmentFeeNote: "Estimated Amazon FBA Pick & Pack Fee",
      promotedOrPlacementFee: 0.21,
      netProfitEstimate: null,
      roiPctEstimate: null,
      marginPctEstimate: null,
      breakEvenPrice: breakEven,
      warnings: amazonWarnings,
    };
  } else {
    const referralFee = Number((amazonPrice * (amazonReferralRate / 100)).toFixed(2));
    const fbaPickPack = Number((3.5 + Math.min(amazonPrice * 0.04, 5.5)).toFixed(2));
    const placementFee = 0.21;
    const totalLandedCost = Number((sourceCost + sourceShipping + estimatedSourceTax).toFixed(2));
    const netProfit = Number(
      (amazonPrice - totalLandedCost - referralFee - fbaPickPack - placementFee).toFixed(2)
    );
    const roiPct =
      totalLandedCost > 0 ? Number(((netProfit / totalLandedCost) * 100).toFixed(1)) : 0;
    const marginPct = amazonPrice > 0 ? Number(((netProfit / amazonPrice) * 100).toFixed(1)) : 0;
    const denom = 1 - amazonReferralRate / 100;
    const breakEven =
      denom > 0.05
        ? Number(((totalLandedCost + fbaPickPack + placementFee) / denom).toFixed(2))
        : null;

    const blockedByStaleOrUnverifiedMatch =
      isSourceStaleScraped || isAmazonMatchContradictoryAndUnoverridden;

    const profitabilityStatus: ChannelProfitEstimate["profitabilityStatus"] =
      blockedByStaleOrUnverifiedMatch
        ? "insufficient_data"
        : netProfit > 0
        ? "profitable_estimate"
        : "unprofitable_estimate";

    amazonEstimate = {
      channel: "Amazon FBA",
      profitabilityStatus,
      isProfitableEstimate: profitabilityStatus === "profitable_estimate",
      isConfirmedProfit: false,
      currency: amazonCurrency,
      sourceCurrency,
      targetCurrency: amazonCurrency,
      currencyMismatch: false,
      sourceCost,
      sourceCostProvenance: sourceCostProv,
      sourceShipping,
      sourceTaxRatePct,
      estimatedSourceTax,
      targetResalePrice: amazonPrice,
      targetResalePriceProvenance: targetAmazonProv,
      marketplaceFee: referralFee,
      marketplaceFeeNote: `Estimated Amazon Referral Fee (${amazonReferralRate}%)`,
      fulfillmentOrPostageFee: fbaPickPack,
      fulfillmentFeeProvenance: "estimated_inferred_ai",
      fulfillmentFeeNote: "Estimated FBA Fulfillment Fee (Standard Tier)",
      promotedOrPlacementFee: placementFee,
      netProfitEstimate: netProfit,
      roiPctEstimate: roiPct,
      marginPctEstimate: marginPct,
      breakEvenPrice: breakEven,
      warnings: amazonWarnings,
    };
  }

  return {
    ebay: ebayEstimate,
    amazonFba: amazonEstimate,
  };
}

export class ArbitrageEnrichmentService {
  private firecrawl: FirecrawlResearchProvider;
  private amazon: AmazonCreatorsProvider;
  private ebay: EbayMarketplaceProvider;
  private soldHistory: SoldHistoryProvider;

  constructor(
    firecrawl: FirecrawlResearchProvider = firecrawlProvider,
    amazon: AmazonCreatorsProvider = amazonProvider,
    ebay: EbayMarketplaceProvider = ebayMarketplaceProvider,
    soldHistory: SoldHistoryProvider = soldHistoryProvider
  ) {
    this.firecrawl = firecrawl;
    this.amazon = amazon;
    this.ebay = ebay;
    this.soldHistory = soldHistory;
  }

  /**
   * Executes an end-to-end arbitrage research & cross-marketplace matching workflow.
   */
  public async enrichArbitrageOpportunity(
    req: ArbitrageEnrichmentRequest
  ): Promise<ArbitrageEnrichmentReport> {
    const now = Date.now();
    const cleanSourceUrl = safeTrimString(req.sourceUrl, 2048);
    const cleanProductQuery = safeTrimString(req.productQuery, 300);
    const cleanBrand = safeTrimString(req.brand, 100);
    const cleanModel = safeTrimString(req.model, 100);
    const cleanUpc = safeTrimString(req.upc, 32);
    const cleanAsin = safeTrimString(req.asin, 32);
    const cleanEpid = safeTrimString(req.epid, 64);

    // 1. Optional Firecrawl extraction when sourceUrl is provided
    let firecrawlResearch: NormalizedFirecrawlProductResearch | null = null;
    if (cleanSourceUrl) {
      firecrawlResearch = await this.firecrawl.extractProductPage(cleanSourceUrl, {
        forceRefresh: Boolean(req.forceRefresh),
      });
    }

    // 2. Synthesize best available search query and identifiers (never treating unverified identifiers as confirmed)
    const effectiveTitle = cleanProductQuery || firecrawlResearch?.title || "";
    const effectiveBrand = cleanBrand || firecrawlResearch?.brand;
    const effectiveModel =
      cleanModel ||
      firecrawlResearch?.model ||
      firecrawlResearch?.identifiers.mpn;
    const effectiveGtin =
      cleanUpc ||
      (firecrawlResearch?.identifiers.identifierConfidence !== "contradictory"
        ? firecrawlResearch?.identifiers.gtin ||
          firecrawlResearch?.identifiers.upc ||
          firecrawlResearch?.identifiers.ean
        : undefined);
    const effectiveAsin =
      cleanAsin ||
      (firecrawlResearch?.identifiers.identifierConfidence !== "contradictory"
        ? firecrawlResearch?.identifiers.asin
        : undefined);
    const effectiveEpid = cleanEpid || firecrawlResearch?.identifiers.epid;

    const searchQuery =
      effectiveGtin ||
      [effectiveBrand, effectiveModel, effectiveTitle]
        .filter(Boolean)
        .join(" ")
        .trim()
        .slice(0, 120) ||
      effectiveAsin ||
      "";

    // 3. Query Official Amazon Creators API (if configured and query/ASIN exists)
    let amazonStatus: CapabilityState | "skipped" | "error" = "skipped";
    let amazonStatusMessage = "No product query or ASIN provided for Amazon lookup.";
    let amazonProducts: NormalizedAmazonProduct[] = [];

    if (searchQuery || effectiveAsin) {
      const amzCap = await this.amazon.getCapabilityStatus();
      if (amzCap.state !== "available") {
        amazonStatus = amzCap.state;
        amazonStatusMessage = amzCap.message;
      } else {
        try {
          if (effectiveAsin && /^B[0-9A-Z]{9}$/i.test(effectiveAsin)) {
            amazonProducts = await this.amazon.getProducts([effectiveAsin.toUpperCase()]);
          }
          if (amazonProducts.length === 0 && searchQuery) {
            amazonProducts = await this.amazon.searchProducts(searchQuery, { itemCount: 5 });
          }
          amazonStatus = "available";
          amazonStatusMessage =
            amazonProducts.length > 0
              ? `Retrieved ${amazonProducts.length} product candidate(s) from official Amazon Creators API.`
              : "Official Amazon Creators API returned 0 matching catalog items.";
        } catch (err: any) {
          amazonStatus = "error";
          amazonStatusMessage = err?.message || "Amazon Creators API lookup failed.";
        }
      }
    }

    // 4. Query Official eBay Catalog API & Browse API (if configured and query exists)
    let ebayCatalogStatus: CapabilityState | "skipped" | "error" = "skipped";
    let ebayCatalogMessage = "No product query provided for eBay Catalog lookup.";
    let ebayCatalogProduct: NormalizedEbayCatalogProduct | null = null;

    let ebayBrowseStatus: CapabilityState | "skipped" | "error" = "skipped";
    let ebayBrowseMessage = "No product query provided for eBay Browse lookup.";
    let ebayActiveListings: NormalizedEbayListing[] = [];

    let ebaySoldHistory: SalesHistoryResult | null = null;

    if (searchQuery) {
      const [catCap, browseCap] = await Promise.all([
        this.ebay.getCatalogCapabilityStatus(),
        this.ebay.getBrowseCapabilityStatus(),
      ]);

      if (catCap.state !== "available") {
        ebayCatalogStatus = catCap.state;
        ebayCatalogMessage = catCap.message;
      } else {
        try {
          ebayCatalogProduct = await this.ebay.matchCatalogProduct(searchQuery);
          ebayCatalogStatus = "available";
          ebayCatalogMessage = ebayCatalogProduct
            ? `Matched eBay Catalog product (ePID: ${ebayCatalogProduct.epid}).`
            : "Official eBay Catalog API returned no direct ePID match.";
        } catch (err: any) {
          ebayCatalogStatus = "error";
          ebayCatalogMessage = err?.message || "eBay Catalog API lookup failed.";
        }
      }

      if (browseCap.state !== "available") {
        ebayBrowseStatus = browseCap.state;
        ebayBrowseMessage = browseCap.message;
      } else {
        try {
          ebayActiveListings = await this.ebay.searchBrowseItems(searchQuery, { limit: 10 });
          ebayBrowseStatus = "available";
          ebayBrowseMessage =
            ebayActiveListings.length > 0
              ? `Retrieved ${ebayActiveListings.length} active listing(s) from official eBay Browse API (asking prices only, not completed sales).`
              : "Official eBay Browse API returned 0 active listings.";
        } catch (err: any) {
          ebayBrowseStatus = "error";
          ebayBrowseMessage = err?.message || "eBay Browse API search failed.";
        }
      }

      try {
        ebaySoldHistory = await this.soldHistory.getSalesHistory({
          query: searchQuery,
          asin: effectiveAsin,
          epid: ebayCatalogProduct?.epid || effectiveEpid,
          upc: effectiveGtin,
        });
      } catch {
        ebaySoldHistory = null;
      }
    }

    // 5. Evaluate Cross-Marketplace Product Match Confidence
    const topAmazon = amazonProducts[0];
    const sourceHasContradictions =
      (firecrawlResearch?.integrity.contradictions.length || 0) > 0;
    const hasPriceContradiction = Boolean(
      firecrawlResearch?.integrity.contradictions.some((c) => /price/i.test(c))
    );

    const amazonMatchAssessment = evaluateProductMatch({
      targetChannel: "Amazon",
      sourceTitle: effectiveTitle,
      sourceBrand: effectiveBrand,
      sourceModel: effectiveModel,
      sourceGtin: effectiveGtin,
      sourceAsin: effectiveAsin,
      sourceHasContradictions,
      candidateId: topAmazon?.asin,
      candidateTitle: topAmazon?.title,
      candidateBrand: topAmazon?.brand,
      candidateUrl: topAmazon?.detailPageUrl,
    });

    const ebayMatchAssessment = evaluateProductMatch({
      targetChannel: "eBay",
      sourceTitle: effectiveTitle,
      sourceBrand: effectiveBrand,
      sourceModel: effectiveModel,
      sourceGtin: effectiveGtin,
      sourceEpid: effectiveEpid,
      sourceHasContradictions,
      candidateId: ebayCatalogProduct?.epid,
      candidateTitle: ebayCatalogProduct?.title || ebayActiveListings[0]?.title,
      candidateBrand: ebayCatalogProduct?.brand,
      candidateModelOrMpn: ebayCatalogProduct?.mpn,
      candidateGtin: ebayCatalogProduct?.gtin,
      candidateUrl: ebayCatalogProduct?.productWebUrl || ebayActiveListings[0]?.itemWebUrl,
    });

    // 6. Compute Active Browse Listing Price Statistics
    let activePriceStats:
      | {
          count: number;
          lowestPrice: number;
          medianPrice: number;
          highestPrice: number;
          note: string;
        }
      | undefined;

    const validActivePrices = ebayActiveListings
      .map((item) => item.price + (item.shippingCost || 0))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);

    if (validActivePrices.length > 0) {
      const mid = Math.floor(validActivePrices.length / 2);
      const median =
        validActivePrices.length % 2 === 0
          ? Number(((validActivePrices[mid - 1] + validActivePrices[mid]) / 2).toFixed(2))
          : Number(validActivePrices[mid].toFixed(2));
      activePriceStats = {
        count: validActivePrices.length,
        lowestPrice: Number(validActivePrices[0].toFixed(2)),
        medianPrice: median,
        highestPrice: Number(validActivePrices[validActivePrices.length - 1].toFixed(2)),
        note: "Active eBay Browse asking prices (including shipping) — NOT confirmed completed/sold transactions.",
      };
    }

    // 7. Determine Source Cost, Currencies & Target Resale Prices with Provenance
    let sourceCost: number | null = null;
    let sourceCostProvenance: FinancialInputProvenance = "missing";
    let sourceCurrency = safeTrimString(req.sourceCurrency, 10) || "USD";

    if (typeof req.sourceCost === "number" && Number.isFinite(req.sourceCost) && req.sourceCost > 0) {
      sourceCost = req.sourceCost;
      sourceCostProvenance = "user_supplied";
    } else if (
      firecrawlResearch?.observedPrice !== undefined &&
      firecrawlResearch.observedPrice > 0
    ) {
      sourceCost = firecrawlResearch.observedPrice;
      sourceCostProvenance = "extracted_public_web_firecrawl";
      if (!req.sourceCurrency && firecrawlResearch.observedCurrency) {
        sourceCurrency = firecrawlResearch.observedCurrency;
      }
    }

    let targetEbayPrice: number | null = null;
    let targetEbayPriceProvenance: FinancialInputProvenance = "missing";
    let targetEbayCurrency = "USD";

    if (
      typeof req.targetEbayPriceOverride === "number" &&
      Number.isFinite(req.targetEbayPriceOverride) &&
      req.targetEbayPriceOverride > 0
    ) {
      targetEbayPrice = req.targetEbayPriceOverride;
      targetEbayPriceProvenance = "user_supplied";
    } else if (
      ebaySoldHistory?.provenance === "confirmed_marketplace_api" &&
      ebaySoldHistory.confirmedSales &&
      ebaySoldHistory.confirmedSales.length > 0
    ) {
      const soldPrices = ebaySoldHistory.confirmedSales
        .map((s) => s.soldPrice + (s.shippingCharged || 0))
        .filter((p) => p > 0)
        .sort((a, b) => a - b);
      if (soldPrices.length > 0) {
        targetEbayPrice = soldPrices[Math.floor(soldPrices.length / 2)];
        targetEbayPriceProvenance = "confirmed_marketplace_api";
        targetEbayCurrency = ebaySoldHistory.confirmedSales[0]?.currency || "USD";
      }
    } else if (activePriceStats && activePriceStats.medianPrice > 0) {
      targetEbayPrice = activePriceStats.medianPrice;
      targetEbayPriceProvenance = "confirmed_marketplace_api";
      targetEbayCurrency = ebayActiveListings[0]?.currency || "USD";
    } else if (
      ebaySoldHistory?.estimatedMetrics?.medianSoldPrice &&
      ebaySoldHistory.estimatedMetrics.medianSoldPrice > 0
    ) {
      targetEbayPrice = ebaySoldHistory.estimatedMetrics.medianSoldPrice;
      targetEbayPriceProvenance = "estimated_inferred_ai";
    }

    let targetAmazonPrice: number | null = null;
    let targetAmazonPriceProvenance: FinancialInputProvenance = "missing";
    let targetAmazonCurrency = "USD";

    if (
      typeof req.targetAmazonPriceOverride === "number" &&
      Number.isFinite(req.targetAmazonPriceOverride) &&
      req.targetAmazonPriceOverride > 0
    ) {
      targetAmazonPrice = req.targetAmazonPriceOverride;
      targetAmazonPriceProvenance = "user_supplied";
    } else if (topAmazon?.buyBoxPrice && topAmazon.buyBoxPrice > 0) {
      targetAmazonPrice = topAmazon.buyBoxPrice;
      targetAmazonPriceProvenance = "confirmed_marketplace_api";
      targetAmazonCurrency = topAmazon.offersV2?.[0]?.currency || "USD";
    }

    const financialEstimates = calculateArbitrageFinancials({
      sourceCost,
      sourceCostProvenance,
      sourceCurrency,
      sourceShipping: req.sourceShipping,
      sourceTaxRatePct: req.sourceTaxRatePct,
      targetEbayPrice,
      targetEbayPriceProvenance,
      targetEbayCurrency,
      targetAmazonPrice,
      targetAmazonPriceProvenance,
      targetAmazonCurrency,
      outboundShippingEstimate: req.outboundShippingEstimate,
      promotedRatePct: req.promotedRatePct,
      isSourceStale: firecrawlResearch?.isStale,
      hasPriceContradiction,
      ebayMatchConfidence: ebayMatchAssessment.matchConfidence,
      amazonMatchConfidence: amazonMatchAssessment.matchConfidence,
    });

    if (
      targetEbayPriceProvenance === "confirmed_marketplace_api" &&
      (!ebaySoldHistory?.confirmedSales || ebaySoldHistory.confirmedSales.length === 0) &&
      activePriceStats
    ) {
      financialEstimates.ebay.warnings.unshift(
        "Target eBay price is derived from active eBay Browse asking listings, NOT confirmed completed sales."
      );
    }

    // 8. Build Overall Summary & Missing Evidence Audit
    const missingEvidenceList: string[] = [];
    if (!effectiveGtin) {
      missingEvidenceList.push("Verified UPC/EAN/GTIN barcode identifier");
    }
    if (sourceCost === null) {
      missingEvidenceList.push("Verified supplier unit acquisition cost (COGS)");
    }
    if (targetEbayPrice === null) {
      missingEvidenceList.push("eBay target resale benchmark (sold comp or active listing price)");
    }
    if (
      !ebaySoldHistory ||
      ebaySoldHistory.provenance !== "confirmed_marketplace_api" ||
      !ebaySoldHistory.confirmedSales?.length
    ) {
      missingEvidenceList.push(
        "Confirmed eBay completed/sold transaction history (eBay Marketplace Insights API requires Commercial Partner approval)"
      );
    }
    if (amazonStatus !== "available") {
      missingEvidenceList.push("Official Amazon Creators API catalog & OffersV2 verification");
    }
    if (firecrawlResearch) {
      for (const mf of firecrawlResearch.integrity.missingFields) {
        missingEvidenceList.push(`Public page attribute: ${mf}`);
      }
    }

    const actionableWarnings: string[] = [
      ...(firecrawlResearch?.integrity.contradictions || []),
      ...(firecrawlResearch?.integrity.staleDataWarnings || []),
      ...amazonMatchAssessment.contradictions,
      ...ebayMatchAssessment.contradictions,
    ];

    if (
      !amazonMatchAssessment.isVerifiedCatalogMatch &&
      !ebayMatchAssessment.isVerifiedCatalogMatch
    ) {
      actionableWarnings.push(
        "Product match across Amazon and eBay is NOT barcode/identifier-verified. Do not commit inventory capital without confirming UPC/GTIN/MPN match."
      );
    }

    return {
      timestamp: now,
      queryUsed: searchQuery,
      firecrawlResearch,
      marketplaceData: {
        amazon: {
          status: amazonStatus,
          statusMessage: amazonStatusMessage,
          products: amazonProducts,
          matchAssessment: amazonMatchAssessment,
        },
        ebayCatalog: {
          status: ebayCatalogStatus,
          statusMessage: ebayCatalogMessage,
          catalogProduct: ebayCatalogProduct,
          matchAssessment: ebayMatchAssessment,
        },
        ebayBrowse: {
          status: ebayBrowseStatus,
          statusMessage: ebayBrowseMessage,
          activeListings: ebayActiveListings,
          activePriceStats,
        },
        ebaySoldHistory,
      },
      financialEstimates,
      overallSummary: {
        hasVerifiedIdentifierMatch:
          amazonMatchAssessment.isVerifiedCatalogMatch ||
          ebayMatchAssessment.isVerifiedCatalogMatch,
        hasStaleOrContradictoryEvidence:
          Boolean(firecrawlResearch?.isStale) ||
          (firecrawlResearch?.integrity.contradictions.length || 0) > 0 ||
          amazonMatchAssessment.contradictions.length > 0 ||
          ebayMatchAssessment.contradictions.length > 0,
        missingEvidenceList,
        actionableWarnings,
      },
    };
  }
}

export const arbitrageEnrichmentService = new ArbitrageEnrichmentService();

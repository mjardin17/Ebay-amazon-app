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
 * 6. Explicit comparable-listing filtering (excluding accessories, replacement parts,
 *    multipack mismatches, used/open-box items, wrong model tiers, and price outliers)
 * 7. Transparent fee, weight/oversize shipping, tax, currency, and net profit estimation
 *    using the app's calculation formulas while preserving input provenance and refusing
 *    to mark stale, contradictory, currency-mismatched, oversize-unverified, or
 *    unverified-match deals as profitable.
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
import {
  firecrawlProvider,
  FirecrawlResearchProvider,
  isValidGtinCheckDigit,
} from "./firecrawlProvider";

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
    .replace(/['’]/g, "")
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

/**
 * Normalizes a valid 8-, 12-, 13-, or 14-digit GTIN/UPC/EAN barcode ONLY if:
 * 1. The input string contains only digits, spaces, or hyphens (no alphabetic SKU characters),
 * 2. It passes Modulo-10 check-digit validation, and
 * 3. Packaging hierarchy is preserved:
 *    - 8-digit GTIN-8 stays distinct ("GTIN8:xxxxxxxx") so it never collides with 12/13/14-digit codes starting with "0000".
 *    - 14-digit GTIN-14 with non-zero packaging indicator digit [1-9] (case pack / multipack carton) stays distinct
 *      ("GTIN14_PACK:xxxxxxxxxxxxxx") so a master case never falsely matches a single retail unit.
 *    - Single-unit 12-digit UPC-A, 13-digit EAN-13/GTIN-13, and 0-indicator 14-digit GTIN-14 normalize to canonical 14-digit "00..."/"0...".
 */
export function normalizeCanonicalGtin(rawCode?: string | null): string | null {
  if (typeof rawCode !== "string") return null;
  const trimmed = rawCode.trim();
  if (!trimmed || !/^[\d\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (!isValidGtinCheckDigit(digits)) return null;

  if (digits.length === 8) {
    return `GTIN8:${digits}`;
  }
  if (digits.length === 14 && !digits.startsWith("0")) {
    return `GTIN14_PACK:${digits}`;
  }
  return digits.padStart(14, "0");
}

/**
 * Checks whether two GTIN/UPC/EAN strings represent the exact same GS1 single-unit or case barcode
 * (for example, 12-digit UPC-A "847280092369", 13-digit leading-zero GTIN-13 "0847280092369",
 * and 0-indicator GTIN-14 "00847280092369"), while rejecting invalid check digits, alphanumeric SKUs,
 * case-vs-single-unit GTIN-14 mismatches, or genuinely different barcodes.
 */
export function areEquivalentGtins(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const canonA = normalizeCanonicalGtin(a);
  const canonB = normalizeCanonicalGtin(b);
  if (canonA && canonB) {
    return canonA === canonB;
  }
  return false;
}

const COMPONENT_COUNT_CONTEXT_PATTERN =
  /\b(?:lego|star\s*wars|technic|creator|duplo|ninjago|mega\s*bloks|building|block|blocks|brick|bricks|minifigure|minifigures|puzzle|jigsaw|playset|model\s+kit|tool|tools|socket|sockets|wrench|screwdriver|drill\s+bit|bit\s+set|cookware|cutlery|utensil|dinnerware|silverware|flatware|sheet\s+set|bedding|comforter|quilt|towel|towels|divider|dividers|sticker|stickers|decal|decals|flower|flowers|floral|marker|markers|pencil|pencils|crayon|crayons|brush\s+set|makeup\s+brushes)\b/i;

/**
 * Detects multi-unit retail bundle / multipack count (e.g. "2-Pack", "Pack of 3", "Lot of 4", "Set of 2", "2x")
 * while carefully distinguishing product piece/component counts (such as LEGO "282 Pieces",
 * "1000-Piece Puzzle", or "3pcs Comforter Set").
 */
export function detectMultiPackCount(title?: string): number {
  if (!title) return 1;

  // 1. Explicit multi-unit pack/lot/bundle patterns ("2-Pack", "(2 Pack)", "Pack of 4", "Lot of 2")
  const explicitPackMatch =
    title.match(
      /\b(\d+)\s*[- ]?\s*(?:pack|pk|packs|multipack|multi-pack|bottles|jars|tubes|boxes|cans|containers|units)\b/i
    ) ||
    title.match(/\b(?:pack|lot|bundle|case|box)\s+of\s+(\d+)\b/i) ||
    title.match(/\b(?:qty|quantity)\s*[:#-]?\s*(\d+)\b/i);

  if (explicitPackMatch) {
    const numStr = explicitPackMatch[1] || explicitPackMatch[2];
    const n = parseInt(numStr, 10);
    if (n > 1 && n <= 100) return n;
  }

  // 2. "Set of N" or "N Sets" or "Nx <Word>" when NOT a component-count category
  if (!COMPONENT_COUNT_CONTEXT_PATTERN.test(title)) {
    const setOfMatch =
      title.match(/\bset\s+of\s+(\d+)\b/i) ||
      title.match(/\b(\d+)\s+sets\b/i) ||
      title.match(/(?:^|\s|\()(\d+)\s*x\s+[a-z]{3,}/i);
    if (setOfMatch?.[1]) {
      const n = parseInt(setOfMatch[1], 10);
      if (n > 1 && n <= 50) return n;
    }
  }

  // 3. Combo / refill multipack phrasing (e.g. "16 oz pump + 16 oz refill", "Twin Pack")
  if (
    /\b(?:twin\s*pack|double\s*pack|duo\s*pack)\b/i.test(title) ||
    /\+\s*\d+(?:\.\d+)?\s*(?:fl\s*)?oz\s+refill\b/i.test(title)
  ) {
    return 2;
  }

  // 4. Check "N pcs / pieces / count / ct" ONLY when NOT a component-count product (LEGO, puzzles, tool sets, bedding, etc.)
  const pieceOrCountMatch = title.match(/\b(\d+)\s*[- ]?\s*(?:pcs|pieces|count|ct)\b/i);
  if (pieceOrCountMatch?.[1]) {
    const n = parseInt(pieceOrCountMatch[1], 10);
    // Component counts in LEGO/puzzles/tool sets or counts > 12 are single-item piece/capsule counts, not multi-box bundles
    if (n > 1 && n <= 12 && !COMPONENT_COUNT_CONTEXT_PATTERN.test(title)) {
      return n;
    }
  }

  return 1;
}

export function isAccessoryOrCompatiblePhrase(title?: string): boolean {
  if (!title) return false;
  return /\b(?:compatible\s+with|replacement\s+for|replacement\s+filter|wick\s+filter|super\s+wick|filter\s+for|replacement\s+part|replacement\s+parts|spare\s+part|replacement\s+lid|replacement\s+straw|replacement\s+cap|replacement\s+cord|silicone\s+boot\s+for|boot\s+for|case\s+for|cover\s+for|charger\s+for|adapter\s+for|mount\s+for|carrying\s+case\s+for|fits\s+|empty\s+box|box\s+only|manual\s+only|instructions\s+only|no\s+minifigures?|minifigures?\s+only|for\s+parts\s+only)\b/i.test(
    title
  );
}

function compactModelCode(val?: string): string {
  if (!val) return "";
  return val.trim().toLowerCase().replace(/[\s\-_\/]+/g, "");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TIER_MODIFIERS = ["plus", "pro", "max", "ultra", "mini", "lite", "oled"];
const GENERATION_OR_TIER_SUFFIX_PATTERN =
  /^(?:v\d+|gen\d+|mk\d+|ii|iii|iv|pro|plus|max|ultra|mini|lite|oled|fe|se|\d)$/i;

/**
 * Evaluates model / MPN compatibility between source research and a marketplace candidate.
 * Handles:
 * - Exact model/MPN equality
 * - Spacing/hyphen normalization on alphanumeric model numbers (e.g. "EP9800" vs "EP9 800")
 * - Bidirectional tier modifier checks ("Plus", "Pro", "Max", "Ultra", "Mini", "Lite", "OLED")
 * - Legitimate base-model vs color/variant-specific MPN relationships (e.g. Carhartt "A18" vs "A18001" or "A18BRN")
 *   when brand matches, the base style code appears as a standalone token, and the suffix is not a generation/tier code
 * - Descriptive multi-word model names (e.g. "FreeSip 24oz") vs internal catalog MPNs ("C00018")
 *   when GTIN is verified or all descriptive tokens appear in the candidate title
 */
export function evaluateModelCompatibility(params: {
  sourceModel?: string;
  candidateModelOrMpn?: string;
  sourceTitle?: string;
  candidateTitle?: string;
  brandMatches: boolean;
  hasExactGtinMatch: boolean;
}): {
  status: "exact_mpn" | "model_or_variant" | "contradiction" | "unverified";
  matchedBasis?: "brand_mpn" | "brand_model";
  note?: string;
} {
  const {
    sourceModel,
    candidateModelOrMpn,
    sourceTitle,
    candidateTitle,
    brandMatches,
    hasExactGtinMatch,
  } = params;

  const normSourceModel = (sourceModel || "").trim().toLowerCase();
  const normCandModel = (candidateModelOrMpn || "").trim().toLowerCase();
  const candTitleLower = (candidateTitle || "").toLowerCase();
  const sourceTitleLower = (sourceTitle || "").toLowerCase();

  if (!normSourceModel) {
    return { status: "unverified" };
  }

  const compactSource = compactModelCode(normSourceModel);
  const compactCand = compactModelCode(normCandModel);
  const compactCandTitle = compactModelCode(candTitleLower);

  // Bidirectional check for tier modifiers ("Plus", "Pro", "Max", "Ultra", "Mini", "Lite", "OLED")
  for (const mod of TIER_MODIFIERS) {
    const modRegex = new RegExp(`\\b${mod}\\b`, "i");
    const sourceHasMod = modRegex.test(normSourceModel) || modRegex.test(sourceTitleLower);
    const candHasMod =
      (Boolean(normCandModel) && modRegex.test(normCandModel)) ||
      (Boolean(candidateTitle) && modRegex.test(candTitleLower));

    if (modRegex.test(normSourceModel) && (candidateTitle || normCandModel) && !candHasMod) {
      return {
        status: "contradiction",
        note: `Model tier mismatch: source model "${sourceModel}" requires "${mod.toUpperCase()}" variant, which is missing from candidate.`,
      };
    }
    if (!sourceHasMod && candHasMod && (candTitleLower.includes(normSourceModel) || (normCandModel && normCandModel.includes(normSourceModel)))) {
      return {
        status: "contradiction",
        note: `Model tier mismatch: candidate includes "${mod.toUpperCase()}" tier modifier not present in source model "${sourceModel}".`,
      };
    }
  }

  if (normCandModel) {
    // 1. Exact or spacing-normalized match
    if (normSourceModel === normCandModel || (compactSource.length >= 3 && compactSource === compactCand)) {
      return { status: "exact_mpn", matchedBasis: "brand_mpn" };
    }

    // 2. Base-model vs color/size-suffixed MPN (e.g. Carhartt "A18" vs "A18001" / "A18BRN" / "A18-BLK")
    const hasLetterAndDigit = /[a-z]/i.test(compactSource) && /\d/.test(compactSource);
    if (
      (brandMatches || hasExactGtinMatch) &&
      hasLetterAndDigit &&
      compactSource.length >= 3 &&
      compactCand.startsWith(compactSource)
    ) {
      const suffix = compactCand.slice(compactSource.length);
      const rawSuffix = normCandModel
        .slice(normSourceModel.length)
        .replace(/^[\s\-_\/]+/, "");
      const isGenerationOrTierSuffix =
        GENERATION_OR_TIER_SUFFIX_PATTERN.test(suffix) ||
        GENERATION_OR_TIER_SUFFIX_PATTERN.test(rawSuffix);

      if (!isGenerationOrTierSuffix) {
        const baseTokenRegex = new RegExp(`\\b${escapeRegExp(normSourceModel)}\\b`, "i");
        const baseAppearsStandalone =
          baseTokenRegex.test(sourceTitleLower) || baseTokenRegex.test(candTitleLower);
        const hasExplicitDelimiter =
          normCandModel.startsWith(normSourceModel + "-") ||
          normCandModel.startsWith(normSourceModel + "/") ||
          normCandModel.startsWith(normSourceModel + " ");

        if (
          suffix.length >= 1 &&
          suffix.length <= 6 &&
          (hasExplicitDelimiter || (baseAppearsStandalone && suffix.length >= 2))
        ) {
          return {
            status: "model_or_variant",
            matchedBasis: "brand_model",
            note: `Base model "${sourceModel}" matches catalog variant MPN "${candidateModelOrMpn}" prefix — verify exact color/size SKU.`,
          };
        }
      }
    }

    // 3. Descriptive multi-word source model name (e.g. "FreeSip 24oz") vs internal catalog MPN ("C00018")
    if (/\s/.test(normSourceModel)) {
      const modelTokens = tokenizeTitle(normSourceModel);
      const allTokensInCandTitle =
        modelTokens.length > 0 && modelTokens.every((t) => candTitleLower.includes(t));
      if (hasExactGtinMatch || (brandMatches && allTokensInCandTitle)) {
        return {
          status: "model_or_variant",
          matchedBasis: "brand_model",
          note: `Source model "${sourceModel}" is a descriptive product-line name while catalog lists MPN "${candidateModelOrMpn}".`,
        };
      }
    }

    return {
      status: "contradiction",
      note: `Model/MPN mismatch: source model "${sourceModel}" vs catalog MPN "${candidateModelOrMpn}".`,
    };
  }

  // No candidateModelOrMpn provided; check candidateTitle (including spacing-normalized alphanumeric model codes like "EP9800" vs "EP9 800")
  if (normSourceModel.length >= 3) {
    const standaloneModelRegex = new RegExp(`\\b${escapeRegExp(normSourceModel)}\\b`, "i");
    if (standaloneModelRegex.test(candTitleLower)) {
      return { status: "model_or_variant", matchedBasis: "brand_model" };
    }
    const isAlnumModelCode =
      compactSource.length >= 4 && /[a-z]/i.test(compactSource) && /\d/.test(compactSource);
    if (isAlnumModelCode && compactCandTitle.includes(compactSource)) {
      return {
        status: "model_or_variant",
        matchedBasis: "brand_model",
        note: `Matched model "${sourceModel}" in candidate title after spacing normalization.`,
      };
    }
    // Check if all tokens of a multi-word model (e.g. "CurlPro Plus") appear in candidateTitle
    if (/\s/.test(normSourceModel)) {
      const modelTokens = normSourceModel.split(/\s+/).filter((t) => t.length >= 2);
      if (modelTokens.length >= 2 && modelTokens.every((t) => candTitleLower.includes(t))) {
        return { status: "model_or_variant", matchedBasis: "brand_model" };
      }
    }
  }

  return { status: "unverified" };
}

/**
 * Evaluates whether a candidate Amazon or eBay catalog product matches the researched product.
 * Never silently treats uncertain, uncorroborated, or fuzzy matches as verified matches.
 */
export function evaluateProductMatch(params: {
  targetChannel: "Amazon" | "eBay";
  sourceTitle?: string;
  sourceBrand?: string;
  sourceModel?: string;
  sourceGtin?: string;
  sourceAlternateGtins?: string[];
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
    sourceAlternateGtins,
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

  // 1. Identifier comparisons (with GS1 canonical GTIN equivalence and dual-region barcode support)
  const allSourceGtins = Array.from(
    new Set(
      [sourceGtin, ...(sourceAlternateGtins || [])]
        .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
        .map((g) => g.trim())
    )
  );
  const rawCandidateGtin = (candidateGtin || "").trim();
  let hasExactGtinMatch = false;

  if (allSourceGtins.length > 0 && rawCandidateGtin) {
    if (allSourceGtins.some((srcCode) => areEquivalentGtins(srcCode, rawCandidateGtin))) {
      hasExactGtinMatch = true;
      matchedOn.push("gtin");
    } else {
      contradictions.push(
        `GTIN/UPC mismatch: researched product (${allSourceGtins[0]}) vs ${targetChannel} catalog (${rawCandidateGtin}).`
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

  // 2. Brand comparison (also checks if sourceBrand appears explicitly in candidateTitle when candidateBrand is omitted on Browse fallback)
  const normSourceBrand = (sourceBrand || "").trim().toLowerCase();
  let normCandBrand = (candidateBrand || "").trim().toLowerCase();
  const candTitleLower = (candidateTitle || "").toLowerCase();

  if (!normCandBrand && normSourceBrand && candTitleLower) {
    const primaryBrandToken = normSourceBrand.split(/\s+/)[0];
    if (primaryBrandToken && primaryBrandToken.length >= 3 && candTitleLower.includes(primaryBrandToken)) {
      normCandBrand = primaryBrandToken;
    }
  }

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
        isSourceGeneric ? sourceBrand || "Unbranded" : candidateBrand || "Unbranded"
      }" while the other is "${isSourceGeneric ? candidateBrand : sourceBrand}".`
    );
  } else {
    uncertaintyReasons.push("Brand is missing or generic on both source and catalog candidate.");
  }

  // 3. Model / MPN comparison
  const modelEval = evaluateModelCompatibility({
    sourceModel,
    candidateModelOrMpn,
    sourceTitle,
    candidateTitle,
    brandMatches,
    hasExactGtinMatch,
  });

  let modelMatches = false;
  if (modelEval.status === "exact_mpn" || modelEval.status === "model_or_variant") {
    modelMatches = true;
    if (modelEval.matchedBasis) {
      matchedOn.push(modelEval.matchedBasis);
    }
    if (modelEval.note) {
      uncertaintyReasons.push(modelEval.note);
    }
  } else if (modelEval.status === "contradiction") {
    contradictions.push(
      modelEval.note ||
        `Model/MPN mismatch: source model "${sourceModel}" vs ${targetChannel} MPN "${candidateModelOrMpn}".`
    );
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
  // A valid barcode check digit establishes structural validity, not product identity by itself.
  // Verified catalog status requires an official catalog ID + non-contradictory corroborating product identity.
  let matchConfidence: ProductMatchConfidence = "unverified";
  let confidenceScorePct = 15;
  let isVerifiedCatalogMatch = false;

  const hasExactIdentifier = hasExactGtinMatch || hasExactAsinMatch || hasExactEpidMatch;
  const hasTrustworthyCatalogRecord = Boolean(candidateId && candidateTitle);
  const hasCorroboratingIdentity =
    (brandMatches && (modelMatches || overlapRatio >= 0.25 || !sourceTitle || !candidateTitle)) ||
    (!normSourceBrand && (overlapRatio >= 0.45 || !sourceTitle));

  if (hasExactIdentifier && sourceTitle && candidateTitle && overlapRatio < 0.2 && !modelMatches) {
    contradictions.push(
      `Suspected recycled or misassigned barcode: identifier matched ${targetChannel} catalog (${candidateId || "unknown"}), but product titles have minimal overlap (${Math.round(
        overlapRatio * 100
      )}%).`
    );
  }

  if (contradictions.length > 0) {
    matchConfidence = "unverified";
    confidenceScorePct = Math.max(5, 25 - contradictions.length * 10);
    isVerifiedCatalogMatch = false;
  } else if (
    hasExactIdentifier &&
    hasTrustworthyCatalogRecord &&
    !sourceHasContradictions &&
    hasCorroboratingIdentity
  ) {
    matchConfidence = "high";
    confidenceScorePct = brandMatches && modelMatches ? 96 : 90;
    isVerifiedCatalogMatch = true;
  } else if (
    brandMatches &&
    modelMatches &&
    (overlapRatio >= 0.45 ||
      modelEval.status === "exact_mpn" ||
      modelEval.status === "model_or_variant")
  ) {
    matchConfidence = "medium";
    confidenceScorePct = Math.round(70 + Math.min(overlapRatio, 1) * 15);
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
    candidateBrand: candidateBrand || (brandMatches ? sourceBrand : undefined),
    candidateUrl,
    candidateProvenance: "confirmed_marketplace_api",
  };
}

/**
 * Filters eBay Browse active listings to exclude non-comparable items before computing price statistics:
 * 1. Excludes replacement parts / compatible accessories / incomplete items when the source product is a primary item
 * 2. Excludes multipack / bundle quantity mismatches (e.g. 2-packs when source is 1-pack)
 * 3. Excludes used, pre-owned, open-box, refurbished, or unverified-condition items when targetCondition is "New"
 * 4. Excludes different model tiers (bidirectional check for "Plus", "Pro", "Max", "Ultra", "Mini", "Lite", "OLED")
 * 5. Excludes extreme low-price outliers (<25% of referencePrice when referencePrice >= $20) that indicate variation bait or parts
 */
export function filterComparableEbayListings(params: {
  listings: NormalizedEbayListing[];
  sourceTitle?: string;
  sourceBrand?: string;
  sourceModel?: string;
  targetCondition?: "New" | "Used" | "Any";
  referencePrice?: number | null;
}): {
  comparableListings: NormalizedEbayListing[];
  excludedListings: Array<{ listing: NormalizedEbayListing; reason: string }>;
} {
  const {
    listings,
    sourceTitle,
    sourceModel,
    targetCondition = "New",
    referencePrice,
  } = params;
  const sourcePack = detectMultiPackCount(sourceTitle);
  const sourceIsAccessory = isAccessoryOrCompatiblePhrase(sourceTitle);
  const normSourceModel = (sourceModel || "").trim().toLowerCase();
  const sourceTitleLower = (sourceTitle || "").toLowerCase();

  const comparableListings: NormalizedEbayListing[] = [];
  const excludedListings: Array<{ listing: NormalizedEbayListing; reason: string }> = [];

  const nonNewTitlePattern =
    /\b(?:pre-owned|preowned|pre\s+owned|light\s+used|lightly\s+used|gently\s+used|used\s+condition|\beuc\b|\bguc\b|open\s+box|open-box|refurbished|incomplete|missing\s+parts|damaged|for\s+parts|unsealed)\b/i;
  const explicitNewTitlePattern =
    /\b(?:new|brand\s*new|sealed|nwt|nib|bnib|factory\s*sealed)\b/i;

  const hasExplicitNewListingInBatch = listings.some((item) => {
    const cond = (item.condition || "").trim();
    return /^(?:new|brand\s*new|new\s*with\s*tags|new\s*with\s*box|1000)$/i.test(cond);
  });

  for (const item of listings) {
    const title = item.title || "";
    const titleLower = title.toLowerCase();

    // 1. Accessory / replacement part check
    if (!sourceIsAccessory && isAccessoryOrCompatiblePhrase(title)) {
      excludedListings.push({
        listing: item,
        reason: "Excluded accessory or replacement part listing",
      });
      continue;
    }

    // 2. Multipack / bundle quantity check
    const itemPack = detectMultiPackCount(title);
    if (itemPack !== sourcePack) {
      excludedListings.push({
        listing: item,
        reason: `Excluded multipack/quantity mismatch (${itemPack}-unit vs ${sourcePack}-unit)`,
      });
      continue;
    }

    // 3. Condition check (when targeting New retail condition)
    if (targetCondition === "New") {
      const cond = (item.condition || "").trim();
      const isUnspecifiedCondition = !cond || cond.toLowerCase() === "unspecified";
      const isExplicitlyNonNewCondition =
        !isUnspecifiedCondition &&
        !/^(?:new|brand\s*new|new\s*with\s*tags|new\s*with\s*box|1000)$/i.test(cond);
      const hasUsedOrOpenBoxInTitle =
        nonNewTitlePattern.test(title) && !nonNewTitlePattern.test(sourceTitle || "");

      if (isExplicitlyNonNewCondition || hasUsedOrOpenBoxInTitle) {
        excludedListings.push({
          listing: item,
          reason: `Excluded non-New or open-box listing (${!isUnspecifiedCondition ? cond : "title condition flag"})`,
        });
        continue;
      }

      if (
        isUnspecifiedCondition &&
        !explicitNewTitlePattern.test(title) &&
        hasExplicitNewListingInBatch
      ) {
        excludedListings.push({
          listing: item,
          reason: "Excluded listing with missing/unspecified condition",
        });
        continue;
      }
    }

    // 4. Bidirectional model tier modifier check (e.g. "CurlPro Plus" vs "CurlPro")
    if (normSourceModel || sourceTitleLower) {
      let tierMismatchReason: string | null = null;
      for (const mod of TIER_MODIFIERS) {
        const modRegex = new RegExp(`\\b${mod}\\b`, "i");
        const sourceHasMod =
          (Boolean(normSourceModel) && modRegex.test(normSourceModel)) ||
          modRegex.test(sourceTitleLower);
        const itemHasMod = modRegex.test(titleLower);

        if (normSourceModel && modRegex.test(normSourceModel) && !itemHasMod) {
          tierMismatchReason = `Excluded different model tier (listing title missing "${mod.toUpperCase()}" variant)`;
          break;
        }
        if (
          !sourceHasMod &&
          itemHasMod &&
          normSourceModel &&
          titleLower.includes(normSourceModel)
        ) {
          tierMismatchReason = `Excluded different model tier (listing is "${mod.toUpperCase()}" variant while source is base model)`;
          break;
        }
      }
      if (tierMismatchReason) {
        excludedListings.push({
          listing: item,
          reason: tierMismatchReason,
        });
        continue;
      }
    }

    // 5. Extreme low-price outlier check (<25% of referencePrice when referencePrice >= $20)
    const totalAskingPrice = item.price + (item.shippingCost || 0);
    if (
      typeof referencePrice === "number" &&
      Number.isFinite(referencePrice) &&
      referencePrice >= 20 &&
      totalAskingPrice > 0 &&
      totalAskingPrice < referencePrice * 0.25
    ) {
      excludedListings.push({
        listing: item,
        reason: `Excluded extreme low-price outlier ($${totalAskingPrice.toFixed(
          2
        )} is <25% of $${referencePrice.toFixed(2)} reference price)`,
      });
      continue;
    }

    comparableListings.push(item);
  }

  return { comparableListings, excludedListings };
}

/**
 * Extracts physical shipping weight (in lbs) and dimensions (in inches) from extracted specifications or title.
 * Carefully distinguishes fluid volume ("fl oz", "gal", "ml") from physical weight ("lb", "lbs", "oz", "g", "kg"),
 * and parses both per-number inch suffixes ("27.5 in H x 18 in W") and composite "L x W x H in" strings.
 */
export function parseProductWeightAndDimensions(params: {
  specifications?: Record<string, string>;
  title?: string;
}): {
  weightLb: number | null;
  maxDimensionIn: number | null;
  sizeTier: "small_standard" | "large_standard" | "heavy_oversize" | "unknown";
} {
  const specs = params.specifications || {};
  let weightLb: number | null = null;
  let maxDimensionIn: number | null = null;

  const parseWeightFromText = (text: string): number | null => {
    const lbMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
    if (lbMatch?.[1]) {
      return Number(parseFloat(lbMatch[1]).toFixed(2));
    }
    const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/i);
    if (kgMatch?.[1]) {
      return Number((parseFloat(kgMatch[1]) * 2.20462).toFixed(2));
    }
    if (!/\bfl(?:uid)?\s*oz\b/i.test(text)) {
      const ozMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/i);
      if (ozMatch?.[1]) {
        return Number((parseFloat(ozMatch[1]) / 16).toFixed(2));
      }
      const gMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i);
      if (gMatch?.[1]) {
        return Number((parseFloat(gMatch[1]) / 453.592).toFixed(2));
      }
    }
    return null;
  };

  for (const [rawKey, rawVal] of Object.entries(specs)) {
    const key = rawKey.toLowerCase();
    const val = String(rawVal || "");

    if (/weight/i.test(key) && weightLb === null) {
      weightLb = parseWeightFromText(val);
    }

    if (/dimension|height|width|depth|length/i.test(key)) {
      // 1. Composite L x W x H (e.g., "27.5 x 18 x 18.5 inches" or "27.5\" x 18\" x 18.5\"")
      const compositeMatch = val.match(
        /(\d+(?:\.\d+)?)\s*(?:in(?:ches)?|")?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in(?:ches)?|")?\s*(?:[x×]\s*(\d+(?:\.\d+)?))?\s*(?:in(?:ches)?|")/i
      );
      if (compositeMatch) {
        const dims = [compositeMatch[1], compositeMatch[2], compositeMatch[3]]
          .filter(Boolean)
          .map((d) => parseFloat(d!))
          .filter((n) => Number.isFinite(n) && n > 0);
        for (const n of dims) {
          if (maxDimensionIn === null || n > maxDimensionIn) {
            maxDimensionIn = n;
          }
        }
      }

      // 2. Individual numbers followed by in / inches / "
      const inchNums = Array.from(val.matchAll(/(\d+(?:\.\d+)?)\s*(?:in(?:ches)?|")(?:\b|$)/gi)).map(
        (m) => parseFloat(m[1])
      );
      for (const n of inchNums) {
        if (Number.isFinite(n) && n > 0 && (maxDimensionIn === null || n > maxDimensionIn)) {
          maxDimensionIn = n;
        }
      }
    }
  }

  // Fallback to explicit shipping weight in title (e.g. "32 lb" / "32 lbs") if not in specs
  if (weightLb === null && params.title) {
    const titleLbMatch = params.title.match(/\b(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
    if (titleLbMatch?.[1]) {
      weightLb = Number(parseFloat(titleLbMatch[1]).toFixed(2));
    }
  }

  // Classify according to Amazon US FBA size tier limits:
  // - Large Standard ceiling: <= 20 lb and longest side <= 18 in
  // - Bulky / Heavy Oversize: > 20 lb (or >= 20 lb shipping weight) or longest side > 18 in
  let sizeTier: "small_standard" | "large_standard" | "heavy_oversize" | "unknown" = "unknown";
  if (
    (weightLb !== null && weightLb >= 20) ||
    (maxDimensionIn !== null && maxDimensionIn > 18)
  ) {
    sizeTier = "heavy_oversize";
  } else if ((weightLb !== null && weightLb > 1) || (maxDimensionIn !== null && maxDimensionIn > 15)) {
    sizeTier = "large_standard";
  } else if (weightLb !== null && weightLb > 0) {
    sizeTier = "small_standard";
  }

  return { weightLb, maxDimensionIn, sizeTier };
}

/**
 * Estimates Amazon US FBA fulfillment fee and inbound placement service fee from weight, dimensions, and price.
 * Uses the published 2026 Amazon US FBA rate card for Large Bulky ($9.35 + $0.38/lb over 1 lb for >=$10,
 * or $8.58 + $0.38/lb over 1 lb for <$10) and Extra-Large (>50 lb: $26.33 + $0.38/lb over 1 lb),
 * while clearly documenting the estimate assumptions.
 */
function estimateAmazonFbaFees(params: {
  amazonPrice: number | null;
  weightLb: number | null;
  maxDimensionIn: number | null;
  isHeavyOversize: boolean;
}): {
  fbaPickPack: number;
  placementFee: number;
  fbaFeeNote: string;
} {
  const { amazonPrice, weightLb, maxDimensionIn, isHeavyOversize } = params;
  const priceBandIsUnder10 = amazonPrice !== null && amazonPrice < 10;

  if (isHeavyOversize) {
    const effWeight = Math.max(1, Math.ceil(weightLb ?? 25));
    if (effWeight > 50) {
      // Extra-Large (>50 lb): $26.33 + $0.38/lb above 1 lb; Extra-Large has $0 inbound placement fee
      const fbaPickPack = Number((26.33 + (effWeight - 1) * 0.38).toFixed(2));
      return {
        fbaPickPack,
        placementFee: 0,
        fbaFeeNote: `Estimated 2026 FBA Extra-Large Fee ($26.33 + $0.38/lb over 1 lb for ${effWeight} lbs; carton dims unverified)`,
      };
    }

    // 2026 US FBA Large Bulky (<= 50 lb, > 18 in or >= 20 lb):
    // Base $9.35 (>=$10) or $8.58 (<$10) + $0.38/lb above the first lb
    const baseRate = priceBandIsUnder10 ? 8.58 : 9.35;
    const fbaPickPack = Number((baseRate + Math.max(0, effWeight - 1) * 0.38).toFixed(2));
    // 2026 Large Bulky partial-split inbound placement service fee midpoint by weight band
    const placementFee =
      effWeight <= 5
        ? 0.9
        : effWeight <= 12
        ? 1.2
        : effWeight <= 28
        ? 1.55
        : effWeight <= 42
        ? 2.0
        : 2.35;

    return {
      fbaPickPack,
      placementFee,
      fbaFeeNote: `Estimated 2026 FBA Large Bulky Fee ($${baseRate.toFixed(
        2
      )} + $0.38/lb over 1 lb for ${
        weightLb ?? `${maxDimensionIn}" (assumed 25 lb)`
      } lbs; assumes non-SIPP)`,
    };
  }

  if (weightLb !== null && weightLb > 1) {
    const fbaPickPack =
      weightLb <= 2 ? 5.4 : weightLb <= 5 ? 6.8 : weightLb <= 10 ? 8.5 : 11.5;
    const placementFee = weightLb <= 3 ? 0.34 : weightLb <= 5 ? 0.49 : 0.68;
    return {
      fbaPickPack,
      placementFee,
      fbaFeeNote: `Estimated FBA Fulfillment Fee (${weightLb} lbs Large Standard)`,
    };
  }

  const refPrice = amazonPrice ?? 25.0;
  const fbaPickPack = Number((3.5 + Math.min(refPrice * 0.04, 5.5)).toFixed(2));
  return {
    fbaPickPack,
    placementFee: 0.21,
    fbaFeeNote: "Estimated FBA Fulfillment Fee (Standard Tier — weight unverified)",
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
 * - Heavy/oversize product (weightLb >= 20 or maxDimensionIn > 18) without user-confirmed shipping -> scales freight/FBA bulky fees and prevents false "profitable_estimate"
 * - Unverified, none, or low (title-only) catalog match when target price is not user_supplied -> prevents false "profitable_estimate" ("insufficient_data")
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
  weightLb?: number | null;
  maxDimensionIn?: number | null;
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

  const weightLb =
    typeof params.weightLb === "number" && Number.isFinite(params.weightLb) && params.weightLb > 0
      ? Number(params.weightLb.toFixed(2))
      : null;
  const maxDimensionIn =
    typeof params.maxDimensionIn === "number" &&
    Number.isFinite(params.maxDimensionIn) &&
    params.maxDimensionIn > 0
      ? Number(params.maxDimensionIn.toFixed(2))
      : null;

  const isHeavyOversize =
    (weightLb !== null && weightLb >= 20) ||
    (maxDimensionIn !== null && maxDimensionIn > 18);

  // Outbound shipping handling:
  // - If explicitly passed as null, treat shipping as missing/unknown (cannot confirm profitability).
  // - If passed as finite number >= 0, provenance is "user_supplied".
  // - If omitted (undefined), scale by weight/sizeTier when known, or default to $6.50 standard parcel estimate.
  const isOutboundExplicitlyMissing = params.outboundShippingEstimate === null;
  const isOutboundUserSupplied =
    typeof params.outboundShippingEstimate === "number" &&
    Number.isFinite(params.outboundShippingEstimate) &&
    params.outboundShippingEstimate >= 0;

  let defaultEbayShipping = 6.5;
  if (isHeavyOversize) {
    const effWeight = weightLb ?? 25;
    defaultEbayShipping = Number((22.0 + Math.max(0, effWeight - 20) * 1.5).toFixed(2));
  } else if (weightLb !== null && weightLb > 1) {
    defaultEbayShipping =
      weightLb <= 2 ? 7.5 : weightLb <= 5 ? 9.5 : weightLb <= 10 ? 13.5 : 18.5;
  }

  const outboundShipping: number | null = isOutboundExplicitlyMissing
    ? null
    : isOutboundUserSupplied
    ? Number(params.outboundShippingEstimate!.toFixed(2))
    : defaultEbayShipping;

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
  if (isHeavyOversize && !isOutboundUserSupplied) {
    ebayWarnings.push(
      `Heavy/oversize product (${
        weightLb ? `${weightLb} lbs` : `${maxDimensionIn}"`
      }): standard $6.50 parcel shipping does not apply. Using estimated heavy ground freight ($${
        outboundShipping?.toFixed(2) || "N/A"
      }); verify exact carton dimensions and carrier zone.`
    );
  } else if (outboundShippingProvenance === "estimated_inferred_ai") {
    ebayWarnings.push(
      `Outbound domestic postage is an unverified $${
        outboundShipping?.toFixed(2) || "6.50"
      } estimate (package weight and dimensions not verified).`
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

  const isEbayMatchContradictoryOrMissing =
    (params.ebayMatchConfidence === "unverified" || params.ebayMatchConfidence === "none") &&
    targetEbayProv !== "user_supplied";

  const isEbayMatchLowConfidenceUnoverridden =
    params.ebayMatchConfidence === "low" && targetEbayProv !== "user_supplied";

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
      fulfillmentFeeNote: isHeavyOversize
        ? `Estimated Heavy/Oversize Ground Shipping (${weightLb ?? "20+"} lbs)`
        : "Estimated domestic outbound carrier label",
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

    // Never present a stale scraped price, unverified/low-confidence match, or unconfirmed heavy/oversize freight as profitable
    const blockedFromProfitable =
      isSourceStaleScraped ||
      isEbayMatchContradictoryOrMissing ||
      (isEbayMatchLowConfidenceUnoverridden && netProfit > 0) ||
      (isHeavyOversize && !isOutboundUserSupplied && netProfit > 0);

    let profitabilityStatus: ChannelProfitEstimate["profitabilityStatus"];
    if (isSourceStaleScraped || isEbayMatchContradictoryOrMissing) {
      profitabilityStatus = "insufficient_data";
    } else if (netProfit <= 0) {
      profitabilityStatus = "unprofitable_estimate";
    } else if (blockedFromProfitable) {
      profitabilityStatus = "insufficient_data";
    } else {
      profitabilityStatus = "profitable_estimate";
    }

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
      fulfillmentFeeNote: isHeavyOversize
        ? `Estimated Heavy/Oversize Ground Shipping (${weightLb ?? "20+"} lbs)`
        : "Estimated USPS/UPS domestic postage",
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
  if (isHeavyOversize) {
    amazonWarnings.push(
      `Heavy/oversize product (${
        weightLb ? `${weightLb} lbs` : `${maxDimensionIn}"`
      }): standard FBA fulfillment fee tier does not apply; using 2026 Large Bulky / Oversize estimate. Verify exact carton dimensions.`
    );
  }
  if (params.amazonMatchConfidence && params.amazonMatchConfidence !== "high") {
    amazonWarnings.push(
      `Amazon catalog match confidence is "${params.amazonMatchConfidence}" — verify exact ASIN and UPC before listing.`
    );
  }

  const isAmazonMatchContradictoryOrMissing =
    (params.amazonMatchConfidence === "unverified" || params.amazonMatchConfidence === "none") &&
    targetAmazonProv !== "user_supplied";

  const isAmazonMatchLowConfidenceUnoverridden =
    params.amazonMatchConfidence === "low" && targetAmazonProv !== "user_supplied";

  const cannotComputeAmazonArithmetic =
    sourceCost === null ||
    amazonPrice === null ||
    isOutboundExplicitlyMissing ||
    isAmazonFeeExplicitlyMissing ||
    amazonCurrencyMismatch ||
    Boolean(params.hasPriceContradiction);

  const { fbaPickPack, placementFee, fbaFeeNote } = estimateAmazonFbaFees({
    amazonPrice,
    weightLb,
    maxDimensionIn,
    isHeavyOversize,
  });

  let amazonEstimate: ChannelProfitEstimate;
  if (cannotComputeAmazonArithmetic) {
    if (sourceCost === null) amazonWarnings.push("Missing valid source unit cost.");
    if (amazonPrice === null) amazonWarnings.push("Missing verified or estimated Amazon Buy Box price.");
    if (isOutboundExplicitlyMissing) amazonWarnings.push("Missing fulfillment / inbound shipping fee estimate.");
    if (isAmazonFeeExplicitlyMissing) amazonWarnings.push("Missing Amazon referral fee schedule.");

    const denom = 1 - amazonReferralRate / 100;
    const breakEven =
      sourceCost !== null &&
      !isOutboundExplicitlyMissing &&
      !isAmazonFeeExplicitlyMissing &&
      !amazonCurrencyMismatch &&
      !params.hasPriceContradiction &&
      denom > 0.05
        ? Number(
            ((sourceCost + sourceShipping + estimatedSourceTax + fbaPickPack + placementFee) / denom).toFixed(2)
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
      fulfillmentFeeNote: fbaFeeNote,
      promotedOrPlacementFee: placementFee,
      netProfitEstimate: null,
      roiPctEstimate: null,
      marginPctEstimate: null,
      breakEvenPrice: breakEven,
      warnings: amazonWarnings,
    };
  } else {
    const referralFee = Number((amazonPrice * (amazonReferralRate / 100)).toFixed(2));
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

    const blockedFromProfitable =
      isSourceStaleScraped ||
      isAmazonMatchContradictoryOrMissing ||
      (isAmazonMatchLowConfidenceUnoverridden && netProfit > 0) ||
      (isHeavyOversize && !isOutboundUserSupplied && netProfit > 0);

    let profitabilityStatus: ChannelProfitEstimate["profitabilityStatus"];
    if (isSourceStaleScraped || isAmazonMatchContradictoryOrMissing) {
      profitabilityStatus = "insufficient_data";
    } else if (netProfit <= 0) {
      profitabilityStatus = "unprofitable_estimate";
    } else if (blockedFromProfitable) {
      profitabilityStatus = "insufficient_data";
    } else {
      profitabilityStatus = "profitable_estimate";
    }

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
      fulfillmentFeeNote: fbaFeeNote,
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
    const alternateGtins =
      firecrawlResearch?.identifiers.identifierConfidence !== "contradictory"
        ? ([
            cleanUpc,
            firecrawlResearch?.identifiers.upc,
            firecrawlResearch?.identifiers.ean,
            firecrawlResearch?.identifiers.gtin,
          ].filter(Boolean) as string[])
        : cleanUpc
        ? [cleanUpc]
        : [];
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

    // Determine source cost early so it can also inform outlier filtering on active listings
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

    // 5. Filter eBay Active Browse Listings for Comparable Condition, Pack Size, Accessories, Model Tier & Outliers
    const { comparableListings, excludedListings } = filterComparableEbayListings({
      listings: ebayActiveListings,
      sourceTitle: effectiveTitle,
      sourceBrand: effectiveBrand,
      sourceModel: effectiveModel,
      targetCondition: "New",
      referencePrice: sourceCost,
    });

    // 6. Evaluate Cross-Marketplace Product Match Confidence
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
      sourceAlternateGtins: alternateGtins,
      sourceAsin: effectiveAsin,
      sourceHasContradictions,
      candidateId: topAmazon?.asin,
      candidateTitle: topAmazon?.title,
      candidateBrand: topAmazon?.brand,
      candidateUrl: topAmazon?.detailPageUrl,
    });

    const fallbackBrowseCandidate = comparableListings[0] || ebayActiveListings[0];
    const ebayMatchAssessment = evaluateProductMatch({
      targetChannel: "eBay",
      sourceTitle: effectiveTitle,
      sourceBrand: effectiveBrand,
      sourceModel: effectiveModel,
      sourceGtin: effectiveGtin,
      sourceAlternateGtins: alternateGtins,
      sourceEpid: effectiveEpid,
      sourceHasContradictions,
      candidateId: ebayCatalogProduct?.epid,
      candidateTitle: ebayCatalogProduct?.title || fallbackBrowseCandidate?.title,
      candidateBrand: ebayCatalogProduct?.brand,
      candidateModelOrMpn: ebayCatalogProduct?.mpn,
      candidateGtin: ebayCatalogProduct?.gtin,
      candidateUrl: ebayCatalogProduct?.productWebUrl || fallbackBrowseCandidate?.itemWebUrl,
    });

    // 7. Compute Active Browse Listing Price Statistics (using comparable listings only)
    let activePriceStats:
      | {
          count: number;
          lowestPrice: number;
          medianPrice: number;
          highestPrice: number;
          note: string;
        }
      | undefined;

    const validActivePrices = comparableListings
      .map((item) => item.price + (item.shippingCost || 0))
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);

    if (validActivePrices.length > 0) {
      const mid = Math.floor(validActivePrices.length / 2);
      const median =
        validActivePrices.length % 2 === 0
          ? Number(((validActivePrices[mid - 1] + validActivePrices[mid]) / 2).toFixed(2))
          : Number(validActivePrices[mid].toFixed(2));
      const excludedReasonsSummary =
        excludedListings.length > 0
          ? ` (${excludedListings.length} non-comparable listing(s) excluded: ${Array.from(
              new Set(excludedListings.map((e) => e.reason))
            ).join("; ")})`
          : "";
      const smallSampleNote =
        validActivePrices.length < 3
          ? ` [Small sample size: N=${validActivePrices.length}]`
          : "";
      activePriceStats = {
        count: validActivePrices.length,
        lowestPrice: Number(validActivePrices[0].toFixed(2)),
        medianPrice: median,
        highestPrice: Number(validActivePrices[validActivePrices.length - 1].toFixed(2)),
        note: `Active eBay Browse asking prices (including shipping)${excludedReasonsSummary}${smallSampleNote} — NOT confirmed completed/sold transactions.`,
      };
    }

    // 8. Determine Physical Weight/Dimensions & Target Resale Prices with Provenance
    const { weightLb, maxDimensionIn } = parseProductWeightAndDimensions({
      specifications: firecrawlResearch?.specifications,
      title: effectiveTitle,
    });

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
      targetEbayCurrency = comparableListings[0]?.currency || ebayActiveListings[0]?.currency || "USD";
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
      weightLb,
      maxDimensionIn,
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

    if (activePriceStats && activePriceStats.count < 3) {
      financialEstimates.ebay.warnings.push(
        `Small comparable sample size (N=${activePriceStats.count} active listing(s)) — median asking price may be volatile.`
      );
    }

    if (excludedListings.length > 0) {
      financialEstimates.ebay.warnings.push(
        `Filtered out ${excludedListings.length} non-comparable eBay Browse listing(s) (${excludedListings
          .slice(0, 3)
          .map((e) => e.reason)
          .join("; ")}) to prevent price contamination.`
      );
    }

    // 9. Build Overall Summary & Missing Evidence Audit
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

export interface ItemAnalysis {
  title: string;
  brand: string;
  model: string;
  category: string;
  condition: string;
  itemSpecifics: Record<string, string>;
  descriptionHtml: string;
  comps: {
    fastSalePrice: number;
    recommendedPrice: number;
    highProfitPrice: number;
    medianSoldComps: number;
    lowSoldComp: number;
    highSoldComp: number;
    sellThroughRate: number;
    compNotes: string;
  };
  flawAndInspection: {
    flawsDetected: string[];
    returnRiskLevel: "Low" | "Medium" | "High";
    authenticityNotes: string;
    suggestedDisclaimer: string;
  };
  shippingOptimization: {
    estimatedWeightOz: number;
    packageDimensions: string;
    recommendedCarrier: string;
    estimatedShippingCost: number;
    cubicRateEligible: boolean;
  };
  crossListingPrices: {
    ebay: number;
    mercari: number;
    poshmark: number;
    facebookMarketplace: number;
    amazonFba?: number;
  };
  negotiationRules: {
    autoAcceptOfferAbove: number;
    autoDeclineOfferBelow: number;
    counterOfferStrategy: string;
  };
  amazonListing?: AmazonListingDetails;
  imageUrl?: string;
  cogs?: number;
}

export interface AmazonListingDetails {
  asin: string;
  sku: string;
  fnsku: string;
  amazonTitle: string;
  bulletPoints: string[];
  backendSearchTerms: string;
  buyBoxPrice: number;
  amazonReferralFee: number;
  fbaFulfillmentFee: number;
  inboundPlacementFee: number;
  netFbaProfit: number;
  fbaRoiPct: number;
  fbaMarginPct: number;
  bsrRank: number;
  bsrCategory: string;
  gatingStatus: "Ungated" | "Auto-Ungated" | "Auto-Ungate Available" | "Gated (Invoice Required)" | "Restricted";
  prepCategory: "No Prep Needed" | "Polybag (Suffocation Warning)" | "Bubble Wrap & Tape" | "Opaque Bag" | "Boxing / Fragile";
  suffocationWarningRequired: boolean;
  labelingOwner: "Seller (FNSKU)" | "Amazon ($0.55/unit)";
  upcOrEan: string;
  sellerCentralAddUrl: string;
}

export interface BoxemBrandUngate {
  id: string;
  brand: string;
  category: string;
  subCategory?: string;
  autoUngateEligible: boolean;
  autoUngateProbability: number;
  difficultyScore: number;
  invoiceRequired: boolean;
  status: "Ungated" | "Auto-Ungated" | "Auto-Ungate Available" | "Gated" | "Gated (Invoice Required)" | "Restricted";
  sampleAsin: string;
  recommendedDistributor?: {
    name: string;
    url: string;
    moq: number;
    notes: string;
  };
  sellerCentralApprovalUrl: string;
  ungateTips: string[];
}

export interface BoxemAsinLookup {
  asin: string;
  title: string;
  brand: string;
  category: string;
  imageUrl?: string;
  buyBoxPrice: number;
  bsrRank: number;
  salesVelocityMonthlyUnits: number;
  isGated: boolean;
  autoUngateEligible: boolean;
  autoUngateProbabilityPct: number;
  gatingReason?: string;
  prepRequirements: {
    prepType: string;
    suffocationWarning: boolean;
    fnskuBarcode: string;
    fbaPickPackFee: number;
    amazonReferralFee: number;
  };
  sellerCentralApplyUrl: string;
  distributorSource?: string;
}

export interface BoxemFbaShipmentBox {
  boxNumber: number;
  weightLbs: number;
  dimensionsInches: string;
  units: {
    asin: string;
    title: string;
    fnsku: string;
    qty: number;
    unitCost: number;
    sellPrice: number;
    prepType: string;
  }[];
  barcode2DString: string;
}

export interface BoxemFbaShipmentPlan {
  id: string;
  shipmentName: string;
  destinationFc: string;
  createdAt: string;
  placementStrategy: "Distributed Split (0 Placement Fee)" | "Minimal Split ($0.21/unit Placement Fee)";
  totalUnits: number;
  totalBoxes: number;
  totalLandedCost: number;
  projectedRevenue: number;
  projectedNetProfit: number;
  manualFeeSaved: number;
  boxes: BoxemFbaShipmentBox[];
}

export interface ArbitrageOpportunity {
  id: string;
  productName: string;
  category: string;
  sourceSite: string;
  sourcePrice: number;
  sourceShipping: number;
  sourceUrlNote: string;
  targetMarketplace: string;
  ebayResalePrice: number;
  ebayFees: number;
  shippingToBuyer: number;
  netProfit: number;
  roiPercentage: number;
  marginPercentage: number;
  arbitrageScore: number;
  salesVelocity: "High" | "Medium" | "Seasonal";
  dropshipFeasibility: {
    fulfillmentSpeedDays: string;
    packagingRisk: string;
    veroRisk: "Low" | "Medium" | "High";
    fulfillmentMethod: string;
    recommendation: string;
  };
  suggestedEbayTitle: string;
  imageUrl: string;
}

export interface ListingDraft {
  id: string;
  createdAt: string;
  title: string;
  price: number;
  cogs: number;
  netProfit: number;
  category: string;
  condition: string;
  status: "Draft" | "Ready to Publish" | "Active";
  data: ItemAnalysis;
}

export interface SupplierSource {
  id: string;
  name: string;
  supplierType: "Wholesale" | "Direct Factory" | "Retail Clearance" | "Liquidation" | "Dropshipper";
  estimatedUnitCost: number;
  shippingCost: number;
  moq: number;
  leadTimeDays: string;
  packagingType: string;
  sourceUrlHint: string;
  reliabilityScore: number;
  grossMarginPct: number;
  netSpreadVsEbay: number;
  notes: string;
}

export interface VeroCheckResult {
  brandOrTerm: string;
  riskLevel: "Safe" | "Moderate Risk" | "High VeRO Risk" | "Prohibited";
  isEnforcedByEbay: boolean;
  reason: string;
  prohibitedWords: string[];
  safeAlternatives: string[];
  policyAdvice: string;
}

export interface TemuSoldAnalysis {
  id: string;
  productName: string;
  category: string;
  temuPrice: number;
  temuShipping: number;
  temuTotalCost: number;
  temuProductUrlOrKeywords: string;
  temuImageUrl?: string;
  
  // Real eBay Sold Data Logic (Past 90 Days)
  ebaySoldMetrics: {
    medianSoldPrice: number;
    lowestSoldPrice: number;
    highestSoldPrice: number;
    unitsSold90Days: number;
    activeCompetitorsCount: number;
    sellThroughRatePct: number; // (sold / active) * 100
    salesPerDay: number;
    demandVelocity: "Viral High Velocity" | "Strong & Steady" | "Moderate" | "Slow Moving / Saturated";
    historicalSalesSummary: string;
    sampleRecentSoldDates: {
      soldDate: string;
      soldPrice: number;
      shippingCharged: number;
      bidsOrBuyItNow: "Buy It Now" | "Auction";
    }[];
  };

  // Real Net Cash Flow (Accounting for eBay FVF & Domestic Freight)
  financialWaterfall: {
    grossEbayPrice: number;
    ebayFinalValueFee: number; // 13.25% + $0.30
    domesticShippingCost: number; // Carrier label
    paymentOrPromotedFee: number; // 2% promoted or processing buffer
    netClearedProfit: number;
    roiPct: number;
    marginPct: number;
    breakEvenMinimumPrice: number;
  };

  // Real-world Temu-to-eBay Operational Realities
  fulfillmentAudit: {
    temuPackagingAlert: string;
    shippingWindowDays: string;
    recommendedInventoryModel: "Micro-Batch Wholesale (Buy 5-15 to home)" | "Direct Dropship (Blind Prep)" | "Avoid - High INAD Risk";
    inadReturnRiskLevel: "Low" | "Moderate" | "High Return Risk";
    inadRiskNotes: string;
    veroRiskLevel: "Safe" | "Moderate Brand Risk" | "High VeRO Knockoff Risk";
    verdict: "STRONG BUY / WINNER" | "PROFITABLE WITH CAUTION" | "DO NOT ARBITRAGE";
    verdictExplanation: string;
  };

  suggestedEbayListing: {
    seoTitle: string;
    itemSpecifics: Record<string, string>;
    descriptionSummary: string;
  };
}

export interface TopMoneyMaker {
  id: string;
  rank: number;
  productName: string;
  category: string;
  badge: "Highest Cashflow" | "Top Dollar Margin" | "Viral Velocity" | "Micro-Batch Winner" | "High ROI";
  imageUrl: string;
  sourcingPlatform: "Temu" | "AliExpress" | "1688 / Factory" | "Wholesale Dist";
  sourcingCost: number;
  sourcingShipping: number;
  totalCost: number;
  sourcingSearchQuery: string;
  
  // Real eBay Sold Data
  ebayMedianSoldPrice: number;
  unitsSoldPerMonth: number;
  sellThroughRatePct: number;
  
  // Financials
  netProfitPerUnit: number;
  roiPct: number;
  estimatedMonthlyCashflow: number; // estimated monthly profit for an active seller
  
  // Strategy
  fulfillmentAdvice: string;
  recommendedInventoryUnits: number;
  testBudgetNeeded: number;
  veroStatus: "VeRO Verified Safe" | "Safe / Unbranded" | "Caution";
  reasonsWhyItPrints: string[];
}

export interface PinGraphicConfig {
  template: "deal-hunter" | "boutique-editorial" | "tech-spec" | "arbitrage-compare" | "modern-minimalist";
  aspectRatio: "2:3" | "9:16" | "1:1";
  colorTheme: "dark-slate" | "editorial-ivory" | "electric-neon" | "sunset-orange" | "cyber-violet" | "ebay-bold";
  badgeText: string;
  headline: string;
  brandText: string;
  price: number;
  comparePrice?: number;
  savingsText: string;
  bullet1: string;
  bullet2: string;
  bullet3: string;
  ctaText: string;
  watermarkText: string;
  imageUrl: string;
  showPriceBadge: boolean;
  showBullets: boolean;
  showCta: boolean;
  showWatermark: boolean;
}

export interface PinCopyData {
  headlineHooks: string[];
  pinTitle: string;
  pinDescription: string;
  suggestedBadge: string;
  highlightPills: string[];
  hashtags: string[];
}

export interface AlibabaSoldAnalysis {
  id: string;
  productName: string;
  category: string;
  alibabaProductUrlOrKeywords: string;
  alibabaImageUrl?: string;

  // Supplier & Factory Verification
  supplierVerification: {
    supplierName: string;
    goldSupplierYears: number;
    tradeAssurance: boolean;
    verifiedManufacturer: boolean;
    factoryLocation: string;
    responseRatePct: number;
    transactionScore: number; // out of 5.0
  };

  // MOQ & Tiered Factory Pricing
  pricingTiers: {
    sampleUnitPrice: number; // 1-9 pcs
    microBatchUnitPrice: number; // 10-49 pcs
    wholesaleUnitPrice: number; // 50-199 pcs
    bulkUnitPrice: number; // 200+ pcs
    standardMoq: number;
  };

  // Landed Freight & Duty
  freightEstimates: {
    unitWeightKg: number;
    airExpressDdpPerUnit: number; // 5-8 days
    seaFreightDdpPerUnit: number; // 25-35 days
    customsDutyPct: number;
    airLeadDays: string;
    seaLeadDays: string;
  };

  // Real eBay Sold Comps (Past 90 Days)
  ebaySoldMetrics: {
    medianSoldPrice: number;
    lowestSoldPrice: number;
    highestSoldPrice: number;
    unitsSold90Days: number;
    activeCompetitorsCount: number;
    sellThroughRatePct: number;
    salesPerDay: number;
    demandVelocity: "Viral High Velocity" | "Strong & Steady" | "Moderate" | "Slow Moving / Niche";
    historicalSalesSummary: string;
    sampleRecentSoldDates: {
      soldDate: string;
      soldPrice: number;
      shippingCharged: number;
      bidsOrBuyItNow: "Buy It Now" | "Auction";
    }[];
  };

  // Financial Waterfall at selected quantity & freight mode
  financialWaterfall: {
    grossEbayPrice: number;
    factoryCostPerUnit: number;
    landedFreightPerUnit: number;
    totalLandedCogsPerUnit: number;
    ebayFinalValueFee: number; // 13.25% + $0.30
    domesticOutboundPostage: number; // USPS label
    paymentOrPromotedFee: number;
    netClearedProfit: number;
    roiPct: number;
    marginPct: number;
    batchSizeUnits: number;
    batchTotalInvestment: number;
    batchTotalNetProfit: number;
    breakEvenMinimumPrice: number;
  };

  // Factory Compliance, Packaging & Sourcing Strategy
  fulfillmentAudit: {
    packagingType: string;
    customLogoMoq: number;
    certifications: string[]; // e.g. CE, FCC, RoHS
    inadRiskLevel: "Low" | "Moderate" | "High";
    inadNotes: string;
    veroRiskLevel: "Safe / White Label" | "Caution - Check Patent" | "High VeRO Risk";
    verdict: "STRONG BUY / WINNER" | "FEASIBLE WITH SAMPLE" | "DO NOT SOURCING";
    verdictExplanation: string;
    actionChecklist: string[];
  };

  suggestedEbayListing: {
    seoTitle: string;
    itemSpecifics: Record<string, string>;
    descriptionSummary: string;
  };
}



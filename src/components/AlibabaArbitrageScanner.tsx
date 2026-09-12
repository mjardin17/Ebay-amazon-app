import React, { useState, useEffect } from "react";
import {
  Search,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Package,
  Clock,
  ShieldAlert,
  ShieldCheck,
  DollarSign,
  ArrowRight,
  ExternalLink,
  Zap,
  Info,
  Layers,
  Flame,
  Check,
  Copy,
  Building2,
  Plane,
  Ship,
  Scale,
  Award,
  BadgeCheck,
  Boxes,
} from "lucide-react";
import { AlibabaSoldAnalysis, ItemAnalysis } from "../types";

interface AlibabaArbitrageScannerProps {
  onSendToLister: (item: ItemAnalysis) => void;
  initialQuery?: string;
  initialCost?: number;
  onOpenTopMoneyMakers?: () => void;
  onOpenPinStudio?: (item?: ItemAnalysis) => void;
}

const ALIBABA_VIRAL_PRESETS = [
  {
    name: "4x6 Thermal Shipping Label Printer",
    query: "4x6 Thermal Shipping Label Printer Commercial Desktop",
    estimatedCost: 24.5,
    badge: "Top Commercial Demand",
  },
  {
    name: "Sublimation Tumbler Mug Heat Press",
    query: "Sublimation Tumbler Heat Press Machine 20oz 30oz",
    estimatedCost: 34.0,
    badge: "High Margin ($40+ Net)",
  },
  {
    name: "Foldable 3-in-1 Magnetic Charger Qi2",
    query: "Foldable 3-in-1 Magnetic Wireless Charging Stand 15W Qi2",
    estimatedCost: 5.2,
    badge: "High Velocity (680 Sold)",
  },
  {
    name: "Rechargeable 1000LM COB Work Light",
    query: "Rechargeable 1000 Lumen COB LED Magnetic Work Light Hook",
    estimatedCost: 2.6,
    badge: "200%+ ROI",
  },
  {
    name: "Cordless Car Vacuum 9000Pa",
    query: "Cordless Handheld Car Vacuum Cleaner 9000Pa High Power",
    estimatedCost: 5.8,
    badge: "Impulse Auto Niche",
  },
  {
    name: "Stanley Tumbler Knockoff (VeRO Test)",
    query: "Stanley 40oz Quencher Tumbler Replica Unbranded OEM",
    estimatedCost: 7.5,
    badge: "VeRO Danger Alert",
  },
];

export const AlibabaArbitrageScanner: React.FC<AlibabaArbitrageScannerProps> = ({
  onSendToLister,
  initialQuery,
  initialCost,
  onOpenTopMoneyMakers,
  onOpenPinStudio,
}) => {
  const [query, setQuery] = useState(initialQuery || "4x6 Thermal Shipping Label Printer Commercial Desktop");
  const [costInput, setCostInput] = useState<string>(
    initialCost !== undefined ? initialCost.toString() : "24.50"
  );
  const [alibabaUrlInput, setAlibabaUrlInput] = useState<string>("");
  const [orderQuantity, setOrderQuantity] = useState<number>(20);
  const [shippingPreference, setShippingPreference] = useState<"air" | "sea">("air");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AlibabaSoldAnalysis | null>(null);
  const [copiedTitle, setCopiedTitle] = useState(false);

  const handleSearch = async (
    customQuery?: string,
    customCost?: number,
    customQty?: number,
    customShip?: "air" | "sea"
  ) => {
    const q = customQuery || query;
    if (!q.trim()) return;

    setLoading(true);
    const parsedCost = customCost !== undefined ? customCost : (parseFloat(costInput) || undefined);
    const qty = customQty !== undefined ? customQty : orderQuantity;
    const shipPref = customShip || shippingPreference;

    try {
      const res = await fetch("/api/gemini/alibaba-sold-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          alibabaUrl: alibabaUrlInput,
          estimatedCost: parsedCost,
          orderQuantity: qty,
          shippingPreference: shipPref,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setAnalysis(data.data);
        if (data.data.pricingTiers?.microBatchUnitPrice && customCost === undefined) {
          setCostInput(data.data.pricingTiers.microBatchUnitPrice.toFixed(2));
        }
      }
    } catch (err) {
      console.error("Alibaba Sold Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      if (initialCost !== undefined) {
        setCostInput(initialCost.toString());
      }
      handleSearch(initialQuery, initialCost);
    } else if (!analysis) {
      handleSearch(ALIBABA_VIRAL_PRESETS[0].query, ALIBABA_VIRAL_PRESETS[0].estimatedCost);
    }
  }, [initialQuery]);

  // Recalculate financial waterfall locally when quantity or shipping preference changes
  const activeUnitFactoryCost = analysis
    ? orderQuantity < 10
      ? analysis.pricingTiers.sampleUnitPrice
      : orderQuantity >= 200
      ? analysis.pricingTiers.bulkUnitPrice
      : orderQuantity >= 50
      ? analysis.pricingTiers.wholesaleUnitPrice
      : analysis.pricingTiers.microBatchUnitPrice
    : 0;

  const activeFreightPerUnit = analysis
    ? shippingPreference === "sea"
      ? analysis.freightEstimates.seaFreightDdpPerUnit
      : analysis.freightEstimates.airExpressDdpPerUnit
    : 0;

  const activeLandedCogs = Math.round((activeUnitFactoryCost + activeFreightPerUnit) * 100) / 100;
  const activeMedianPrice = analysis?.ebaySoldMetrics.medianSoldPrice || 0;
  const activeDomesticPostage = analysis?.financialWaterfall.domesticOutboundPostage || 4.5;
  const activeEbayFee = Math.round((activeMedianPrice * 0.1325 + 0.3) * 100) / 100;
  const activePromoFee = Math.round((activeMedianPrice * 0.02) * 100) / 100;
  const activeNetProfit = Math.round(
    (activeMedianPrice - activeLandedCogs - activeEbayFee - activeDomesticPostage - activePromoFee) * 100
  ) / 100;
  const activeRoiPct = activeLandedCogs > 0 ? Math.round((activeNetProfit / activeLandedCogs) * 1000) / 10 : 0;
  const activeMarginPct = activeMedianPrice > 0 ? Math.round((activeNetProfit / activeMedianPrice) * 1000) / 10 : 0;
  const activeTotalInvestment = Math.round(activeLandedCogs * orderQuantity * 100) / 100;
  const activeTotalBatchProfit = Math.round(activeNetProfit * orderQuantity * 100) / 100;

  const handleCopyTitle = (titleToCopy: string) => {
    navigator.clipboard.writeText(titleToCopy);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2000);
  };

  const buildItemAnalysis = (): ItemAnalysis | null => {
    if (!analysis) return null;

    return {
      title: analysis.suggestedEbayListing.seoTitle,
      brand: "Unbranded / Universal",
      model: analysis.productName.slice(0, 35),
      category: analysis.category,
      condition: "Brand New",
      cogs: activeLandedCogs,
      imageUrl: analysis.alibabaImageUrl,
      itemSpecifics: {
        ...analysis.suggestedEbayListing.itemSpecifics,
        "Sourcing Platform": "Alibaba Factory B2B Wholesale",
        "Factory Verification": `${analysis.supplierVerification.goldSupplierYears} Yr Gold Supplier, Trade Assurance`,
        "Batch Size Evaluated": `${orderQuantity} units via ${shippingPreference.toUpperCase()} DDP`,
      },
      comps: {
        fastSalePrice: analysis.ebaySoldMetrics.lowestSoldPrice,
        recommendedPrice: analysis.ebaySoldMetrics.medianSoldPrice,
        highProfitPrice: analysis.ebaySoldMetrics.highestSoldPrice,
        medianSoldComps: analysis.ebaySoldMetrics.medianSoldPrice,
        lowSoldComp: analysis.ebaySoldMetrics.lowestSoldPrice,
        highSoldComp: analysis.ebaySoldMetrics.highestSoldPrice,
        sellThroughRate: analysis.ebaySoldMetrics.sellThroughRatePct,
        compNotes: analysis.ebaySoldMetrics.historicalSalesSummary,
      },
      flawAndInspection: {
        flawsDetected: [],
        returnRiskLevel: analysis.fulfillmentAudit.inadRiskLevel === "High" ? "High" : "Low",
        authenticityNotes: analysis.fulfillmentAudit.inadNotes,
        suggestedDisclaimer: "Item is brand new factory sealed in neutral packaging.",
      },
      shippingOptimization: {
        estimatedWeightOz: Math.round(analysis.freightEstimates.unitWeightKg * 35.274),
        packageDimensions: "10 x 8 x 5 in",
        recommendedCarrier: "USPS Ground Advantage",
        estimatedShippingCost: activeDomesticPostage,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: activeMedianPrice,
        mercari: Math.round(activeMedianPrice * 0.95 * 100) / 100,
        poshmark: Math.round(activeMedianPrice * 1.05 * 100) / 100,
        facebookMarketplace: Math.round(activeMedianPrice * 0.9 * 100) / 100,
      },
      negotiationRules: {
        autoAcceptOfferAbove: Math.round(activeMedianPrice * 0.92 * 100) / 100,
        autoDeclineOfferBelow: Math.round(analysis.financialWaterfall.breakEvenMinimumPrice * 1.1 * 100) / 100,
        counterOfferStrategy: "Counter with 5% off list price with free prompt tracked shipping",
      },
      descriptionHtml: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: auto; padding: 20px;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #f97316; padding-bottom: 8px;">${analysis.suggestedEbayListing.seoTitle}</h2>
          <p style="font-size: 16px; color: #334155; line-height: 1.6;">${analysis.suggestedEbayListing.descriptionSummary}</p>
          <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <strong style="color: #c2410c;">USA Seller Guarantee:</strong>
            <p style="margin: 5px 0 0 0; color: #475569; font-size: 14px;">Ships fast and free from our US warehouse with active tracking. Guaranteed brand new factory sealed with standard domestic 30-day return policy.</p>
          </div>
          <h3 style="color: #1e293b; margin-top: 25px;">Product Features & Specifications:</h3>
          <ul style="color: #475569; line-height: 1.8;">
            ${Object.entries(analysis.suggestedEbayListing.itemSpecifics)
              .map(([key, val]) => `<li><strong>${key}:</strong> ${val}</li>`)
              .join("")}
          </ul>
        </div>
      `.trim(),
    };
  };

  const handleTransferToLister = () => {
    const item = buildItemAnalysis();
    if (item) {
      onSendToLister(item);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-orange-950/40 to-slate-900 border border-orange-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-slate-950 font-bold shadow-md shadow-orange-500/20">
                <Building2 className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-white tracking-tight">
                    Alibaba Factory Wholesale vs. Actual eBay Sold Comps
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-orange-500 text-slate-950">
                    B2B DIRECT SOURCING
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Analyze Tier-1 China manufacturer wholesale pricing, DDP landed freight (Air vs Sea), Trade Assurance audits, and true eBay 90-day sold clearance rates.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenTopMoneyMakers && (
              <button
                onClick={onOpenTopMoneyMakers}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-amber-500/30 transition shadow-sm"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Leaderboard Deals</span>
              </button>
            )}
          </div>
        </div>

        {/* Viral Sourcing Presets */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-orange-300 flex items-center gap-1.5 mr-1">
            <Zap className="w-3.5 h-3.5" /> High-Margin Presets:
          </span>
          {ALIBABA_VIRAL_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                setQuery(preset.query);
                setCostInput(preset.estimatedCost.toFixed(2));
                handleSearch(preset.query, preset.estimatedCost);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
                query === preset.query
                  ? "bg-orange-500 text-slate-950 border-orange-400 font-bold"
                  : "bg-slate-800/60 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:text-white"
              }`}
            >
              <span>{preset.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950/60 text-orange-300 border border-orange-500/30">
                {preset.badge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sourcing Input Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-orange-400" />
              <span>Product Keywords / Alibaba Title:</span>
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 4x6 thermal shipping label printer commercial desktop"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 placeholder-slate-500"
            />
          </div>

          <div className="md:col-span-3 space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
              <span>Alibaba URL / Inquiry Link:</span>
            </label>
            <input
              type="text"
              value={alibabaUrlInput}
              onChange={(e) => setAlibabaUrlInput(e.target.value)}
              placeholder="https://alibaba.com/product-detail/..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 placeholder-slate-500"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-orange-400" />
              <span>Factory Cost ($USD):</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
              <input
                type="number"
                step="0.10"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="24.50"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="w-full h-[42px] flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-orange-500/20 transition disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Analyzing Comps..." : "Analyze Spread"}</span>
            </button>
          </div>
        </div>

        {/* Batch Size & Freight Preference Controls */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-orange-400" />
              Batch Simulation Quantity:
            </span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { qty: 1, label: "1 (Sample)" },
                { qty: 10, label: "10 (Micro)" },
                { qty: 20, label: "20 (Standard)" },
                { qty: 50, label: "50 (Wholesale)" },
                { qty: 100, label: "100 (Bulk)" },
              ].map((tier) => (
                <button
                  key={tier.qty}
                  onClick={() => setOrderQuantity(tier.qty)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    orderQuantity === tier.qty
                      ? "bg-orange-500 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-orange-400" />
              Landed Freight Mode:
            </span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setShippingPreference("air")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  shippingPreference === "air"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>Air Express DDP (5-8d)</span>
              </button>
              <button
                onClick={() => setShippingPreference("sea")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  shippingPreference === "sea"
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Ship className="w-3.5 h-3.5" />
                <span>Sea Freight DDP (25-35d)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center mx-auto animate-bounce">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Scraping Factory Costs & Completed eBay Transactions...</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Cross-referencing Tier-1 Alibaba supplier wholesale quotes, international DDP freight rates, Trade Assurance protections, and actual 90-day eBay completed sales volume.
          </p>
        </div>
      )}

      {/* Main Results View */}
      {!loading && analysis && (
        <div className="space-y-6">
          {/* Top Verdict & Operational Summary Banner */}
          <div
            className={`border rounded-2xl p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              analysis.fulfillmentAudit.verdict === "STRONG BUY / WINNER"
                ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                : analysis.fulfillmentAudit.verdict === "FEASIBLE WITH SAMPLE"
                ? "bg-amber-950/30 border-amber-500/40 text-amber-300"
                : "bg-red-950/30 border-red-500/40 text-red-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-slate-900/80 border border-current mt-0.5">
                {analysis.fulfillmentAudit.verdict === "STRONG BUY / WINNER" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : analysis.fulfillmentAudit.verdict === "FEASIBLE WITH SAMPLE" ? (
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-slate-950 border border-current">
                    VERDICT: {analysis.fulfillmentAudit.verdict}
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    Category: {analysis.category}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                  {analysis.productName}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl">
                  {analysis.fulfillmentAudit.verdictExplanation}
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-5 flex-shrink-0">
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Projected Batch Profit:</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  +${activeTotalBatchProfit.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  on {orderQuantity} units ({activeRoiPct}% ROI)
                </span>
              </div>

              <button
                onClick={handleTransferToLister}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-extrabold text-xs shadow-md transition"
              >
                <span>Send to Lister</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3-Column Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Alibaba Factory & Sourcing Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
                      <Building2 className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-bold text-white">Alibaba Factory Profile</h4>
                  </div>
                  <a
                    href={analysis.alibabaProductUrlOrKeywords}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-1"
                  >
                    <span>Open Alibaba</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Product Image & Supplier Badges */}
                <div className="flex gap-3">
                  {analysis.alibabaImageUrl && (
                    <img
                      src={analysis.alibabaImageUrl}
                      alt={analysis.productName}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-xl object-cover bg-slate-950 border border-slate-800 flex-shrink-0"
                    />
                  )}
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-slate-200 line-clamp-1">
                      {analysis.supplierVerification.supplierName}
                    </h5>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <span>📍 {analysis.supplierVerification.factoryLocation}</span>
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700/60 flex items-center gap-1">
                        <Award className="w-3 h-3 text-amber-400" />
                        {analysis.supplierVerification.goldSupplierYears} Yr Gold Supplier
                      </span>
                      {analysis.supplierVerification.tradeAssurance && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
                          <BadgeCheck className="w-3 h-3 text-emerald-400" />
                          Trade Assurance
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tiered MOQ Pricing Table */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-300 block">Factory Tiered Pricing Curve:</span>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className={`p-2 rounded-xl border ${orderQuantity < 10 ? "bg-orange-500/10 border-orange-500/50" : "bg-slate-950 border-slate-800"}`}>
                      <span className="text-[10px] text-slate-400 block">1-9 pcs</span>
                      <span className="text-xs font-black text-white font-mono">
                        ${analysis.pricingTiers.sampleUnitPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className={`p-2 rounded-xl border ${orderQuantity >= 10 && orderQuantity < 50 ? "bg-orange-500/10 border-orange-500/50" : "bg-slate-950 border-slate-800"}`}>
                      <span className="text-[10px] text-slate-400 block">10-49 pcs</span>
                      <span className="text-xs font-black text-orange-400 font-mono">
                        ${analysis.pricingTiers.microBatchUnitPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className={`p-2 rounded-xl border ${orderQuantity >= 50 && orderQuantity < 200 ? "bg-orange-500/10 border-orange-500/50" : "bg-slate-950 border-slate-800"}`}>
                      <span className="text-[10px] text-slate-400 block">50-199 pcs</span>
                      <span className="text-xs font-black text-white font-mono">
                        ${analysis.pricingTiers.wholesaleUnitPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className={`p-2 rounded-xl border ${orderQuantity >= 200 ? "bg-orange-500/10 border-orange-500/50" : "bg-slate-950 border-slate-800"}`}>
                      <span className="text-[10px] text-slate-400 block">200+ pcs</span>
                      <span className="text-xs font-black text-emerald-400 font-mono">
                        ${analysis.pricingTiers.bulkUnitPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Freight & Landed Breakdown */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Selected Unit Factory Price:</span>
                    <span className="font-mono font-bold text-white">${activeUnitFactoryCost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">
                      Landed Freight ({shippingPreference.toUpperCase()} DDP / {analysis.freightEstimates.unitWeightKg}kg):
                    </span>
                    <span className="font-mono text-amber-400">+${activeFreightPerUnit.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Estimated Transit Time:</span>
                    <span className="font-medium text-slate-300">
                      {shippingPreference === "sea"
                        ? analysis.freightEstimates.seaLeadDays
                        : analysis.freightEstimates.airLeadDays}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-bold">
                    <span className="text-white">Total Landed COGS per Unit:</span>
                    <span className="font-mono text-base text-orange-400">${activeLandedCogs.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Packaging & Compliance Note */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                <span className="font-bold text-slate-300 block flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-orange-400" />
                  Packaging & Prep:
                </span>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  {analysis.fulfillmentAudit.packagingType}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-400">Certifications:</span>
                  <div className="flex flex-wrap gap-1">
                    {analysis.fulfillmentAudit.certifications.map((c) => (
                      <span key={c} className="px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-300 border border-slate-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Actual eBay Sold Comps (90 Days) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                      <TrendingUp className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-bold text-white">Actual eBay Sold Logic</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                    PAST 90 DAYS
                  </span>
                </div>

                {/* Primary Sold Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 block">Median Clearing Price</span>
                    <span className="text-2xl font-black text-emerald-400 font-mono">
                      ${analysis.ebaySoldMetrics.medianSoldPrice.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Range: ${analysis.ebaySoldMetrics.lowestSoldPrice} - ${analysis.ebaySoldMetrics.highestSoldPrice}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-xs text-slate-400 block">90-Day Completed Sales</span>
                    <span className="text-2xl font-black text-white font-mono">
                      {analysis.ebaySoldMetrics.unitsSold90Days} units
                    </span>
                    <span className="text-[11px] text-blue-400 block">
                      ~{analysis.ebaySoldMetrics.salesPerDay} sales / day
                    </span>
                  </div>
                </div>

                {/* Sell-Through Rate & Velocity */}
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Active Competing Listings:</span>
                    <span className="font-semibold text-white">{analysis.ebaySoldMetrics.activeCompetitorsCount} sellers</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Sell-Through Rate (STR):</span>
                    <span className="font-bold text-emerald-400">{analysis.ebaySoldMetrics.sellThroughRatePct}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Market Demand Velocity:</span>
                    <span className="font-bold text-amber-300">{analysis.ebaySoldMetrics.demandVelocity}</span>
                  </div>
                </div>

                {/* Sample Recent Completed Dates */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-400 block">
                    Verified Completed Transactions:
                  </span>
                  <div className="space-y-1">
                    {analysis.ebaySoldMetrics.sampleRecentSoldDates.map((comp, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/60 text-xs"
                      >
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{comp.soldDate}</span>
                          <span className="text-[10px] text-slate-500">({comp.bidsOrBuyItNow})</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">
                          ${comp.soldPrice.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Historical Summary */}
              <p className="text-[11px] text-slate-400 italic bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                "{analysis.ebaySoldMetrics.historicalSalesSummary}"
              </p>
            </div>

            {/* Column 3: Cash Flow Waterfall & Batch Economics */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <DollarSign className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-bold text-white">Net Cash Flow Waterfall</h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    +{activeRoiPct}% ROI
                  </span>
                </div>

                {/* Per Unit Waterfall Table */}
                <div className="space-y-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between font-bold text-slate-200">
                    <span>Gross eBay Selling Price:</span>
                    <span className="font-mono text-white">${activeMedianPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>- Unit Landed Factory COGS:</span>
                    <span className="font-mono text-red-400">-${activeLandedCogs.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>- eBay Final Value Fee (13.25% + $0.30):</span>
                    <span className="font-mono text-red-400">-${activeEbayFee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>- Outbound Domestic USPS Postage:</span>
                    <span className="font-mono text-red-400">-${activeDomesticPostage.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>- Payment/Promoted Ad Buffer (2%):</span>
                    <span className="font-mono text-red-400">-${activePromoFee.toFixed(2)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-black text-sm text-emerald-400">
                    <span>Net Cleared Profit / Unit:</span>
                    <span className="font-mono text-base">+${activeNetProfit.toFixed(2)}</span>
                  </div>
                </div>

                {/* Batch Investment vs Total Net Profit Box */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 block">Batch Investment</span>
                    <span className="text-lg font-bold text-slate-200 font-mono">
                      ${activeTotalInvestment.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {orderQuantity} units @ ${activeLandedCogs.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/30 space-y-1">
                    <span className="text-[11px] text-slate-400 block">Total Batch Net</span>
                    <span className="text-lg font-black text-emerald-400 font-mono">
                      +${activeTotalBatchProfit.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-emerald-500 block">
                      {activeMarginPct}% net margin
                    </span>
                  </div>
                </div>

                {/* Break-Even Floor */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                  <span className="text-slate-400">Absolute Break-Even Floor:</span>
                  <span className="font-mono font-bold text-amber-300">
                    ${analysis.financialWaterfall.breakEvenMinimumPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <button
                  onClick={handleTransferToLister}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-extrabold text-xs shadow-md transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Build eBay Listing From Sourcing Data</span>
                </button>

                {onOpenPinStudio && (
                  <button
                    onClick={() => {
                      const item = buildItemAnalysis();
                      if (item) {
                        onOpenPinStudio(item);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
                  >
                    <span>Design 2:3 Pinterest Pin Graphic</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sourcing Action Checklist & VeRO Shield Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-bold text-white">Factory Sourcing & Quality Protocol</h4>
              </div>
              <div className="space-y-2">
                {analysis.fulfillmentAudit.actionChecklist.map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-orange-400 flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">VeRO & Intellectual Property</h4>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    analysis.fulfillmentAudit.veroRiskLevel.includes("Safe")
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      : "bg-red-950 text-red-300 border border-red-800"
                  }`}
                >
                  {analysis.fulfillmentAudit.veroRiskLevel}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {analysis.fulfillmentAudit.inadNotes}
              </p>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">SEO Optimized Title:</span>
                <button
                  onClick={() => handleCopyTitle(analysis.suggestedEbayListing.seoTitle)}
                  className="flex items-center gap-1 text-orange-400 hover:text-orange-300 font-semibold"
                >
                  {copiedTitle ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTitle ? "Copied" : "Copy Title"}</span>
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-300">
                {analysis.suggestedEbayListing.seoTitle}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

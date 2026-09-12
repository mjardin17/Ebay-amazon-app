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
  Trophy,
} from "lucide-react";
import { TemuSoldAnalysis, ItemAnalysis } from "../types";

interface TemuSoldArbitrageScannerProps {
  onSendToLister: (item: ItemAnalysis) => void;
  initialQuery?: string;
  initialCost?: number;
  onOpenTopMoneyMakers?: () => void;
}

const TEMU_VIRAL_PRESETS = [
  {
    name: "4x6 Thermal Label Printer",
    query: "4x6 Thermal Shipping Label Printer",
    estimatedTemuCost: 36.8,
    badge: "High Margin",
  },
  {
    name: "Car Vacuum 9000Pa",
    query: "Cordless Handheld Car Vacuum 9000Pa",
    estimatedTemuCost: 7.4,
    badge: "High Velocity",
  },
  {
    name: "Tumbler Heat Press",
    query: "Sublimation Tumbler Heat Press Machine",
    estimatedTemuCost: 44.5,
    badge: "Huge Spread",
  },
  {
    name: "Sunset Projection Lamp",
    query: "Aesthetic Sunset Projection Lamp 360",
    estimatedTemuCost: 4.2,
    badge: "Impulse Buy",
  },
  {
    name: "Stanley Cup Knockoff (VeRO Test)",
    query: "Stanley 40oz Quencher Tumbler Replica",
    estimatedTemuCost: 6.5,
    badge: "VeRO Danger",
  },
];

export const TemuSoldArbitrageScanner: React.FC<TemuSoldArbitrageScannerProps> = ({
  onSendToLister,
  initialQuery,
  initialCost,
  onOpenTopMoneyMakers,
}) => {
  const [query, setQuery] = useState(initialQuery || "4x6 Thermal Shipping Label Printer");
  const [temuPriceInput, setTemuPriceInput] = useState<string>(
    initialCost !== undefined ? initialCost.toString() : "36.80"
  );
  const [temuUrlInput, setTemuUrlInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TemuSoldAnalysis | null>(null);
  const [copiedTitle, setCopiedTitle] = useState(false);

  const handleSearch = async (customQuery?: string, customCost?: number) => {
    const q = customQuery || query;
    if (!q.trim()) return;

    setLoading(true);
    const parsedCost = customCost !== undefined ? customCost : (parseFloat(temuPriceInput) || undefined);

    try {
      const res = await fetch("/api/gemini/temu-sold-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          temuUrl: temuUrlInput,
          estimatedTemuPrice: parsedCost,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setAnalysis(data.data);
        if (data.data.temuPrice) {
          setTemuPriceInput(data.data.temuPrice.toFixed(2));
        }
      }
    } catch (err) {
      console.error("Temu Sold Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      if (initialCost !== undefined) {
        setTemuPriceInput(initialCost.toString());
      }
      handleSearch(initialQuery, initialCost);
    } else if (!analysis) {
      handleSearch(TEMU_VIRAL_PRESETS[0].query, TEMU_VIRAL_PRESETS[0].estimatedTemuCost);
    }
  }, [initialQuery, initialCost]);

  const handlePresetSelect = (preset: typeof TEMU_VIRAL_PRESETS[0]) => {
    setQuery(preset.query);
    setTemuPriceInput(preset.estimatedTemuCost.toString());
    handleSearch(preset.query, preset.estimatedTemuCost);
  };

  const handleCopyTitle = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2000);
  };

  // Convert Temu Sold Analysis into ItemAnalysis for the 1-click lister
  const handleTransferToLister = () => {
    if (!analysis) return;

    const converted: ItemAnalysis = {
      title: analysis.suggestedEbayListing.seoTitle || analysis.productName,
      brand: analysis.suggestedEbayListing.itemSpecifics?.Brand || "Unbranded",
      model: analysis.productName.slice(0, 40),
      category: analysis.category || "General Merchandise",
      condition: "Brand New",
      cogs: analysis.temuTotalCost,
      imageUrl: analysis.temuImageUrl,
      itemSpecifics: {
        ...analysis.suggestedEbayListing.itemSpecifics,
        "Source Origin": "Direct Factory Sourced",
        "Fulfillment Method": analysis.fulfillmentAudit.recommendedInventoryModel,
        "Sell-Through Rate": `${analysis.ebaySoldMetrics.sellThroughRatePct}%`,
      },
      descriptionHtml: `<h3>Product Highlights</h3>
<p>${analysis.suggestedEbayListing.descriptionSummary}</p>

<h3>Key Specifications</h3>
<ul>
  <li>100% Brand new factory-sealed packaging</li>
  <li>Fast domestic tracked dispatch</li>
  <li>Inspected for quality prior to shipping</li>
  <li>30-day buyer satisfaction guarantee</li>
</ul>

<h3>Seller Logistics Note</h3>
<p>Ships domestically with active tracking provided immediately upon carrier receipt.</p>`,
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
        returnRiskLevel: analysis.fulfillmentAudit.inadReturnRiskLevel === "High Return Risk" ? "High" : "Low",
        authenticityNotes: analysis.fulfillmentAudit.inadRiskNotes,
        suggestedDisclaimer: "Item is brand new sealed. Packaging may have slight supplier handling wear.",
      },
      shippingOptimization: {
        estimatedWeightOz: 16,
        packageDimensions: "9 x 6 x 4 in",
        recommendedCarrier: "USPS Ground Advantage",
        estimatedShippingCost: analysis.financialWaterfall.domesticShippingCost,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: analysis.financialWaterfall.grossEbayPrice,
        mercari: Math.round(analysis.financialWaterfall.grossEbayPrice * 0.95 * 100) / 100,
        poshmark: Math.round(analysis.financialWaterfall.grossEbayPrice * 1.05 * 100) / 100,
        facebookMarketplace: Math.round(analysis.financialWaterfall.grossEbayPrice * 0.9 * 100) / 100,
      },
      negotiationRules: {
        autoAcceptOfferAbove: Math.round(analysis.financialWaterfall.grossEbayPrice * 0.9 * 100) / 100,
        autoDeclineOfferBelow: Math.round(analysis.financialWaterfall.breakEvenMinimumPrice * 1.05 * 100) / 100,
        counterOfferStrategy: "Accept offers within 8% of median sold comp.",
      },
    };

    onSendToLister(converted);
  };

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Flame className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-white">
                Temu Low Price Sourcing vs. Actual eBay Sold Data
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
                True Sold Comps (Not Asking Prices)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Search any Temu product, link, or keyword to match against verified 90-day completed eBay sales. Calculates real Sell-Through Rate (STR), net fees, USPS domestic freight, and highlights critical Temu orange-bag packaging risks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {onOpenTopMoneyMakers && (
              <button
                id="btn-switch-to-top-money-makers"
                onClick={onOpenTopMoneyMakers}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-md transition"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Top Money Makers</span>
              </button>
            )}
            <span className="text-[11px] text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-mono">
              eBay FVF: 13.25% + 30¢
            </span>
          </div>
        </div>

        {/* Viral Temu Presets */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <span className="text-xs font-semibold text-slate-400 block">
            Popular Temu Arbitrage Candidates:
          </span>
          <div className="flex flex-wrap gap-2">
            {TEMU_VIRAL_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetSelect(preset)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition ${
                  query === preset.query
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/60 font-semibold"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                <span>{preset.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    preset.badge === "VeRO Danger"
                      ? "bg-rose-950 text-rose-300 border border-rose-800"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  }`}
                >
                  {preset.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-slate-800">
          <div className="md:col-span-6">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Search Temu Product Name / Keywords / URL:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                id="input-temu-sold-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. 4x6 Thermal Shipping Label Printer or paste Temu link..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Temu Buy Price ($ USD):
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                id="input-temu-buy-price"
                type="number"
                step="0.1"
                value={temuPriceInput}
                onChange={(e) => setTemuPriceInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="36.80"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs sm:text-sm text-white font-mono focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="md:col-span-3 flex items-end">
            <button
              id="btn-run-temu-sold-search"
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Matching Sold Comps..." : "Analyze Actual Sold Logic"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mx-auto" />
          <h3 className="text-base font-semibold text-white">
            Scanning 90-Day Completed eBay Transactions for "{query}"...
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Filtering out active unsold asking prices, calculating Sell-Through Rate (STR), deducting 13.25% eBay fees, and auditing Temu packaging constraints.
          </p>
        </div>
      )}

      {/* Main Analysis Card */}
      {!loading && analysis && (
        <div className="space-y-6">
          {/* Top Summary Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
            {/* Header / Title Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-start gap-3">
                {analysis.temuImageUrl && (
                  <img
                    src={analysis.temuImageUrl}
                    alt={analysis.productName}
                    className="w-16 h-16 rounded-xl object-cover border border-slate-800 flex-shrink-0"
                  />
                )}
                <div>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                    {analysis.category}
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {analysis.productName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-xs bg-orange-950 text-orange-300 border border-orange-800 font-semibold">
                      Temu Sourced: ${analysis.temuTotalCost.toFixed(2)}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold">
                      eBay Resale Median: ${analysis.ebaySoldMetrics.medianSoldPrice.toFixed(2)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold border ${
                        analysis.fulfillmentAudit.verdict === "STRONG BUY / WINNER"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                          : analysis.fulfillmentAudit.verdict === "PROFITABLE WITH CAUTION"
                          ? "bg-amber-950 text-amber-300 border-amber-800"
                          : "bg-rose-950 text-rose-300 border-rose-800"
                      }`}
                    >
                      {analysis.fulfillmentAudit.verdict}
                    </span>
                  </div>
                </div>
              </div>

              {/* 1-Click Action to Lister */}
              <button
                id="btn-transfer-temu-to-lister"
                onClick={handleTransferToLister}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition flex-shrink-0"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>Create eBay Listing Draft</span>
              </button>
            </div>

            {/* Core Metrics: Actual Sold Comps vs Sourcing Cost */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Temu Acquisition */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Temu Buy Cost</span>
                <span className="text-xl font-bold text-amber-400 font-mono">
                  ${analysis.temuTotalCost.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block">Factory Direct Cost</span>
              </div>

              {/* Actual Median Sold Comp */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Actual Sold Comp</span>
                <span className="text-xl font-bold text-white font-mono">
                  ${analysis.ebaySoldMetrics.medianSoldPrice.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Range: ${analysis.ebaySoldMetrics.lowestSoldPrice.toFixed(2)} - ${analysis.ebaySoldMetrics.highestSoldPrice.toFixed(2)}
                </span>
              </div>

              {/* Sell-Through Rate (STR) */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Sell-Through Rate (STR)</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-bold text-emerald-400 font-mono">
                    {analysis.ebaySoldMetrics.sellThroughRatePct}%
                  </span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-[11px] text-slate-400 block">
                  {analysis.ebaySoldMetrics.unitsSold90Days} Sold / {analysis.ebaySoldMetrics.activeCompetitorsCount} Active
                </span>
              </div>

              {/* Net Cleared Cash */}
              <div className="bg-slate-950 p-3.5 rounded-xl border-2 border-emerald-500/40 shadow-sm">
                <span className="text-xs text-emerald-400 block font-semibold">Net Cleared Profit</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  +${analysis.financialWaterfall.netClearedProfit.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-300 block">
                  {analysis.financialWaterfall.roiPct.toFixed(0)}% ROI ({analysis.financialWaterfall.marginPct.toFixed(1)}% Margin)
                </span>
              </div>
            </div>

            {/* Verified Sold Logic: Deep Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: 90-Day Sold Transactions Table & Logic */}
              <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">
                      Actual Completed eBay Sales (Past 90 Days)
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    ~{analysis.ebaySoldMetrics.salesPerDay} sales/day ({analysis.ebaySoldMetrics.demandVelocity})
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {analysis.ebaySoldMetrics.historicalSalesSummary}
                </p>

                {/* Sample Completed Transactions */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Verified Completed Sales Log:
                  </span>
                  <div className="space-y-1">
                    {analysis.ebaySoldMetrics.sampleRecentSoldDates.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-slate-300 font-medium">{item.soldDate}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                            {item.bidsOrBuyItNow}
                          </span>
                        </div>
                        <div className="font-mono font-bold text-white">
                          ${item.soldPrice.toFixed(2)}{" "}
                          <span className="text-[11px] text-emerald-400 font-normal">
                            {item.shippingCharged === 0 ? "Free Ship" : `+$${item.shippingCharged} ship`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Exact Fee & Freight Waterfall */}
              <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">
                    Real Cashflow Waterfall
                  </h4>
                </div>

                <div className="space-y-2 text-xs divide-y divide-slate-800/80">
                  <div className="flex justify-between pb-1.5">
                    <span className="text-slate-400">Gross Sale Price:</span>
                    <span className="font-mono font-bold text-white">
                      ${analysis.financialWaterfall.grossEbayPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 text-rose-400">
                    <span className="text-slate-400">Temu Acquisition Cost:</span>
                    <span className="font-mono font-medium">
                      -${analysis.temuTotalCost.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 text-rose-400">
                    <span className="text-slate-400">eBay Final Value Fee (13.25% + 30¢):</span>
                    <span className="font-mono font-medium">
                      -${analysis.financialWaterfall.ebayFinalValueFee.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 text-rose-400">
                    <span className="text-slate-400">USPS Ground Advantage (Domestic):</span>
                    <span className="font-mono font-medium">
                      -${analysis.financialWaterfall.domesticShippingCost.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 text-rose-400">
                    <span className="text-slate-400">Ad / Processing Buffer (2%):</span>
                    <span className="font-mono font-medium">
                      -${analysis.financialWaterfall.paymentOrPromotedFee.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-slate-800 text-sm">
                    <span className="font-bold text-emerald-400">Net Cleared in Pocket:</span>
                    <span className="font-mono font-black text-emerald-400">
                      +${analysis.financialWaterfall.netClearedProfit.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between pt-1 text-[11px] text-slate-400">
                    <span>Break-Even Floor Price:</span>
                    <span className="font-mono text-slate-300">
                      ${analysis.financialWaterfall.breakEvenMinimumPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Temu-Specific Fulfillment & Packaging Hazards Alert */}
            <div className="bg-slate-950 p-4 rounded-xl border border-amber-800/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <h4 className="font-bold text-sm text-white">
                    Temu Operational & Dropship Guardrails
                  </h4>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Recommended Model:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold border border-slate-700">
                    {analysis.fulfillmentAudit.recommendedInventoryModel}
                  </span>
                </div>
              </div>

              {/* Packaging Warning */}
              <div className="bg-amber-950/20 border border-amber-800/40 p-3 rounded-lg text-xs space-y-1">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  The Temu "Orange Bag" Hazard:
                </span>
                <p className="text-slate-300 leading-relaxed">
                  {analysis.fulfillmentAudit.temuPackagingAlert}
                </p>
              </div>

              {/* 3-Way Risk Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px] mb-0.5">Shipping Window:</span>
                  <span className="font-semibold text-slate-200 block">
                    {analysis.fulfillmentAudit.shippingWindowDays}
                  </span>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px] mb-0.5">INAD Return Risk:</span>
                  <span
                    className={`font-semibold ${
                      analysis.fulfillmentAudit.inadReturnRiskLevel === "High Return Risk"
                        ? "text-rose-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {analysis.fulfillmentAudit.inadReturnRiskLevel}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate" title={analysis.fulfillmentAudit.inadRiskNotes}>
                    {analysis.fulfillmentAudit.inadRiskNotes}
                  </span>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[11px] mb-0.5">VeRO / Trademark:</span>
                  <span
                    className={`font-semibold ${
                      analysis.fulfillmentAudit.veroRiskLevel === "High VeRO Knockoff Risk"
                        ? "text-rose-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {analysis.fulfillmentAudit.veroRiskLevel}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {analysis.fulfillmentAudit.verdictExplanation}
                  </span>
                </div>
              </div>
            </div>

            {/* Generated Cassini Title & Quick Action */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">
                  Suggested eBay Cassini SEO Title ({analysis.suggestedEbayListing.seoTitle.length}/80 chars):
                </span>
                <button
                  onClick={() => handleCopyTitle(analysis.suggestedEbayListing.seoTitle)}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium transition"
                >
                  {copiedTitle ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTitle ? "Copied" : "Copy Title"}</span>
                </button>
              </div>

              <div className="font-mono text-sm text-slate-100 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                {analysis.suggestedEbayListing.seoTitle}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-slate-400">
                  Ready to list? Click below to populate all item specifics, descriptions, and pricing into the Lister.
                </p>
                <button
                  onClick={handleTransferToLister}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow transition"
                >
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>Transfer to 1-Click Lister</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

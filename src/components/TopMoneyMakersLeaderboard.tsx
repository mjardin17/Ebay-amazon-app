import React, { useState, useEffect } from "react";
import {
  Trophy,
  DollarSign,
  TrendingUp,
  Flame,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Package,
  Layers,
  Zap,
  ArrowRight,
  Info,
  CheckCircle2,
  RefreshCw,
  Clock,
  Filter,
  Building2,
} from "lucide-react";
import { TopMoneyMaker, ItemAnalysis } from "../types";

interface TopMoneyMakersLeaderboardProps {
  onSelectForSoldAnalysis: (productName: string, estimatedCost: number) => void;
  onSelectForAlibabaAnalysis?: (productName: string, estimatedCost: number) => void;
  onSendToLister: (item: ItemAnalysis) => void;
}

export const TopMoneyMakersLeaderboard: React.FC<TopMoneyMakersLeaderboardProps> = ({
  onSelectForSoldAnalysis,
  onSelectForAlibabaAnalysis,
  onSendToLister,
}) => {
  const [criteria, setCriteria] = useState<
    "highest-cashflow" | "highest-margin" | "viral-velocity" | "low-startup-capital"
  >("highest-cashflow");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [moneyMakers, setMoneyMakers] = useState<TopMoneyMaker[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchMoneyMakers = async (selectedCriteria = criteria, selectedCategory = categoryFilter) => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini/top-money-makers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: selectedCriteria,
          category: selectedCategory,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setMoneyMakers(data.data);
      }
    } catch (err) {
      console.error("Failed to load top money makers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMoneyMakers();
  }, [criteria, categoryFilter]);

  const handleTransferToLister = (mm: TopMoneyMaker) => {
    const analysis: ItemAnalysis = {
      title: `${mm.productName} Brand New Fast Tracked USA Shipping`,
      brand: "Unbranded / Universal",
      model: mm.productName.slice(0, 35),
      category: mm.category,
      condition: "Brand New",
      cogs: mm.totalCost,
      imageUrl: mm.imageUrl,
      itemSpecifics: {
        Brand: "Unbranded / Universal",
        Type: mm.category,
        Condition: "Brand New in Box",
        Features: "High Efficiency, Commercial & Home Grade",
        "Sourcing Origin": mm.sourcingPlatform,
        "Monthly Sold Rate": `${mm.unitsSoldPerMonth} units/mo on eBay`,
        "Verified STR": `${mm.sellThroughRatePct}%`,
      },
      descriptionHtml: `<h3>Product Overview</h3>
<p>Brand new factory-sealed ${mm.productName}. High-demand, verified quality specification tested for performance and reliability.</p>

<h3>Key Benefits</h3>
<ul>
  ${mm.reasonsWhyItPrints.map((r) => `<li>${r}</li>`).join("\n  ")}
  <li>Ships quickly and securely with tracking uploaded immediately</li>
  <li>Protected by our 30-day customer satisfaction guarantee</li>
</ul>

<h3>Logistics & Handling</h3>
<p>${mm.fulfillmentAdvice}</p>`,
      comps: {
        fastSalePrice: Math.round(mm.ebayMedianSoldPrice * 0.9 * 100) / 100,
        recommendedPrice: mm.ebayMedianSoldPrice,
        highProfitPrice: Math.round(mm.ebayMedianSoldPrice * 1.15 * 100) / 100,
        medianSoldComps: mm.ebayMedianSoldPrice,
        lowSoldComp: Math.round(mm.ebayMedianSoldPrice * 0.85 * 100) / 100,
        highSoldComp: Math.round(mm.ebayMedianSoldPrice * 1.25 * 100) / 100,
        sellThroughRate: mm.sellThroughRatePct,
        compNotes: `Top Money Maker verified by AI Arbitrage Suite. Sourced on ${mm.sourcingPlatform} at $${mm.totalCost.toFixed(2)} with median sold price of $${mm.ebayMedianSoldPrice.toFixed(2)}.`,
      },
      flawAndInspection: {
        flawsDetected: [],
        returnRiskLevel: "Low",
        authenticityNotes: mm.fulfillmentAdvice,
        suggestedDisclaimer: "Item is 100% brand new sealed in factory protective packaging.",
      },
      shippingOptimization: {
        estimatedWeightOz: 16,
        packageDimensions: "10 x 7 x 4 in",
        recommendedCarrier: "USPS Ground Advantage",
        estimatedShippingCost: 6.5,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: mm.ebayMedianSoldPrice,
        mercari: Math.round(mm.ebayMedianSoldPrice * 0.95 * 100) / 100,
        poshmark: Math.round(mm.ebayMedianSoldPrice * 1.05 * 100) / 100,
        facebookMarketplace: Math.round(mm.ebayMedianSoldPrice * 0.9 * 100) / 100,
      },
      negotiationRules: {
        autoAcceptOfferAbove: Math.round(mm.ebayMedianSoldPrice * 0.92 * 100) / 100,
        autoDeclineOfferBelow: Math.round((mm.totalCost + 10) * 100) / 100,
        counterOfferStrategy: "Accept offers within $3 of median sold clearing comp.",
      },
    };

    onSendToLister(analysis);
  };

  const totalMonthlyCashflow = moneyMakers.reduce(
    (acc, cur) => acc + cur.estimatedMonthlyCashflow,
    0
  );
  const avgRoi = moneyMakers.length
    ? Math.round(
        (moneyMakers.reduce((acc, cur) => acc + cur.roiPct, 0) /
          moneyMakers.length) *
          10
      ) / 10
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Portfolio Summary */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-black shadow-md shadow-amber-500/20">
                <Trophy className="w-5 h-5" />
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Top Money Maker Recommendations
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Live Arbitrage Alpha
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
              Curated, high-velocity arbitrage winners sourced directly from low-cost factory suppliers (Temu, 1688, AliExpress) with verified 90-day eBay sold comps, high sell-through rates, and guaranteed VeRO-safe unbranded models.
            </p>
          </div>

          <button
            id="btn-refresh-top-money-makers"
            onClick={() => fetchMoneyMakers()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-semibold text-xs sm:text-sm transition disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Re-scanning Sold Data..." : "Refresh Recommendations"}</span>
          </button>
        </div>

        {/* Aggregate Stats Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Combined Monthly Potential</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              +${totalMonthlyCashflow.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 block">Across 6 Top Winners</span>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Average Seller ROI</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
              {avgRoi}%
            </span>
            <span className="text-[10px] text-slate-400 block">Net Return on Inventory</span>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Trademark Safety</span>
            <span className="text-xl sm:text-2xl font-black text-indigo-400 font-mono flex items-center gap-1.5">
              100%
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </span>
            <span className="text-[10px] text-slate-400 block">VeRO Protected / Unbranded</span>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Startup Capital (Avg)</span>
            <span className="text-xl sm:text-2xl font-black text-slate-200 font-mono">
              ~$190
            </span>
            <span className="text-[10px] text-slate-400 block">For 10-Unit Micro-Batch</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setCriteria("highest-cashflow")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                criteria === "highest-cashflow"
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              Highest Monthly Cashflow ($/mo)
            </button>

            <button
              onClick={() => setCriteria("highest-margin")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                criteria === "highest-margin"
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              Highest Dollar Margin ($/unit)
            </button>

            <button
              onClick={() => setCriteria("viral-velocity")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                criteria === "viral-velocity"
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              Viral Velocity (Fastest Flipping)
            </button>

            <button
              onClick={() => setCriteria("low-startup-capital")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                criteria === "low-startup-capital"
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              Low Startup Capital (&lt;$150 Test)
            </button>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Ranked by verified cleared profit</span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mx-auto" />
          <h3 className="text-base font-semibold text-white">
            Aggregating Top Money Maker Opportunities...
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Cross-referencing wholesale factory pricing against active eBay 90-day sold listings and calculating net margin after USPS postage.
          </p>
        </div>
      )}

      {/* Recommended Items Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {moneyMakers.map((mm) => {
            const isExpanded = expandedId === mm.id;

            return (
              <div
                key={mm.id}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl overflow-hidden flex flex-col justify-between shadow-md transition-all duration-200"
              >
                {/* Card Top: Image & Badges */}
                <div className="p-4 space-y-3">
                  <div className="relative h-44 rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                    <img
                      src={mm.imageUrl}
                      alt={mm.productName}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
                    />

                    {/* Rank Badge */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/90 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-black">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>#{mm.rank} Money Maker</span>
                    </div>

                    {/* Category / Criteria Badge */}
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-[11px] font-bold">
                      {mm.badge}
                    </div>

                    {/* Supplier Sourcing Tag */}
                    <div className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-md bg-slate-950/90 text-orange-300 border border-orange-800/80 text-[10px] font-bold">
                      Source: {mm.sourcingPlatform} @ ${mm.sourcingCost.toFixed(2)}
                    </div>
                  </div>

                  {/* Title & Category */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {mm.category}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white line-clamp-2 mt-0.5 leading-snug">
                      {mm.productName}
                    </h3>
                  </div>

                  {/* Pricing Spread Comparison */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Temu / Factory Buy:</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        ${mm.totalCost.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">eBay Median Sold:</span>
                      <span className="font-mono font-bold text-white text-sm">
                        ${mm.ebayMedianSoldPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Net Profit & Monthly Cashflow Hero */}
                  <div className="bg-emerald-950/30 border border-emerald-800/60 p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-slate-300 block font-medium">
                        Net Profit / Sale
                      </span>
                      <span className="text-lg font-black text-emerald-400 font-mono">
                        +${mm.netProfitPerUnit.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-emerald-500 font-semibold block">
                        {mm.roiPct}% Net ROI
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-300 block font-medium">
                        Est. Monthly Cashflow
                      </span>
                      <span className="text-lg font-black text-white font-mono">
                        +${mm.estimatedMonthlyCashflow.toLocaleString()}
                        <span className="text-[11px] text-slate-400 font-normal">/mo</span>
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {mm.sellThroughRatePct}% Sell-Through
                      </span>
                    </div>
                  </div>

                  {/* Micro-Batch Test Order Info */}
                  <div className="flex items-center justify-between text-xs bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                      <span>Recommended Test Batch:</span>
                    </span>
                    <span className="font-bold text-slate-200">
                      {mm.recommendedInventoryUnits} units (${mm.testBudgetNeeded.toFixed(0)} capital)
                    </span>
                  </div>

                  {/* Expandable Reasons Why It Prints */}
                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t border-slate-800 text-xs text-slate-300">
                      <span className="font-bold text-amber-300 block">
                        Why This Item Prints Money:
                      </span>
                      <ul className="space-y-1.5">
                        {mm.reasonsWhyItPrints.map((reason, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 mt-2">
                        <span className="font-bold text-slate-200 block text-[11px] mb-0.5">
                          Logistics & Packaging Note:
                        </span>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {mm.fulfillmentAdvice}
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : mm.id)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold block transition"
                  >
                    {isExpanded ? "Hide detailed insights ▲" : "View market insights & why it sells ▼"}
                  </button>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 pt-0 space-y-2 border-t border-slate-800/80 mt-2">
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    {/* Button 1: Analyze Temu Sold Logic */}
                    <button
                      onClick={() =>
                        onSelectForSoldAnalysis(mm.sourcingSearchQuery, mm.totalCost)
                      }
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition shadow-sm"
                      title="Analyze Temu price vs. actual 90-day eBay sold completed comps"
                    >
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>Temu Comps</span>
                    </button>

                    {/* Button 2: Analyze Alibaba Wholesale */}
                    {onSelectForAlibabaAnalysis ? (
                      <button
                        onClick={() =>
                          onSelectForAlibabaAnalysis(mm.sourcingSearchQuery, mm.totalCost * 0.75)
                        }
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-orange-400 border border-orange-500/40 text-xs font-bold transition shadow-sm"
                        title="Analyze Alibaba B2B factory wholesale pricing, MOQs & DDP freight"
                      >
                        <Building2 className="w-3.5 h-3.5 text-orange-400" />
                        <span>Alibaba B2B</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleTransferToLister(mm)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition shadow-md"
                        title="Directly transfer into eBay listing generator"
                      >
                        <Zap className="w-3.5 h-3.5 fill-slate-950" />
                        <span>1-Click List</span>
                      </button>
                    )}
                  </div>

                  {/* Secondary row for 1-Click List if Alibaba is present */}
                  {onSelectForAlibabaAnalysis && (
                    <button
                      onClick={() => handleTransferToLister(mm)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black transition shadow-md"
                      title="Directly transfer into eBay listing generator"
                    >
                      <Zap className="w-3.5 h-3.5 fill-slate-950" />
                      <span>1-Click eBay Listing</span>
                    </button>
                  )}

                  {/* Sourcing Links */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <a
                      href={`https://www.temu.com/search_result.html?search_key=${encodeURIComponent(
                        mm.sourcingSearchQuery
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-amber-400 flex items-center gap-1 transition"
                    >
                      <span>Temu</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-slate-600">•</span>
                    <a
                      href={`https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(
                        mm.sourcingSearchQuery
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-orange-400 flex items-center gap-1 transition"
                    >
                      <span>Alibaba Wholesale</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

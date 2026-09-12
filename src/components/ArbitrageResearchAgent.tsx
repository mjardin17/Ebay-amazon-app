import React, { useState, useEffect } from "react";
import {
  Compass,
  Search,
  Sparkles,
  ArrowRight,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  Truck,
  ExternalLink,
  Sliders,
  CheckCircle,
  Package,
  Layers,
  Zap,
  Link as LinkIcon,
  Tag,
  AlertTriangle,
  Flame,
  Trophy,
  Image as ImageIcon,
  Building2,
} from "lucide-react";
import { ArbitrageOpportunity, ItemAnalysis } from "../types";
import { VeroCheckerTool } from "./VeroCheckerTool";
import { TemuSoldArbitrageScanner } from "./TemuSoldArbitrageScanner";
import { AlibabaArbitrageScanner } from "./AlibabaArbitrageScanner";
import { TopMoneyMakersLeaderboard } from "./TopMoneyMakersLeaderboard";

interface ArbitrageResearchAgentProps {
  onSendToLister: (item: ItemAnalysis) => void;
  onOpenPinStudio?: (item: ItemAnalysis) => void;
}

const NICHE_PRESETS = [
  "Trending Electronics & Modding",
  "Cyberpunk Clocks & Desk Tech",
  "Power Tool Replacement Batteries",
  "E-Commerce & Thermal Shipping Gear",
  "Retro Gaming Consoles & Mod Kits",
  "Outdoor EDC & Titanium Gear",
];

const QUICK_SCAN_EXAMPLES = [
  {
    title: "Wireless Ergonomic Split Mechanical Keyboard RGB",
    url: "https://aliexpress.com/item/10050064219.html",
    platform: "AliExpress",
    cost: 26.5,
    shipping: 2.0,
  },
  {
    title: "4x6 Thermal Shipping Label Printer Bluetooth Wireless",
    url: "https://temu.com/goods-thermal-label-printer.html",
    platform: "Temu",
    cost: 39.0,
    shipping: 0.0,
  },
  {
    title: "DeWalt 20V Max 6.0Ah Replacement Battery 2-Pack",
    url: "https://walmart.com/ip/dewalt-compatible-battery-pack/84920",
    platform: "Walmart",
    cost: 32.0,
    shipping: 0.0,
  },
];

export const ArbitrageResearchAgent: React.FC<ArbitrageResearchAgentProps> = ({
  onSendToLister,
  onOpenPinStudio,
}) => {
  const [activeMode, setActiveMode] = useState<
    "top-moneymakers" | "temu-sold" | "alibaba" | "niche" | "single" | "vero"
  >("top-moneymakers");
  const [selectedTemuProduct, setSelectedTemuProduct] = useState<{ query: string; cost: number } | null>(null);
  const [selectedAlibabaProduct, setSelectedAlibabaProduct] = useState<{ query: string; cost: number } | null>(null);

  const handleSelectForSoldAnalysis = (productName: string, estimatedCost: number) => {
    setSelectedTemuProduct({ query: productName, cost: estimatedCost });
    setActiveMode("temu-sold");
  };

  const handleSelectForAlibabaAnalysis = (productName: string, estimatedCost: number) => {
    setSelectedAlibabaProduct({ query: productName, cost: estimatedCost });
    setActiveMode("alibaba");
  };

  // Niche Scanner States
  const [selectedNiche, setSelectedNiche] = useState<string>(NICHE_PRESETS[0]);
  const [customQuery, setCustomQuery] = useState<string>("");
  const [minMargin, setMinMargin] = useState<number>(30);
  const [sourcePlatform, setSourcePlatform] = useState<string>("All");
  const [scanning, setScanning] = useState<boolean>(false);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  // Single Product / URL Scanner States
  const [singleTitle, setSingleTitle] = useState(QUICK_SCAN_EXAMPLES[0].title);
  const [singleUrl, setSingleUrl] = useState(QUICK_SCAN_EXAMPLES[0].url);
  const [singlePlatform, setSinglePlatform] = useState(QUICK_SCAN_EXAMPLES[0].platform);
  const [singleCost, setSingleCost] = useState(QUICK_SCAN_EXAMPLES[0].cost);
  const [singleShipping, setSingleShipping] = useState(QUICK_SCAN_EXAMPLES[0].shipping);
  const [singleScanning, setSingleScanning] = useState(false);
  const [singleResult, setSingleResult] = useState<{
    opportunity: ArbitrageOpportunity;
    itemAnalysis: ItemAnalysis;
  } | null>(null);

  // Initial scan on mount
  useEffect(() => {
    if (opportunities.length === 0) {
      handleScan(selectedNiche);
    }
  }, []);

  // Run Niche Scan
  const handleScan = async (nicheToScan?: string) => {
    setScanning(true);
    setHasScanned(true);
    const query = nicheToScan || customQuery || selectedNiche;

    try {
      const res = await fetch("/api/gemini/arbitrage-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: query,
          minMargin,
          sourcePlatform,
        }),
      });
      const data = await res.json();
      if (data.opportunities) {
        setOpportunities(data.opportunities);
      }
    } catch (err) {
      console.error("Arbitrage research failed:", err);
    } finally {
      setScanning(false);
    }
  };

  const handlePresetClick = (preset: string) => {
    setSelectedNiche(preset);
    setCustomQuery("");
    handleScan(preset);
  };

  // Run Single Product Scan
  const handleRunSingleScan = async () => {
    if (!singleTitle.trim()) return;
    setSingleScanning(true);

    try {
      const res = await fetch("/api/gemini/single-arbitrage-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTitle: singleTitle,
          sourceUrl: singleUrl,
          sourcePlatform: singlePlatform,
          sourceCost: singleCost,
          sourceShipping: singleShipping,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSingleResult(json.data);
      }
    } catch (err) {
      console.error("Single scan error:", err);
    } finally {
      setSingleScanning(false);
    }
  };

  // Load example into Single Scanner
  const handleLoadExample = (ex: typeof QUICK_SCAN_EXAMPLES[0]) => {
    setSingleTitle(ex.title);
    setSingleUrl(ex.url);
    setSinglePlatform(ex.platform);
    setSingleCost(ex.cost);
    setSingleShipping(ex.shipping);
  };

  // Convert Arbitrage deal to ItemAnalysis
  const buildItemAnalysisFromOpp = (opp: ArbitrageOpportunity): ItemAnalysis => {
    return {
      title: opp.suggestedEbayTitle,
      brand: opp.productName.split(" ")[0] || "Generic",
      model: opp.productName,
      category: opp.category,
      condition: "Brand New",
      cogs: opp.sourcePrice + opp.sourceShipping,
      imageUrl: opp.imageUrl,
      itemSpecifics: {
        Brand: opp.productName.split(" ")[0] || "Unbranded",
        Type: "Dropship Ready Item",
        Category: opp.category,
        "Source Origin": opp.sourceSite,
        "Fulfillment Method": opp.dropshipFeasibility.fulfillmentMethod,
      },
      descriptionHtml: `<h3>Product Overview</h3>
<p>Brand new ${opp.productName}. High quality, fast fulfillment, and backed by a 30-day money back satisfaction guarantee.</p>

<h3>Key Features</h3>
<ul>
  <li>Fast shipping with online tracking provided within 24 hours</li>
  <li>Factory direct quality inspection prior to dispatch</li>
  <li>Complete retail or safe transit packaging</li>
</ul>

<h3>Dropship / Supplier Guarantee</h3>
<p>${opp.dropshipFeasibility.recommendation}</p>`,
      comps: {
        fastSalePrice: Math.round(opp.ebayResalePrice * 0.92 * 100) / 100,
        recommendedPrice: opp.ebayResalePrice,
        highProfitPrice: Math.round(opp.ebayResalePrice * 1.1 * 100) / 100,
        medianSoldComps: opp.ebayResalePrice,
        lowSoldComp: Math.round(opp.ebayResalePrice * 0.85 * 100) / 100,
        highSoldComp: Math.round(opp.ebayResalePrice * 1.25 * 100) / 100,
        sellThroughRate: 85,
        compNotes: `Discovered by AI Arbitrage Agent. Sourced via ${opp.sourceSite} at $${(opp.sourcePrice + opp.sourceShipping).toFixed(2)} with resale benchmark at $${opp.ebayResalePrice.toFixed(2)}.`,
      },
      flawAndInspection: {
        flawsDetected: [],
        returnRiskLevel: opp.dropshipFeasibility.veroRisk === "High" ? "High" : "Low",
        authenticityNotes: `Sourced from ${opp.sourceSite}. Packaging: ${opp.dropshipFeasibility.packagingRisk}.`,
        suggestedDisclaimer: "Item ships brand new directly from fulfillment center with tracking number provided immediately upon dispatch.",
      },
      shippingOptimization: {
        estimatedWeightOz: 16,
        packageDimensions: "8 x 6 x 4 in",
        recommendedCarrier: "Tracked Carrier / Standard Ground",
        estimatedShippingCost: opp.shippingToBuyer,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: opp.ebayResalePrice,
        mercari: Math.round(opp.ebayResalePrice * 0.95 * 100) / 100,
        poshmark: Math.round(opp.ebayResalePrice * 1.05 * 100) / 100,
        facebookMarketplace: Math.round(opp.ebayResalePrice * 0.9 * 100) / 100,
      },
      negotiationRules: {
        autoAcceptOfferAbove: Math.round(opp.ebayResalePrice * 0.9 * 100) / 100,
        autoDeclineOfferBelow: Math.round((opp.sourcePrice + opp.sourceShipping + opp.ebayFees + opp.shippingToBuyer) * 1.1 * 100) / 100,
        counterOfferStrategy: "Counter with 5% discount for immediate purchase.",
      },
    };
  };

  const handleTransferToLister = (opp: ArbitrageOpportunity) => {
    const analysis = buildItemAnalysisFromOpp(opp);
    onSendToLister(analysis);
  };

  const handleCreatePin = (opp: ArbitrageOpportunity) => {
    const analysis = buildItemAnalysisFromOpp(opp);
    onOpenPinStudio?.(analysis);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation: Top Money Makers vs Temu Sold vs Niche vs Single Product vs VeRO Shield */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            id="tab-mode-top-moneymakers"
            onClick={() => setActiveMode("top-moneymakers")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeMode === "top-moneymakers"
                ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/25 font-black"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Trophy className={`w-4 h-4 ${activeMode === "top-moneymakers" ? "text-slate-950 fill-slate-950" : "text-amber-400"}`} />
            <span>Top Money Makers</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950 text-amber-300 border border-amber-800/80 font-bold">
              HOT PICKS
            </span>
          </button>

          <button
            id="tab-mode-temu-sold"
            onClick={() => setActiveMode("temu-sold")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeMode === "temu-sold"
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Flame className={`w-4 h-4 ${activeMode === "temu-sold" ? "text-slate-950 fill-slate-950" : "text-amber-400 fill-amber-400"}`} />
            <span>Temu Sold Comps</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950 text-amber-300 border border-amber-800/80 font-bold">
              SOLD LOGIC
            </span>
          </button>

          <button
            id="tab-mode-alibaba"
            onClick={() => setActiveMode("alibaba")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeMode === "alibaba"
                ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md shadow-orange-600/25 font-bold"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Building2 className={`w-4 h-4 ${activeMode === "alibaba" ? "text-white" : "text-orange-400"}`} />
            <span>Alibaba Factory Wholesale</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950 text-orange-300 border border-orange-800/80 font-bold">
              B2B DDP
            </span>
          </button>

          <button
            id="tab-mode-niche"
            onClick={() => setActiveMode("niche")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeMode === "niche"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Niche Arbitrage Scanner</span>
          </button>

          <button
            id="tab-mode-single"
            onClick={() => setActiveMode("single")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeMode === "single"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Supplier Link / Product Scanner</span>
          </button>

          <button
            id="tab-mode-vero"
            onClick={() => setActiveMode("vero")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              activeMode === "vero"
                ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-300" />
            <span>VeRO Brand Shield</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 pr-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>eBay Cassini + Real-Time Margin Matcher</span>
        </div>
      </div>

      {/* MODE 0: Top Money Makers Leaderboard & Recommendations */}
      {activeMode === "top-moneymakers" && (
        <TopMoneyMakersLeaderboard
          onSelectForSoldAnalysis={handleSelectForSoldAnalysis}
          onSelectForAlibabaAnalysis={handleSelectForAlibabaAnalysis}
          onSendToLister={onSendToLister}
        />
      )}

      {/* MODE 1: Temu Low Price vs Actual Sold Comps */}
      {activeMode === "temu-sold" && (
        <TemuSoldArbitrageScanner
          onSendToLister={onSendToLister}
          initialQuery={selectedTemuProduct?.query}
          initialCost={selectedTemuProduct?.cost}
          onOpenTopMoneyMakers={() => setActiveMode("top-moneymakers")}
          onOpenPinStudio={onOpenPinStudio}
        />
      )}

      {/* MODE 1b: Alibaba Factory Wholesale vs Actual Sold Comps */}
      {activeMode === "alibaba" && (
        <AlibabaArbitrageScanner
          onSendToLister={onSendToLister}
          initialQuery={selectedAlibabaProduct?.query}
          initialCost={selectedAlibabaProduct?.cost}
          onOpenTopMoneyMakers={() => setActiveMode("top-moneymakers")}
          onOpenPinStudio={onOpenPinStudio}
        />
      )}

      {/* MODE 1: Niche Discovery Scanner */}
      {activeMode === "niche" && (
        <div className="space-y-6">
          {/* Controls Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Compass className="w-5 h-5" />
                  </span>
                  <h2 className="text-lg font-bold text-white">
                    Live E-Commerce Arbitrage & Sourcing Scanner
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Multi-Supplier Spreads
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Autonomous agent scrapes low-cost supplier catalog prices (AliExpress, Walmart Rollback, Temu, GoodwillFinds) and matches with high-conversion eBay 90-day sold comps.
                </p>
              </div>

              <button
                id="btn-scan-arbitrage"
                onClick={() => handleScan()}
                disabled={scanning}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/10 transition disabled:opacity-50 flex-shrink-0"
              >
                <Sparkles className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
                <span>{scanning ? "Researching Deals..." : "Scan Hot Arbitrage"}</span>
              </button>
            </div>

            {/* Niche Presets */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-400 block">
                Select High-Yield Niche:
              </span>
              <div className="flex flex-wrap gap-2">
                {NICHE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handlePresetClick(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      selectedNiche === preset && !customQuery
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-semibold"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Query & Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-800">
              <div className="sm:col-span-6">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Product Search / Niche (Optional):
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="input-arbitrage-query"
                    type="text"
                    value={customQuery}
                    onChange={(e) => setCustomQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScan(customQuery)}
                    placeholder="e.g., retro keyboards, thermal shipping labels, vintage lenses..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Source Platform:
                </label>
                <select
                  value={sourcePlatform}
                  onChange={(e) => setSourcePlatform(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:border-emerald-400 focus:outline-none"
                >
                  <option value="All">All Suppliers (Best Deals)</option>
                  <option value="AliExpress">AliExpress Wholesale</option>
                  <option value="Walmart">Walmart Rollback / Clearance</option>
                  <option value="Temu">Temu Factory Direct</option>
                  <option value="GoodwillFinds">Goodwill / Estate Overstock</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                  <span>Min. Margin:</span>
                  <span className="text-emerald-400 font-bold">{minMargin}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="60"
                  step="5"
                  value={minMargin}
                  onChange={(e) => setMinMargin(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer mt-2"
                />
              </div>
            </div>
          </div>

          {/* Loading indicator */}
          {scanning && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mx-auto" />
              <h3 className="text-base font-semibold text-white">
                AI Research Agent is Analyzing Price Spreads...
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Cross-referencing supplier catalog costs against 90-day verified sold items on eBay, subtracting platform fees, and rating dropshipping fulfillment feasibility.
              </p>
            </div>
          )}

          {/* Opportunities List */}
          {!scanning && opportunities.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  Found <strong className="text-white">{opportunities.length}</strong> high-margin arbitrage opportunities
                </span>
                <span>Sorted by Net ROI & Feasibility</span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {opportunities.map((opp) => (
                  <div
                    key={opp.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-sm transition space-y-4"
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={opp.imageUrl}
                          alt={opp.productName}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-800 flex-shrink-0"
                        />
                        <div>
                          <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                            {opp.category}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-white">
                            {opp.productName}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-medium">
                              Source: <span className="text-amber-400 font-bold">{opp.sourceSite}</span>
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-950 text-indigo-300 border border-indigo-800 font-medium">
                              Target: <strong className="text-white">eBay Resale</strong>
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                              Score: {opp.arbitrageScore}/100
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* The Net Profit Badge */}
                      <div className="sm:text-right bg-slate-950 p-3 rounded-xl border border-slate-800 flex sm:flex-col justify-between items-center sm:items-end w-full sm:w-auto">
                        <div>
                          <span className="text-[11px] text-slate-400 block">Est. Net Profit</span>
                          <span className="text-xl sm:text-2xl font-black text-emerald-400">
                            +${opp.netProfit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mt-0 sm:mt-1">
                          <span className="text-emerald-400">{opp.roiPercentage.toFixed(0)}% ROI</span>
                          <span className="text-slate-600">|</span>
                          <span>{opp.marginPercentage.toFixed(1)}% Margin</span>
                        </div>
                      </div>
                    </div>

                    {/* The Sourcing Spread Visual */}
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                      <div className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2 text-xs">
                        {/* Source Cost */}
                        <div className="sm:col-span-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[11px] block">1. Buy Cheap on Source:</span>
                          <div className="text-sm font-bold text-amber-300 mt-0.5">
                            ${opp.sourcePrice.toFixed(2)}{" "}
                            <span className="text-xs font-normal text-slate-400">
                              (+${opp.sourceShipping.toFixed(2)} ship)
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate mt-0.5" title={opp.sourceUrlNote}>
                            {opp.sourceUrlNote}
                          </span>
                        </div>

                        {/* Arrow */}
                        <div className="text-center text-slate-500 hidden sm:block">
                          <ArrowRight className="w-5 h-5 mx-auto text-emerald-400" />
                        </div>

                        {/* Resale on eBay */}
                        <div className="sm:col-span-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-slate-400 text-[11px] block">2. Sell High on eBay:</span>
                          <div className="text-sm font-bold text-emerald-400 mt-0.5">
                            ${opp.ebayResalePrice.toFixed(2)}{" "}
                            <span className="text-xs font-normal text-slate-400">
                              (Median Sold Comp)
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                            <span>eBay Fee: -${opp.ebayFees.toFixed(2)}</span>
                            <span>Postage: -${opp.shippingToBuyer.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dropshipping Feasibility & Risk Panel */}
                    <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">Fulfillment:</span>
                          <span className="font-semibold text-slate-200">
                            {opp.dropshipFeasibility.fulfillmentMethod} ({opp.dropshipFeasibility.fulfillmentSpeedDays})
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">Packaging Risk:</span>
                          <span className="text-slate-200">
                            {opp.dropshipFeasibility.packagingRisk}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">eBay VeRO Risk:</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              opp.dropshipFeasibility.veroRisk === "High"
                                ? "bg-rose-950 text-rose-300 border-rose-800"
                                : "bg-emerald-950 text-emerald-300 border-emerald-800"
                            }`}
                          >
                            {opp.dropshipFeasibility.veroRisk} Risk
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        <strong className="text-amber-400">Agent Recommendation:</strong>{" "}
                        {opp.dropshipFeasibility.recommendation}
                      </p>
                    </div>

                    {/* Action Row */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                      <div className="text-xs text-slate-400 truncate max-w-lg">
                        <span className="font-semibold text-slate-300">Generated Title:</span>{" "}
                        <span className="italic">{opp.suggestedEbayTitle}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleCreatePin(opp)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold text-xs shadow transition"
                          title="Create 2:3 Pinterest Pin Graphic"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>2:3 Pin</span>
                        </button>
                        <button
                          id={`btn-load-lister-${opp.id}`}
                          onClick={() => handleTransferToLister(opp)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow transition"
                        >
                          <Zap className="w-4 h-4 fill-slate-950" />
                          <span>Send to AI Lister</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!scanning && hasScanned && opportunities.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              No arbitrage deals met the minimum {minMargin}% margin threshold for "{customQuery || selectedNiche}". Try lowering the margin slider or selecting another niche.
            </div>
          )}
        </div>
      )}

      {/* MODE 2: Single Product & Supplier Link Scanner */}
      {activeMode === "single" && (
        <div className="space-y-6">
          {/* Sourcing Input Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <LinkIcon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-base text-white">
                  Direct Product & Supplier URL Arbitrage Analyzer
                </h3>
                <p className="text-xs text-slate-400">
                  Found an item on AliExpress, Walmart, Temu, or Amazon? Enter its details below to calculate real eBay sold comps, net profit, VeRO risk, and create an instant listing.
                </p>
              </div>
            </div>

            {/* Quick Preset Examples */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Quick Test Items:
              </span>
              <div className="flex flex-wrap gap-2">
                {QUICK_SCAN_EXAMPLES.map((ex, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleLoadExample(ex)}
                    className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    {ex.platform}: {ex.title.slice(0, 32)}... (${ex.cost})
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
              <div className="md:col-span-8">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Product Name / Title / Specs:
                </label>
                <input
                  id="input-single-title"
                  type="text"
                  value={singleTitle}
                  onChange={(e) => setSingleTitle(e.target.value)}
                  placeholder="e.g. Ergonomic Split Mechanical Keyboard Bluetooth RGB Hot Swap"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Source Supplier Platform:
                </label>
                <select
                  value={singlePlatform}
                  onChange={(e) => setSinglePlatform(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:border-emerald-400 focus:outline-none"
                >
                  <option value="AliExpress">AliExpress Wholesale</option>
                  <option value="Walmart">Walmart Online / Rollback</option>
                  <option value="Temu">Temu Factory Batch</option>
                  <option value="Amazon">Amazon Retail Arbitrage</option>
                  <option value="CJ Dropshipping">CJ Dropshipping US Warehouse</option>
                  <option value="1688 / Taobao">1688 / Taobao Agent</option>
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Supplier Product URL / Item ID (Optional):
                </label>
                <input
                  type="text"
                  value={singleUrl}
                  onChange={(e) => setSingleUrl(e.target.value)}
                  placeholder="https://aliexpress.com/item/1005... or https://walmart.com/ip/..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Unit Buy Price ($ USD):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={singleCost}
                  onChange={(e) => setSingleCost(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white font-mono focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Supplier Shipping to Buyer ($):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={singleShipping}
                  onChange={(e) => setSingleShipping(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white font-mono focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                id="btn-run-single-scan"
                onClick={handleRunSingleScan}
                disabled={singleScanning || !singleTitle.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${singleScanning ? "animate-spin" : ""}`} />
                <span>{singleScanning ? "Analyzing Arbitrage Spread..." : "Analyze Arbitrage & Profit"}</span>
              </button>
            </div>
          </div>

          {/* Single Result Breakdown Card */}
          {singleResult && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                    {singleResult.opportunity.category}
                  </span>
                  <h3 className="text-lg font-bold text-white">
                    {singleResult.opportunity.productName}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-amber-300 font-semibold">
                      Sourced on: {singleResult.opportunity.sourceSite}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                      Arbitrage Score: {singleResult.opportunity.arbitrageScore}/100
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenPinStudio?.(singleResult.itemAnalysis)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-xs shadow transition"
                    title="Generate 2:3 Pinterest Pin Graphic"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>2:3 Pin Graphic</span>
                  </button>
                  <button
                    id="btn-single-to-lister"
                    onClick={() => onSendToLister(singleResult.itemAnalysis)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg transition"
                  >
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>Transfer to 1-Click AI Lister</span>
                  </button>
                </div>
              </div>

              {/* Profit & Fee Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Total Buy Cost</span>
                  <span className="text-xl font-bold text-amber-400">
                    ${(singleResult.opportunity.sourcePrice + singleResult.opportunity.sourceShipping).toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Product + Inbound</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">eBay Sold Benchmark</span>
                  <span className="text-xl font-bold text-white">
                    ${singleResult.opportunity.ebayResalePrice.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-500 block">90-Day Sold Median</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">eBay Fees & Postage</span>
                  <span className="text-xl font-bold text-rose-400">
                    -${(singleResult.opportunity.ebayFees + singleResult.opportunity.shippingToBuyer).toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-500 block">13.25% + 30¢ + Carrier</span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border-2 border-emerald-500/50 shadow-sm">
                  <span className="text-xs text-emerald-400 block font-semibold">Net Profit in Pocket</span>
                  <span className="text-2xl font-black text-emerald-400">
                    +${singleResult.opportunity.netProfit.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-300 block">
                    {singleResult.opportunity.roiPercentage.toFixed(0)}% ROI ({singleResult.opportunity.marginPercentage.toFixed(1)}% Margin)
                  </span>
                </div>
              </div>

              {/* Dropship Feasibility & VeRO Warning */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-slate-400">Fulfillment Method: </span>
                    <strong className="text-white">
                      {singleResult.opportunity.dropshipFeasibility.fulfillmentMethod} ({singleResult.opportunity.dropshipFeasibility.fulfillmentSpeedDays})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Packaging Type: </span>
                    <strong className="text-slate-200">
                      {singleResult.opportunity.dropshipFeasibility.packagingRisk}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">VeRO Risk: </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                        singleResult.opportunity.dropshipFeasibility.veroRisk === "High"
                          ? "bg-rose-950 text-rose-300 border-rose-800"
                          : "bg-emerald-950 text-emerald-300 border-emerald-800"
                      }`}
                    >
                      {singleResult.opportunity.dropshipFeasibility.veroRisk}
                    </span>
                  </div>
                </div>

                <p className="text-slate-300 text-xs leading-relaxed pt-1">
                  <strong className="text-emerald-400">Sourcing Recommendation:</strong>{" "}
                  {singleResult.opportunity.dropshipFeasibility.recommendation}
                </p>
              </div>

              {/* Title preview */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 block mb-1">Generated eBay Cassini SEO Title:</span>
                <span className="font-mono text-sm text-slate-100 font-semibold">
                  {singleResult.opportunity.suggestedEbayTitle}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 3: VeRO Brand Shield & Database */}
      {activeMode === "vero" && (
        <div className="space-y-6">
          <VeroCheckerTool />
        </div>
      )}
    </div>
  );
};

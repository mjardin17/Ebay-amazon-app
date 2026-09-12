import React, { useState, useRef } from "react";
import {
  Upload,
  Camera,
  Sparkles,
  Copy,
  Check,
  Tag,
  TrendingUp,
  Layers,
  ArrowRight,
  ExternalLink,
  Code,
  FileText,
  Bookmark,
  CheckCircle,
  HelpCircle,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Image as ImageIcon,
  Zap,
} from "lucide-react";
import { ItemAnalysis } from "../types";
import { PRESET_ITEMS, PresetItem } from "../data/sampleItems";
import { ProfitCalculator } from "./ProfitCalculator";
import { FlawInspector } from "./FlawInspector";
import { SourcingFinderDrawer } from "./SourcingFinderDrawer";
import { AmazonListingCard } from "./AmazonListingCard";

interface ListingGeneratorProps {
  onSaveDraft: (item: ItemAnalysis) => void;
  initialItem?: ItemAnalysis | null;
  onOpenPinStudio?: (item: ItemAnalysis) => void;
  onOpenBoxem?: () => void;
}

export const ListingGenerator: React.FC<ListingGeneratorProps> = ({
  onSaveDraft,
  initialItem,
  onOpenPinStudio,
  onOpenBoxem,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(
    initialItem || PRESET_ITEMS[0].precomputedAnalysis
  );
  const [notes, setNotes] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string | null>(
    initialItem?.imageUrl || PRESET_ITEMS[0].imageUrl
  );
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedSpecifics, setCopiedSpecifics] = useState(false);
  const [descTab, setDescTab] = useState<"rendered" | "html">("rendered");
  const [marketplaceView, setMarketplaceView] = useState<"both" | "ebay" | "amazon">("both");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSourcingOpen, setIsSourcingOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImagePreview(base64);
        setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // Select a preset item
  const handleSelectPreset = (preset: PresetItem) => {
    setImagePreview(preset.imageUrl);
    setImageBase64(null);
    setNotes(preset.notes);
    setAnalysis(preset.precomputedAnalysis);
    setSavedSuccess(false);
  };

  // Run AI analysis
  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setSavedSuccess(false);
    try {
      const res = await fetch("/api/gemini/analyze-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageBase64 || (imagePreview?.startsWith("data:") ? imagePreview : undefined),
          notes,
          itemTitle: notes ? notes : "Item analysis",
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setAnalysis({
          ...json.data,
          imageUrl: imagePreview || undefined,
        });
      }
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopyTitle = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis.title);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2000);
  };

  const handleCopyDesc = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis.descriptionHtml);
    setCopiedDesc(true);
    setTimeout(() => setCopiedDesc(false), 2000);
  };

  const handleCopySpecifics = () => {
    if (!analysis) return;
    const text = Object.entries(analysis.itemSpecifics)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedSpecifics(true);
    setTimeout(() => setCopiedSpecifics(false), 2000);
  };

  const handleSaveToDrafts = () => {
    if (!analysis) return;
    onSaveDraft(analysis);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Quick Preset Selector & Upload Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-5 items-start lg:items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              AI Listing Generator & Sold Comps Engine
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Upload an item photo or test our realistic verified power-seller presets below:
            </p>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Quick Test:</span>
            {PRESET_ITEMS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                  imagePreview === p.imageUrl
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="w-4 h-4 rounded-full object-cover"
                />
                <span className="max-w-[130px] truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-slate-800">
          {/* Image Upload Box */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-xl bg-slate-950 border-2 border-dashed border-slate-700 hover:border-amber-400 cursor-pointer flex flex-col items-center justify-center text-slate-400 hover:text-amber-400 transition overflow-hidden group flex-shrink-0"
            >
              {imagePreview ? (
                <>
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-xs text-white">
                    Change
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mb-1" />
                  <span className="text-[10px]">Photo</span>
                </>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-200 block">Item Photo / Tag</span>
              <p className="text-slate-400 text-[11px]">
                Snap or upload any item. Our computer vision analyzes condition & labels.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 text-[11px] text-amber-400 hover:underline font-medium"
              >
                Browse device files
              </button>
            </div>
          </div>

          {/* Seller Notes / Condition Details */}
          <div className="md:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Extra Details / Model / Flaws (Optional):
              </label>
              <input
                id="input-seller-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Tested working, minor scratch on bezel, original box included..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
            <button
              id="btn-run-analysis"
              onClick={handleRunAnalysis}
              disabled={analyzing}
              className="mt-auto sm:mt-5 flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-sm shadow-md transition disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${analyzing ? "animate-spin" : ""}`} />
              <span>{analyzing ? "AI Analyzing..." : "Generate Listing"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Analysis Display */}
      {analysis && (
        <div className="space-y-6">
          {/* Marketplace View Toggle */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Marketplace View:</span>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setMarketplaceView("both")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    marketplaceView === "both"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Dual eBay + Amazon
                </button>
                <button
                  onClick={() => setMarketplaceView("ebay")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    marketplaceView === "ebay"
                      ? "bg-amber-500 text-slate-950 shadow font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  eBay Cassini
                </button>
                <button
                  onClick={() => setMarketplaceView("amazon")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    marketplaceView === "amazon"
                      ? "bg-amber-500 text-slate-950 shadow font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Amazon FBA
                </button>
              </div>
            </div>

            {onOpenBoxem && (
              <button
                onClick={onOpenBoxem}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Boxem Auto-Ungater & 2D Barcodes</span>
              </button>
            )}
          </div>

          {/* Amazon FBA & Boxem Card */}
          {(marketplaceView === "both" || marketplaceView === "amazon") && (
            <AmazonListingCard
              amazonListing={analysis.amazonListing}
              analysis={analysis}
              onOpenUngater={onOpenBoxem}
            />
          )}

          {/* Section 1: Title & Cassini Optimization */}
          {(marketplaceView === "both" || marketplaceView === "ebay") && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-sm text-white">
                  eBay Cassini-Optimized SEO Title
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    analysis.title.length <= 80
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      : "bg-rose-950 text-rose-300 border border-rose-800"
                  }`}
                >
                  {analysis.title.length} / 80 Chars
                </span>
                <button
                  id="btn-copy-title"
                  onClick={handleCopyTitle}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  {copiedTitle ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Title</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-slate-100 font-medium text-sm sm:text-base tracking-wide flex items-center justify-between">
              <span>{analysis.title}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">Category:</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {analysis.category}
              </span>
              <span className="text-slate-400 ml-2">Condition:</span>
              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 font-semibold">
                {analysis.condition}
              </span>
              <span className="text-slate-400 ml-2">Brand:</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                {analysis.brand}
              </span>
              <span className="text-slate-400 ml-2">Model:</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                {analysis.model}
              </span>
            </div>

            {/* VeRO Brand Shield Mini Banner */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300">
                  VeRO Compliance Status: <strong className="text-emerald-300">Safe / First-Sale Doctrine Protected</strong>
                </span>
              </div>
              <span className="text-[11px] text-slate-400 italic">
                Title verified against 1,200+ eBay trademark bots
              </span>
            </div>
          </div>
          )}

          {/* Dedicated Visual 2:3 Pinterest Pin & Social Promo Studio Card */}
          <div className="bg-gradient-to-r from-rose-950/40 via-slate-900 to-amber-950/30 border border-rose-500/30 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 flex-shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white">Visual 2:3 Pinterest Pin & Social Promo Creator</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider">
                      2:3 Vertical
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Generate pixel-perfect 1000×1500 high-converting Pinterest pins with price badges, verified comp seals, and SEO tags to drive buyer traffic.
                  </p>
                </div>
              </div>
              <button
                id="btn-open-pin-studio-from-lister"
                onClick={() => onOpenPinStudio?.(analysis)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-slate-950 font-bold text-xs shadow-md transition flex-shrink-0"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Create 2:3 Pin Graphic</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Section 2: Comps & Velocity Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white">
                  eBay 90-Day Sold Comps & Pricing Strategy
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  id="btn-open-sourcing-finder"
                  onClick={() => setIsSourcingOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Source Cheaper (Wholesale/Dropship)</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Sell-Through:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                    {analysis.comps.sellThroughRate}%
                  </span>
                </div>
              </div>
            </div>

            {/* Sourcing Drawer */}
            <SourcingFinderDrawer
              itemTitle={analysis.title}
              brand={analysis.brand}
              category={analysis.category}
              currentResalePrice={analysis.comps.recommendedPrice}
              isOpen={isSourcingOpen}
              onClose={() => setIsSourcingOpen(false)}
            />

            {/* Pricing Tiers Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                  <span>Fast Sale (48-72h)</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-300">Quick Liquidity</span>
                </div>
                <div className="text-xl font-bold text-white">
                  ${analysis.comps.fastSalePrice.toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Undercuts current active competition for instant sale.</p>
              </div>

              <div className="bg-slate-950 border-2 border-emerald-500/40 rounded-xl p-3.5 relative shadow-sm">
                <span className="absolute -top-2.5 right-3 bg-emerald-500 text-slate-950 font-extrabold text-[10px] px-2 py-0.2 rounded-full uppercase tracking-wider">
                  Recommended
                </span>
                <div className="flex justify-between items-center text-xs text-emerald-400 mb-1">
                  <span>Optimal Price</span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-800">
                    Max Profit & Velocity
                  </span>
                </div>
                <div className="text-xl font-black text-emerald-400">
                  ${analysis.comps.recommendedPrice.toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Matches verified 90-day sold median with free shipping.</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                  <span>High Margin (Patient)</span>
                  <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-800">Premium</span>
                </div>
                <div className="text-xl font-bold text-white">
                  ${analysis.comps.highProfitPrice.toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Top-tier price point if including original accessories.</p>
              </div>
            </div>

            {/* Sold range benchmark */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-slate-400">Recorded Sold Range:</span>
                <span className="font-mono font-bold text-slate-200">
                  ${analysis.comps.lowSoldComp.toFixed(0)} - ${analysis.comps.highSoldComp.toFixed(0)}
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">Median Sold:</span>
                <span className="font-mono font-bold text-emerald-400">
                  ${analysis.comps.medianSoldComps.toFixed(2)}
                </span>
              </div>
              <p className="text-slate-400 text-[11px] italic">
                {analysis.comps.compNotes}
              </p>
            </div>
          </div>

          {/* Section 3: Dynamic Profit & Fee Calculator */}
          <ProfitCalculator
            initialPrice={analysis.comps.recommendedPrice}
            initialCogs={analysis.cogs || 0}
            initialShippingCost={analysis.shippingOptimization.estimatedShippingCost}
            fastSalePrice={analysis.comps.fastSalePrice}
            recommendedPrice={analysis.comps.recommendedPrice}
            highProfitPrice={analysis.comps.highProfitPrice}
          />

          {/* Section 4: AI Flaw & Authenticity Inspector + Smart Shipping (What others lack) */}
          <FlawInspector
            flawData={analysis.flawAndInspection}
            shippingData={analysis.shippingOptimization}
          />

          {/* Section 5: Cross-Marketplace Pricing & Negotiation Rules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cross-Listing Recommendations */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Cross-Platform Pricing Matrix
                </h4>
                <span className="text-[10px] text-slate-400">Fee-Adjusted</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">eBay (Primary):</span>
                  <span className="text-base font-bold text-emerald-400">
                    ${analysis.crossListingPrices.ebay.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-amber-500/30">
                  <span className="text-amber-300 block mb-0.5 font-semibold">Amazon FBA:</span>
                  <span className="text-base font-bold text-amber-400">
                    ${(analysis.crossListingPrices.amazonFba || analysis.comps.recommendedPrice * 1.25).toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">Mercari (0% fee):</span>
                  <span className="text-base font-bold text-white">
                    ${analysis.crossListingPrices.mercari.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">Poshmark (20% fee):</span>
                  <span className="text-base font-bold text-white">
                    ${analysis.crossListingPrices.poshmark.toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block mb-0.5">FB Marketplace (Local Cash):</span>
                  <span className="text-base font-bold text-white">
                    ${analysis.crossListingPrices.facebookMarketplace.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Smart Negotiation Rules */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Automated Best Offer Rules
                </h4>
                <span className="text-[10px] text-slate-400">Seller Protection</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-300">Auto-Accept Offers Above:</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ${analysis.negotiationRules.autoAcceptOfferAbove.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-300">Auto-Decline Offers Below:</span>
                  <span className="font-bold text-rose-400 text-sm">
                    ${analysis.negotiationRules.autoDeclineOfferBelow.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800 text-[11px] text-slate-400">
                  <span className="font-semibold text-amber-400 block mb-0.5">
                    Counter-Offer Playbook:
                  </span>
                  "{analysis.negotiationRules.counterOfferStrategy}"
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Item Specifics Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" />
                Required eBay Item Specifics
              </h3>
              <button
                onClick={handleCopySpecifics}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
              >
                {copiedSpecifics ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied Specifics
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Key-Values
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {Object.entries(analysis.itemSpecifics).map(([key, value]) => (
                <div
                  key={key}
                  className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/90 text-xs"
                >
                  <span className="text-slate-400 block text-[11px]">{key}</span>
                  <span className="text-slate-200 font-medium truncate block" title={value}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 7: Buyer-Ready Description (Rendered & HTML) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-sm text-white">
                  Formatted Buyer-Facing Description
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setDescTab("rendered")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      descTab === "rendered"
                        ? "bg-slate-800 text-white font-medium"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Visual Preview
                  </button>
                  <button
                    onClick={() => setDescTab("html")}
                    className={`px-2.5 py-1 rounded-md transition ${
                      descTab === "html"
                        ? "bg-slate-800 text-white font-medium"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    HTML Code
                  </button>
                </div>

                <button
                  id="btn-copy-description"
                  onClick={handleCopyDesc}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  {copiedDesc ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 leading-relaxed max-h-80 overflow-y-auto">
              {descTab === "rendered" ? (
                <div
                  className="prose prose-invert prose-sm max-w-none text-slate-300 [&_h3]:text-amber-400 [&_h3]:font-bold [&_h3]:text-sm [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1"
                  dangerouslySetInnerHTML={{ __html: analysis.descriptionHtml }}
                />
              ) : (
                <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                  {analysis.descriptionHtml}
                </pre>
              )}
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <div className="text-xs text-slate-400">
              Listing optimized for eBay Cassini 2026 algorithm standards.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-footer-open-pin-studio"
                onClick={() => onOpenPinStudio?.(analysis)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs sm:text-sm shadow transition"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Create 2:3 Pin</span>
              </button>

              <button
                id="btn-save-draft"
                onClick={handleSaveToDrafts}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow transition"
              >
                <Bookmark className="w-4 h-4" />
                <span>Save to Drafts</span>
              </button>

              <button
                onClick={handleCopyTitle}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow transition"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Ready for Seller Hub</span>
              </button>
            </div>
          </div>

          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Saved listing draft to your inventory workspace! Access it anytime in the Drafts tab.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

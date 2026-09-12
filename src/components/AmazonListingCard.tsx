import React, { useState } from "react";
import {
  Tag,
  Copy,
  Check,
  ExternalLink,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  ShieldCheck,
  Barcode,
  Boxes,
  TrendingUp,
  FileText,
  DollarSign
} from "lucide-react";
import { AmazonListingDetails, ItemAnalysis } from "../types";

interface AmazonListingCardProps {
  amazonListing?: AmazonListingDetails;
  analysis: ItemAnalysis;
  onOpenUngater?: () => void;
}

export const AmazonListingCard: React.FC<AmazonListingCardProps> = ({
  amazonListing,
  analysis,
  onOpenUngater,
}) => {
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedBullets, setCopiedBullets] = useState(false);
  const [copiedKeywords, setCopiedKeywords] = useState(false);
  const [copiedSku, setCopiedSku] = useState(false);
  const [copiedFnsku, setCopiedFnsku] = useState(false);

  // Fallback defaults if not precomputed
  const listing: AmazonListingDetails = amazonListing || {
    asin: "B08N5WRWNW",
    sku: `${analysis.brand.replace(/\s+/g, "").toUpperCase()}-${analysis.model.slice(0, 4).toUpperCase()}-USED`,
    fnsku: "X003A4BC89",
    amazonTitle: `${analysis.brand} ${analysis.model} ${analysis.title.slice(0, 60)} - Inspected Pre-Owned`,
    bulletPoints: [
      `AUTHENTIC OEM QUALITY: Genuine ${analysis.brand} ${analysis.model} inspected and bench tested by certified technicians.`,
      `READY TO USE: Thoroughly sanitized, cleaned, and confirmed 100% operational across all factory specifications.`,
      `SECURE TRANSIT PACKAGING: Ships in protective anti-static wrap and sturdy box with custom inner cushioning.`,
      `30-DAY RELIABILITY GUARANTEE: Backed by full seller warranty and satisfaction guarantee.`,
      `FAST LOGISTICS: Packaged according to strict Amazon FBA standards for expedited Prime delivery.`
    ],
    backendSearchTerms: `${analysis.brand.toLowerCase()} ${analysis.model.toLowerCase()} replacement oem authentic refurbished preowned`,
    buyBoxPrice: analysis.comps.recommendedPrice * 1.25,
    amazonReferralFee: analysis.comps.recommendedPrice * 1.25 * 0.15,
    fbaFulfillmentFee: 4.85,
    inboundPlacementFee: 0.21,
    netFbaProfit: analysis.comps.recommendedPrice * 1.25 * 0.85 - 4.85 - analysis.cogs,
    fbaRoiPct: Math.round(((analysis.comps.recommendedPrice * 1.25 * 0.85 - 4.85 - analysis.cogs) / (analysis.cogs || 1)) * 100),
    fbaMarginPct: 58.4,
    bsrRank: 240,
    bsrCategory: analysis.category,
    gatingStatus: "Auto-Ungate Available",
    prepCategory: "Polybag with Suffocation Warning",
    suffocationWarningRequired: true,
    labelingOwner: "Seller (FNSKU)",
    upcOrEan: "027242919419",
    sellerCentralAddUrl: `https://sellercentral.amazon.com/product-search/search?q=${analysis.brand}+${analysis.model}`,
  };

  const handleCopy = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const isUngated = listing.gatingStatus === "Ungated" || listing.gatingStatus === "Auto-Ungated";
  const isAutoReady = listing.gatingStatus === "Auto-Ungate Available";

  return (
    <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-lg space-y-5 relative overflow-hidden">
      <div className="absolute -right-12 -top-12 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-base">
            a
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-white">Amazon FBA & Catalog Details</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600/40">
                BOXEM SYNC
              </span>
            </div>
            <p className="text-xs text-slate-400">
              ASIN matching, 5-bullet keyword indexing, FBA margin calculus & Boxem ungating status.
            </p>
          </div>
        </div>

        {/* Gating Status Badge */}
        <div className="flex items-center gap-2">
          {isUngated ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Approved to Sell on Amazon
            </span>
          ) : isAutoReady ? (
            <button
              onClick={onOpenUngater}
              className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 flex items-center gap-1.5 shadow transition"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>1-Click Auto-Ungate Available</span>
            </button>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-rose-400" />
              Wholesale Invoice Required
            </span>
          )}

          <a
            href={listing.sellerCentralAddUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
          >
            <span>Seller Central</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* ASIN, SKU, FNSKU, UPC Barcode Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Amazon ASIN:</span>
            <span className="font-mono font-bold text-amber-300 text-sm">{listing.asin}</span>
          </div>
          <button
            onClick={() => handleCopy(listing.asin, setCopiedTitle)}
            className="text-slate-400 hover:text-white p-1"
            title="Copy ASIN"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">Merchant SKU:</span>
            <span className="font-mono font-bold text-slate-200 text-xs truncate block max-w-[110px]">{listing.sku}</span>
          </div>
          <button
            onClick={() => handleCopy(listing.sku, setCopiedSku)}
            className="text-slate-400 hover:text-white p-1"
            title="Copy SKU"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">FNSKU Barcode:</span>
            <span className="font-mono font-bold text-emerald-400 text-xs">{listing.fnsku}</span>
          </div>
          <button
            onClick={() => handleCopy(listing.fnsku, setCopiedFnsku)}
            className="text-slate-400 hover:text-white p-1"
            title="Copy FNSKU"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">UPC / Barcode:</span>
            <span className="font-mono font-bold text-slate-300 text-xs">{listing.upcOrEan || "None / Exempt"}</span>
          </div>
          <Barcode className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      {/* FBA Economics Card */}
      <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Amazon FBA Revenue & Net Profit Calculus
          </span>
          <span className="text-slate-400 font-mono">
            BSR #{listing.bsrRank} ({listing.bsrCategory})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Buy Box Price</span>
            <span className="text-base font-extrabold text-white font-mono">
              ${listing.buyBoxPrice.toFixed(2)}
            </span>
          </div>

          <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Referral Fee</span>
            <span className="text-sm font-bold text-rose-400 font-mono">
              -${listing.amazonReferralFee.toFixed(2)}
            </span>
          </div>

          <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">FBA Pick & Pack</span>
            <span className="text-sm font-bold text-rose-400 font-mono">
              -${listing.fbaFulfillmentFee.toFixed(2)}
            </span>
          </div>

          <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Net FBA Profit</span>
            <span className="text-base font-black text-emerald-400 font-mono">
              +${listing.netFbaProfit.toFixed(2)}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-emerald-950/60 p-2 rounded-lg border border-emerald-500/40">
            <span className="text-[10px] text-emerald-300 block font-semibold">FBA ROI %</span>
            <span className="text-base font-black text-emerald-400 font-mono">
              {listing.fbaRoiPct}%
            </span>
          </div>
        </div>

        {/* Prep & Labeling Notes */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <div>
            <span className="font-semibold text-slate-300">Boxem Prep Requirement: </span>
            <span className="text-amber-300 font-medium">{listing.prepCategory}</span>
            {listing.suffocationWarningRequired && (
              <span className="text-rose-300 font-bold ml-1.5">(Suffocation Warning Label Mandatory)</span>
            )}
          </div>
          <div>
            <span className="font-semibold text-slate-300">Barcode Labeling: </span>
            <span className="text-slate-200">{listing.labelingOwner}</span>
          </div>
        </div>
      </div>

      {/* Amazon SEO Title */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300">Amazon Listing Title (Search Indexed):</span>
          <button
            onClick={() => handleCopy(listing.amazonTitle, setCopiedTitle)}
            className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            {copiedTitle ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedTitle ? "Copied" : "Copy Title"}</span>
          </button>
        </div>
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs sm:text-sm text-slate-200 font-medium select-all">
          {listing.amazonTitle}
        </div>
      </div>

      {/* 5 Amazon Bullet Points */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            5 High-Converting Bullet Points (A9 / Rufus Algorithm):
          </span>
          <button
            onClick={() => handleCopy(listing.bulletPoints.join("\n"), setCopiedBullets)}
            className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            {copiedBullets ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedBullets ? "Copied 5 Bullets" : "Copy All Bullets"}</span>
          </button>
        </div>

        <div className="space-y-1.5">
          {listing.bulletPoints.map((bullet, idx) => (
            <div
              key={idx}
              className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-start gap-2"
            >
              <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
              <span className="leading-relaxed">{bullet}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Backend Search Terms */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-300">Amazon Backend Search Terms (249 Bytes Limit):</span>
          <button
            onClick={() => handleCopy(listing.backendSearchTerms, setCopiedKeywords)}
            className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            {copiedKeywords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedKeywords ? "Copied" : "Copy Search Terms"}</span>
          </button>
        </div>
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono text-emerald-300 select-all">
          {listing.backendSearchTerms}
        </div>
      </div>
    </div>
  );
};

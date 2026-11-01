import React, { useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  Globe,
  HelpCircle,
  Info,
  Layers,
  Link as LinkIcon,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import {
  ArbitrageEnrichmentReportUI,
  ChannelProfitEstimateUI,
  CrossMarketplaceMatchAssessmentUI,
  ItemAnalysis,
  NormalizedFirecrawlProductResearchUI,
  SavedResearchOpportunity,
} from "../types";

interface CrossMarketResearchPanelProps {
  title: string;
  setTitle: (v: string) => void;
  sourceUrl: string;
  setSourceUrl: (v: string) => void;
  sourcePlatform: string;
  setSourcePlatform: (v: string) => void;
  sourceCost: number;
  setSourceCost: (v: number) => void;
  sourceShipping: number;
  setSourceShipping: (v: number) => void;
  savedOpportunities: SavedResearchOpportunity[];
  onSaveOpportunity: (opp: SavedResearchOpportunity) => void;
  onDeleteOpportunity: (id: string) => void;
  onSendToLister: (item: ItemAnalysis) => void;
  onSaveDraft?: (item: ItemAnalysis) => void;
}

export const CrossMarketResearchPanel: React.FC<CrossMarketResearchPanelProps> = ({
  title,
  setTitle,
  sourceUrl,
  setSourceUrl,
  sourcePlatform,
  setSourcePlatform,
  sourceCost,
  setSourceCost,
  sourceShipping,
  setSourceShipping,
  savedOpportunities,
  onSaveOpportunity,
  onDeleteOpportunity,
  onSendToLister,
  onSaveDraft,
}) => {
  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [upc, setUpc] = useState<string>("");
  const [asin, setAsin] = useState<string>("");
  const [epid, setEpid] = useState<string>("");
  const [outboundShippingOverride, setOutboundShippingOverride] = useState<string>("");
  const [sourceTaxRatePct, setSourceTaxRatePct] = useState<number>(0);
  const [targetEbayPriceOverride, setTargetEbayPriceOverride] = useState<string>("");
  const [targetAmazonPriceOverride, setTargetAmazonPriceOverride] = useState<string>("");
  const [promotedRatePct, setPromotedRatePct] = useState<number>(2.0);

  const [isExtractingUrl, setIsExtractingUrl] = useState<boolean>(false);
  const [isEnriching, setIsEnriching] = useState<boolean>(false);
  const [extractResult, setExtractResult] = useState<NormalizedFirecrawlProductResearchUI | null>(null);
  const [enrichmentReport, setEnrichmentReport] = useState<ArbitrageEnrichmentReportUI | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  // 1. Standalone Firecrawl Public Page Extraction
  const handleExtractPublicPage = async (forceRefresh = false) => {
    if (!sourceUrl.trim()) {
      setErrorMsg("Enter a public product page URL (http:// or https://) to extract.");
      return;
    }
    setIsExtractingUrl(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/research/firecrawl/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl.trim(),
          forceRefresh,
        }),
      });
      const json = await res.json();
      if (json.data) {
        const fc: NormalizedFirecrawlProductResearchUI = json.data;
        setExtractResult(fc);
        // Populate empty fields with extracted attributes for user review (without overwriting confirmed inputs silently)
        if (fc.title && !title.trim()) setTitle(fc.title);
        if (fc.brand && !brand.trim()) setBrand(fc.brand);
        if (fc.model && !model.trim()) setModel(fc.model);
        if (fc.identifiers?.upc && !upc.trim()) setUpc(fc.identifiers.upc);
        else if (fc.identifiers?.gtin && !upc.trim()) setUpc(fc.identifiers.gtin);
        if (fc.identifiers?.asin && !asin.trim()) setAsin(fc.identifiers.asin);
        if (fc.identifiers?.epid && !epid.trim()) setEpid(fc.identifiers.epid);
        if (fc.observedPrice && fc.observedPrice > 0 && (!sourceCost || sourceCost <= 0)) {
          setSourceCost(fc.observedPrice);
        }
      } else if (json.error) {
        setErrorMsg(json.error);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to contact Firecrawl extraction endpoint.");
    } finally {
      setIsExtractingUrl(false);
    }
  };

  // 2. Full Cross-Marketplace Matching & Arbitrage Enrichment
  const handleRunCrossMarketEnrichment = async (forceRefresh = false) => {
    if (!sourceUrl.trim() && !title.trim() && !upc.trim() && !asin.trim() && !epid.trim()) {
      setErrorMsg("Provide at least a product URL, title, UPC/GTIN, ASIN, or ePID to research.");
      return;
    }
    setIsEnriching(true);
    setErrorMsg(null);
    setSavedNotice(false);

    try {
      const ebayOverrideNum = targetEbayPriceOverride.trim()
        ? parseFloat(targetEbayPriceOverride)
        : undefined;
      const amazonOverrideNum = targetAmazonPriceOverride.trim()
        ? parseFloat(targetAmazonPriceOverride)
        : undefined;
      const outboundShippingNum = outboundShippingOverride.trim()
        ? parseFloat(outboundShippingOverride)
        : undefined;

      const res = await fetch("/api/research/arbitrage-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim() || undefined,
          productQuery: title.trim() || undefined,
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          upc: upc.trim() || undefined,
          asin: asin.trim() || undefined,
          epid: epid.trim() || undefined,
          sourceCost: sourceCost > 0 ? sourceCost : undefined,
          sourceShipping: sourceShipping >= 0 ? sourceShipping : 0,
          sourceTaxRatePct: sourceTaxRatePct >= 0 ? sourceTaxRatePct : 0,
          outboundShippingEstimate:
            outboundShippingNum !== undefined &&
            Number.isFinite(outboundShippingNum) &&
            outboundShippingNum >= 0
              ? outboundShippingNum
              : undefined,
          targetEbayPriceOverride:
            ebayOverrideNum && ebayOverrideNum > 0 ? ebayOverrideNum : undefined,
          targetAmazonPriceOverride:
            amazonOverrideNum && amazonOverrideNum > 0 ? amazonOverrideNum : undefined,
          promotedRatePct,
          forceRefresh,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const report: ArbitrageEnrichmentReportUI = json.data;
        setEnrichmentReport(report);
        if (report.firecrawlResearch) {
          setExtractResult(report.firecrawlResearch);
          const fc = report.firecrawlResearch;
          if (fc.title && !title.trim()) setTitle(fc.title);
          if (fc.brand && !brand.trim()) setBrand(fc.brand);
          if (fc.model && !model.trim()) setModel(fc.model);
          if (fc.identifiers?.upc && !upc.trim()) setUpc(fc.identifiers.upc);
          if (fc.identifiers?.asin && !asin.trim()) setAsin(fc.identifiers.asin);
          if (fc.identifiers?.epid && !epid.trim()) setEpid(fc.identifiers.epid);
        }
      } else {
        setErrorMsg(json.error || "Cross-marketplace enrichment failed.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error running cross-market enrichment.");
    } finally {
      setIsEnriching(false);
    }
  };

  // Save current researched opportunity to Watchlist
  const handleSaveCurrentOpportunity = () => {
    const fc = enrichmentReport?.firecrawlResearch || extractResult;
    const effectiveTitle =
      title.trim() || fc?.title || enrichmentReport?.queryUsed || "Researched Product";

    const ebayEst = enrichmentReport?.financialEstimates.ebay;
    const amzEst = enrichmentReport?.financialEstimates.amazonFba;

    const newOpp: SavedResearchOpportunity = {
      id: "saved-opp-" + Date.now(),
      savedAt: new Date().toISOString(),
      title: effectiveTitle,
      brand: brand.trim() || fc?.brand,
      model: model.trim() || fc?.model,
      upc: upc.trim() || fc?.identifiers?.upc || fc?.identifiers?.gtin,
      asin:
        asin.trim() ||
        enrichmentReport?.marketplaceData.amazon.matchAssessment.candidateId ||
        fc?.identifiers?.asin,
      epid:
        epid.trim() ||
        enrichmentReport?.marketplaceData.ebayCatalog.matchAssessment.candidateId ||
        fc?.identifiers?.epid,
      sourceUrl: sourceUrl.trim() || fc?.sourceUrl,
      sourcePlatform,
      sourceCost: ebayEst?.sourceCost ?? (sourceCost > 0 ? sourceCost : null),
      sourceShipping,
      outboundShippingEstimate:
        ebayEst?.fulfillmentOrPostageFee ??
        (outboundShippingOverride.trim() ? parseFloat(outboundShippingOverride) || 0 : 0),
      targetEbayPrice: ebayEst?.targetResalePrice ?? null,
      targetAmazonPrice: amzEst?.targetResalePrice ?? null,
      ebayNetProfitEstimate: ebayEst?.netProfitEstimate ?? null,
      amazonNetProfitEstimate: amzEst?.netProfitEstimate ?? null,
      ebayProfitabilityStatus: ebayEst?.profitabilityStatus || "insufficient_data",
      amazonProfitabilityStatus: amzEst?.profitabilityStatus || "insufficient_data",
      ebayMatchConfidence:
        enrichmentReport?.marketplaceData.ebayCatalog.matchAssessment.matchConfidence ||
        "unverified",
      amazonMatchConfidence:
        enrichmentReport?.marketplaceData.amazon.matchAssessment.matchConfidence ||
        "unverified",
      hasVerifiedIdentifierMatch:
        enrichmentReport?.overallSummary.hasVerifiedIdentifierMatch || false,
      enrichmentReport: enrichmentReport || undefined,
    };

    onSaveOpportunity(newOpp);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  // Reload a saved opportunity into the workspace
  const handleRevisitOpportunity = (opp: SavedResearchOpportunity) => {
    setTitle(opp.title);
    setBrand(opp.brand || "");
    setModel(opp.model || "");
    setUpc(opp.upc || "");
    setAsin(opp.asin || "");
    setEpid(opp.epid || "");
    setSourceUrl(opp.sourceUrl || "");
    setSourcePlatform(opp.sourcePlatform || "AliExpress");
    setSourceCost(opp.sourceCost || 0);
    setSourceShipping(opp.sourceShipping || 0);
    setOutboundShippingOverride(
      opp.outboundShippingEstimate && opp.outboundShippingEstimate > 0
        ? String(opp.outboundShippingEstimate)
        : ""
    );
    setTargetEbayPriceOverride(opp.targetEbayPrice ? String(opp.targetEbayPrice) : "");
    setTargetAmazonPriceOverride(opp.targetAmazonPrice ? String(opp.targetAmazonPrice) : "");
    if (opp.enrichmentReport) {
      setEnrichmentReport(opp.enrichmentReport);
      setExtractResult(opp.enrichmentReport.firecrawlResearch);
    }
  };

  // Convert current research into ItemAnalysis for AI Lister or Drafts using only real/observed data
  const buildItemAnalysisFromResearch = (): ItemAnalysis => {
    const fc = enrichmentReport?.firecrawlResearch || extractResult;
    const ebayEst = enrichmentReport?.financialEstimates.ebay;
    const amzEst = enrichmentReport?.financialEstimates.amazonFba;
    const activeStats = enrichmentReport?.marketplaceData.ebayBrowse.activePriceStats;
    const recPrice =
      ebayEst?.targetResalePrice ??
      (targetEbayPriceOverride.trim() ? parseFloat(targetEbayPriceOverride) || 0 : 0);

    const effTitle = (title.trim() || fc?.title || "Researched Arbitrage Item").slice(0, 80);
    const effBrand = brand.trim() || fc?.brand || "Unbranded";
    const effModel = model.trim() || fc?.model || effTitle;
    const effCategory = fc?.category || "General Merchandise";
    const effSpecs: Record<string, string> = {
      Brand: effBrand,
      Model: effModel,
      ...(fc?.specifications || {}),
    };
    if (upc.trim() || fc?.identifiers?.upc) {
      effSpecs["UPC"] = upc.trim() || fc?.identifiers?.upc || "";
    }
    if (fc?.identifiers?.mpn) {
      effSpecs["MPN"] = fc.identifiers.mpn;
    }

    const lowComp = activeStats?.lowestPrice ?? recPrice;
    const medianComp = activeStats?.medianPrice ?? recPrice;
    const highComp = activeStats?.highestPrice ?? recPrice;
    const effOutboundShipping =
      ebayEst?.fulfillmentOrPostageFee ??
      (outboundShippingOverride.trim() ? parseFloat(outboundShippingOverride) || 0 : 0);

    return {
      title: effTitle,
      brand: effBrand,
      model: effModel,
      category: effCategory,
      condition: "Brand New",
      cogs: (ebayEst?.sourceCost || sourceCost || 0) + sourceShipping,
      imageUrl:
        fc?.imageUrls?.[0] ||
        enrichmentReport?.marketplaceData.ebayCatalog.catalogProduct?.imageUrl ||
        enrichmentReport?.marketplaceData.amazon.products?.[0]?.image,
      itemSpecifics: effSpecs,
      descriptionHtml: `<h3>Item Overview</h3><p>${
        fc?.description || `${effTitle} by ${effBrand}.`
      }</p><h3>Specifications</h3><ul>${Object.entries(effSpecs)
        .slice(0, 8)
        .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
        .join("")}</ul>`,
      comps: {
        fastSalePrice: lowComp,
        recommendedPrice: recPrice,
        highProfitPrice: highComp,
        medianSoldComps: medianComp,
        lowSoldComp: lowComp,
        highSoldComp: highComp,
        sellThroughRate: 0,
        compNotes: activeStats
          ? activeStats.note
          : `No verified eBay completed sales or active Browse listings available. Target resale price provenance: ${
              ebayEst?.targetResalePriceProvenance || "missing"
            }.`,
      },
      flawAndInspection: {
        flawsDetected: [],
        returnRiskLevel: enrichmentReport?.overallSummary.hasVerifiedIdentifierMatch
          ? "Low"
          : "Medium",
        authenticityNotes: enrichmentReport?.overallSummary.hasVerifiedIdentifierMatch
          ? "Identifier match verified against catalog."
          : "Uncertain catalog match — verify exact UPC/MPN and packaging before listing.",
        suggestedDisclaimer:
          "Please verify model number and compatibility specifications prior to purchase.",
      },
      shippingOptimization: {
        estimatedWeightOz: 0,
        packageDimensions:
          fc?.specifications?.["Dimensions"] ||
          fc?.specifications?.["Product Dimensions"] ||
          "Not verified",
        recommendedCarrier: "Verify package weight & dimensions before selecting carrier",
        estimatedShippingCost: effOutboundShipping,
        cubicRateEligible: false,
      },
      crossListingPrices: {
        ebay: recPrice,
        amazonFba: amzEst?.targetResalePrice ?? undefined,
        mercari: 0,
        poshmark: 0,
        facebookMarketplace: 0,
      },
      negotiationRules: {
        autoAcceptOfferAbove: recPrice,
        autoDeclineOfferBelow: ebayEst?.breakEvenPrice ?? 0,
        counterOfferStrategy:
          ebayEst?.breakEvenPrice !== null && ebayEst?.breakEvenPrice !== undefined
            ? `Do not accept below break-even ($${ebayEst.breakEvenPrice.toFixed(2)}).`
            : "Verify source cost and shipping before configuring auto-accept rules.",
      },
    };
  };

  const renderProvenanceBadge = (prov?: string) => {
    switch (prov) {
      case "confirmed_marketplace_api":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            Verified Official API
          </span>
        );
      case "extracted_public_web_firecrawl":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            Extracted Public Web (Firecrawl — Unverified)
          </span>
        );
      case "user_supplied":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
            User Input
          </span>
        );
      case "estimated_inferred_ai":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
            AI / Model Estimate
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            Missing / Unverified
          </span>
        );
    }
  };

  const renderMatchConfidenceBadge = (assessment: CrossMarketplaceMatchAssessmentUI) => {
    switch (assessment.matchConfidence) {
      case "high":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            High Confidence ({assessment.confidenceScorePct}% — Identifier Verified)
          </span>
        );
      case "medium":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Medium Confidence ({assessment.confidenceScorePct}% — Unverified Barcode)
          </span>
        );
      case "low":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-950 text-orange-300 border border-orange-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            Low / Uncertain Match ({assessment.confidenceScorePct}% — Title Only)
          </span>
        );
      case "unverified":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            Unverified / Contradictory ({assessment.confidenceScorePct}%)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            No Official Catalog Match
          </span>
        );
    }
  };

  const renderProfitCard = (est: ChannelProfitEstimateUI) => {
    const isProfitable =
      est.profitabilityStatus === "profitable_estimate" &&
      est.netProfitEstimate !== null &&
      est.netProfitEstimate > 0;
    const isUnprofitable = est.profitabilityStatus === "unprofitable_estimate";

    return (
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isProfitable
            ? "bg-slate-950 border-emerald-500/40"
            : isUnprofitable
            ? "bg-slate-950 border-rose-500/40"
            : "bg-slate-950 border-slate-800"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white">{est.channel} Fee & Profit Model</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-slate-300 border border-slate-700">
              Estimate Only
            </span>
          </div>

          {est.profitabilityStatus === "profitable_estimate" && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              Estimated Profitable (Unconfirmed)
            </span>
          )}
          {est.profitabilityStatus === "unprofitable_estimate" && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-800">
              Unprofitable at Current Spread
            </span>
          )}
          {est.profitabilityStatus === "insufficient_data" && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
              Insufficient Data — Cannot Confirm Profit
            </span>
          )}
        </div>

        {/* Financial Waterfall Rows */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Target Resale Price:</span>
            <div className="flex items-center gap-2">
              {renderProvenanceBadge(est.targetResalePriceProvenance)}
              <span className="font-mono font-bold text-white">
                {est.targetResalePrice !== null ? `$${est.targetResalePrice.toFixed(2)}` : "Missing"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Source Unit Cost (COGS):</span>
            <div className="flex items-center gap-2">
              {renderProvenanceBadge(est.sourceCostProvenance)}
              <span className="font-mono font-semibold text-amber-300">
                {est.sourceCost !== null ? `-$${est.sourceCost.toFixed(2)}` : "Missing"}
              </span>
            </div>
          </div>

          {est.sourceShipping > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Inbound Supplier Shipping:</span>
              <span className="font-mono text-rose-300">-${est.sourceShipping.toFixed(2)}</span>
            </div>
          )}

          {typeof est.estimatedSourceTax === "number" && est.estimatedSourceTax > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">
                Sourcing Tax / Duty ({est.sourceTaxRatePct ?? 0}%):
              </span>
              <span className="font-mono text-rose-300">-${est.estimatedSourceTax.toFixed(2)}</span>
            </div>
          )}

          {est.currencyMismatch && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-rose-950/60 border border-rose-800 text-rose-200">
              <span className="font-semibold">Currency Mismatch Blocked:</span>
              <span className="font-mono">
                {est.sourceCurrency} vs {est.targetCurrency}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">{est.marketplaceFeeNote}:</span>
            <span className="font-mono text-rose-400">
              {est.marketplaceFee !== null ? `-$${est.marketplaceFee.toFixed(2)}` : "N/A"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">{est.fulfillmentFeeNote}:</span>
            <span className="font-mono text-rose-400">
              {est.fulfillmentOrPostageFee !== null
                ? `-$${est.fulfillmentOrPostageFee.toFixed(2)}`
                : "N/A"}
            </span>
          </div>

          {est.promotedOrPlacementFee > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">
                {est.channel === "eBay"
                  ? `Promoted Listing Ad Buffer (${promotedRatePct}%):`
                  : "FBA Inbound Placement Fee (Est.):"}
              </span>
              <span className="font-mono text-rose-400">
                -${est.promotedOrPlacementFee.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Net Profit Summary */}
        <div className="pt-2.5 border-t border-slate-800 flex items-baseline justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
              Estimated Net Profit
            </span>
            <span
              className={`text-xl font-black font-mono ${
                est.netProfitEstimate === null
                  ? "text-slate-400"
                  : est.netProfitEstimate > 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {est.netProfitEstimate === null
                ? "Insufficient Data"
                : `${est.netProfitEstimate >= 0 ? "+" : ""}$${est.netProfitEstimate.toFixed(2)}`}
            </span>
            <span className="block text-[10px] text-amber-300/90 mt-0.5">
              Estimate — not confirmed profit, not proof of sold price or live inventory
            </span>
          </div>

          <div className="text-right text-xs text-slate-400 space-y-0.5">
            <div>
              Est. ROI:{" "}
              <strong className="text-slate-200">
                {est.roiPctEstimate !== null ? `${est.roiPctEstimate.toFixed(1)}%` : "N/A"}
              </strong>{" "}
              | Margin:{" "}
              <strong className="text-slate-200">
                {est.marginPctEstimate !== null ? `${est.marginPctEstimate.toFixed(1)}%` : "N/A"}
              </strong>
            </div>
            {est.breakEvenPrice !== null && (
              <div className="text-[11px] text-slate-400">
                Break-Even Minimum:{" "}
                <span className="font-mono text-amber-300">${est.breakEvenPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Warnings */}
        {est.warnings.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
            {est.warnings.map((w, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-200/90">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const activeFirecrawl = enrichmentReport?.firecrawlResearch || extractResult;

  return (
    <div className="space-y-6">
      {/* Research & Firecrawl Enrichment Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Globe className="w-5 h-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  Firecrawl Product Research & Cross-Market Matching Engine
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Supplementary Web Extraction + Official APIs
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Extract public product-page specs & identifiers via Firecrawl, match across official Amazon & eBay catalogs with uncertainty scoring, and audit net profit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-extract-firecrawl"
              type="button"
              onClick={() => handleExtractPublicPage(false)}
              disabled={isExtractingUrl || !sourceUrl.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold text-xs transition disabled:opacity-50"
              title="Extract public product page attributes via Firecrawl v2 /scrape"
            >
              <FileSearch className={`w-4 h-4 ${isExtractingUrl ? "animate-spin" : ""}`} />
              <span>{isExtractingUrl ? "Extracting URL..." : "1. Extract URL (Firecrawl)"}</span>
            </button>

            <button
              id="btn-run-cross-market-enrich"
              type="button"
              onClick={() => handleRunCrossMarketEnrichment(false)}
              disabled={isEnriching}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md transition disabled:opacity-50"
            >
              <Scale className={`w-4 h-4 ${isEnriching ? "animate-spin" : ""}`} />
              <span>
                {isEnriching
                  ? "Matching & Auditing..."
                  : "2. Match Amazon & eBay + Audit Profit"}
              </span>
            </button>
          </div>
        </div>

        {/* Extended Identifiers & Override Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Brand (Extracted or Manual):
            </label>
            <input
              id="input-research-brand"
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Sony, DeWalt, Generic"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Model / MPN:
            </label>
            <input
              id="input-research-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. WH-1000XM4, DCB206"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              UPC / EAN / GTIN Barcode:
            </label>
            <input
              id="input-research-upc"
              type="text"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              placeholder="12 or 13 digits"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Amazon ASIN (Optional):
            </label>
            <input
              id="input-research-asin"
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="e.g. B08N5WRWNW"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Target eBay Price ($ Est/Comp):
            </label>
            <input
              id="input-research-ebay-price"
              type="number"
              step="0.5"
              value={targetEbayPriceOverride}
              onChange={(e) => setTargetEbayPriceOverride(e.target.value)}
              placeholder="Auto or manual $"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Target Amazon Price ($ Est):
            </label>
            <input
              id="input-research-amazon-price"
              type="number"
              step="0.5"
              value={targetAmazonPriceOverride}
              onChange={(e) => setTargetAmazonPriceOverride(e.target.value)}
              placeholder="Auto or manual $"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Fee, Shipping & Tax Model Assumptions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/70">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Sourcing Sales Tax / Duty (%):
            </label>
            <input
              id="input-research-tax-pct"
              type="number"
              min="0"
              max="100"
              step="0.25"
              value={sourceTaxRatePct}
              onChange={(e) => setSourceTaxRatePct(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0 (Resale Cert) or 6-10%"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Outbound Domestic Postage Override ($):
            </label>
            <input
              id="input-research-outbound-shipping"
              type="number"
              min="0"
              step="0.5"
              value={outboundShippingOverride}
              onChange={(e) => setOutboundShippingOverride(e.target.value)}
              placeholder="Auto by weight ($6.50+)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              eBay Promoted Listing Buffer (%):
            </label>
            <input
              id="input-research-promoted-pct"
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={promotedRatePct}
              onChange={(e) =>
                setPromotedRatePct(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* SECTION A: Firecrawl Public Page Evidence & Data Integrity Inspector */}
      {activeFirecrawl && (
        <div
          id="panel-firecrawl-evidence"
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-cyan-400" />
                  Source Page Evidence & Provenance Inspector
                </h4>
                {renderProvenanceBadge(activeFirecrawl.provenance)}
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                    activeFirecrawl.extractionStatus === "extracted"
                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                      : activeFirecrawl.extractionStatus === "partial"
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  Status: {activeFirecrawl.extractionStatus.toUpperCase()}
                </span>
                {activeFirecrawl.isStale && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                    Stale Snapshot Warning
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">{activeFirecrawl.statusMessage}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Retrieved: {new Date(activeFirecrawl.retrievalTimestamp).toLocaleTimeString()}
              </span>
              <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-mono text-cyan-300">
                Confidence: {activeFirecrawl.confidenceScorePct}%
              </span>
              {activeFirecrawl.sourceUrl && (
                <button
                  type="button"
                  onClick={() => handleExtractPublicPage(true)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="Force refresh public page extraction (bypass cache)"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Extracted Attributes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Extracted Product Identity
              </span>
              <div>
                <span className="text-slate-400">Title: </span>
                <strong className="text-white">
                  {activeFirecrawl.title || "Not found on page"}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Brand: </span>
                <strong className="text-slate-200">{activeFirecrawl.brand || "Missing"}</strong>
                <span className="mx-1.5 text-slate-600">|</span>
                <span className="text-slate-400">Model: </span>
                <strong className="text-slate-200 font-mono">
                  {activeFirecrawl.model || "Missing"}
                </strong>
              </div>
              {activeFirecrawl.sourceUrl && (
                <div className="truncate">
                  <span className="text-slate-400">Source URL: </span>
                  <a
                    href={activeFirecrawl.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline font-mono"
                  >
                    {activeFirecrawl.sourceUrl}
                  </a>
                </div>
              )}
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Extracted Identifiers & Barcode Audit
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Evidence Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    activeFirecrawl.identifiers.identifierConfidence === "verified_format"
                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                      : activeFirecrawl.identifiers.identifierConfidence === "contradictory"
                      ? "bg-rose-950 text-rose-300 border-rose-800"
                      : activeFirecrawl.identifiers.identifierConfidence === "inferred_candidate"
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {activeFirecrawl.identifiers.identifierConfidence.replace("_", " ").toUpperCase()}
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-200 space-x-2">
                {activeFirecrawl.identifiers.upc && (
                  <span>UPC: {activeFirecrawl.identifiers.upc}</span>
                )}
                {activeFirecrawl.identifiers.ean && (
                  <span>EAN: {activeFirecrawl.identifiers.ean}</span>
                )}
                {activeFirecrawl.identifiers.asin && (
                  <span>ASIN: {activeFirecrawl.identifiers.asin}</span>
                )}
                {activeFirecrawl.identifiers.mpn && (
                  <span>MPN: {activeFirecrawl.identifiers.mpn}</span>
                )}
                {!activeFirecrawl.identifiers.upc &&
                  !activeFirecrawl.identifiers.ean &&
                  !activeFirecrawl.identifiers.asin &&
                  !activeFirecrawl.identifiers.mpn && (
                    <span className="text-slate-500">No structured identifiers detected</span>
                  )}
              </div>
              {activeFirecrawl.identifiers.identifierNotes.map((n, i) => (
                <p key={i} className="text-[11px] text-slate-400 leading-snug">
                  • {n}
                </p>
              ))}
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Observed Public Web Price (Unverified)
              </span>
              <div className="text-lg font-bold font-mono text-amber-300">
                {activeFirecrawl.observedPrice !== undefined
                  ? `$${activeFirecrawl.observedPrice.toFixed(2)} ${
                      activeFirecrawl.observedCurrency || "USD"
                    }`
                  : "No Price Extracted"}
              </div>
              {activeFirecrawl.observedAvailabilityText && (
                <div className="text-[11px] text-slate-300">
                  Page Availability Text:{" "}
                  <span className="font-semibold">{activeFirecrawl.observedAvailabilityText}</span>
                </div>
              )}
              <p className="text-[10px] text-amber-200/80 leading-snug">
                {activeFirecrawl.observedPriceNote}
              </p>
            </div>
          </div>

          {/* Specifications Table (if extracted) */}
          {Object.keys(activeFirecrawl.specifications).length > 0 && (
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Extracted Public Page Specifications
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                {Object.entries(activeFirecrawl.specifications).map(([key, val]) => (
                  <div
                    key={key}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 truncate"
                    title={`${key}: ${val}`}
                  >
                    <span className="text-slate-400 text-[10px] block">{key}</span>
                    <span className="text-slate-200 font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing, Inferred, Stale & Contradictory Information Audit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Missing & Inferred Attributes Audit
              </span>
              {activeFirecrawl.integrity.missingFields.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-slate-400 text-[11px]">Missing:</span>
                  {activeFirecrawl.integrity.missingFields.map((mf) => (
                    <span
                      key={mf}
                      className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-amber-900/50 text-[10px]"
                    >
                      {mf}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-emerald-400 text-[11px]">
                  All core product attributes present on page.
                </p>
              )}

              {activeFirecrawl.integrity.inferredFields.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-slate-400 text-[11px]">Inferred:</span>
                  {activeFirecrawl.integrity.inferredFields.map((inf) => (
                    <span
                      key={inf}
                      className="px-2 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800 text-[10px]"
                    >
                      {inf}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Contradictions & Stale Signals
              </span>
              {activeFirecrawl.integrity.contradictions.length === 0 &&
              activeFirecrawl.integrity.staleDataWarnings.length === 0 ? (
                <p className="text-emerald-400 text-[11px]">
                  No internal page contradictions or staleness flags detected.
                </p>
              ) : (
                <div className="space-y-1">
                  {activeFirecrawl.integrity.contradictions.map((c, idx) => (
                    <div key={idx} className="text-[11px] text-rose-300 flex items-start gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </div>
                  ))}
                  {activeFirecrawl.integrity.staleDataWarnings.map((s, idx) => (
                    <div key={idx} className="text-[11px] text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mandatory Marketplace Data Integrity Guardrails Banner */}
          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/50 text-[11px] text-indigo-200/90 flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <strong>Marketplace Data Integrity Guardrail:</strong> Scraped public product pages
              are supplementary research only and are <strong>never</strong> treated as proof of a
              completed sale, guaranteed live inventory, Amazon/eBay seller ungating approval, or
              actual marketplace fees.
            </div>
          </div>
        </div>
      )}

      {/* SECTION B: Cross-Marketplace Product Matching & Profit Waterfall */}
      {enrichmentReport && (
        <div
          id="panel-cross-market-report"
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h4 className="font-bold text-base text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                Cross-Marketplace Product Matching & Profit Verification
              </h4>
              <p className="text-xs text-slate-400">
                Query evaluated: <span className="font-mono text-slate-200">"{enrichmentReport.queryUsed}"</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-save-research-opp"
                type="button"
                onClick={handleSaveCurrentOpportunity}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-semibold text-xs transition"
              >
                <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                <span>{savedNotice ? "Saved to Watchlist!" : "Save Opportunity"}</span>
              </button>

              {onSaveDraft && (
                <button
                  type="button"
                  onClick={() => onSaveDraft(buildItemAnalysisFromResearch())}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Stage to Drafts</span>
                </button>
              )}

              <button
                id="btn-send-enriched-to-lister"
                type="button"
                onClick={() => onSendToLister(buildItemAnalysisFromResearch())}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition"
              >
                <Zap className="w-3.5 h-3.5 fill-slate-950" />
                <span>Send to AI Lister</span>
              </button>
            </div>
          </div>

          {/* Side-by-Side Channel Match Confidence Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* eBay Match Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-white">
                  eBay Catalog & Browse Match
                </span>
                {renderMatchConfidenceBadge(
                  enrichmentReport.marketplaceData.ebayCatalog.matchAssessment
                )}
              </div>

              <p className="text-slate-400 text-[11px]">
                {enrichmentReport.marketplaceData.ebayCatalog.statusMessage}{" "}
                {enrichmentReport.marketplaceData.ebayBrowse.statusMessage}
              </p>

              {enrichmentReport.marketplaceData.ebayCatalog.catalogProduct && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      {enrichmentReport.marketplaceData.ebayCatalog.catalogProduct.title}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400">
                      ePID: {enrichmentReport.marketplaceData.ebayCatalog.catalogProduct.epid}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Brand:{" "}
                    {enrichmentReport.marketplaceData.ebayCatalog.catalogProduct.brand || "N/A"} |
                    GTIN:{" "}
                    {enrichmentReport.marketplaceData.ebayCatalog.catalogProduct.gtin || "N/A"}
                  </div>
                </div>
              )}

              {enrichmentReport.marketplaceData.ebayBrowse.activePriceStats && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-semibold">
                      Active Browse Listings (
                      {enrichmentReport.marketplaceData.ebayBrowse.activePriceStats.count}):
                    </span>
                    <span className="font-mono font-bold text-emerald-300">
                      Median Asking: $
                      {enrichmentReport.marketplaceData.ebayBrowse.activePriceStats.medianPrice.toFixed(
                        2
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-300/90">
                    {enrichmentReport.marketplaceData.ebayBrowse.activePriceStats.note}
                  </p>
                </div>
              )}

              {/* Uncertainty Reasons & Contradictions */}
              {enrichmentReport.marketplaceData.ebayCatalog.matchAssessment.contradictions.map(
                (c, i) => (
                  <div key={i} className="text-[11px] text-rose-300 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </div>
                )
              )}
              {enrichmentReport.marketplaceData.ebayCatalog.matchAssessment.uncertaintyReasons.map(
                (u, i) => (
                  <div key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{u}</span>
                  </div>
                )
              )}
            </div>

            {/* Amazon Match Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-white">
                  Amazon Creators Catalog & OffersV2 Match
                </span>
                {renderMatchConfidenceBadge(
                  enrichmentReport.marketplaceData.amazon.matchAssessment
                )}
              </div>

              <p className="text-slate-400 text-[11px]">
                {enrichmentReport.marketplaceData.amazon.statusMessage}
              </p>

              {enrichmentReport.marketplaceData.amazon.products[0] && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      {enrichmentReport.marketplaceData.amazon.products[0].title}
                    </span>
                    <span className="font-mono text-[10px] text-amber-400">
                      ASIN: {enrichmentReport.marketplaceData.amazon.products[0].asin}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Brand: {enrichmentReport.marketplaceData.amazon.products[0].brand} | Buy Box:{" "}
                    {enrichmentReport.marketplaceData.amazon.products[0].buyBoxPrice
                      ? `$${enrichmentReport.marketplaceData.amazon.products[0].buyBoxPrice.toFixed(
                          2
                        )}`
                      : "N/A"}
                  </div>
                </div>
              )}

              {enrichmentReport.marketplaceData.amazon.matchAssessment.contradictions.map(
                (c, i) => (
                  <div key={i} className="text-[11px] text-rose-300 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </div>
                )
              )}
              {enrichmentReport.marketplaceData.amazon.matchAssessment.uncertaintyReasons.map(
                (u, i) => (
                  <div key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{u}</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Side-by-Side Financial Estimates (eBay vs Amazon FBA) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderProfitCard(enrichmentReport.financialEstimates.ebay)}
            {renderProfitCard(enrichmentReport.financialEstimates.amazonFba)}
          </div>

          {/* Missing Evidence Checklist before Acting */}
          {enrichmentReport.overallSummary.missingEvidenceList.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Missing Evidence & Verification Checklist Before Committing Capital
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                {enrichmentReport.overallSummary.missingEvidenceList.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION C: Saved Research Opportunities Watchlist */}
      {savedOpportunities.length > 0 && (
        <div
          id="panel-saved-research-watchlist"
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-400" />
              <h4 className="font-bold text-sm text-white">
                Saved Research Opportunities Watchlist ({savedOpportunities.length})
              </h4>
            </div>
            <span className="text-xs text-slate-400">
              Click "Revisit" to reload any saved opportunity into the analyzer
            </span>
          </div>

          <div className="space-y-2">
            {savedOpportunities.map((opp) => (
              <div
                key={opp.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">{opp.title}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-800 text-[10px]">
                      {opp.sourcePlatform}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        opp.hasVerifiedIdentifierMatch
                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                          : "bg-amber-950 text-amber-300 border-amber-800"
                      }`}
                    >
                      {opp.hasVerifiedIdentifierMatch
                        ? "Verified Barcode Match"
                        : `Match: ${opp.ebayMatchConfidence.toUpperCase()}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                    <span>
                      Cost:{" "}
                      <strong className="text-slate-200">
                        {opp.sourceCost !== null ? `$${opp.sourceCost.toFixed(2)}` : "Missing"}
                      </strong>
                    </span>
                    <span>
                      eBay Est. Net:{" "}
                      <strong
                        className={
                          opp.ebayNetProfitEstimate && opp.ebayNetProfitEstimate > 0
                            ? "text-emerald-400"
                            : "text-slate-400"
                        }
                      >
                        {opp.ebayNetProfitEstimate !== null
                          ? `${opp.ebayNetProfitEstimate >= 0 ? "+" : ""}$${opp.ebayNetProfitEstimate.toFixed(
                              2
                            )}`
                          : "Unconfirmed"}
                      </strong>
                    </span>
                    <span>Saved {new Date(opp.savedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRevisitOpportunity(opp)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold text-xs transition"
                  >
                    Revisit & Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteOpportunity(opp.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Remove from watchlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

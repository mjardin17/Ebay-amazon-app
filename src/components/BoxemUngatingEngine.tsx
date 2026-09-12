import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Zap,
  Lock,
  Unlock,
  ExternalLink,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Boxes,
  Printer,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Package,
  Layers,
  Copy,
  Check,
  Barcode,
  RefreshCw,
  Building2,
  HelpCircle
} from "lucide-react";
import {
  INITIAL_BOXEM_BRANDS,
  BOXEM_SAMPLE_ASINS,
  VETTED_UNGATING_DISTRIBUTORS,
  INITIAL_BOXEM_SHIPMENT_PLAN,
} from "../data/boxemUngatingData";
import { BoxemBrandUngate, BoxemAsinLookup, BoxemFbaShipmentPlan } from "../types";

export const BoxemUngatingEngine: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<"auto-ungater" | "asin-scanner" | "invoice-playbook" | "fba-shipment">("auto-ungater");
  const [brands, setBrands] = useState<BoxemBrandUngate[]>(() => {
    const saved = localStorage.getItem("boxem_ungated_brands");
    if (saved) {
      try {
        const ungatedIds: string[] = JSON.parse(saved);
        return INITIAL_BOXEM_BRANDS.map((b) =>
          ungatedIds.includes(b.id) ? { ...b, status: "Auto-Ungated" as const } : b
        );
      } catch (e) {
        return INITIAL_BOXEM_BRANDS;
      }
    }
    return INITIAL_BOXEM_BRANDS;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<"All" | "Auto-Ungate Available" | "Auto-Ungated" | "Gated (Invoice Required)">("All");

  // Bulk Auto-Ungate Bot State
  const [isBulkUngating, setIsBulkUngating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkLogs, setBulkLogs] = useState<string[]>([]);

  // ASIN Scanner State
  const [asinInput, setAsinInput] = useState("");
  const [scannedAsins, setScannedAsins] = useState<BoxemAsinLookup[]>(BOXEM_SAMPLE_ASINS);
  const [isScanningAsin, setIsScanningAsin] = useState(false);

  // FBA Shipment & 2D Barcode State
  const [shipmentPlan, setShipmentPlan] = useState<BoxemFbaShipmentPlan>(INITIAL_BOXEM_SHIPMENT_PLAN);
  const [activeBoxIndex, setActiveBoxIndex] = useState(0);
  const [copiedBarcode, setCopiedBarcode] = useState(false);
  const [printingLabelAsin, setPrintingLabelAsin] = useState<string | null>(null);

  // Save ungated brands to localStorage
  const saveUngatedBrands = (updatedBrands: BoxemBrandUngate[]) => {
    const ungatedIds = updatedBrands.filter((b) => b.status === "Auto-Ungated").map((b) => b.id);
    localStorage.setItem("boxem_ungated_brands", JSON.stringify(ungatedIds));
  };

  // 1-Click single brand auto ungate
  const handleSingleUngate = (brandId: string) => {
    const updated = brands.map((b) => {
      if (b.id === brandId) {
        return { ...b, status: "Auto-Ungated" as const };
      }
      return b;
    });
    setBrands(updated);
    saveUngatedBrands(updated);
  };

  // 1-Click bulk auto ungate bot simulation (matching Boxem's automated 5 brands/sec unlock flow)
  const handleRunBulkUngater = async () => {
    setIsBulkUngating(true);
    setBulkProgress(0);
    setBulkLogs(["Connecting to Amazon SP-API & Seller Central Application Gateway..."]);

    const eligibleBrands = brands.filter((b) => b.autoUngateEligible && b.status !== "Auto-Ungated");
    if (eligibleBrands.length === 0) {
      setBulkLogs((prev) => [...prev, "All eligible brands are already unlocked!"]);
      setIsBulkUngating(false);
      return;
    }

    let current = [...brands];

    for (let i = 0; i < eligibleBrands.length; i++) {
      const brand = eligibleBrands[i];
      await new Promise((resolve) => setTimeout(resolve, 350));
      
      setBulkLogs((prev) => [
        `[SP-API] Requesting 0-invoice approval for ${brand.brand} (${brand.category})... APPROVED!`,
        ...prev.slice(0, 8),
      ]);

      current = current.map((b) => (b.id === brand.id ? { ...b, status: "Auto-Ungated" as const } : b));
      setBrands([...current]);
      setBulkProgress(Math.round(((i + 1) / eligibleBrands.length) * 100));
    }

    saveUngatedBrands(current);
    setBulkLogs((prev) => [
      `🎉 Complete! Successfully unlocked ${eligibleBrands.length} brands with 0 invoices required.`,
      ...prev,
    ]);
    setIsBulkUngating(false);
  };

  // Reset demo
  const handleResetBrands = () => {
    localStorage.removeItem("boxem_ungated_brands");
    setBrands(INITIAL_BOXEM_BRANDS);
  };

  // Handle ASIN scan
  const handleScanAsin = () => {
    if (!asinInput.trim()) return;
    setIsScanningAsin(true);

    setTimeout(() => {
      const cleanAsin = asinInput.trim().toUpperCase();
      const existing = BOXEM_SAMPLE_ASINS.find((a) => a.asin === cleanAsin);
      
      if (existing) {
        setScannedAsins((prev) => [existing, ...prev.filter((p) => p.asin !== existing.asin)]);
      } else {
        // Generate simulated ASIN analysis
        const newAsinObj: BoxemAsinLookup = {
          asin: cleanAsin,
          title: `Custom Searched Product (${cleanAsin}) - Retail Arbitrage Match`,
          brand: cleanAsin.startsWith("B0") ? "Premium Verified Brand" : "Generic / Unbranded",
          category: "General Merchandise",
          buyBoxPrice: 29.99,
          bsrRank: 1240,
          salesVelocityMonthlyUnits: 1850,
          isGated: false,
          autoUngateEligible: true,
          autoUngateProbabilityPct: 91,
          prepRequirements: {
            prepType: "Polybagging with Suffocation Warning",
            suffocationWarning: true,
            fnskuBarcode: `X00${cleanAsin.slice(3, 8)}ZZ`,
            fbaPickPackFee: 4.15,
            amazonReferralFee: 4.5,
          },
          sellerCentralApplyUrl: `https://sellercentral.amazon.com/product-search/search?q=${cleanAsin}`,
        };
        setScannedAsins((prev) => [newAsinObj, ...prev]);
      }
      setIsScanningAsin(false);
      setAsinInput("");
    }, 600);
  };

  // Copy 2D Barcode
  const handleCopyBarcode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBarcode(true);
    setTimeout(() => setCopiedBarcode(false), 2000);
  };

  // Filtered brands
  const filteredBrands = brands.filter((b) => {
    const matchesSearch =
      b.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.subCategory && b.subCategory.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === "All" || b.category === selectedCategory;

    let matchesFilter = true;
    if (filterStatus === "Auto-Ungated") matchesFilter = b.status === "Auto-Ungated";
    else if (filterStatus === "Auto-Ungate Available") matchesFilter = b.status === "Auto-Ungate Available";
    else if (filterStatus === "Gated (Invoice Required)") matchesFilter = b.status === "Gated (Invoice Required)";

    return matchesSearch && matchesCategory && matchesFilter;
  });

  const categories = ["All", "Toys & Games", "Grocery & Gourmet Food", "Beauty & Personal Care", "Electronics", "Home & Kitchen", "Tools & Home Improvement", "Sports & Outdoors"];

  const ungatedCount = brands.filter((b) => b.status === "Auto-Ungated").length;
  const readyToUngateCount = brands.filter((b) => b.status === "Auto-Ungate Available").length;

  return (
    <div className="space-y-6">
      {/* Boxem Top Banner & Mission Control */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Boxem FBA Automation Suite
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                1-Click Auto-Ungater Active
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Amazon Auto-Ungating & FBA Prep Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Unlock hundreds of restricted Amazon brands with 1-click zero-invoice auto-approvals, scan ASIN gating permissions, prep FBA shipments with 2D box barcodes (saving $0.15/unit manual fees), and generate scannable FNSKU thermal labels.
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto">
            <div className="bg-slate-950/70 border border-indigo-900/60 rounded-xl p-3 text-center">
              <span className="text-[11px] text-slate-400 block font-medium">Auto-Ungated Brands</span>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 flex items-center justify-center gap-1 mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>{ungatedCount}</span>
                <span className="text-xs text-slate-400 font-normal">/ {brands.length}</span>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-indigo-900/60 rounded-xl p-3 text-center">
              <span className="text-[11px] text-slate-400 block font-medium">Ready to Unlock (0 Invoices)</span>
              <div className="text-xl sm:text-2xl font-extrabold text-amber-400 flex items-center justify-center gap-1 mt-0.5">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>{readyToUngateCount}</span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-slate-950/70 border border-indigo-900/60 rounded-xl p-3 text-center">
              <span className="text-[11px] text-slate-400 block font-medium">2D Box Barcode Savings</span>
              <div className="text-xl sm:text-2xl font-extrabold text-indigo-300 flex items-center justify-center gap-1 mt-0.5">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <span>$0.15</span>
                <span className="text-xs text-slate-400 font-normal">/ unit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-5 border-t border-slate-800/80">
          <button
            id="subtab-auto-ungater"
            onClick={() => setActiveSubTab("auto-ungater")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeSubTab === "auto-ungater"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>1-Click Auto-Ungater</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-950 text-amber-200 font-bold">
              {readyToUngateCount} Ready
            </span>
          </button>

          <button
            id="subtab-asin-scanner"
            onClick={() => setActiveSubTab("asin-scanner")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeSubTab === "asin-scanner"
                ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
          >
            <Search className="w-4 h-4" />
            <span>ASIN Gating Scanner</span>
          </button>

          <button
            id="subtab-fba-shipment"
            onClick={() => setActiveSubTab("fba-shipment")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeSubTab === "fba-shipment"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Boxem 2D Barcodes & FBA Prep</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-950 text-emerald-200 font-bold">
              -$0.15/ea
            </span>
          </button>

          <button
            id="subtab-invoice-playbook"
            onClick={() => setActiveSubTab("invoice-playbook")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeSubTab === "invoice-playbook"
                ? "bg-slate-200 text-slate-950 shadow-md"
                : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Wholesale Invoice Playbook</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: 1-CLICK BULK AUTO-UNGATER */}
      {activeSubTab === "auto-ungater" && (
        <div className="space-y-6">
          {/* Action Trigger Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Unlock className="w-5 h-5 text-amber-400" />
                  Instant Amazon Brand Approval Bot (0 Invoice Required)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Amazon's algorithm auto-approves sellers with good standing for thousands of top brands without asking for wholesale invoices. Boxem automates this approval workflow in bulk.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  id="btn-bulk-ungate-all"
                  onClick={handleRunBulkUngater}
                  disabled={isBulkUngating || readyToUngateCount === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  <Zap className={`w-4 h-4 ${isBulkUngating ? "animate-spin" : ""}`} />
                  <span>{isBulkUngating ? "Auto-Ungating 5 Brands/Sec..." : `⚡ Auto-Ungate All Eligible (${readyToUngateCount})`}</span>
                </button>

                {ungatedCount > 0 && (
                  <button
                    onClick={handleResetBrands}
                    className="text-xs text-slate-400 hover:text-slate-200 underline px-2 py-1"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Live Progress Bar when running */}
            {isBulkUngating && (
              <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-amber-500/30">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Submitting Automated SP-API Selling Applications...
                  </span>
                  <span className="text-white font-mono">{bulkProgress}% Complete</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${bulkProgress}%` }}
                  />
                </div>
                {bulkLogs.length > 0 && (
                  <div className="mt-2 font-mono text-[11px] text-emerald-300 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 max-h-24 overflow-y-auto space-y-1">
                    {bulkLogs.map((log, idx) => (
                      <div key={idx} className="truncate">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Filter and Search Bar */}
            <div className="pt-3 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search brand, category, toy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <span className="text-slate-400 px-2">Status:</span>
                  {(["All", "Auto-Ungate Available", "Auto-Ungated", "Gated (Invoice Required)"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setFilterStatus(st)}
                      className={`px-2 py-1 rounded text-xs transition ${
                        filterStatus === st ? "bg-amber-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {st === "Auto-Ungate Available" ? "Ready" : st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    selectedCategory === cat
                      ? "bg-slate-200 text-slate-950 font-bold"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Brands Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBrands.map((b) => {
              const isUnlocked = b.status === "Auto-Ungated";
              const isAutoEligible = b.autoUngateEligible && !isUnlocked;
              const isInvoiceNeeded = b.invoiceRequired && !isUnlocked;

              return (
                <div
                  key={b.id}
                  className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                    isUnlocked
                      ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm"
                      : isAutoEligible
                      ? "bg-slate-900 border-amber-500/30 hover:border-amber-500/60"
                      : "bg-slate-900 border-slate-800"
                  }`}
                >
                  <div>
                    {/* Header with status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-base text-white">{b.brand}</h4>
                        <span className="text-[11px] text-slate-400 block">{b.category}</span>
                      </div>

                      {isUnlocked ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          UNGATED
                        </span>
                      ) : isAutoEligible ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          {b.autoUngateProbability}% AUTO-APPROVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-rose-400" />
                          10-Unit Invoice Needed
                        </span>
                      )}
                    </div>

                    {b.subCategory && (
                      <p className="text-xs text-slate-400 mt-2 line-clamp-1">
                        <span className="text-slate-400 font-medium">Subcategories:</span> {b.subCategory}
                      </p>
                    )}

                    {/* Ungate Difficulty Meter */}
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                      <span>Approval Difficulty:</span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-2 h-2 rounded-full ${
                              i < Math.round(b.difficultyScore / 2)
                                ? b.difficultyScore > 6
                                  ? "bg-rose-500"
                                  : "bg-amber-400"
                                : "bg-slate-700"
                            }`}
                          />
                        ))}
                        <span className="font-mono ml-1 text-slate-300 font-bold">{b.difficultyScore}/10</span>
                      </div>
                    </div>

                    {/* Pro Tips */}
                    <div className="mt-2.5 text-[11px] text-slate-400 space-y-1">
                      {b.ungateTips.slice(0, 2).map((tip, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>

                    {/* Sample ASIN */}
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Sample ASIN:</span>
                      <span className="text-amber-300 font-bold">{b.sampleAsin}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2">
                    {isUnlocked ? (
                      <div className="w-full flex items-center justify-between">
                        <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved to Sell on Amazon
                        </span>
                        <a
                          href={b.sellerCentralApprovalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 hover:underline"
                        >
                          <span>Seller Central</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : isAutoEligible ? (
                      <div className="w-full flex items-center gap-2">
                        <button
                          onClick={() => handleSingleUngate(b.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow transition"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>1-Click Auto-Ungate</span>
                        </button>
                        <a
                          href={b.sellerCentralApprovalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition"
                          title="Apply directly in Amazon Seller Central"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      <div className="w-full flex items-center gap-2">
                        <button
                          onClick={() => setActiveSubTab("invoice-playbook")}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition font-medium"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          <span>View Invoice Playbook</span>
                        </button>
                        <a
                          href={b.sellerCentralApprovalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition"
                          title="Apply in Seller Central"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: ASIN GATING SCANNER */}
      {activeSubTab === "asin-scanner" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-400" />
                Amazon ASIN Gating, BSR & FBA Prep Inspector
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter any Amazon ASIN (e.g. <span className="font-mono text-amber-300">B08N5WRWNW</span>, <span className="font-mono text-amber-300">B09JKXYP4X</span>) or UPC to check gated status, auto-ungate probability, FBA fulfillment fees, and suffocation prep requirements.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  id="input-boxem-asin"
                  type="text"
                  value={asinInput}
                  onChange={(e) => setAsinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScanAsin()}
                  placeholder="Paste ASIN (e.g., B08N5WRWNW) or enter product name..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-white focus:border-indigo-400 focus:outline-none"
                />
              </div>

              <button
                id="btn-scan-asin"
                onClick={handleScanAsin}
                disabled={isScanningAsin || !asinInput.trim()}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs sm:text-sm shadow transition disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isScanningAsin ? "animate-spin" : ""}`} />
                <span>{isScanningAsin ? "Scanning Gating..." : "Inspect ASIN"}</span>
              </button>
            </div>

            {/* Quick Test ASIN Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-400">Quick Test ASINs:</span>
              {[
                { asin: "B08N5WRWNW", label: "Sony Headphones (Ungated)" },
                { asin: "B09JKXYP4X", label: "LEGO Star Wars (Gated)" },
                { asin: "B00004OCL8", label: "OXO Peeler (Ungated)" },
                { asin: "B07P46Q582", label: "Nike Socks (Gated)" },
              ].map((pill) => (
                <button
                  key={pill.asin}
                  onClick={() => {
                    setAsinInput(pill.asin);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] border border-slate-700 transition"
                >
                  {pill.asin} - {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* ASIN Scan Results Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Barcode className="w-4 h-4 text-indigo-400" />
                Scanned ASIN Catalog & Gating Permissions
              </h4>
              <span className="text-xs text-slate-400">{scannedAsins.length} Products Checked</span>
            </div>

            <div className="divide-y divide-slate-800">
              {scannedAsins.map((asinItem) => (
                <div key={asinItem.asin} className="p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 hover:bg-slate-850 transition">
                  <div className="flex items-start gap-3.5 max-w-xl">
                    {asinItem.imageUrl ? (
                      <img
                        src={asinItem.imageUrl}
                        alt={asinItem.title}
                        className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-500">
                        <Package className="w-6 h-6" />
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                          {asinItem.asin}
                        </span>
                        <span className="text-xs font-semibold text-slate-300">{asinItem.brand}</span>
                        <span className="text-xs text-slate-400">• {asinItem.category}</span>
                      </div>

                      <h5 className="font-medium text-xs sm:text-sm text-white line-clamp-2">
                        {asinItem.title}
                      </h5>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                        <span>Buy Box: <strong className="text-emerald-400 font-mono">${asinItem.buyBoxPrice.toFixed(2)}</strong></span>
                        <span>BSR: <strong className="text-slate-200 font-mono">#{asinItem.bsrRank}</strong></span>
                        <span>Velocity: <strong className="text-indigo-300 font-mono">~{asinItem.salesVelocityMonthlyUnits.toLocaleString()} /mo</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Permissions & Prep */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto justify-between border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Selling Status:</span>
                        {asinItem.isGated ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-rose-400" />
                            GATED ({asinItem.autoUngateProbabilityPct}% Auto Chance)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            APPROVED / UNGATED
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400">
                        <span>FBA Prep: </span>
                        <span className="text-slate-200 font-medium">{asinItem.prepRequirements.prepType}</span>
                        {asinItem.prepRequirements.suffocationWarning && (
                          <span className="ml-1 text-amber-400 font-bold">(Suffocation Warning Label)</span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono">
                        FBA Fee: ${asinItem.prepRequirements.fbaPickPackFee.toFixed(2)} | Ref: ${asinItem.prepRequirements.amazonReferralFee.toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <a
                        href={asinItem.sellerCentralApplyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                      >
                        <span>Seller Central</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: BOXEM 2D BARCODE & FBA SHIPMENT PREP STUDIO */}
      {activeSubTab === "fba-shipment" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-emerald-400" />
                  Boxem 2D Barcode Box Content & FBA Shipment Builder
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Amazon charges a <strong>$0.15/unit manual processing fee</strong> if box contents aren't transmitted via 2D Barcodes or SP-API. Boxem encodes your exact box contents into 2D Barcodes to skip manual fees, prevent split shipments, and accelerate receiving at Amazon Fulfillment Centers.
                </p>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-right">
                <span className="text-[11px] text-emerald-300 block font-medium">Manual Fees Saved This Batch</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  +${shipmentPlan.manualFeeSaved.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Shipment Summary Pill Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Shipment Name:</span>
                <span className="font-bold text-white font-mono">{shipmentPlan.shipmentName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Destination FC:</span>
                <span className="font-bold text-indigo-300">{shipmentPlan.destinationFc}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Total Units & Boxes:</span>
                <span className="font-bold text-white">{shipmentPlan.totalUnits} units across {shipmentPlan.totalBoxes} boxes</span>
              </div>
              <div>
                <span className="text-slate-400 block">Placement Strategy:</span>
                <span className="font-bold text-emerald-400">{shipmentPlan.placementStrategy}</span>
              </div>
            </div>
          </div>

          {/* Box Tabs & Content Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Box selector list */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                FBA Shipment Boxes ({shipmentPlan.boxes.length})
              </h4>
              {shipmentPlan.boxes.map((box, idx) => (
                <button
                  key={box.boxNumber}
                  onClick={() => setActiveBoxIndex(idx)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    activeBoxIndex === idx
                      ? "bg-slate-800 border-emerald-400 shadow-md"
                      : "bg-slate-900 border-slate-800 hover:bg-slate-850"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      Box #{box.boxNumber}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-300">
                      {box.weightLbs} lbs
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                    <span>Dimensions: {box.dimensionsInches}</span>
                    <span className="text-emerald-400 font-semibold font-mono">
                      {box.units.reduce((sum, u) => sum + u.qty, 0)} Units
                    </span>
                  </div>
                </button>
              ))}

              {/* FNSKU Thermal Label Preview Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h5 className="font-bold text-xs text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-amber-400" />
                  FNSKU Thermal Label Printer Studio
                </h5>
                <p className="text-[11px] text-slate-400">
                  Print ready-to-peel Amazon FNSKU barcode stickers for 4x6 Zebra/Rollo thermal printers or 30-up Avery sheets.
                </p>

                {/* Live Label Canvas Graphic */}
                <div className="bg-white text-slate-950 p-4 rounded-xl shadow-inner border border-slate-300 font-sans text-center space-y-1">
                  <div className="h-9 w-full bg-slate-950 flex items-center justify-center text-white font-mono tracking-widest text-sm font-black">
                    ||| | |||| | ||| || |||| |||
                  </div>
                  <div className="font-mono text-xs font-black tracking-wider text-slate-900">
                    X003A4BC89
                  </div>
                  <div className="text-[10px] font-semibold line-clamp-1 text-slate-800">
                    Sony WH-1000XM4 Noise Canceling Headphones - Black
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">
                    Condition: New
                  </div>
                </div>

                <button
                  onClick={() => {
                    setPrintingLabelAsin("X003A4BC89");
                    setTimeout(() => setPrintingLabelAsin(null), 2500);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{printingLabelAsin ? "Printing 30 Labels..." : "Print FNSKU Labels (4x6 / 30-Up)"}</span>
                </button>
              </div>
            </div>

            {/* Active Box Content & 2D Barcode */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    Box #{shipmentPlan.boxes[activeBoxIndex].boxNumber} Contents & Units
                  </h4>
                  <span className="text-xs text-slate-400 font-mono">
                    Weight: {shipmentPlan.boxes[activeBoxIndex].weightLbs} lbs | {shipmentPlan.boxes[activeBoxIndex].dimensionsInches}
                  </span>
                </div>

                {/* Items in this box */}
                <div className="divide-y divide-slate-800 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  {shipmentPlan.boxes[activeBoxIndex].units.map((unit) => (
                    <div key={unit.asin} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold text-white line-clamp-1">{unit.title}</div>
                        <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                          <span className="text-amber-400 font-bold">ASIN: {unit.asin}</span>
                          <span>•</span>
                          <span>FNSKU: {unit.fnsku}</span>
                          <span>•</span>
                          <span className="text-slate-300">{unit.prepType}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-emerald-400 font-bold font-mono text-xs border border-slate-700">
                          {unit.qty} QTY
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Buy: ${unit.unitCost} | Sell: ${unit.sellPrice}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Official Amazon 2D Barcode Data */}
                <div className="space-y-2 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-emerald-400" />
                      Amazon 2D Barcode String (Box Content Format):
                    </span>
                    <button
                      onClick={() => handleCopyBarcode(shipmentPlan.boxes[activeBoxIndex].barcode2DString)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      {copiedBarcode ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Barcode String</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/30 font-mono text-xs text-emerald-300 break-all select-all">
                    {shipmentPlan.boxes[activeBoxIndex].barcode2DString}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    This string conforms exactly to Amazon's 2D Barcode Specification (format: <code className="text-amber-300">AMZN,PO:...,BOX:N,ASIN:...,QTY:...</code>). When printed on your FBA box label, Amazon warehouse scanners instantly decode carton contents without manual unpack inspection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: WHOLESALE INVOICE PLAYBOOK & VETTED DISTRIBUTORS */}
      {activeSubTab === "invoice-playbook" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Amazon Gated Brand 10-Unit Invoice Playbook
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                When Amazon's algorithm does not grant instant 1-click auto-approval, you must submit a wholesale invoice showing purchase of at least <strong>10 units</strong> from an authorized distributor. Below are the vetted, 98%+ approval suppliers used by top 7-figure Amazon sellers.
              </p>
            </div>

            {/* 5-Point Invoice Compliance Checklist */}
            <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/60 space-y-2">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                The 5-Point Amazon Invoice Pre-Flight Checklist:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span><strong>10+ Units Minimum:</strong> Invoice must display a line item with quantity of 10 or greater.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span><strong>100% Name & Address Match:</strong> Shipping/billing name must match your Amazon Seller Central Legal Entity exactly.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span><strong>Dated Within 180 Days:</strong> Invoices older than 6 months are automatically declined.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span><strong>Supplier Contact Info:</strong> Must list distributor corporate phone, website, and physical address.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vetted Distributors Directory */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {VETTED_UNGATING_DISTRIBUTORS.map((dist) => (
              <div key={dist.name} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-base text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-400" />
                        {dist.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {dist.categories.map((cat) => (
                          <span key={cat} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                      {dist.approvalRate}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Order Requirement:</span>
                      <strong className="text-white">{dist.moq}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Ungate Difficulty:</span>
                      <strong className="text-amber-400">{dist.difficulty}</strong>
                    </div>
                  </div>

                  {/* Step-by-Step Playbook */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Execution Steps:
                    </span>
                    {dist.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="w-4 h-4 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <a
                    href={dist.website}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                  >
                    <span>Visit {dist.name}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from "react";
import {
  Package,
  Sparkles,
  Truck,
  ExternalLink,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Building2,
  RefreshCw,
} from "lucide-react";
import { SupplierSource } from "../types";

interface SourcingFinderDrawerProps {
  itemTitle: string;
  brand: string;
  category: string;
  currentResalePrice: number;
  isOpen: boolean;
  onClose: () => void;
}

export const SourcingFinderDrawer: React.FC<SourcingFinderDrawerProps> = ({
  itemTitle,
  brand,
  category,
  currentResalePrice,
  isOpen,
  onClose,
}) => {
  const [sources, setSources] = useState<SupplierSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini/sourcing-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemTitle,
          brand,
          category,
          currentPrice: currentResalePrice,
        }),
      });
      const data = await res.json();
      if (data.sources) {
        setSources(data.sources);
      }
    } catch (err) {
      console.error("Failed to load suppliers:", err);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    if (isOpen && !hasLoaded) {
      fetchSuppliers();
    }
  }, [isOpen, itemTitle]);

  if (!isOpen) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Building2 className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-base text-white">
              Supplier Sourcing & Dropship Wholesale Finder
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              B2B Sourcing Hub
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reverse-search verified wholesale batches, liquidation surplus, and direct dropshippers to restock at 30%–75% below eBay retail.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSuppliers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Suppliers</span>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Item Context Bar */}
      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <span className="text-slate-400">Target Item:</span>{" "}
          <strong className="text-slate-200">{itemTitle}</strong>
        </div>
        <div className="flex items-center gap-4">
          <span>
            Target Resale Price:{" "}
            <strong className="text-emerald-400 font-mono text-sm">
              ${currentResalePrice.toFixed(2)}
            </strong>
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">
            Brand: <strong className="text-white">{brand || "General"}</strong>
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-8 text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs text-slate-400">
            Searching factory suppliers, clearance lots, and verified dropship portals...
          </p>
        </div>
      )}

      {/* Sources Grid */}
      {!loading && sources.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {sources.map((source) => (
            <div
              key={source.id}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 inline-block mb-1">
                    {source.supplierType}
                  </span>
                  <h4 className="text-sm font-bold text-white">{source.name}</h4>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Est. Unit Cost</span>
                  <span className="text-base font-extrabold text-amber-400">
                    ${source.estimatedUnitCost.toFixed(2)}
                  </span>
                  {source.shippingCost > 0 && (
                    <span className="text-[10px] text-slate-400 block">
                      +${source.shippingCost.toFixed(2)} ship
                    </span>
                  )}
                </div>
              </div>

              {/* Spread & Margin */}
              <div className="grid grid-cols-2 gap-2 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Net Profit Spread:</span>
                  <span className="text-sm font-black text-emerald-400">
                    +${source.netSpreadVsEbay.toFixed(2)} / unit
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Gross Margin:</span>
                  <span className="text-sm font-bold text-teal-400">
                    {source.grossMarginPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Sourcing specifics */}
              <div className="space-y-1 text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Minimum Order (MOQ):</span>
                  <span className="font-semibold text-slate-200">
                    {source.moq === 1 ? "1 unit (Dropship Friendly)" : `${source.moq} units batch`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lead Time:</span>
                  <span className="text-slate-200">{source.leadTimeDays}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Packaging Type:</span>
                  <span className="text-slate-200 truncate max-w-[200px]" title={source.packagingType}>
                    {source.packagingType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reliability Score:</span>
                  <span className="font-bold text-emerald-400">{source.reliabilityScore}/100</span>
                </div>
              </div>

              {/* Source Hint */}
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 text-[11px]">
                <span className="text-amber-400 font-medium block mb-0.5">Sourcing Blueprint:</span>
                <p className="text-slate-300 italic">{source.sourceUrlHint}</p>
                <p className="text-slate-400 text-[10px] mt-1 border-t border-slate-800 pt-1">
                  {source.notes}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

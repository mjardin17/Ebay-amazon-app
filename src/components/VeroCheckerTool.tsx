import React, { useState } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, Search, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { VeroCheckResult } from "../types";

const POPULAR_VERO_CHECKS = [
  "OtterBox",
  "Velcro",
  "Apple",
  "Beachbody",
  "Onesie",
  "Nike",
  "Bose",
  "Rolex",
  "PopSockets",
  "Sony",
];

export const VeroCheckerTool: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VeroCheckResult | null>(null);

  const handleCheck = async (termToCheck?: string) => {
    const term = termToCheck || searchTerm;
    if (!term.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/gemini/vero-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandOrTerm: term, title: term }),
      });
      const data = await res.json();
      if (data.result) {
        setResult(data.result);
      }
    } catch (err) {
      console.error("VeRO check failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (brand: string) => {
    setSearchTerm(brand);
    handleCheck(brand);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-base text-white">
              eBay VeRO & Trademark Compliance Shield
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
              Anti-Account Suspension
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Check any brand, product term, or keyword against eBay's Verified Rights Owner (VeRO) program before listing to prevent instant listing takedowns and MC999 strikes.
          </p>
        </div>
      </div>

      {/* Preset Quick Checks */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
          Common VeRO Enforcement Traps:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_VERO_CHECKS.map((brand) => (
            <button
              key={brand}
              onClick={() => handlePresetClick(brand)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition"
            >
              {brand}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            id="input-vero-brand"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            placeholder="Type any brand, keyword, or phrasing (e.g. Velcro, Apple, Otterbox, Dyson)..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          id="btn-run-vero-check"
          onClick={() => handleCheck()}
          disabled={loading || !searchTerm.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs sm:text-sm transition disabled:opacity-50 flex-shrink-0"
        >
          <Sparkles className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Checking..." : "Verify VeRO Risk"}</span>
        </button>
      </div>

      {/* Result Card */}
      {result && (
        <div
          className={`rounded-xl border p-4.5 space-y-3 transition ${
            result.riskLevel === "High VeRO Risk" || result.riskLevel === "Prohibited"
              ? "bg-rose-950/30 border-rose-800/80 text-rose-100"
              : result.riskLevel === "Moderate Risk"
              ? "bg-amber-950/30 border-amber-800/80 text-amber-100"
              : "bg-emerald-950/30 border-emerald-800/80 text-emerald-100"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {result.riskLevel === "High VeRO Risk" || result.riskLevel === "Prohibited" ? (
                <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              ) : result.riskLevel === "Moderate Risk" ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              )}
              <div>
                <span className="font-bold text-sm text-white">
                  Analysis for: <span className="underline">{result.brandOrTerm}</span>
                </span>
                <span
                  className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    result.riskLevel === "High VeRO Risk" || result.riskLevel === "Prohibited"
                      ? "bg-rose-900/80 text-rose-200 border border-rose-700"
                      : result.riskLevel === "Moderate Risk"
                      ? "bg-amber-900/80 text-amber-200 border border-amber-700"
                      : "bg-emerald-900/80 text-emerald-200 border border-emerald-700"
                  }`}
                >
                  {result.riskLevel}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-300">
              eBay Automated Enforcement:{" "}
              <strong className={result.isEnforcedByEbay ? "text-rose-400" : "text-emerald-400"}>
                {result.isEnforcedByEbay ? "Active VeRO Member" : "No Automated Strikes"}
              </strong>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-200 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            {result.reason}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Prohibited words */}
            {result.prohibitedWords && result.prohibitedWords.length > 0 && (
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="font-semibold text-rose-400 block text-[11px] uppercase">
                  Avoid These Trigger Keywords:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {result.prohibitedWords.map((word, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-rose-950 text-rose-300 border border-rose-800 line-through"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Safe Alternatives */}
            {result.safeAlternatives && result.safeAlternatives.length > 0 && (
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="font-semibold text-emerald-400 block text-[11px] uppercase">
                  Safe Approved Alternatives:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {result.safeAlternatives.map((alt, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium"
                    >
                      {alt}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
            <strong className="text-indigo-300">Reseller Compliance Advice:</strong>{" "}
            {result.policyAdvice}
          </div>
        </div>
      )}
    </div>
  );
};

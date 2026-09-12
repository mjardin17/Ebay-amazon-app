import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, CheckCircle, Copy, Check, Truck, Box } from "lucide-react";
import { ItemAnalysis } from "../types";

interface FlawInspectorProps {
  flawData: ItemAnalysis["flawAndInspection"];
  shippingData: ItemAnalysis["shippingOptimization"];
}

export const FlawInspector: React.FC<FlawInspectorProps> = ({
  flawData,
  shippingData,
}) => {
  const [copiedDisclaimer, setCopiedDisclaimer] = useState(false);

  const handleCopyDisclaimer = () => {
    navigator.clipboard.writeText(flawData.suggestedDisclaimer);
    setCopiedDisclaimer(true);
    setTimeout(() => setCopiedDisclaimer(false), 2000);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "High":
        return "bg-rose-950 text-rose-300 border-rose-800";
      case "Medium":
        return "bg-amber-950 text-amber-300 border-amber-800";
      default:
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Flaw & Return Risk Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                AI Flaw & Return Protection
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/50">
                  Anti-Dispute
                </span>
              </h4>
              <p className="text-xs text-slate-400">Detects condition issues to prevent buyer returns</p>
            </div>
          </div>

          <div
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${getRiskColor(
              flawData.returnRiskLevel
            )}`}
          >
            {flawData.returnRiskLevel === "High" ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{flawData.returnRiskLevel} Return Risk</span>
          </div>
        </div>

        {/* Flaws list */}
        <div className="space-y-2 mb-3">
          <span className="text-xs font-medium text-slate-300 block">
            Discovered Flaws & Wear Points:
          </span>
          {flawData.flawsDetected && flawData.flawsDetected.length > 0 ? (
            <ul className="space-y-1.5">
              {flawData.flawsDetected.map((flaw, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs bg-slate-950 p-2 rounded border border-slate-800/80 text-slate-300"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>{flaw}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-400 bg-emerald-950/40 p-2 rounded border border-emerald-800/40">
              No significant flaws or damage identified. Item exhibits like-new condition.
            </p>
          )}
        </div>

        {/* Authenticity advice */}
        {flawData.authenticityNotes && (
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-300 mb-3">
            <span className="font-semibold text-amber-400 block mb-0.5">
              Authenticity & Serial Verification:
            </span>
            <p className="text-slate-400">{flawData.authenticityNotes}</p>
          </div>
        )}

        {/* Suggested Disclaimer */}
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-slate-300">
              Suggested Protection Disclaimer (Anti-INAD):
            </span>
            <button
              onClick={handleCopyDisclaimer}
              className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium"
            >
              {copiedDisclaimer ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="text-slate-400 italic">"{flawData.suggestedDisclaimer}"</p>
        </div>
      </div>

      {/* Shipping & Packaging Tier Optimization */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                  Smart Shipping & Box Optimizer
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                    Dimensional Weight
                  </span>
                </h4>
                <p className="text-xs text-slate-400">Auto-estimates cubic rate & carrier savings</p>
              </div>
            </div>
            {shippingData.cubicRateEligible && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-900/60 text-indigo-300 border border-indigo-700">
                Cubic Tier Eligible
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Est. Billable Weight:</span>
              <span className="text-base font-bold text-white">
                {shippingData.estimatedWeightOz} oz{" "}
                <span className="text-xs font-normal text-slate-400">
                  ({(shippingData.estimatedWeightOz / 16).toFixed(1)} lbs)
                </span>
              </span>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Recommended Box:</span>
              <span className="text-base font-bold text-white">
                {shippingData.packageDimensions}
              </span>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Recommended Carrier Service:</span>
              <span className="text-amber-400 font-semibold">{shippingData.recommendedCarrier}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Est. Commercial Base Rate:</span>
              <span className="text-emerald-400 font-bold text-sm">
                ${shippingData.estimatedShippingCost.toFixed(2)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
              Tip: Using calculated shipping based on buyer ZIP code will maximize conversion while protecting against cross-country Zone 8 rate jumps.
            </p>
          </div>
        </div>

        <div className="mt-3 p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
          <Box className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>
            Fits into standard USPS Flat Rate or Ground Advantage Poly Mailer for optimal dimensional rate.
          </span>
        </div>
      </div>
    </div>
  );
};

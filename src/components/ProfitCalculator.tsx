import React, { useState } from "react";
import { DollarSign, Percent, TrendingUp, AlertCircle, Sparkles } from "lucide-react";

interface ProfitCalculatorProps {
  initialPrice: number;
  initialCogs?: number;
  initialShippingCost?: number;
  fastSalePrice: number;
  recommendedPrice: number;
  highProfitPrice: number;
  onPriceChange?: (newPrice: number) => void;
}

export const ProfitCalculator: React.FC<ProfitCalculatorProps> = ({
  initialPrice,
  initialCogs = 0,
  initialShippingCost = 6.5,
  fastSalePrice,
  recommendedPrice,
  highProfitPrice,
  onPriceChange,
}) => {
  const [listPrice, setListPrice] = useState<number>(initialPrice || recommendedPrice || 50);
  const [cogs, setCogs] = useState<number>(initialCogs);
  const [shippingCharged, setShippingCharged] = useState<number>(0); // 0 = Free shipping
  const [actualPostage, setActualPostage] = useState<number>(initialShippingCost);
  const [promotedRate, setPromotedRate] = useState<number>(2.0); // 2% standard promoted listing
  const [ebayFeeRate] = useState<number>(13.25); // Standard eBay FVF %

  // Calculations
  const grossBuyerPaid = listPrice + shippingCharged;
  const ebayFinalValueFee = (grossBuyerPaid * (ebayFeeRate / 100)) + 0.30;
  const promotedAdFee = listPrice * (promotedRate / 100);
  const totalFees = ebayFinalValueFee + promotedAdFee;
  const netRevenue = grossBuyerPaid - totalFees - actualPostage;
  const netProfit = netRevenue - cogs;
  const marginPercent = grossBuyerPaid > 0 ? (netProfit / grossBuyerPaid) * 100 : 0;
  const totalInvestment = cogs + actualPostage;
  const roiPercent = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

  const handleApplyPresetPrice = (price: number) => {
    setListPrice(price);
    if (onPriceChange) onPriceChange(price);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-white">
              Dynamic eBay Profit & Fee Calculator
            </h3>
            <p className="text-xs text-slate-400">
              Live eBay Final Value (13.25% + $0.30), Promoted Ads & Shipping Margins
            </p>
          </div>
        </div>

        {/* Quick presets */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 mr-1">Target:</span>
          <button
            id="preset-fast-sale"
            onClick={() => handleApplyPresetPrice(fastSalePrice)}
            className={`px-2 py-1 rounded transition text-xs ${
              listPrice === fastSalePrice
                ? "bg-amber-500 text-slate-950 font-bold"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
          >
            Fast Sale (${fastSalePrice.toFixed(0)})
          </button>
          <button
            id="preset-recommended"
            onClick={() => handleApplyPresetPrice(recommendedPrice)}
            className={`px-2 py-1 rounded transition text-xs ${
              listPrice === recommendedPrice
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
          >
            Optimal (${recommendedPrice.toFixed(0)})
          </button>
          <button
            id="preset-high-profit"
            onClick={() => handleApplyPresetPrice(highProfitPrice)}
            className={`px-2 py-1 rounded transition text-xs ${
              listPrice === highProfitPrice
                ? "bg-indigo-500 text-white font-bold"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
          >
            High Margin (${highProfitPrice.toFixed(0)})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Inputs */}
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Listing Price ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input
                  id="input-calc-list-price"
                  type="number"
                  step="0.5"
                  value={listPrice}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setListPrice(val);
                    if (onPriceChange) onPriceChange(val);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Your Cost (COGS) ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input
                  id="input-calc-cogs"
                  type="number"
                  step="0.5"
                  value={cogs}
                  onChange={(e) => setCogs(parseFloat(e.target.value) || 0)}
                  placeholder="What you paid"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Buyer Pays Shipping ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input
                  id="input-calc-shipping-charged"
                  type="number"
                  step="0.5"
                  value={shippingCharged}
                  onChange={(e) => setShippingCharged(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {shippingCharged === 0 ? "Free Shipping to Buyer" : "Calculated shipping"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Actual Postage Cost ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input
                  id="input-calc-actual-postage"
                  type="number"
                  step="0.25"
                  value={actualPostage}
                  onChange={(e) => setActualPostage(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Commercial rate label</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1">
              <span>Promoted Listing Ad Rate</span>
              <span className="text-amber-400 font-bold">{promotedRate}% (${promotedAdFee.toFixed(2)})</span>
            </div>
            <input
              id="slider-promoted-rate"
              type="range"
              min="0"
              max="15"
              step="0.5"
              value={promotedRate}
              onChange={(e) => setPromotedRate(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0% (Organic)</span>
              <span>2% (Recommended min)</span>
              <span>5% (Competitive)</span>
              <span>15%</span>
            </div>
          </div>
        </div>

        {/* Right Outputs / Financial Breakdown */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400 pb-1.5 border-b border-slate-800">
              <span>Gross Transaction Amount:</span>
              <span className="text-slate-200 font-semibold">${grossBuyerPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>eBay Final Value Fee (13.25% + $0.30):</span>
              <span className="text-rose-400">-${ebayFinalValueFee.toFixed(2)}</span>
            </div>
            {promotedRate > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Promoted Ad Fee ({promotedRate}%):</span>
                <span className="text-rose-400">-${promotedAdFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Postage Cost:</span>
              <span className="text-rose-400">-${actualPostage.toFixed(2)}</span>
            </div>
            {cogs > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Cost of Goods (COGS):</span>
                <span className="text-rose-400">-${cogs.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 bg-emerald-950/20 -mx-4 -mb-4 p-4 rounded-b-lg border-emerald-900/30">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-emerald-400/90 font-semibold block">
                  Net Estimated Profit
                </span>
                <span className="text-2xl font-black text-emerald-400">
                  ${netProfit.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">
                  Margin:{" "}
                  <span className="font-bold text-white">
                    {marginPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  ROI:{" "}
                  <span className="font-bold text-emerald-400">
                    {roiPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

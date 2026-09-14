import React, { useState } from "react";
import { Sparkles, ShoppingBag, Layers, MessageSquare, Compass, Image as ImageIcon, Zap, Activity } from "lucide-react";
import { MarketplaceApiStatusModal } from "./MarketplaceApiStatusModal";

interface HeaderProps {
  activeTab: "lister" | "arbitrage" | "boxem" | "drafts" | "pins";
  setActiveTab: (tab: "lister" | "arbitrage" | "boxem" | "drafts" | "pins") => void;
  onOpenAdvisor: () => void;
  draftsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenAdvisor,
  draftsCount,
}) => {
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white font-black text-xl">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Listofa <span className="text-amber-400 font-extrabold">AI</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                  eBay Cassini Ready
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden md:block">
                AI Lister, Flaw Inspector & Cross-Market Dropship Research Agent
              </p>
            </div>
          </div>

          {/* Navigation Modes */}
          <nav className="flex items-center space-x-1 sm:space-x-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              id="nav-tab-lister"
              onClick={() => setActiveTab("lister")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "lister"
                  ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>AI Lister & Comps</span>
            </button>

            <button
              id="nav-tab-arbitrage"
              onClick={() => setActiveTab("arbitrage")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "arbitrage"
                  ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Arbitrage Agent</span>
              <span className="hidden md:inline-block px-1.5 py-0.2 rounded text-[10px] bg-emerald-900/60 text-emerald-200 border border-emerald-500/30">
                HOT
              </span>
            </button>

            <button
              id="nav-tab-boxem"
              onClick={() => setActiveTab("boxem")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "boxem"
                  ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Amazon & Boxem</span>
              <span className="hidden md:inline-block px-1.5 py-0.2 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-500/40 font-bold">
                UNGATER
              </span>
            </button>

            <button
              id="nav-tab-drafts"
              onClick={() => setActiveTab("drafts")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "drafts"
                  ? "bg-indigo-500 text-white font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Drafts</span>
              {draftsCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-900 text-indigo-200 border border-indigo-500/40">
                  {draftsCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-pins"
              onClick={() => setActiveTab("pins")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "pins"
                  ? "bg-rose-500 text-slate-950 font-semibold shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <ImageIcon className="w-4 h-4 text-rose-400" />
              <span>2:3 Pin Studio</span>
              <span className="hidden md:inline-block px-1.5 py-0.2 rounded text-[10px] bg-rose-900/80 text-rose-200 border border-rose-500/30">
                2:3 PIN
              </span>
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="btn-marketplace-api-status"
              onClick={() => setIsStatusModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition"
              title="View Official Marketplace APIs Status & Credentials"
            >
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">APIs</span>
            </button>

            <button
              id="btn-seller-advisor"
              onClick={onOpenAdvisor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Open AI Reseller Strategist"
            >
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">AI Advisor</span>
            </button>
          </div>
        </div>
      </div>

      <MarketplaceApiStatusModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
      />
    </header>
  );
};

import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { ListingGenerator } from "./components/ListingGenerator";
import { ArbitrageResearchAgent } from "./components/ArbitrageResearchAgent";
import { DraftsManager } from "./components/DraftsManager";
import { SellerAdvisorModal } from "./components/SellerAdvisorModal";
import { PinGraphicStudio } from "./components/PinGraphicStudio";
import { BoxemUngatingEngine } from "./components/BoxemUngatingEngine";
import { ItemAnalysis, ListingDraft } from "./types";
import { PRESET_ITEMS } from "./data/sampleItems";
import { idbGet, idbSet } from "./utils/storage";

export default function App() {
  const [activeTab, setActiveTab] = useState<"lister" | "arbitrage" | "boxem" | "drafts" | "pins">("lister");
  const [activeListerItem, setActiveListerItem] = useState<ItemAnalysis | null>(null);
  const [activePinItem, setActivePinItem] = useState<ItemAnalysis | null>(null);
  const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);

  // Initialize drafts from localStorage or pre-load 1 sample
  const [drafts, setDrafts] = useState<ListingDraft[]>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem("listofa_drafts");
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (e) {
      console.error(e);
    }
    // Default initial sample draft
    const sample = PRESET_ITEMS[0].precomputedAnalysis;
    return [
      {
        id: "draft-sample-1",
        createdAt: new Date().toISOString(),
        title: sample.title,
        price: sample.comps.recommendedPrice,
        cogs: sample.cogs || 65,
        netProfit: sample.comps.recommendedPrice - 65 - 24.5,
        category: sample.category,
        condition: sample.condition,
        status: "Ready to Publish",
        data: sample,
      },
    ];
  });

  // Load from IndexedDB on startup (unlimited quota, handles high-res photos)
  useEffect(() => {
    let isMounted = true;
    async function loadPersistentDrafts() {
      try {
        const saved = await idbGet<ListingDraft[]>("listofa_drafts");
        if (saved && saved.length > 0 && isMounted) {
          setDrafts(saved);
        }
      } catch (e) {
        console.warn("Failed to load drafts from IndexedDB:", e);
      }
    }
    loadPersistentDrafts();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save drafts to both IndexedDB (primary) and localStorage (fallback)
  useEffect(() => {
    idbSet("listofa_drafts", drafts).catch((err) => {
      console.error("Failed to persist drafts to IndexedDB:", err);
    });
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("listofa_drafts", JSON.stringify(drafts));
      }
    } catch (e) {
      // Ignored if quota is exceeded because IndexedDB safely stores it
    }
  }, [drafts]);

  // Handler: Save from Lister into Drafts
  const handleSaveDraft = (item: ItemAnalysis) => {
    const listPrice = item.comps?.recommendedPrice || 50;
    const cogs = item.cogs || 0;
    const ebayFees = listPrice * 0.1325 + 0.3;
    const shipping = item.shippingOptimization?.estimatedShippingCost || 6;
    const netProfit = listPrice - cogs - ebayFees - shipping;

    const newDraft: ListingDraft = {
      id: "draft-" + Date.now(),
      createdAt: new Date().toISOString(),
      title: item.title,
      price: listPrice,
      cogs,
      netProfit,
      category: item.category,
      condition: item.condition,
      status: "Ready to Publish",
      data: item,
    };

    setDrafts((prev) => [newDraft, ...prev]);
  };

  // Handler: Send Arbitrage Deal into Lister
  const handleSendToLister = (item: ItemAnalysis) => {
    setActiveListerItem(item);
    setActiveTab("lister");
  };

  // Handler: Launch 2:3 Pin Studio for an item
  const handleOpenPinStudio = (item?: ItemAnalysis) => {
    if (item) {
      setActivePinItem(item);
    } else if (activeListerItem) {
      setActivePinItem(activeListerItem);
    }
    setActiveTab("pins");
  };

  // Handler: Open Draft in Lister
  const handleLoadDraft = (item: ItemAnalysis) => {
    setActiveListerItem(item);
    setActiveTab("lister");
  };

  // Handler: Delete draft
  const handleDeleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleClearAllDrafts = () => {
    setDrafts([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAdvisor={() => setIsAdvisorOpen(true)}
        draftsCount={drafts.length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "lister" && (
          <ListingGenerator
            key={activeListerItem ? activeListerItem.title : "default"}
            initialItem={activeListerItem}
            onSaveDraft={handleSaveDraft}
            onOpenPinStudio={handleOpenPinStudio}
            onOpenBoxem={() => setActiveTab("boxem")}
          />
        )}

        {activeTab === "arbitrage" && (
          <ArbitrageResearchAgent
            onSendToLister={handleSendToLister}
            onOpenPinStudio={handleOpenPinStudio}
          />
        )}

        {activeTab === "boxem" && (
          <BoxemUngatingEngine />
        )}

        {activeTab === "drafts" && (
          <DraftsManager
            drafts={drafts}
            onLoadDraft={handleLoadDraft}
            onDeleteDraft={handleDeleteDraft}
            onClearAll={handleClearAllDrafts}
            onOpenPinStudio={handleOpenPinStudio}
          />
        )}

        {activeTab === "pins" && (
          <PinGraphicStudio
            initialItem={activePinItem || activeListerItem}
            onClose={() => setActiveTab("lister")}
          />
        )}
      </main>

      {/* AI Seller Advisor Modal */}
      <SellerAdvisorModal
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
      />
    </div>
  );
}

import React from "react";
import { Download, Trash2, ExternalLink, DollarSign, Layers, CheckCircle, Image as ImageIcon } from "lucide-react";
import { ListingDraft, ItemAnalysis } from "../types";

interface DraftsManagerProps {
  drafts: ListingDraft[];
  onLoadDraft: (item: ItemAnalysis) => void;
  onDeleteDraft: (id: string) => void;
  onClearAll: () => void;
  onOpenPinStudio?: (item: ItemAnalysis) => void;
}

export const DraftsManager: React.FC<DraftsManagerProps> = ({
  drafts,
  onLoadDraft,
  onDeleteDraft,
  onClearAll,
  onOpenPinStudio,
}) => {
  // Financial pipeline total
  const totalPipelineRevenue = drafts.reduce((acc, d) => acc + d.price, 0);
  const totalPipelineProfit = drafts.reduce((acc, d) => acc + d.netProfit, 0);

  // Export to eBay CSV (File Exchange standard)
  const handleExportCSV = () => {
    if (drafts.length === 0) return;

    const headers = [
      "Action(SiteID=US|Country=US|Currency=USD|Version=1193)",
      "CustomLabel",
      "Title",
      "Category",
      "Format",
      "Duration",
      "StartPrice",
      "Quantity",
      "ConditionID",
      "Description",
    ];

    const rows = drafts.map((d) => {
      const conditionMap: Record<string, string> = {
        "Brand New": "1000",
        "New (Other)": "1500",
        "Very Good (Pre-owned)": "3000",
        "Good (Pre-owned)": "4000",
        "For Parts / Repair": "7000",
      };
      const condId = conditionMap[d.condition] || "3000";
      const cleanDesc = d.data.descriptionHtml.replace(/"/g, '""');

      return [
        "Add",
        `SKU-${d.id.substring(0, 8)}`,
        `"${d.title.replace(/"/g, '""')}"`,
        `"${d.category}"`,
        "FixedPrice",
        "GTC",
        d.price.toFixed(2),
        "1",
        condId,
        `"${cleanDesc}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Listofa_eBay_Listings_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Listing Drafts & Pipeline Portfolio
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Manage your staged eBay listings, analyze portfolio profit, and export in bulk.
            </p>
          </div>

          {drafts.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                id="btn-export-csv"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm transition shadow"
              >
                <Download className="w-4 h-4" />
                <span>Export eBay CSV (File Exchange)</span>
              </button>
              <button
                onClick={onClearAll}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 text-xs transition"
                title="Clear all drafts"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800 text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Active Staged Listings</span>
            <span className="text-xl font-bold text-white">{drafts.length} Items</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Gross Pipeline Value</span>
            <span className="text-xl font-bold text-indigo-400">
              ${totalPipelineRevenue.toFixed(2)}
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-0.5">Estimated Net Profit</span>
            <span className="text-xl font-bold text-emerald-400">
              +${totalPipelineProfit.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* List of drafts */}
      {drafts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Drafts Saved Yet</h3>
          <p className="text-xs max-w-sm mx-auto">
            Generate listings in the AI Lister or transfer deals from the Arbitrage Research Agent to stage them here!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                {draft.data.imageUrl ? (
                  <img
                    src={draft.data.imageUrl}
                    alt={draft.title}
                    className="w-14 h-14 rounded-lg object-cover border border-slate-800 flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0">
                    ITEM
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-sm text-white line-clamp-1">
                    {draft.title}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                      {draft.condition}
                    </span>
                    <span>Created {new Date(draft.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                <div className="text-right">
                  <div className="text-sm font-bold text-white">
                    ${draft.price.toFixed(2)}
                  </div>
                  <div className="text-xs font-semibold text-emerald-400">
                    +${draft.netProfit.toFixed(2)} net
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenPinStudio?.(draft.data)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold text-xs transition"
                    title="Generate 2:3 Pinterest Pin Graphic"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>2:3 Pin</span>
                  </button>
                  <button
                    onClick={() => onLoadDraft(draft.data)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                  >
                    Open in Lister
                  </button>
                  <button
                    onClick={() => onDeleteDraft(draft.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Delete draft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

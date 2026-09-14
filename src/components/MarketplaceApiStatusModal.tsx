import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";

export interface CapabilityItem {
  id: string;
  name: string;
  provider: string;
  state: "available" | "restricted" | "not_configured" | "deprecated" | "rate_limited" | "authentication_failed";
  message: string;
  lastChecked: number;
  documentationUrl?: string;
  requiredCredentials: string[];
}

interface MarketplaceCapabilitiesData {
  timestamp: number;
  capabilities: Record<string, CapabilityItem>;
  cacheStats: {
    size: number;
    hits: number;
    misses: number;
    inFlightCount: number;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MarketplaceApiStatusModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<MarketplaceCapabilitiesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCapabilities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/capabilities");
      const json = await res.json();
      if (json.success && json.data) {
        setData({
          timestamp: json.data.timestamp,
          capabilities: json.data.capabilities,
          cacheStats: json.cacheStats,
        });
      } else {
        throw new Error(json.error || "Failed to load capabilities");
      }
    } catch (err: any) {
      setError(err.message || "Network error loading marketplace status");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCapabilities();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getStateBadge = (state: CapabilityItem["state"]) => {
    switch (state) {
      case "available":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Live & Operational
          </span>
        );
      case "restricted":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Commercial Approval Required
          </span>
        );
      case "not_configured":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Credentials Required
          </span>
        );
      case "deprecated":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            Superseded / Migrated
          </span>
        );
      case "rate_limited":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            Rate Limited
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            Auth Failed
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                Marketplace API Status & Integration Layer
              </h3>
              <p className="text-xs text-slate-400">
                Official Amazon Creators API, eBay Catalog & Browse API, and Data Provenance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCapabilities}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Telemetry & Cache Stats */}
          {data?.cacheStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-850 border border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                  Cache Entries
                </span>
                <span className="text-lg font-bold font-mono text-amber-400">
                  {data.cacheStats.size}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-850 border border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                  Cache Hits
                </span>
                <span className="text-lg font-bold font-mono text-emerald-400">
                  {data.cacheStats.hits}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-850 border border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                  Cache Misses
                </span>
                <span className="text-lg font-bold font-mono text-slate-300">
                  {data.cacheStats.misses}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-850 border border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                  In-Flight Pooling
                </span>
                <span className="text-lg font-bold font-mono text-indigo-400">
                  {data.cacheStats.inFlightCount} active
                </span>
              </div>
            </div>
          )}

          {/* Capability List */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider">
              Integrated APIs & Capabilities
            </h4>

            {data?.capabilities &&
              (Object.values(data.capabilities) as CapabilityItem[]).map((cap) => (
                <div
                  key={cap.id}
                  className="p-4 rounded-xl bg-slate-850 border border-slate-800 hover:border-slate-700 transition space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{cap.name}</span>
                      {cap.documentationUrl && (
                        <a
                          href={cap.documentationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-amber-400 transition"
                          title="Official API Documentation"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <div>{getStateBadge(cap.state)}</div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{cap.message}</p>

                  {cap.requiredCredentials && cap.requiredCredentials.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Configuration:
                      </span>
                      {cap.requiredCredentials.map((cred) => (
                        <span
                          key={cred}
                          className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-800"
                        >
                          {cred}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>

          {/* Compliance & Provenance Guarantee */}
          <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-900/60 space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Strict Data Provenance & Anti-Hallucination Policy</span>
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-relaxed">
              When live API credentials or commercial approvals are unconfigured, Listofa AI
              transparently labels calculations as <strong>Estimated / Inferred Resale Comps (AI Model)</strong>. Confirmed transaction sales from official marketplace channels are never fabricated or simulated.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-850/80 flex items-center justify-between text-xs text-slate-400">
          <span>Centralized Rate Limiting: 1 req/sec (Amazon), 4 req/sec (eBay)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition"
          >
            Close Status
          </button>
        </div>
      </div>
    </div>
  );
};

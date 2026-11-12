"use client";

import { useState } from "react";
import {
  Download,
  ExternalLink,
  FileJson,
  FileText,
  GitCompare,
  Layers,
  MessageSquareQuote,
  Printer,
  Shield,
  Tag,
  TrendingUp,
} from "lucide-react";
import { downloadDossierExport } from "@/lib/api";
import { safeHttpUrl } from "@/lib/url";
import {
  DiffSummary,
  DossierPayload,
  SourceCitation,
} from "@/lib/types";
import { OpportunityChart } from "./OpportunityChart";
import { MarkdownBrief } from "./MarkdownBrief";

interface DossierTabsProps {
  runId: string;
  productName: string;
  dossier: DossierPayload;
  diffSummary: DiffSummary | null;
  citations: SourceCitation[];
  createdAt: string;
}

type TabKey =
  | "brief"
  | "features"
  | "pricing"
  | "battlecards"
  | "voc"
  | "opportunities"
  | "diff_sources";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "brief", label: "Executive Brief", icon: <FileText className="w-4 h-4" /> },
  { key: "features", label: "Feature Matrix", icon: <Layers className="w-4 h-4" /> },
  { key: "pricing", label: "Pricing & Packaging", icon: <Tag className="w-4 h-4" /> },
  { key: "battlecards", label: "Battlecards & SWOT", icon: <Shield className="w-4 h-4" /> },
  { key: "voc", label: "Voice of Customer", icon: <MessageSquareQuote className="w-4 h-4" /> },
  { key: "opportunities", label: "Opportunities & Momentum", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "diff_sources", label: "Diff & Sources", icon: <GitCompare className="w-4 h-4" /> },
];

export function DossierTabs({
  runId,
  productName,
  dossier,
  diffSummary,
  citations,
  createdAt,
}: DossierTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("brief");
  const [vocFilter, setVocFilter] = useState<string>("all");
  const [downloadingFormat, setDownloadingFormat] = useState<
    "markdown" | "json" | null
  >(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const featureCompetitors = Array.from(
    new Set(
      dossier.feature_matrix.flatMap((row) =>
        Object.keys(row.competitor_support || {})
      )
    )
  );

  const panelClass = (isActive: boolean) =>
    isActive ? "block print:block" : "hidden print:block";

  async function handleExport(format: "markdown" | "json") {
    setDownloadingFormat(format);
    setExportError(null);
    try {
      await downloadDossierExport(runId, format);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to download dossier export."
      );
    } finally {
      setDownloadingFormat(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0f1623] overflow-hidden shadow-xl print:bg-white print:text-slate-900 print:border-0 print:shadow-none print:rounded-none print:overflow-visible">
      {/* Header + Export Actions */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 print:bg-white print:border-slate-200 print:px-0">
        <div>
          <h2 className="text-base font-semibold text-slate-100 print:text-slate-900 print:text-xl">
            {productName} — Competitive Dossier
          </h2>
          <p className="text-xs text-slate-400 print:text-slate-600">
            Snapshot generated {new Date(createdAt).toLocaleString()} ·{" "}
            {citations.length} verified sources
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            disabled={downloadingFormat !== null}
            onClick={() => void handleExport("markdown")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            {downloadingFormat === "markdown" ? "Downloading..." : "Markdown"}
          </button>
          <button
            type="button"
            disabled={downloadingFormat !== null}
            onClick={() => void handleExport("json")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5 text-teal-400" />
            {downloadingFormat === "json" ? "Downloading..." : "JSON"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-teal-400" />
            Print / PDF
          </button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200 print:hidden"
        >
          {exportError}
        </div>
      )}

      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Dossier views"
        className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 bg-slate-950/40 px-3 py-2 print:hidden"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap border transition-colors cursor-pointer ${
                active
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-200 shadow-sm"
                  : "border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-5 print:p-0 print:pt-4 print:space-y-8">
        <div className={panelClass(activeTab === "brief")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            1. Executive Brief
          </h3>
          <div className="space-y-5">
            {diffSummary && diffSummary.has_changes && (
              <div className="rounded-lg border border-teal-500/35 bg-teal-500/10 p-3 text-xs text-teal-200 print:bg-teal-50 print:text-teal-900 print:border-teal-200">
                <strong>Change Diff vs. Previous Snapshot:</strong>{" "}
                {diffSummary.headline}
              </div>
            )}
            <MarkdownBrief content={dossier.executive_brief_md} />
            {dossier.market_trends.length > 0 && (
              <div className="border-t border-slate-800 pt-4 print:border-slate-200">
                <h3 className="text-sm font-semibold text-slate-100 mb-2 print:text-slate-900">
                  Key Market Trends
                </h3>
                <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-300 print:text-slate-700">
                  {dossier.market_trends.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className={panelClass(activeTab === "features")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            2. Feature Comparison Matrix
          </h3>
          <div className="overflow-x-auto studio-scroll print:overflow-visible">
            {dossier.feature_matrix.length === 0 ? (
              <p className="text-sm text-slate-400 print:text-slate-500">
                No feature matrix rows generated.
              </p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-300 print:bg-slate-50 print:border-slate-200 print:text-slate-700">
                    <th className="py-2.5 px-3 font-semibold">Capability</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Priority</th>
                    {featureCompetitors.map((comp) => (
                      <th key={comp} className="py-2.5 px-3 font-semibold">
                        {comp}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 font-semibold">Sources</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 print:divide-slate-200">
                  {dossier.feature_matrix.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-800/40 print:hover:bg-transparent"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-100 print:text-slate-900">
                        {row.capability}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 print:text-slate-600">
                        {row.category}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold ${
                            row.importance === "high"
                              ? "bg-teal-500/20 text-teal-300 print:bg-teal-100 print:text-teal-800"
                              : row.importance === "medium"
                                ? "bg-slate-800 text-slate-300 print:bg-slate-100 print:text-slate-700"
                                : "bg-slate-900 text-slate-500 print:bg-slate-50"
                          }`}
                        >
                          {row.importance}
                        </span>
                      </td>
                      {featureCompetitors.map((comp) => (
                        <td
                          key={comp}
                          className="py-2.5 px-3 text-slate-300 print:text-slate-700"
                        >
                          {row.competitor_support?.[comp] || "—"}
                        </td>
                      ))}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {row.citation_urls.slice(0, 2).map((u, i) => {
                            const href = safeHttpUrl(u);
                            if (!href) return null;
                            return (
                              <a
                                key={i}
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 text-teal-400 hover:underline print:text-teal-700"
                              >
                                [{i + 1}]
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={panelClass(activeTab === "pricing")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            3. Pricing &amp; Packaging
          </h3>
          <div className="overflow-x-auto studio-scroll print:overflow-visible">
            {dossier.pricing_matrix.length === 0 ? (
              <p className="text-sm text-slate-400 print:text-slate-500">
                No pricing entries captured.
              </p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-300 print:bg-slate-50 print:border-slate-200 print:text-slate-700">
                    <th className="py-2.5 px-3 font-semibold">Competitor</th>
                    <th className="py-2.5 px-3 font-semibold">Billing Model</th>
                    <th className="py-2.5 px-3 font-semibold">Free Tier</th>
                    <th className="py-2.5 px-3 font-semibold">Entry</th>
                    <th className="py-2.5 px-3 font-semibold">Mid Tier</th>
                    <th className="py-2.5 px-3 font-semibold">Enterprise</th>
                    <th className="py-2.5 px-3 font-semibold">Key Packaging Gates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 print:divide-slate-200">
                  {dossier.pricing_matrix.map((pr, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-800/40 align-top print:hover:bg-transparent"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-100 print:text-slate-900">
                        {pr.competitor_name}
                        {safeHttpUrl(pr.pricing_url) && (
                          <a
                            href={safeHttpUrl(pr.pricing_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[11px] font-normal text-teal-400 hover:underline mt-0.5 print:text-teal-700"
                          >
                            Pricing source
                          </a>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-slate-700">
                        {pr.billing_model}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-slate-700">
                        {pr.free_tier}
                      </td>
                      <td className="py-2.5 px-3 text-teal-300 font-medium print:text-slate-900">
                        {pr.entry_price}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-slate-700">
                        {pr.mid_tier}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-slate-700">
                        {pr.enterprise_tier}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 print:text-slate-600">
                        {pr.key_packaging_gates.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={panelClass(activeTab === "battlecards")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            4. Battlecards &amp; SWOT
          </h3>
          <div className="space-y-5">
            {dossier.battlecards.map((bc, idx) => (
              <div
                key={idx}
                className="border border-slate-800 bg-slate-950/60 rounded-xl p-4 space-y-3 print:bg-white print:border-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 print:border-slate-200">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 print:text-slate-900">
                      {bc.competitor_name}
                    </h3>
                    <p className="text-xs text-slate-400 print:text-slate-600">
                      <strong className="text-slate-200 print:text-slate-800">ICP:</strong>{" "}
                      {bc.target_icp} ·{" "}
                      <strong className="text-slate-200 print:text-slate-800">
                        Positioning:
                      </strong>{" "}
                      {bc.positioning}
                    </p>
                  </div>
                  {safeHttpUrl(bc.website) && (
                    <a
                      href={safeHttpUrl(bc.website)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-teal-400 hover:underline print:text-teal-700"
                    >
                      Website <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-emerald-950/30 border border-emerald-500/30 p-3 print:bg-emerald-50 print:border-emerald-200">
                    <p className="font-semibold text-emerald-300 mb-1 print:text-emerald-900">
                      Strengths
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300 print:text-slate-700">
                      {bc.swot.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-rose-950/30 border border-rose-500/30 p-3 print:bg-rose-50 print:border-rose-200">
                    <p className="font-semibold text-rose-300 mb-1 print:text-rose-900">
                      Weaknesses
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300 print:text-slate-700">
                      {bc.swot.weaknesses.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-sky-950/30 border border-sky-500/30 p-3 print:bg-sky-50 print:border-sky-200">
                    <p className="font-semibold text-sky-300 mb-1 print:text-sky-900">
                      How to Win
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300 print:text-slate-700">
                      {bc.how_to_win.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-amber-950/30 border border-amber-500/30 p-3 print:bg-amber-50 print:border-amber-200">
                    <p className="font-semibold text-amber-300 mb-1 print:text-amber-900">
                      Landmines to Avoid
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300 print:text-slate-700">
                      {bc.landmines_to_avoid.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={panelClass(activeTab === "voc")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            5. Voice of Customer
          </h3>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {["all", "complaint", "praise", "switching_trigger"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setVocFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                    vocFilter === f
                      ? "bg-teal-500 text-slate-950 border-teal-500 font-semibold"
                      : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  {f === "all" ? "All Signals" : f.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dossier.voc_insights.map((v, idx) => {
                const matchesFilter =
                  vocFilter === "all" || v.sentiment === vocFilter;
                return (
                  <div
                    key={idx}
                    className={`border border-slate-800 bg-slate-950/60 rounded-lg p-3.5 text-xs space-y-2 print:bg-white print:border-slate-200 ${
                      matchesFilter ? "" : "hidden print:block"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100 print:text-slate-900">
                        {v.competitor_name} · {v.theme}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold ${
                          v.sentiment === "complaint"
                            ? "bg-rose-500/20 text-rose-300 print:bg-rose-100 print:text-rose-800"
                            : v.sentiment === "praise"
                              ? "bg-emerald-500/20 text-emerald-300 print:bg-emerald-100 print:text-emerald-800"
                              : "bg-amber-500/20 text-amber-300 print:bg-amber-100 print:text-amber-800"
                        }`}
                      >
                        {v.sentiment.replace("_", " ")}
                      </span>
                    </div>
                    <blockquote className="text-slate-300 italic border-l-2 border-slate-700 pl-2.5 print:text-slate-700 print:border-slate-300">
                      &ldquo;{v.evidence_quote}&rdquo;
                    </blockquote>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 print:text-slate-500">
                      <span>Platform: {v.platform.replace("_", " ")}</span>
                      {safeHttpUrl(v.source_url) && (
                        <a
                          href={safeHttpUrl(v.source_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-teal-400 hover:underline print:text-teal-700"
                        >
                          Verify quote <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={panelClass(activeTab === "opportunities")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            6. Opportunities &amp; Momentum
          </h3>
          <div className="space-y-5">
            <div className="print:hidden">
              <OpportunityChart opportunities={dossier.opportunities} />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-100 print:text-slate-900">
                Prioritized PM Roadmap Opportunities
              </h3>
              {dossier.opportunities.map((opp, idx) => (
                <div
                  key={idx}
                  className="border border-slate-800 bg-slate-950/60 rounded-lg p-3.5 text-xs space-y-1.5 print:bg-white print:border-slate-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100 print:text-slate-900">
                      {opp.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-medium print:bg-teal-50 print:text-teal-800">
                        Impact {opp.impact_score}/10
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium print:bg-slate-100 print:text-slate-700">
                        Effort {opp.effort_score}/10
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium print:bg-amber-50 print:text-amber-800">
                        {opp.horizon}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-300 print:text-slate-700">
                    <strong className="text-slate-100 print:text-slate-900">
                      Recommended Bet:
                    </strong>{" "}
                    {opp.recommended_feature_or_bet}
                  </p>
                  <p className="text-slate-400 print:text-slate-600">
                    <strong className="text-slate-200 print:text-slate-800">
                      Evidence:
                    </strong>{" "}
                    {opp.problem_evidence}
                  </p>
                </div>
              ))}
            </div>

            {dossier.momentum_signals.length > 0 && (
              <div className="border-t border-slate-800 pt-4 space-y-2 print:border-slate-200">
                <h3 className="text-sm font-semibold text-slate-100 print:text-slate-900">
                  Recent Momentum &amp; Launch Signals
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dossier.momentum_signals.map((sig, idx) => (
                    <div
                      key={idx}
                      className="border border-slate-800 bg-slate-950/60 rounded-lg p-3 text-xs space-y-1 print:bg-white print:border-slate-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-100 print:text-slate-900">
                          {sig.competitor_name}
                        </span>
                        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 print:bg-slate-100 print:text-slate-600">
                          {sig.signal_type}
                        </span>
                      </div>
                      <p className="font-medium text-slate-200 print:text-slate-800">
                        {sig.headline}
                      </p>
                      <p className="text-slate-400 print:text-slate-600">
                        {sig.takeaway}
                      </p>
                      {safeHttpUrl(sig.source_url) && (
                        <a
                          href={safeHttpUrl(sig.source_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-teal-400 hover:underline print:text-teal-700"
                        >
                          Source <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={panelClass(activeTab === "diff_sources")}>
          <h3 className="hidden print:block text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3">
            7. Snapshot Diff &amp; Verified Sources
          </h3>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 mb-2 print:text-slate-900">
                Snapshot Diff vs. Previous Run
              </h3>
              {!diffSummary || !diffSummary.has_changes ? (
                <p className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-lg p-3 print:bg-slate-50 print:text-slate-600 print:border-slate-200">
                  {diffSummary?.headline ||
                    "Initial baseline snapshot. Re-run this workspace later to track changes."}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-200 font-medium print:text-slate-700">
                    {diffSummary.headline}
                  </p>
                  <ul className="space-y-1.5">
                    {diffSummary.changes.map((c, idx) => (
                      <li
                        key={idx}
                        className="text-xs border border-slate-800 bg-slate-950/60 rounded-lg p-2.5 flex items-center gap-2 print:bg-white print:border-slate-200"
                      >
                        <span className="uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 print:bg-teal-100 print:text-teal-800">
                          {c.change_type}
                        </span>
                        <span className="font-semibold text-slate-100 print:text-slate-800">
                          [{c.category}] {c.target}:
                        </span>
                        <span className="text-slate-300 print:text-slate-700">
                          {c.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-100 mb-2 print:text-slate-900">
                Verified External Evidence ({citations.length})
              </h3>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg max-h-96 overflow-y-auto studio-scroll print:divide-slate-200 print:border-slate-200 print:max-h-none print:overflow-visible">
                {citations.map((c) => (
                  <div key={c.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      {safeHttpUrl(c.url) ? (
                        <a
                          href={safeHttpUrl(c.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-teal-400 hover:underline inline-flex items-center gap-1 print:text-teal-700"
                        >
                          {c.title} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="font-semibold text-slate-200 print:text-slate-800">
                          {c.title}
                        </span>
                      )}
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0 print:bg-slate-100 print:text-slate-600">
                        {c.competitor_name} · {c.source_type}
                      </span>
                    </div>
                    <p className="text-slate-400 line-clamp-2 print:text-slate-600">
                      {c.snippet}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

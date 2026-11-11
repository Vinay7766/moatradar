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
import { getExportUrl } from "@/lib/api";
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

  const featureCompetitors = Array.from(
    new Set(
      dossier.feature_matrix.flatMap((row) =>
        Object.keys(row.competitor_support || {})
      )
    )
  );

  const filteredVoc =
    vocFilter === "all"
      ? dossier.voc_insights
      : dossier.voc_insights.filter((v) => v.sentiment === vocFilter);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header + Export Actions */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {productName} — Competitive Dossier
          </h2>
          <p className="text-xs text-slate-500">
            Snapshot generated {new Date(createdAt).toLocaleString()} ·{" "}
            {citations.length} verified sources
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <a
            href={getExportUrl(runId, "markdown")}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Markdown
          </a>
          <a
            href={getExportUrl(runId, "json")}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileJson className="w-3.5 h-3.5" />
            JSON
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Dossier views"
        className="flex overflow-x-auto border-b border-slate-200 bg-white px-2 print:hidden"
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
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? "border-teal-700 text-teal-800"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {activeTab === "brief" && (
          <div className="space-y-5">
            {diffSummary && diffSummary.has_changes && (
              <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 text-xs text-teal-900">
                <strong>Change Diff vs. Previous Snapshot:</strong>{" "}
                {diffSummary.headline}
              </div>
            )}
            <MarkdownBrief content={dossier.executive_brief_md} />
            {dossier.market_trends.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Key Market Trends
                </h3>
                <ul className="space-y-1.5 list-disc pl-5 text-sm text-slate-700">
                  {dossier.market_trends.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === "features" && (
          <div className="overflow-x-auto">
            {dossier.feature_matrix.length === 0 ? (
              <p className="text-sm text-slate-500">No feature matrix rows generated.</p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
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
                <tbody className="divide-y divide-slate-100">
                  {dossier.feature_matrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {row.capability}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold ${
                            row.importance === "high"
                              ? "bg-teal-100 text-teal-800"
                              : row.importance === "medium"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-slate-50 text-slate-500"
                          }`}
                        >
                          {row.importance}
                        </span>
                      </td>
                      {featureCompetitors.map((comp) => (
                        <td key={comp} className="py-2.5 px-3 text-slate-700">
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
                                className="inline-flex items-center gap-0.5 text-teal-700 hover:underline"
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
        )}

        {activeTab === "pricing" && (
          <div className="overflow-x-auto">
            {dossier.pricing_matrix.length === 0 ? (
              <p className="text-sm text-slate-500">No pricing entries captured.</p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold">Competitor</th>
                    <th className="py-2.5 px-3 font-semibold">Billing Model</th>
                    <th className="py-2.5 px-3 font-semibold">Free Tier</th>
                    <th className="py-2.5 px-3 font-semibold">Entry</th>
                    <th className="py-2.5 px-3 font-semibold">Mid Tier</th>
                    <th className="py-2.5 px-3 font-semibold">Enterprise</th>
                    <th className="py-2.5 px-3 font-semibold">Key Packaging Gates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dossier.pricing_matrix.map((pr, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 align-top">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {pr.competitor_name}
                        {safeHttpUrl(pr.pricing_url) && (
                          <a
                            href={safeHttpUrl(pr.pricing_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[11px] font-normal text-teal-700 hover:underline mt-0.5"
                          >
                            Pricing source
                          </a>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{pr.billing_model}</td>
                      <td className="py-2.5 px-3 text-slate-700">{pr.free_tier}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">{pr.entry_price}</td>
                      <td className="py-2.5 px-3 text-slate-700">{pr.mid_tier}</td>
                      <td className="py-2.5 px-3 text-slate-700">{pr.enterprise_tier}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {pr.key_packaging_gates.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "battlecards" && (
          <div className="space-y-5">
            {dossier.battlecards.map((bc, idx) => (
              <div
                key={idx}
                className="border border-slate-200 rounded-md p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {bc.competitor_name}
                    </h3>
                    <p className="text-xs text-slate-600">
                      <strong>ICP:</strong> {bc.target_icp} · <strong>Positioning:</strong>{" "}
                      {bc.positioning}
                    </p>
                  </div>
                  {safeHttpUrl(bc.website) && (
                    <a
                      href={safeHttpUrl(bc.website)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                    >
                      Website <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded bg-emerald-50/60 border border-emerald-200 p-3">
                    <p className="font-semibold text-emerald-900 mb-1">Strengths</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                      {bc.swot.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded bg-rose-50/60 border border-rose-200 p-3">
                    <p className="font-semibold text-rose-900 mb-1">Weaknesses</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                      {bc.swot.weaknesses.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded bg-sky-50/60 border border-sky-200 p-3">
                    <p className="font-semibold text-sky-900 mb-1">How to Win</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                      {bc.how_to_win.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded bg-amber-50/60 border border-amber-200 p-3">
                    <p className="font-semibold text-amber-900 mb-1">Landmines to Avoid</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                      {bc.landmines_to_avoid.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "voc" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {["all", "complaint", "praise", "switching_trigger"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setVocFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border ${
                    vocFilter === f
                      ? "bg-teal-700 text-white border-teal-700"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {f === "all" ? "All Signals" : f.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredVoc.map((v, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-md p-3.5 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {v.competitor_name} · {v.theme}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded uppercase text-[10px] font-semibold ${
                        v.sentiment === "complaint"
                          ? "bg-rose-100 text-rose-800"
                          : v.sentiment === "praise"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {v.sentiment.replace("_", " ")}
                    </span>
                  </div>
                  <blockquote className="text-slate-700 italic border-l-2 border-slate-300 pl-2.5">
                    &ldquo;{v.evidence_quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Platform: {v.platform.replace("_", " ")}</span>
                    {safeHttpUrl(v.source_url) && (
                      <a
                        href={safeHttpUrl(v.source_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                      >
                        Verify quote <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "opportunities" && (
          <div className="space-y-5">
            <OpportunityChart opportunities={dossier.opportunities} />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Prioritized PM Roadmap Opportunities
              </h3>
              {dossier.opportunities.map((opp, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-md p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {opp.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-medium">
                        Impact {opp.impact_score}/10
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        Effort {opp.effort_score}/10
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium">
                        {opp.horizon}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-700">
                    <strong>Recommended Bet:</strong> {opp.recommended_feature_or_bet}
                  </p>
                  <p className="text-slate-600">
                    <strong>Evidence:</strong> {opp.problem_evidence}
                  </p>
                </div>
              ))}
            </div>

            {dossier.momentum_signals.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Recent Momentum & Launch Signals
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dossier.momentum_signals.map((sig, idx) => (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {sig.competitor_name}
                        </span>
                        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {sig.signal_type}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800">{sig.headline}</p>
                      <p className="text-slate-600">{sig.takeaway}</p>
                      {safeHttpUrl(sig.source_url) && (
                        <a
                          href={safeHttpUrl(sig.source_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-teal-700 hover:underline"
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
        )}

        {activeTab === "diff_sources" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Snapshot Diff vs. Previous Run
              </h3>
              {!diffSummary || !diffSummary.has_changes ? (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
                  {diffSummary?.headline ||
                    "Initial baseline snapshot. Re-run this workspace later to track changes."}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-700 font-medium">
                    {diffSummary.headline}
                  </p>
                  <ul className="space-y-1.5">
                    {diffSummary.changes.map((c, idx) => (
                      <li
                        key={idx}
                        className="text-xs border border-slate-200 rounded p-2.5 flex items-center gap-2"
                      >
                        <span className="uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                          {c.change_type}
                        </span>
                        <span className="font-semibold text-slate-800">
                          [{c.category}] {c.target}:
                        </span>
                        <span className="text-slate-700">{c.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Verified External Evidence ({citations.length})
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-96 overflow-y-auto">
                {citations.map((c) => (
                  <div key={c.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      {safeHttpUrl(c.url) ? (
                        <a
                          href={safeHttpUrl(c.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
                        >
                          {c.title} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="font-semibold text-slate-800">{c.title}</span>
                      )}
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        {c.competitor_name} · {c.source_type}
                      </span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{c.snippet}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

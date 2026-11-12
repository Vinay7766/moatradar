"use client";

import { useState } from "react";
import { CheckCircle2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { CompetitorCandidate } from "@/lib/types";

interface HitlApprovalPanelProps {
  discovered: CompetitorCandidate[];
  onApprove: (competitors: CompetitorCandidate[]) => Promise<void>;
  isApproving: boolean;
}

export function HitlApprovalPanel({
  discovered,
  onApprove,
  isApproving,
}: HitlApprovalPanelProps) {
  const [candidates, setCandidates] = useState<CompetitorCandidate[]>(discovered);
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newCategory, setNewCategory] = useState<
    "direct" | "adjacent" | "substitute"
  >("direct");
  const [error, setError] = useState<string | null>(null);

  function removeItem(idx: number) {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCustomCompetitor() {
    setError(null);
    if (!newName.trim()) {
      setError("Enter a competitor name before adding.");
      return;
    }
    if (candidates.length >= 6) {
      setError("Maximum 6 competitors per deep-dive mission.");
      return;
    }
    setCandidates((prev) => [
      ...prev,
      {
        name: newName.trim(),
        website: newWebsite.trim(),
        category: newCategory,
        rationale: "Added by Product Manager at HITL checkpoint.",
      },
    ]);
    setNewName("");
    setNewWebsite("");
  }

  async function handleApprove() {
    if (candidates.length === 0) {
      setError("Keep at least 1 competitor before resuming research.");
      return;
    }
    await onApprove(candidates);
  }

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 shadow-lg print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-500/25">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Human-in-the-Loop Checkpoint: Confirm Competitors
            </h3>
            <p className="text-xs text-slate-400">
              LangGraph execution is paused in SQLite checkpoints. Edit the discovered list before specialist agents fan out.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleApprove}
          disabled={isApproving || candidates.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          {isApproving
            ? "Resuming Agents..."
            : `Approve (${candidates.length}) & Run Deep Dive`}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {candidates.map((c, idx) => (
          <div
            key={`${c.name}-${idx}`}
            className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100">
                  {c.name}
                </span>
                <span className="text-[11px] font-medium uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {c.category}
                </span>
              </div>
              {c.website && (
                <p className="text-xs text-teal-400 truncate mt-0.5">
                  {c.website}
                </p>
              )}
              {c.rationale && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {c.rationale}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              aria-label={`Remove ${c.name}`}
              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-amber-500/20 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-300">
            Add Competitor
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Competitor name"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-300">
            Website (optional)
          </label>
          <input
            type="url"
            value={newWebsite}
            onChange={(e) => setNewWebsite(e.target.value)}
            placeholder="https://competitor.com"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300">
            Type
          </label>
          <select
            value={newCategory}
            onChange={(e) =>
              setNewCategory(
                e.target.value as "direct" | "adjacent" | "substitute"
              )
            }
            className="mt-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
          >
            <option value="direct">Direct</option>
            <option value="adjacent">Adjacent</option>
            <option value="substitute">Substitute</option>
          </select>
        </div>
        <button
          type="button"
          onClick={addCustomCompetitor}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-400 font-medium">
          {error}
        </p>
      )}
    </section>
  );
}

"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { MissionRun } from "@/lib/types";

interface MissionProgressRibbonProps {
  run: MissionRun;
  eventCount: number;
  showTraceLogs: boolean;
  onToggleTraceLogs: () => void;
  onInspectXRay: () => void;
  onRetryMission?: () => Promise<void>;
  isRetrying?: boolean;
}

const STAGES = [
  { key: "discovering", label: "Discovery" },
  { key: "awaiting_approval", label: "HITL Gate" },
  { key: "researching", label: "Specialists" },
  { key: "verifying", label: "Critic Audit" },
  { key: "synthesizing", label: "Synthesis" },
  { key: "completed", label: "Done" },
] as const;

function getStageIndex(status: MissionRun["status"]): number {
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

export function MissionProgressRibbon({
  run,
  eventCount,
  showTraceLogs,
  onToggleTraceLogs,
  onInspectXRay,
  onRetryMission,
  isRetrying = false,
}: MissionProgressRibbonProps) {
  const isFailed = run.status === "failed";
  const currentIdx = getStageIndex(run.status);

  return (
    <section
      aria-label="Mission pipeline progress"
      className="rounded-xl border border-slate-800 bg-[#0f1623] px-4 py-3 shadow-md print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Clickable Stage Stepper */}
        <ol className="flex flex-wrap items-center gap-1.5">
          {STAGES.map((stage, idx) => {
            const isComplete =
              run.status === "completed" || (!isFailed && idx < currentIdx);
            const isActive =
              !isFailed && idx === currentIdx && run.status !== "completed";
            return (
              <li key={stage.key} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onInspectXRay}
                  title={`Inspect ${stage.label} in 3D Studio`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? stage.key === "awaiting_approval"
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        : "border-teal-500/50 bg-teal-500/15 text-teal-200"
                      : isComplete
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : "border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {isActive ? (
                    stage.key === "awaiting_approval" ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin" />
                    )
                  ) : isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  )}
                  <span>{stage.label}</span>
                </button>
                {idx < STAGES.length - 1 && (
                  <span className="text-slate-600 text-xs select-none" aria-hidden="true">
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Metrics & Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {run.status !== "completed" && run.status !== "failed" && (
            <span className="hidden sm:inline-block rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-300">
              {run.llm_provider}/{run.llm_model}
            </span>
          )}
          {run.critic_score !== null && (
            <span className="rounded-md bg-teal-500/15 border border-teal-500/35 px-2 py-1 font-medium text-teal-300">
              Critic {(run.critic_score * 100).toFixed(0)}%
            </span>
          )}

          <button
            type="button"
            onClick={onInspectXRay}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/15 border border-teal-500/40 px-2.5 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/25 transition-colors cursor-pointer"
          >
            <Network className="w-3.5 h-3.5 text-teal-400" />
            3D X-Ray
          </button>

          <button
            type="button"
            onClick={onToggleTraceLogs}
            aria-expanded={showTraceLogs}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            Logs ({eventCount})
            {showTraceLogs ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isFailed && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="break-words">
              {run.error_message ||
                "Mission failed. Inspect 3D Workflow X-Ray for node diagnostics."}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRetryMission && (
              <button
                type="button"
                disabled={isRetrying}
                onClick={() => void onRetryMission()}
                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`}
                />
                {isRetrying ? "Retrying..." : "Retry Stage"}
              </button>
            )}
            <button
              type="button"
              onClick={onInspectXRay}
              className="rounded-md border border-rose-500/40 bg-slate-900 px-2.5 py-1 font-medium text-rose-200 hover:bg-rose-950/70 cursor-pointer"
            >
              Inspect Broken Node
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

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
      className="rounded-lg border border-slate-200 bg-white px-4 py-3 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Clickable Stage Stepper */}
        <ol className="flex flex-wrap items-center gap-1.5">
          {STAGES.map((stage, idx) => {
            const isComplete =
              run.status === "completed" || (!isFailed && idx < currentIdx);
            const isActive = !isFailed && idx === currentIdx && run.status !== "completed";
            return (
              <li key={stage.key} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onInspectXRay}
                  title={`Inspect ${stage.label} in Workflow X-Ray`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? stage.key === "awaiting_approval"
                        ? "border-amber-400 bg-amber-50 text-amber-900"
                        : "border-teal-600 bg-teal-50 text-teal-900"
                      : isComplete
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {isActive ? (
                    stage.key === "awaiting_approval" ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin" />
                    )
                  ) : isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  )}
                  <span>{stage.label}</span>
                </button>
                {idx < STAGES.length - 1 && (
                  <span className="text-slate-300 text-xs select-none" aria-hidden="true">
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Metrics & Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="hidden sm:inline-block rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">
            {run.llm_provider}/{run.llm_model}
          </span>
          {run.critic_score !== null && (
            <span className="rounded bg-teal-50 border border-teal-200 px-2 py-1 font-medium text-teal-900">
              Critic {(run.critic_score * 100).toFixed(0)}%
            </span>
          )}

          <button
            type="button"
            onClick={onInspectXRay}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            <Network className="w-3.5 h-3.5 text-teal-400" />
            3D X-Ray
          </button>

          <button
            type="button"
            onClick={onToggleTraceLogs}
            aria-expanded={showTraceLogs}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
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
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span className="break-words">
              {run.error_message || "Mission failed. Inspect Workflow X-Ray for node diagnostics."}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRetryMission && (
              <button
                type="button"
                disabled={isRetrying}
                onClick={() => void onRetryMission()}
                className="inline-flex items-center gap-1 rounded bg-rose-700 px-2.5 py-1 font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
                {isRetrying ? "Retrying..." : "Retry Stage"}
              </button>
            )}
            <button
              type="button"
              onClick={onInspectXRay}
              className="rounded border border-rose-300 bg-white px-2.5 py-1 font-medium text-rose-900 hover:bg-rose-100"
            >
              Inspect Broken Node
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

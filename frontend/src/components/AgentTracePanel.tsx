"use client";

import { Activity, CheckCircle2, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { AgentEvent, MissionRun } from "@/lib/types";

interface AgentTracePanelProps {
  run: MissionRun;
  events: AgentEvent[];
}

function eventIcon(type: AgentEvent["event_type"]) {
  switch (type) {
    case "tool_call":
    case "tool_result":
      return <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    case "critic_review":
      return <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case "retry_loop":
      return <RefreshCw className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-teal-400 shrink-0" />;
  }
}

export function AgentTracePanel({ run, events }: AgentTracePanelProps) {
  const isActive = !["completed", "failed", "awaiting_approval"].includes(
    run.status
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0b111d] p-4 shadow-md print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              run.status === "completed"
                ? "bg-emerald-400"
                : run.status === "failed"
                  ? "bg-rose-400"
                  : run.status === "awaiting_approval"
                    ? "bg-amber-400"
                    : "bg-teal-400 animate-pulse"
            }`}
          />
          <h3 className="text-sm font-semibold text-slate-100">
            Live Agent Execution Trace
          </h3>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-teal-300 font-mono">
            {run.status}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Model:{" "}
            <strong className="font-mono text-slate-200">
              {run.llm_provider}/{run.llm_model}
            </strong>
          </span>
          {run.critic_score !== null && (
            <span>
              Critic Score:{" "}
              <strong className="text-teal-300">
                {(run.critic_score * 100).toFixed(0)}%
              </strong>
            </span>
          )}
          <span>Loops: {run.iteration_count}</span>
        </div>
      </div>

      {run.error_message && (
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-200">
          {run.error_message}
        </div>
      )}

      <ol className="mt-3 space-y-2 max-h-60 overflow-y-auto studio-scroll pr-1">
        {events.length === 0 ? (
          <li className="text-xs text-slate-500 py-2">
            {isActive
              ? "Connecting to agent SSE stream..."
              : "No trace events recorded."}
          </li>
        ) : (
          events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-2.5 text-xs border-l-2 border-slate-700 pl-2.5 py-0.5"
            >
              <span className="mt-0.5">{eventIcon(ev.event_type)}</span>
              <div className="min-w-0 flex-1">
                <span className="font-mono font-semibold text-teal-300 mr-2">
                  [{ev.node_name}]
                </span>
                <span className="text-slate-300">{ev.message}</span>
              </div>
              <span className="text-[11px] text-slate-500 shrink-0 font-mono">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

"use client";

import {
  Database,
  FileText,
  Menu,
  MessageSquare,
  Network,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
} from "lucide-react";
import {
  DossierSnapshot,
  MissionRun,
  Workspace,
  WorkspaceMonitor,
} from "@/lib/types";

export type StudioView = "desk" | "xray" | "knowledge";

interface StudioHeaderProps {
  selectedWorkspace: Workspace | null;
  activeRun: MissionRun | null;
  activeView: StudioView;
  onChangeView: (view: StudioView, xrayMode?: "live" | "tutor") => void;
  snapshots: DossierSnapshot[];
  activeSnapshot: DossierSnapshot | null;
  onSelectSnapshot: (snap: DossierSnapshot) => void;
  onTriggerRerun: () => void;
  documentsCount: number;
  monitor: WorkspaceMonitor | null;
  isCopilotOpen: boolean;
  onToggleCopilot: () => void;
  onOpenMobileSidebar: () => void;
}

export function StudioHeader({
  selectedWorkspace,
  activeRun,
  activeView,
  onChangeView,
  snapshots,
  activeSnapshot,
  onSelectSnapshot,
  onTriggerRerun,
  documentsCount,
  monitor,
  isCopilotOpen,
  onToggleCopilot,
  onOpenMobileSidebar,
}: StudioHeaderProps) {
  const monitorActive = monitor && monitor.interval !== "off";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#0b111d]/90 backdrop-blur-md px-4 lg:px-6 py-2.5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1640px] mx-auto">
        {/* Left: Mobile Sidebar Toggle + Active Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Open saved workspaces menu"
            className="lg:hidden p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100 truncate max-w-[200px] sm:max-w-xs">
                {selectedWorkspace
                  ? selectedWorkspace.product_name
                  : "New Competitive Mission"}
              </h2>
              {activeRun && (
                <button
                  type="button"
                  onClick={() => onChangeView("xray", "live")}
                  title="Inspect run in 3D Workflow Studio"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
                    activeRun.status === "failed"
                      ? "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                      : activeRun.status === "completed"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                        : activeRun.status === "awaiting_approval"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                          : "border-teal-500/40 bg-teal-500/15 text-teal-300 hover:bg-teal-500/25"
                  }`}
                >
                  {!["completed", "failed", "awaiting_approval"].includes(
                    activeRun.status
                  ) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  )}
                  {activeRun.status.replace("_", " ")}
                </button>
              )}
            </div>
            {selectedWorkspace && (
              <p className="text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-sm">
                {selectedWorkspace.target_segment}
              </p>
            )}
          </div>
        </div>

        {/* Center: Primary Studio View Switcher */}
        <div
          role="tablist"
          aria-label="Studio sections"
          className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-950/90 p-1 border border-slate-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "desk"}
            onClick={() => onChangeView("desk")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeView === "desk"
                ? "bg-slate-800 text-slate-100 shadow-xs border border-slate-700/80"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-teal-400" />
            Intelligence Desk
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeView === "xray"}
            onClick={() => onChangeView("xray", activeRun ? "live" : "tutor")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeView === "xray"
                ? "bg-teal-500/20 text-teal-200 border border-teal-500/40 shadow-xs"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <Network className="w-3.5 h-3.5 text-teal-400" />
            3D Workflow &amp; Tutor
          </button>

          {selectedWorkspace && (
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "knowledge"}
              onClick={() => onChangeView("knowledge")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeView === "knowledge"
                  ? "bg-slate-800 text-slate-100 shadow-xs border border-slate-700/80"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-teal-400" />
              Evidence &amp; Monitors
              {(documentsCount > 0 || monitorActive) && (
                <span className="rounded-full bg-teal-500/20 border border-teal-500/30 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">
                  {documentsCount}
                  {monitorActive ? ` · ${monitor.interval}` : ""}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right: Contextual Desk Controls Only (Keys lives exclusively in left rail) */}
        <div className="flex flex-wrap items-center gap-2 min-h-[32px]">
          {snapshots.length > 0 && activeView === "desk" && (
            <select
              aria-label="Select snapshot version"
              value={activeSnapshot?.id || ""}
              onChange={(e) => {
                const found = snapshots.find((s) => s.id === e.target.value);
                if (found) onSelectSnapshot(found);
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              {snapshots.map((s, idx) => (
                <option key={s.id} value={s.id}>
                  Snapshot #{snapshots.length - idx} ·{" "}
                  {new Date(s.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}

          {selectedWorkspace && activeView === "desk" && (
            <button
              type="button"
              onClick={onTriggerRerun}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/15 px-2.5 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/25 transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Re-run</span>
            </button>
          )}

          {selectedWorkspace && activeView === "desk" && snapshots.length > 0 && (
            <button
              type="button"
              onClick={onToggleCopilot}
              aria-pressed={isCopilotOpen}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                isCopilotOpen
                  ? "border-teal-500 bg-teal-500 text-slate-950"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {isCopilotOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
              <MessageSquare className="w-3.5 h-3.5 sm:hidden" />
              <span className="hidden sm:inline">RAG Copilot</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

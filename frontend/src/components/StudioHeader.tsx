"use client";

import {
  Database,
  FileText,
  GraduationCap,
  KeyRound,
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
  byokKeyCount: number;
  onOpenSettings: () => void;
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
  byokKeyCount,
  onOpenSettings,
  onOpenMobileSidebar,
}: StudioHeaderProps) {
  const monitorActive = monitor && monitor.interval !== "off";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-4 lg:px-6 py-2.5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1600px] mx-auto">
        {/* Left: Mobile Sidebar Toggle + Active Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Open saved workspaces menu"
            className="lg:hidden p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                {selectedWorkspace
                  ? selectedWorkspace.product_name
                  : "New Competitive Mission"}
              </h2>
              {activeRun && (
                <button
                  type="button"
                  onClick={() => onChangeView("xray", "live")}
                  title="Inspect run in Workflow X-Ray"
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                    activeRun.status === "failed"
                      ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                      : activeRun.status === "completed"
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : activeRun.status === "awaiting_approval"
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : "bg-teal-100 text-teal-800 hover:bg-teal-200"
                  }`}
                >
                  {!["completed", "failed", "awaiting_approval"].includes(
                    activeRun.status
                  ) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                  )}
                  {activeRun.status.replace("_", " ")}
                </button>
              )}
            </div>
            {selectedWorkspace && (
              <p className="text-[11px] text-slate-500 truncate max-w-[240px] sm:max-w-sm">
                {selectedWorkspace.target_segment}
              </p>
            )}
          </div>
        </div>

        {/* Center: Primary Studio Navigation */}
        <div
          role="tablist"
          aria-label="Studio sections"
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 border border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "desk"}
            onClick={() => onChangeView("desk")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeView === "desk"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-teal-700" />
            Intelligence Desk
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeView === "xray"}
            onClick={() => onChangeView("xray", activeRun ? "live" : "tutor")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeView === "xray"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Network
              className={`w-3.5 h-3.5 ${
                activeView === "xray" ? "text-teal-400" : "text-teal-700"
              }`}
            />
            Workflow X-Ray &amp; Tutor
          </button>

          {selectedWorkspace && (
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "knowledge"}
              onClick={() => onChangeView("knowledge")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activeView === "knowledge"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-teal-700" />
              Evidence &amp; Monitors
              {(documentsCount > 0 || monitorActive) && (
                <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                  {documentsCount}
                  {monitorActive ? ` · ${monitor.interval}` : ""}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right: Quick Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {snapshots.length > 0 && activeView === "desk" && (
            <select
              aria-label="Select snapshot version"
              value={activeSnapshot?.id || ""}
              onChange={(e) => {
                const found = snapshots.find((s) => s.id === e.target.value);
                if (found) onSelectSnapshot(found);
              }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-teal-600 focus:outline-none"
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
              className="inline-flex items-center gap-1.5 rounded-md border border-teal-700 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
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
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isCopilotOpen
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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

          {activeView !== "xray" && (
            <button
              type="button"
              onClick={() => onChangeView("xray", "tutor")}
              className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
              AI Tutor
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-teal-700" />
            <span className="hidden sm:inline">Keys</span>
            {byokKeyCount > 0 && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                {byokKeyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

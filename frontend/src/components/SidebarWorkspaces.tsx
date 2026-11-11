"use client";

import {
  FolderKanban,
  GraduationCap,
  KeyRound,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Workspace } from "@/lib/types";

interface SidebarWorkspacesProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onNewMission: () => void;
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onOpenWorkflowXRay?: (mode: "live" | "tutor") => void;
  activeView?: "dossier" | "xray";
  byokKeyCount?: number;
  hasCustomOllamaUrl?: boolean;
}

export function SidebarWorkspaces({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onNewMission,
  onRefresh,
  onOpenSettings,
  onOpenWorkflowXRay,
  activeView = "dossier",
  byokKeyCount = 0,
  hasCustomOllamaUrl = false,
}: SidebarWorkspacesProps) {
  return (
    <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            MoatRadar
          </p>
          <h1 className="text-base font-semibold text-slate-900">
            Competitive Intel Desk
          </h1>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh workspaces"
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-slate-100 space-y-2">
        <button
          type="button"
          onClick={onNewMission}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Intelligence Mission
        </button>

        {onOpenWorkflowXRay && (
          <button
            type="button"
            onClick={() => onOpenWorkflowXRay("tutor")}
            className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
              activeView === "xray"
                ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                : "border-indigo-200 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100"
            }`}
          >
            <span className="flex items-center gap-1.5 truncate">
              <GraduationCap className="w-4 h-4 shrink-0 text-indigo-700" />
              <span className="truncate">Interactive AI Tutor &amp; X-Ray</span>
            </span>
            <span className="shrink-0 rounded bg-indigo-200/70 px-1.5 py-0.5 text-[10px] font-bold text-indigo-900">
              3D
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-64 lg:max-h-none">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Saved Workspaces ({workspaces.length})
        </div>

        {workspaces.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No missions yet. Launch your first competitive teardown.
          </div>
        ) : (
          workspaces.map((ws) => {
            const active = ws.id === selectedWorkspaceId;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => onSelectWorkspace(ws)}
                className={`w-full text-left rounded-md px-3 py-2.5 border transition-colors ${
                  active
                    ? "bg-teal-50/70 border-teal-300 text-slate-900"
                    : "bg-white border-transparent hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="w-4 h-4 shrink-0 text-teal-700" />
                    <span className="text-sm font-medium truncate">
                      {ws.product_name}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                    {ws.snapshot_count || 0} snap
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 truncate">
                  {ws.target_segment}
                </p>
              </button>
            );
          })
        )}
      </div>

      {onOpenSettings && (
        <div className="p-3 border-t border-slate-200 bg-slate-50/70">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-teal-700" />
              Settings (BYOK Keys)
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                byokKeyCount > 0 || hasCustomOllamaUrl
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {byokKeyCount > 0
                ? `${byokKeyCount} active`
                : hasCustomOllamaUrl
                  ? "Ollama URL"
                  : "0 keys"}
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}

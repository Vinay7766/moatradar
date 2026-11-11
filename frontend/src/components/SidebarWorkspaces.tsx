"use client";

import { FolderKanban, Plus, RefreshCw } from "lucide-react";
import { Workspace } from "@/lib/types";

interface SidebarWorkspacesProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onNewMission: () => void;
  onRefresh: () => void;
}

export function SidebarWorkspaces({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onNewMission,
  onRefresh,
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

      <div className="p-3 border-b border-slate-100">
        <button
          type="button"
          onClick={onNewMission}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Intelligence Mission
        </button>
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
    </aside>
  );
}

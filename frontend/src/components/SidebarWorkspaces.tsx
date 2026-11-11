"use client";

import { useMemo, useState } from "react";
import {
  Check,
  FolderKanban,
  GraduationCap,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Workspace } from "@/lib/types";

interface SidebarWorkspacesProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onNewMission: () => void;
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onOpenWorkflowXRay?: (mode: "live" | "tutor") => void;
  activeView?: "desk" | "xray" | "knowledge";
  byokKeyCount?: number;
  hasCustomOllamaUrl?: boolean;
  deletingWorkspaceId?: string | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

function statusDotColor(status?: Workspace["latest_run_status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "failed":
      return "bg-rose-500";
    case "awaiting_approval":
      return "bg-amber-500";
    case "discovering":
    case "researching":
    case "verifying":
    case "synthesizing":
      return "bg-teal-500 animate-pulse";
    default:
      return "bg-slate-300";
  }
}

export function SidebarWorkspaces({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onNewMission,
  onRefresh,
  onOpenSettings,
  onOpenWorkflowXRay,
  activeView = "desk",
  byokKeyCount = 0,
  hasCustomOllamaUrl = false,
  deletingWorkspaceId = null,
  isMobileOpen = false,
  onCloseMobile,
}: SidebarWorkspacesProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const filteredWorkspaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (ws) =>
        ws.product_name.toLowerCase().includes(q) ||
        ws.target_segment.toLowerCase().includes(q) ||
        ws.name.toLowerCase().includes(q)
    );
  }, [workspaces, searchQuery]);

  async function confirmDelete(workspaceId: string) {
    try {
      await onDeleteWorkspace(workspaceId);
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] lg:hidden print:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Workspaces sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 print:hidden ${
          isMobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-teal-700">
              MoatRadar
            </p>
            <h1 className="text-base font-semibold text-slate-900">
              Competitive Intel Studio
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh workspaces"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close sidebar"
                className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="p-3 border-b border-slate-100 space-y-2">
          <button
            type="button"
            onClick={() => {
              onNewMission();
              onCloseMobile?.();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Intelligence Mission
          </button>

          {onOpenWorkflowXRay && (
            <button
              type="button"
              onClick={() => {
                onOpenWorkflowXRay("tutor");
                onCloseMobile?.();
              }}
              className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                activeView === "xray"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <GraduationCap
                  className={`w-4 h-4 shrink-0 ${
                    activeView === "xray" ? "text-teal-400" : "text-teal-700"
                  }`}
                />
                <span className="truncate">Interactive AI Tutor &amp; X-Ray</span>
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  activeView === "xray"
                    ? "bg-teal-500/20 text-teal-300"
                    : "bg-teal-100 text-teal-800"
                }`}
              >
                3D
              </span>
            </button>
          )}
        </div>

        <div className="px-3 pt-2.5 pb-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter workspaces..."
              aria-label="Filter saved workspaces"
              className="w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear workspace filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center justify-between">
            <span>Saved Workspaces</span>
            <span>{filteredWorkspaces.length}</span>
          </div>

          {workspaces.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No workspaces yet. Launch a competitive mission or explore the AI Tutor.
            </div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No workspaces match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <ul role="list" className="space-y-1">
              {filteredWorkspaces.map((ws) => {
                const active = ws.id === selectedWorkspaceId;
                const isConfirming = confirmingId === ws.id;
                const isDeleting = deletingWorkspaceId === ws.id;

                return (
                  <li key={ws.id} className="group relative">
                    {isConfirming ? (
                      <div
                        role="alertdialog"
                        aria-label={`Confirm delete ${ws.product_name}`}
                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs space-y-2"
                      >
                        <p className="font-medium text-rose-950 leading-snug">
                          Delete <span className="font-semibold">{ws.product_name}</span> and all snapshots?
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => void confirmDelete(ws.id)}
                            className="inline-flex items-center gap-1 rounded bg-rose-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            {isDeleting ? "Deleting..." : "Confirm"}
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => setConfirmingId(null)}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`flex items-start justify-between gap-1.5 rounded-md border px-2.5 py-2 transition-colors ${
                          active
                            ? "bg-teal-50/80 border-teal-300 text-slate-900"
                            : "bg-white border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectWorkspace(ws);
                            onCloseMobile?.();
                          }}
                          className="min-w-0 flex-1 text-left focus:outline-none"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor(
                                ws.latest_run_status
                              )}`}
                              title={
                                ws.latest_run_status
                                  ? `Latest run: ${ws.latest_run_status}`
                                  : "No runs yet"
                              }
                            />
                            <FolderKanban className="w-3.5 h-3.5 shrink-0 text-teal-700" />
                            <span className="text-xs font-semibold truncate">
                              {ws.product_name}
                            </span>
                          </div>
                          <p className="mt-1 pl-4 text-[11px] text-slate-500 truncate">
                            {ws.target_segment}
                          </p>
                        </button>

                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {ws.snapshot_count || 0}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmingId(ws.id);
                            }}
                            aria-label={`Delete workspace ${ws.product_name}`}
                            title={`Delete ${ws.product_name}`}
                            className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {onOpenSettings && (
          <div className="p-3 border-t border-slate-200 bg-slate-50/80">
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onCloseMobile?.();
              }}
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
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Database,
  FileText,
  FolderKanban,
  KeyRound,
  Loader2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Workspace } from "@/lib/types";
import type { StudioView } from "./StudioHeader";

interface SidebarWorkspacesProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onNewMission: () => void;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
  onChangeView?: (view: StudioView, xrayMode?: "live" | "tutor") => void;
  activeView?: StudioView;
  hasSelectedWorkspace?: boolean;
  byokKeyCount?: number;
  hasCustomOllamaUrl?: boolean;
  deletingWorkspaceId?: string | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

function statusDotColor(status?: Workspace["latest_run_status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
    case "failed":
      return "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]";
    case "awaiting_approval":
      return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
    case "discovering":
    case "researching":
    case "verifying":
    case "synthesizing":
      return "bg-teal-400 animate-pulse shadow-[0_0_8px_rgba(45,212,191,0.75)]";
    default:
      return "bg-slate-600";
  }
}

export function SidebarWorkspaces({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onDeleteWorkspace,
  onNewMission,
  onOpenSettings,
  onChangeView,
  activeView = "desk",
  hasSelectedWorkspace = false,
  byokKeyCount = 0,
  hasCustomOllamaUrl = false,
  deletingWorkspaceId = null,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
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

  const navItems: {
    id: StudioView;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    disabled?: boolean;
  }[] = [
    {
      id: "desk",
      label: "Intelligence Desk",
      shortLabel: "Desk",
      icon: <FileText className="w-4 h-4 shrink-0" />,
    },
    {
      id: "xray",
      label: "3D Workflow & Tutor",
      shortLabel: "3D",
      icon: <Network className="w-4 h-4 shrink-0" />,
    },
    {
      id: "knowledge",
      label: "Evidence & Monitors",
      shortLabel: "Docs",
      icon: <Database className="w-4 h-4 shrink-0" />,
      disabled: !hasSelectedWorkspace,
    },
  ];

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-xs lg:hidden print:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Workspaces sidebar"
        className={`fixed inset-y-0 left-0 z-40 shrink-0 border-r border-slate-800/90 bg-[#0b111d] flex flex-col overflow-x-hidden transition-all duration-200 lg:static lg:translate-x-0 print:hidden ${
          isCollapsed ? "lg:w-[68px] w-72" : "w-72"
        } ${isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
      >
        {/* Top Brand + Collapse Control */}
        <div
          className={`border-b border-slate-800/80 flex items-center gap-2 ${
            isCollapsed ? "lg:justify-center lg:px-2.5 py-2.5 px-3.5" : "justify-between px-3.5 py-3"
          }`}
        >
          {!isCollapsed ? (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.85)]" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-teal-400">
                  MoatRadar
                </p>
              </div>
              <h1 className="text-sm font-semibold text-slate-100 truncate mt-0.5">
                Intelligence Studio
              </h1>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="mx-auto w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center text-teal-400 hover:border-teal-500/60 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {!isCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  className="hidden lg:inline-flex p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              )}
              {onCloseMobile && (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close sidebar"
                  className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Studio Navigation Section */}
        <div
          className={`p-2.5 border-b border-slate-800/80 ${
            isCollapsed ? "flex flex-col items-center gap-2" : "space-y-1.5"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNewMission();
              onCloseMobile?.();
            }}
            title="New Intelligence Mission"
            className={`flex items-center justify-center gap-2 bg-teal-500 text-xs font-semibold text-slate-950 shadow-sm shadow-teal-500/20 hover:bg-teal-400 transition-colors cursor-pointer ${
              isCollapsed
                ? "lg:w-10 lg:h-10 lg:p-0 lg:rounded-xl lg:mx-auto w-full rounded-lg px-3 py-2"
                : "w-full rounded-lg px-3 py-2"
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>New Mission</span>}
          </button>

          {onChangeView && (
            <nav
              aria-label="Studio workspace views"
              className={`w-full pt-1 ${isCollapsed ? "flex flex-col items-center gap-1.5" : "space-y-1"}`}
            >
              {navItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      onChangeView(item.id);
                      onCloseMobile?.();
                    }}
                    title={item.disabled ? `${item.label} (select a workspace first)` : item.label}
                    className={`flex items-center text-xs font-medium transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                      isCollapsed
                        ? "lg:w-10 lg:h-10 lg:p-0 lg:justify-center lg:rounded-xl lg:mx-auto w-full gap-2.5 rounded-lg px-2.5 py-2"
                        : "w-full gap-2.5 rounded-lg px-2.5 py-2"
                    } ${
                      isActive
                        ? "bg-teal-500/15 text-teal-300 border border-teal-500/30"
                        : "text-slate-400 border border-transparent hover:text-slate-100 hover:bg-slate-800/70"
                    }`}
                  >
                    <span className={`shrink-0 ${isActive ? "text-teal-400" : "text-slate-400"}`}>
                      {item.icon}
                    </span>
                    {!isCollapsed && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {!isCollapsed && item.id === "xray" && (
                      <span className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-teal-300">
                        3D
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Search Filter */}
        {!isCollapsed && (
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter workspaces..."
                aria-label="Filter saved workspaces"
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-teal-500/70 focus:bg-slate-950 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear workspace filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Saved Workspaces List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden studio-scroll px-2.5 py-2 space-y-1">
          {!isCollapsed && (
            <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Saved Workspaces</span>
              <span className="font-mono text-slate-400">{filteredWorkspaces.length}</span>
            </div>
          )}

          {workspaces.length === 0 ? (
            !isCollapsed && (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                No workspaces yet. Launch a competitive mission or explore 3D Studio.
              </div>
            )
          ) : filteredWorkspaces.length === 0 ? (
            !isCollapsed && (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                No matches for &ldquo;{searchQuery}&rdquo;.
              </div>
            )
          ) : (
            <ul role="list" className={isCollapsed ? "space-y-2 flex flex-col items-center" : "space-y-1"}>
              {filteredWorkspaces.map((ws) => {
                const active = ws.id === selectedWorkspaceId;
                const isConfirming = confirmingId === ws.id;
                const isDeleting = deletingWorkspaceId === ws.id;

                if (isCollapsed) {
                  return (
                    <li key={ws.id} className="w-full flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectWorkspace(ws);
                          onCloseMobile?.();
                        }}
                        title={`${ws.product_name} (${ws.snapshot_count || 0} snapshots)`}
                        className={`relative w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                          active
                            ? "border-teal-500/60 bg-teal-500/15 text-teal-300"
                            : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-100"
                        }`}
                      >
                        <span className="text-[11px] font-bold uppercase tracking-tight">
                          {ws.product_name.slice(0, 2)}
                        </span>
                        <span
                          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0b111d] ${statusDotColor(
                            ws.latest_run_status
                          )}`}
                        />
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={ws.id} className="group relative">
                    {isConfirming ? (
                      <div
                        role="alertdialog"
                        aria-label={`Confirm delete ${ws.product_name}`}
                        className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2.5 text-xs space-y-2"
                      >
                        <p className="font-medium text-rose-100 leading-snug">
                          Delete <span className="font-semibold text-white">{ws.product_name}</span> &amp; snapshots?
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => void confirmDelete(ws.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                            className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`flex items-start justify-between gap-1.5 rounded-lg border px-2.5 py-2 transition-all ${
                          active
                            ? "border-teal-500/40 bg-teal-500/10 text-slate-100 shadow-xs"
                            : "border-transparent bg-transparent hover:border-slate-800 hover:bg-slate-900/70 text-slate-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectWorkspace(ws);
                            onCloseMobile?.();
                          }}
                          className="min-w-0 flex-1 text-left focus:outline-none cursor-pointer"
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
                            <FolderKanban
                              className={`w-3.5 h-3.5 shrink-0 ${
                                active ? "text-teal-400" : "text-slate-500"
                              }`}
                            />
                            <span className="text-xs font-semibold truncate">
                              {ws.product_name}
                            </span>
                          </div>
                          <p className="mt-1 pl-4 text-[11px] text-slate-500 truncate">
                            {ws.target_segment}
                          </p>
                        </button>

                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
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
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 opacity-85 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
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

        {/* Single Bottom API Keys Trigger */}
        {onOpenSettings && (
          <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/40 flex justify-center">
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onCloseMobile?.();
              }}
              title="API Keys & Local Ollama Settings"
              className={`flex items-center gap-2 border border-slate-800 bg-slate-900/90 text-xs font-medium text-slate-200 hover:border-teal-500/40 hover:bg-slate-800/80 transition-colors cursor-pointer ${
                isCollapsed
                  ? "lg:w-10 lg:h-10 lg:p-0 lg:rounded-xl lg:justify-center lg:mx-auto w-full rounded-lg px-3 py-2 justify-between"
                  : "w-full rounded-lg px-3 py-2 justify-between"
              }`}
            >
              <span className="relative flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-400 shrink-0" />
                {!isCollapsed && <span>API Keys &amp; Ollama</span>}
                {isCollapsed && (byokKeyCount > 0 || hasCustomOllamaUrl) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </span>
              {!isCollapsed && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    byokKeyCount > 0 || hasCustomOllamaUrl
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {byokKeyCount > 0
                    ? `${byokKeyCount} active`
                    : hasCustomOllamaUrl
                      ? "Ollama URL"
                      : "0 keys"}
                </span>
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

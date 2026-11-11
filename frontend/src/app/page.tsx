"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  GraduationCap,
  KeyRound,
  Network,
  RotateCw,
} from "lucide-react";
import { AgentTracePanel } from "@/components/AgentTracePanel";
import { CustomEvidencePanel } from "@/components/CustomEvidencePanel";
import { DossierTabs } from "@/components/DossierTabs";
import { HitlApprovalPanel } from "@/components/HitlApprovalPanel";
import { MissionLauncher } from "@/components/MissionLauncher";
import { MonitorSettingsPanel } from "@/components/MonitorSettingsPanel";
import { RagChatPanel } from "@/components/RagChatPanel";
import { SettingsModal } from "@/components/SettingsModal";
import { SidebarWorkspaces } from "@/components/SidebarWorkspaces";
import { WorkflowXRay } from "@/components/WorkflowXRay";
import {
  approveCompetitors,
  deleteWorkspaceDocument,
  fetchChatHistory,
  fetchMission,
  fetchProviders,
  fetchWorkspaceDocuments,
  fetchWorkspaceMonitor,
  fetchWorkspaces,
  fetchWorkspaceSnapshots,
  retryMission,
  sendWorkspaceChat,
  startMission,
  subscribeMissionEvents,
  updateWorkspaceMonitor,
  uploadWorkspaceDocument,
} from "@/lib/api";
import {
  clearByokConfig,
  createEmptyByokConfig,
  getActiveByokProviders,
  loadByokConfig,
  saveByokConfig,
} from "@/lib/byokStorage";
import {
  AgentEvent,
  ByokConfig,
  ChatMessage,
  CompetitorCandidate,
  CustomDocument,
  DossierSnapshot,
  MissionRun,
  MonitorInterval,
  ProviderInfo,
  SourceCitation,
  SupportedProvider,
  Workspace,
  WorkspaceMonitor,
} from "@/lib/types";

function pickDefaultProvider(
  providers: ProviderInfo[],
  defaultProvider: SupportedProvider | "",
  defaultModel: string,
  byok: ByokConfig
): { provider: SupportedProvider | ""; model: string } {
  const activeByok = getActiveByokProviders(byok);
  const envProvider = providers.find(
    (p) => p.provider === defaultProvider && p.configured
  );
  if (envProvider) {
    return {
      provider: envProvider.provider,
      model: defaultModel || envProvider.default_model,
    };
  }
  const firstReady = providers.find((p) => p.configured);
  if (firstReady) {
    return {
      provider: firstReady.provider,
      model: firstReady.default_model,
    };
  }
  const firstByok = providers.find((p) => activeByok.includes(p.provider));
  if (firstByok) {
    return {
      provider: firstByok.provider,
      model: firstByok.default_model,
    };
  }
  return { provider: "", model: "" };
}

export default function HomePage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<
    SupportedProvider | ""
  >("");
  const [selectedModel, setSelectedModel] = useState("");

  const [byokConfig, setByokConfig] = useState<ByokConfig>(() =>
    createEmptyByokConfig()
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [mainView, setMainView] = useState<"dossier" | "xray">("dossier");
  const [xrayDefaultMode, setXrayDefaultMode] = useState<"live" | "tutor">(
    "live"
  );

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null
  );
  const [snapshots, setSnapshots] = useState<DossierSnapshot[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<DossierSnapshot | null>(
    null
  );
  const [activeRun, setActiveRun] = useState<MissionRun | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [citations, setCitations] = useState<SourceCitation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [workspaceDocs, setWorkspaceDocs] = useState<CustomDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [workspaceMonitor, setWorkspaceMonitor] =
    useState<WorkspaceMonitor | null>(null);
  const [isLoadingMonitor, setIsLoadingMonitor] = useState(false);

  const [showLauncher, setShowLauncher] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const activeByokProviders = useMemo(
    () => getActiveByokProviders(byokConfig),
    [byokConfig]
  );

  const effectiveProviders = useMemo(
    () =>
      providers.map((p) => ({
        ...p,
        configured:
          p.configured ||
          (p.provider !== "ollama" && activeByokProviders.includes(p.provider)),
      })),
    [providers, activeByokProviders]
  );

  const refreshProvidersAndWorkspaces = useCallback(
    async (
      byokOverride?: ByokConfig,
      providerHint?: SupportedProvider | ""
    ) => {
      const currentByok = byokOverride ?? loadByokConfig();
      const hint =
        providerHint ||
        getActiveByokProviders(currentByok)[0] ||
        "";
      const [provData, wsData] = await Promise.all([
        fetchProviders(hint),
        fetchWorkspaces(),
      ]);
      setBannerError(null);
      setByokConfig(currentByok);
      setProviders(provData.providers);
      const picked = pickDefaultProvider(
        provData.providers,
        provData.default_provider,
        provData.default_model,
        currentByok
      );
      setSelectedProvider((prev) => {
        if (prev) {
          const stillReady = provData.providers.find(
            (p) =>
              p.provider === prev &&
              (p.configured ||
                (p.provider !== "ollama" &&
                  getActiveByokProviders(currentByok).includes(p.provider)))
          );
          if (stillReady) return prev;
        }
        return picked.provider;
      });
      setSelectedModel((prev) => (prev.trim() ? prev : picked.model));
      setWorkspaces(wsData.workspaces);
    },
    []
  );

  const loadInitialData = useCallback(async () => {
    try {
      await refreshProvidersAndWorkspaces();
    } catch (err) {
      setBannerError(
        err instanceof Error
          ? `${err.message} — Make sure FastAPI backend is running on port 8000.`
          : "Cannot reach backend API."
      );
    }
  }, [refreshProvidersAndWorkspaces]);

  useEffect(() => {
    let active = true;
    const storedByok = loadByokConfig();
    const hint = getActiveByokProviders(storedByok)[0] || "";
    Promise.all([fetchProviders(hint), fetchWorkspaces()])
      .then(([provData, wsData]) => {
        if (!active) return;
        setByokConfig(storedByok);
        setBannerError(null);
        setProviders(provData.providers);
        const picked = pickDefaultProvider(
          provData.providers,
          provData.default_provider,
          provData.default_model,
          storedByok
        );
        setSelectedProvider(picked.provider);
        setSelectedModel(picked.model);
        setWorkspaces(wsData.workspaces);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setByokConfig(storedByok);
        setBannerError(
          err instanceof Error
            ? `${err.message} — Make sure FastAPI backend is running on port 8000.`
            : "Cannot reach backend API."
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const loadWorkspaceDetails = useCallback(async (ws: Workspace) => {
    setSelectedWorkspace(ws);
    setShowLauncher(false);
    setMainView("dossier");
    setBannerError(null);
    setIsLoadingDocs(true);
    setIsLoadingMonitor(true);
    try {
      const [snapData, chatData, docsRes, monitorRes] = await Promise.all([
        fetchWorkspaceSnapshots(ws.id),
        fetchChatHistory(ws.id),
        fetchWorkspaceDocuments(ws.id).catch(() => ({ documents: [] })),
        fetchWorkspaceMonitor(ws.id).catch(() => null),
      ]);
      setSnapshots(snapData.snapshots);
      setChatMessages(chatData.messages);
      setWorkspaceDocs(docsRes.documents);
      setWorkspaceMonitor(monitorRes);

      const latestSnap = snapData.snapshots[0] || null;
      setActiveSnapshot(latestSnap);

      const runIdToLoad = latestSnap?.run_id || ws.latest_run_id;
      if (runIdToLoad) {
        const mission = await fetchMission(runIdToLoad);
        setActiveRun(mission.run);
        setEvents(mission.events);
        setCitations(mission.citations);
      } else {
        setActiveRun(null);
        setEvents([]);
        setCitations([]);
      }
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to load workspace."
      );
    } finally {
      setIsLoadingDocs(false);
      setIsLoadingMonitor(false);
    }
  }, []);

  // Live SSE + status polling while a mission is active
  useEffect(() => {
    if (!activeRun) return;
    if (["completed", "failed"].includes(activeRun.status)) return;

    const unsubscribe = subscribeMissionEvents(activeRun.id, (ev) => {
      setEvents((prev) =>
        prev.some((p) => p.id === ev.id) ? prev : [...prev, ev]
      );
    });

    const interval = setInterval(async () => {
      try {
        const res = await fetchMission(activeRun.id);
        setActiveRun(res.run);
        setCitations(res.citations);
        if (res.events.length > 0) {
          setEvents(res.events);
        }
        if (res.snapshot) {
          setActiveSnapshot(res.snapshot);
          if (selectedWorkspace) {
            const wsSnaps = await fetchWorkspaceSnapshots(selectedWorkspace.id);
            setSnapshots(wsSnaps.snapshots);
            const wsList = await fetchWorkspaces();
            setWorkspaces(wsList.workspaces);
          }
        }
      } catch {
        // ignore transient polling glitches
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [activeRun, selectedWorkspace]);

  async function handleLaunch(payload: {
    product_name: string;
    product_description: string;
    target_segment: string;
    seed_competitors: string[];
  }) {
    if (!selectedProvider || !selectedModel.trim()) {
      throw new Error("Select an LLM provider and enter a model name.");
    }
    setIsLaunching(true);
    setBannerError(null);
    try {
      const res = await startMission({
        workspace_id: selectedWorkspace?.id || null,
        ...payload,
        llm_provider: selectedProvider,
        llm_model: selectedModel.trim(),
      });
      setSelectedWorkspace(res.workspace);
      setActiveRun(res.run);
      setEvents([]);
      setCitations([]);
      setActiveSnapshot(null);
      setShowLauncher(false);
      setMainView("dossier");
      const [wsList, docsRes, monitorRes] = await Promise.all([
        fetchWorkspaces(),
        fetchWorkspaceDocuments(res.workspace.id).catch(() => ({
          documents: [],
        })),
        fetchWorkspaceMonitor(res.workspace.id).catch(() => null),
      ]);
      setWorkspaces(wsList.workspaces);
      setWorkspaceDocs(docsRes.documents);
      setWorkspaceMonitor(monitorRes);
    } finally {
      setIsLaunching(false);
    }
  }

  async function handleApprove(competitors: CompetitorCandidate[]) {
    if (!activeRun) return;
    setIsApproving(true);
    setBannerError(null);
    try {
      await approveCompetitors(
        activeRun.id,
        competitors,
        selectedProvider || activeRun.llm_provider
      );
      const updated = await fetchMission(activeRun.id);
      setActiveRun(updated.run);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to approve competitors."
      );
    } finally {
      setIsApproving(false);
    }
  }

  async function handleRetryMission(options?: { skipCompetitors?: string[] }) {
    if (!activeRun) return;
    setIsRetrying(true);
    setBannerError(null);
    try {
      const providerToUse = selectedProvider || activeRun.llm_provider;
      const modelToUse = selectedModel.trim() || activeRun.llm_model;
      await retryMission(activeRun.id, {
        skipCompetitors: options?.skipCompetitors,
        llmProvider: providerToUse,
        llmModel: modelToUse,
      });
      const updated = await fetchMission(activeRun.id);
      setActiveRun(updated.run);
      setEvents(updated.events);
      setCitations(updated.citations);
      if (updated.snapshot) {
        setActiveSnapshot(updated.snapshot);
      }
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to retry mission."
      );
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleSelectSnapshot(snap: DossierSnapshot) {
    setActiveSnapshot(snap);
    try {
      const mission = await fetchMission(snap.run_id);
      setActiveRun(mission.run);
      setEvents(mission.events);
      setCitations(mission.citations);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to load snapshot."
      );
    }
  }

  async function handleSendChat(question: string) {
    if (!selectedWorkspace) return;
    if (!selectedProvider || !selectedModel.trim()) {
      throw new Error("Select an LLM provider and model first.");
    }
    setIsChatting(true);
    try {
      await sendWorkspaceChat(selectedWorkspace.id, {
        question,
        llm_provider: selectedProvider,
        llm_model: selectedModel.trim(),
      });
      const history = await fetchChatHistory(selectedWorkspace.id);
      setChatMessages(history.messages);
    } finally {
      setIsChatting(false);
    }
  }

  async function handleUploadDoc(file: File) {
    if (!selectedWorkspace) return;
    await uploadWorkspaceDocument(selectedWorkspace.id, file);
    const docsRes = await fetchWorkspaceDocuments(selectedWorkspace.id);
    setWorkspaceDocs(docsRes.documents);
  }

  async function handleDeleteDoc(docId: string) {
    if (!selectedWorkspace) return;
    await deleteWorkspaceDocument(selectedWorkspace.id, docId);
    setWorkspaceDocs((prev) => prev.filter((doc) => doc.id !== docId));
  }

  async function handleSaveMonitor(payload: {
    interval: MonitorInterval;
    webhook_url: string | null;
    llm_provider: SupportedProvider | "" | null;
    llm_model: string | null;
  }) {
    if (!selectedWorkspace) return;
    const updated = await updateWorkspaceMonitor(selectedWorkspace.id, payload);
    setWorkspaceMonitor(updated);
  }

  async function handleSaveByokAndRefresh(nextConfig: ByokConfig) {
    const saved = saveByokConfig(nextConfig);
    const active = getActiveByokProviders(saved);
    const hint =
      (selectedProvider && active.includes(selectedProvider)
        ? selectedProvider
        : active[0]) || "";
    const provData = await fetchProviders(hint);
    setByokConfig(saved);
    setProviders(provData.providers);
    const picked = pickDefaultProvider(
      provData.providers,
      provData.default_provider,
      provData.default_model,
      saved
    );
    if (!selectedProvider || !active.includes(selectedProvider)) {
      if (picked.provider) {
        setSelectedProvider(picked.provider);
        setSelectedModel(picked.model);
      }
    }
  }

  async function handleClearAllByok() {
    const cleared = clearByokConfig();
    setByokConfig(cleared);
    await refreshProvidersAndWorkspaces(cleared, "");
  }

  function openWorkflowXRay(mode?: "live" | "tutor") {
    const resolvedMode = mode ?? (activeRun ? "live" : "tutor");
    setXrayDefaultMode(resolvedMode);
    setMainView("xray");
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <SidebarWorkspaces
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspace?.id || null}
        onSelectWorkspace={loadWorkspaceDetails}
        onNewMission={() => {
          setSelectedWorkspace(null);
          setActiveRun(null);
          setActiveSnapshot(null);
          setSnapshots([]);
          setEvents([]);
          setCitations([]);
          setChatMessages([]);
          setWorkspaceDocs([]);
          setWorkspaceMonitor(null);
          setShowLauncher(true);
          setMainView("dossier");
        }}
        onRefresh={loadInitialData}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenWorkflowXRay={(mode) => openWorkflowXRay(mode)}
        activeView={mainView}
        byokKeyCount={activeByokProviders.length}
        hasCustomOllamaUrl={Boolean(byokConfig.ollamaBaseUrl.trim())}
      />

      <main
        className={`flex-1 p-4 md:p-6 space-y-5 w-full mx-auto print:p-0 print:max-w-none print:space-y-0 ${
          mainView === "xray" ? "max-w-[1440px]" : "max-w-6xl"
        }`}
      >
        {/* Top Workspace View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2 print:hidden">
          <div
            role="tablist"
            aria-label="Workspace view switcher"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mainView === "dossier"}
              onClick={() => setMainView("dossier")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mainView === "dossier"
                  ? "bg-teal-700 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Dossier Workbench
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mainView === "xray"}
              onClick={() => openWorkflowXRay()}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mainView === "xray"
                  ? "bg-indigo-700 text-white"
                  : "text-slate-700 hover:bg-indigo-50 hover:text-indigo-900"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Workflow X-Ray &amp; AI Tutor
              {activeRun && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    mainView === "xray"
                      ? "bg-white/20 text-white"
                      : activeRun.status === "failed"
                        ? "bg-rose-100 text-rose-800"
                        : activeRun.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {activeRun.status}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mainView === "dossier" && (
              <button
                type="button"
                onClick={() => openWorkflowXRay("tutor")}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Zero-Key AI Tutor
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-700" />
              <span>BYOK Keys</span>
              {activeByokProviders.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  {activeByokProviders.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {bannerError && (
          <div
            role="alert"
            className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 print:hidden"
          >
            {bannerError}
          </div>
        )}

        {mainView === "xray" ? (
          <div className="print:hidden">
            <WorkflowXRay
              run={activeRun}
              events={events}
              productName={selectedWorkspace?.product_name}
              onRetryMission={handleRetryMission}
              isRetrying={isRetrying}
              onOpenHitl={() => setMainView("dossier")}
              defaultMode={xrayDefaultMode}
            />
          </div>
        ) : (
          <>
            {selectedWorkspace && !showLauncher && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {selectedWorkspace.product_name}
                  </h2>
                  <p className="text-xs text-slate-600">
                    {selectedWorkspace.target_segment}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {snapshots.length > 0 && (
                    <select
                      aria-label="Select snapshot version"
                      value={activeSnapshot?.id || ""}
                      onChange={(e) => {
                        const found = snapshots.find(
                          (s) => s.id === e.target.value
                        );
                        if (found) void handleSelectSnapshot(found);
                      }}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                    >
                      {snapshots.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                          Snapshot #{snapshots.length - idx} ·{" "}
                          {new Date(s.created_at).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowLauncher(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-teal-700 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100 transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Re-run &amp; Diff Snapshot
                  </button>
                </div>
              </div>
            )}

            {showLauncher && (
              <div className="print:hidden">
                <MissionLauncher
                  providers={effectiveProviders}
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onChangeProvider={(p, m) => {
                    setSelectedProvider(p);
                    setSelectedModel(m);
                  }}
                  onLaunch={handleLaunch}
                  isSubmitting={isLaunching}
                  initialProduct={selectedWorkspace}
                  byokConfig={byokConfig}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenWorkflowXRay={(mode) => openWorkflowXRay(mode)}
                />
              </div>
            )}

            {activeRun && <AgentTracePanel run={activeRun} events={events} />}

            {activeRun?.status === "awaiting_approval" && (
              <HitlApprovalPanel
                key={activeRun.id}
                discovered={activeRun.discovered_competitors}
                onApprove={handleApprove}
                isApproving={isApproving}
              />
            )}

            {activeSnapshot && activeRun && (
              <DossierTabs
                runId={activeSnapshot.run_id}
                productName={selectedWorkspace?.product_name || "Market"}
                dossier={activeSnapshot.dossier}
                diffSummary={activeSnapshot.diff_summary}
                citations={citations}
                createdAt={activeSnapshot.created_at}
              />
            )}

            {selectedWorkspace && (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 print:hidden">
                  <CustomEvidencePanel
                    workspaceId={selectedWorkspace.id}
                    documents={workspaceDocs}
                    onUpload={handleUploadDoc}
                    onDelete={handleDeleteDoc}
                    isLoading={isLoadingDocs}
                  />
                  <MonitorSettingsPanel
                    workspaceId={selectedWorkspace.id}
                    monitor={workspaceMonitor}
                    providers={effectiveProviders}
                    defaultProvider={selectedProvider}
                    defaultModel={selectedModel}
                    onSave={handleSaveMonitor}
                    isLoading={isLoadingMonitor}
                  />
                </div>

                <RagChatPanel
                  messages={chatMessages}
                  onSend={handleSendChat}
                  isSending={isChatting}
                  disabled={snapshots.length === 0}
                />
              </>
            )}
          </>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={byokConfig}
        onSaveAndRefresh={handleSaveByokAndRefresh}
        onClearAll={handleClearAllByok}
      />
    </div>
  );
}

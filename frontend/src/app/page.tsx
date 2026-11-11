"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { AgentTracePanel } from "@/components/AgentTracePanel";
import { DossierTabs } from "@/components/DossierTabs";
import { HitlApprovalPanel } from "@/components/HitlApprovalPanel";
import { MissionLauncher } from "@/components/MissionLauncher";
import { RagChatPanel } from "@/components/RagChatPanel";
import { SidebarWorkspaces } from "@/components/SidebarWorkspaces";
import {
  approveCompetitors,
  fetchChatHistory,
  fetchMission,
  fetchProviders,
  fetchWorkspaces,
  fetchWorkspaceSnapshots,
  sendWorkspaceChat,
  startMission,
  subscribeMissionEvents,
} from "@/lib/api";
import {
  AgentEvent,
  ChatMessage,
  CompetitorCandidate,
  DossierSnapshot,
  MissionRun,
  ProviderInfo,
  SourceCitation,
  SupportedProvider,
  Workspace,
} from "@/lib/types";

export default function HomePage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<
    SupportedProvider | ""
  >("");
  const [selectedModel, setSelectedModel] = useState("");

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

  const [showLauncher, setShowLauncher] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      const [provData, wsData] = await Promise.all([
        fetchProviders(),
        fetchWorkspaces(),
      ]);
      setBannerError(null);
      setProviders(provData.providers);
      const envProvider = provData.providers.find(
        (p) => p.provider === provData.default_provider && p.configured
      );
      const firstReady = provData.providers.find((p) => p.configured);
      if (envProvider) {
        setSelectedProvider(envProvider.provider);
        setSelectedModel(provData.default_model || envProvider.default_model);
      } else if (firstReady) {
        setSelectedProvider(firstReady.provider);
        setSelectedModel(firstReady.default_model);
      } else {
        setSelectedProvider("");
        setSelectedModel("");
      }
      setWorkspaces(wsData.workspaces);
    } catch (err) {
      setBannerError(
        err instanceof Error
          ? `${err.message} — Make sure FastAPI backend is running on port 8000.`
          : "Cannot reach backend API."
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchProviders(), fetchWorkspaces()])
      .then(([provData, wsData]) => {
        if (!active) return;
        setBannerError(null);
        setProviders(provData.providers);
        const envProvider = provData.providers.find(
          (p) => p.provider === provData.default_provider && p.configured
        );
        const firstReady = provData.providers.find((p) => p.configured);
        if (envProvider) {
          setSelectedProvider(envProvider.provider);
          setSelectedModel(provData.default_model || envProvider.default_model);
        } else if (firstReady) {
          setSelectedProvider(firstReady.provider);
          setSelectedModel(firstReady.default_model);
        } else {
          setSelectedProvider("");
          setSelectedModel("");
        }
        setWorkspaces(wsData.workspaces);
      })
      .catch((err: unknown) => {
        if (!active) return;
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
    setBannerError(null);
    try {
      const [snapData, chatData] = await Promise.all([
        fetchWorkspaceSnapshots(ws.id),
        fetchChatHistory(ws.id),
      ]);
      setSnapshots(snapData.snapshots);
      setChatMessages(chatData.messages);

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
      const wsList = await fetchWorkspaces();
      setWorkspaces(wsList.workspaces);
    } finally {
      setIsLaunching(false);
    }
  }

  async function handleApprove(competitors: CompetitorCandidate[]) {
    if (!activeRun) return;
    setIsApproving(true);
    setBannerError(null);
    try {
      await approveCompetitors(activeRun.id, competitors);
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
          setShowLauncher(true);
        }}
        onRefresh={loadInitialData}
      />

      <main className="flex-1 p-4 md:p-6 space-y-5 max-w-6xl w-full mx-auto">
        {bannerError && (
          <div
            role="alert"
            className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {bannerError}
          </div>
        )}

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
                    const found = snapshots.find((s) => s.id === e.target.value);
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
                Re-run & Diff Snapshot
              </button>
            </div>
          </div>
        )}

        {showLauncher && (
          <MissionLauncher
            providers={providers}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onChangeProvider={(p, m) => {
              setSelectedProvider(p);
              setSelectedModel(m);
            }}
            onLaunch={handleLaunch}
            isSubmitting={isLaunching}
            initialProduct={selectedWorkspace}
          />
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
          <RagChatPanel
            messages={chatMessages}
            onSend={handleSendChat}
            isSending={isChatting}
            disabled={snapshots.length === 0}
          />
        )}
      </main>
    </div>
  );
}

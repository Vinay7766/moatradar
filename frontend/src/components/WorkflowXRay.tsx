"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Box,
  Brain,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Layers,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  AGENTIC_CONCEPTS,
  AgenticConceptId,
  NodeVisualStatus,
  SubtaskStatus,
  TUTOR_STEPS,
  TutorSubtask,
  WORKFLOW_NODES,
  WorkflowNodeId,
  WorkflowNodeMeta,
} from "@/data/agenticTutorData";
import { AgentEvent, MissionRun } from "@/lib/types";
import { WorkflowFloorplanCanvas } from "./WorkflowFloorplanCanvas";
import { WorkflowNodeInspector } from "./WorkflowNodeInspector";
import { WorkflowThreeStage } from "./WorkflowThreeStage";

export interface WorkflowXRayProps {
  run: MissionRun | null;
  events: AgentEvent[];
  productName?: string;
  onRetryMission?: (options?: { skipCompetitors?: string[] }) => Promise<void>;
  isRetrying?: boolean;
  onOpenHitl?: () => void;
  defaultMode?: "live" | "tutor";
}

interface LiveTelemetrySnapshot {
  nodeStatuses: Record<WorkflowNodeId, NodeVisualStatus>;
  activeNode: WorkflowNodeId | null;
  activeEdge: string | null;
  failedNode: WorkflowNodeId | null;
  failedCompetitor: string | null;
  errorDetail: string | null;
  recoveryHint: string | null;
  subtasks: TutorSubtask[];
  nodeEvents: Record<WorkflowNodeId, AgentEvent[]>;
  nodeDurationsMs: Partial<Record<WorkflowNodeId, number>>;
  guardrailsApplied: string[];
  hasTargetedLoopRun: boolean;
}

const NODE_MAP: Record<WorkflowNodeId, WorkflowNodeMeta> = WORKFLOW_NODES.reduce(
  (acc, node) => {
    acc[node.id] = node;
    return acc;
  },
  {} as Record<WorkflowNodeId, WorkflowNodeMeta>
);

const VALID_NODE_IDS = new Set<WorkflowNodeId>([
  "discovery",
  "hitl_approval",
  "specialist_research",
  "critic_verifier",
  "targeted_research",
  "synthesizer",
  "memory_indexer",
]);

function isWorkflowNodeId(value: string): value is WorkflowNodeId {
  return VALID_NODE_IDS.has(value as WorkflowNodeId);
}

function readStringMeta(
  meta: Record<string, unknown> | undefined,
  key: string
): string | null {
  if (!meta) return null;
  const val = meta[key];
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}

function readNumberMeta(
  meta: Record<string, unknown> | undefined,
  key: string
): number | null {
  if (!meta) return null;
  const val = meta[key];
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function readStringArrayMeta(
  meta: Record<string, unknown> | undefined,
  key: string
): string[] {
  if (!meta) return [];
  const val = meta[key];
  if (!Array.isArray(val)) return [];
  return val.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function inferRecoveryHint(errorText: string | null): string {
  if (!errorText) {
    return "Retry from the last saved checkpoint or verify your active provider settings.";
  }
  const lower = errorText.toLowerCase();
  if (lower.includes("ollama") || lower.includes("model") || lower.includes("not found")) {
    return "Check that your Ollama model is pulled locally (or switch provider/model in API Keys) and click Retry Stage.";
  }
  if (lower.includes("api key") || lower.includes("401") || lower.includes("403") || lower.includes("unauthorized")) {
    return "Your provider API key looks invalid or missing. Update it in API Keys (bottom-left) and click Retry Stage.";
  }
  if (lower.includes("429") || lower.includes("rate") || lower.includes("timeout") || lower.includes("timed out")) {
    return "Upstream search or provider hit a rate limit/timeout. Retry Stage or skip the blocked competitor to finish synthesis.";
  }
  return "Review the error detail below, adjust provider keys if needed, and click Retry Stage (or skip the blocked competitor).";
}

function buildLiveSnapshot(
  run: MissionRun | null,
  events: AgentEvent[]
): LiveTelemetrySnapshot {
  const nodeStatuses: Record<WorkflowNodeId, NodeVisualStatus> = {
    discovery: "idle",
    hitl_approval: "idle",
    specialist_research: "idle",
    critic_verifier: "idle",
    targeted_research: "idle",
    synthesizer: "idle",
    memory_indexer: "idle",
  };

  const nodeEvents: Record<WorkflowNodeId, AgentEvent[]> = {
    discovery: [],
    hitl_approval: [],
    specialist_research: [],
    critic_verifier: [],
    targeted_research: [],
    synthesizer: [],
    memory_indexer: [],
  };

  const nodeDurationsMs: Partial<Record<WorkflowNodeId, number>> = {};
  const guardrailsSet = new Set<string>();
  let hasTargetedLoopRun = false;
  let lastActiveNode: WorkflowNodeId | null = null;
  let failedNode: WorkflowNodeId | null = null;
  let failedCompetitor: string | null = null;
  let errorDetail: string | null = null;

  for (const ev of events) {
    const meta = ev.metadata;
    for (const g of readStringArrayMeta(meta, "guardrails_applied")) {
      guardrailsSet.add(g);
    }

    const explicitFailedNode = readStringMeta(meta, "failed_node");
    if (explicitFailedNode && isWorkflowNodeId(explicitFailedNode)) {
      failedNode = explicitFailedNode;
    }

    const explicitComp = readStringMeta(meta, "competitor_name");
    if (ev.event_type === "error" || readStringMeta(meta, "node_status") === "failed") {
      if (explicitComp) {
        failedCompetitor = explicitComp;
      }
      errorDetail = readStringMeta(meta, "error_detail") || ev.message;
    }

    if (isWorkflowNodeId(ev.node_name)) {
      nodeEvents[ev.node_name].push(ev);
      lastActiveNode = ev.node_name;
      if (ev.node_name === "targeted_research") {
        hasTargetedLoopRun = true;
      }
      const dur = readNumberMeta(meta, "duration_ms");
      if (dur !== null) {
        nodeDurationsMs[ev.node_name] = dur;
      }
      const ns = readStringMeta(meta, "node_status");
      if (ns === "failed" || ev.event_type === "error") {
        failedNode = ev.node_name;
      }
    }
  }

  if (!run) {
    return {
      nodeStatuses,
      activeNode: null,
      activeEdge: null,
      failedNode: null,
      failedCompetitor: null,
      errorDetail: null,
      recoveryHint: null,
      subtasks: [],
      nodeEvents,
      nodeDurationsMs,
      guardrailsApplied: Array.from(guardrailsSet),
      hasTargetedLoopRun,
    };
  }

  switch (run.status) {
    case "discovering":
      nodeStatuses.discovery = "running";
      break;
    case "awaiting_approval":
      nodeStatuses.discovery = "completed";
      nodeStatuses.hitl_approval = "paused";
      break;
    case "researching":
      nodeStatuses.discovery = "completed";
      nodeStatuses.hitl_approval = "completed";
      nodeStatuses.specialist_research = "running";
      break;
    case "verifying":
      nodeStatuses.discovery = "completed";
      nodeStatuses.hitl_approval = "completed";
      nodeStatuses.specialist_research = "completed";
      if (lastActiveNode === "targeted_research") {
        nodeStatuses.critic_verifier = "retrying";
        nodeStatuses.targeted_research = "running";
      } else {
        nodeStatuses.critic_verifier = "running";
        if (hasTargetedLoopRun) {
          nodeStatuses.targeted_research = "completed";
        }
      }
      break;
    case "synthesizing":
      nodeStatuses.discovery = "completed";
      nodeStatuses.hitl_approval = "completed";
      nodeStatuses.specialist_research = "completed";
      nodeStatuses.critic_verifier = "completed";
      if (hasTargetedLoopRun) {
        nodeStatuses.targeted_research = "completed";
      }
      nodeStatuses.synthesizer = "running";
      break;
    case "completed":
      nodeStatuses.discovery = "completed";
      nodeStatuses.hitl_approval = "completed";
      nodeStatuses.specialist_research = "completed";
      nodeStatuses.critic_verifier = "completed";
      if (hasTargetedLoopRun) {
        nodeStatuses.targeted_research = "completed";
      }
      nodeStatuses.synthesizer = "completed";
      nodeStatuses.memory_indexer = "completed";
      break;
    case "failed": {
      const order: WorkflowNodeId[] = [
        "discovery",
        "hitl_approval",
        "specialist_research",
        "critic_verifier",
        "targeted_research",
        "synthesizer",
        "memory_indexer",
      ];
      const targetFail = failedNode || lastActiveNode || "discovery";
      failedNode = targetFail;
      const failIdx = order.indexOf(targetFail);
      order.forEach((id, idx) => {
        if (idx < failIdx) {
          nodeStatuses[id] =
            id === "targeted_research" && !hasTargetedLoopRun ? "idle" : "completed";
        } else if (idx === failIdx) {
          nodeStatuses[id] = "failed";
        }
      });
      if (!errorDetail && run.error_message) {
        errorDetail = run.error_message;
      }
      break;
    }
  }

  const targetCompetitors =
    run.approved_competitors.length > 0
      ? run.approved_competitors
      : run.discovered_competitors;

  const subtasks: TutorSubtask[] = targetCompetitors.map((comp) => {
    const compLower = comp.name.toLowerCase();
    let status: SubtaskStatus =
      nodeStatuses.specialist_research === "completed" ? "completed" : "pending";
    let detail =
      status === "completed"
        ? "4 domain findings verified"
        : run.status === "awaiting_approval"
          ? "Awaiting PM approval"
          : "Queued in Semaphore(3) pool";
    let citationsCount: number | undefined;

    for (const ev of nodeEvents.specialist_research) {
      const evComp = readStringMeta(ev.metadata, "competitor_name");
      const matchesComp = evComp
        ? evComp.toLowerCase() === compLower
        : ev.message.toLowerCase().includes(compLower);
      if (!matchesComp) continue;

      const ns = readStringMeta(ev.metadata, "node_status");
      const citCount = readNumberMeta(ev.metadata, "citations_count");
      if (citCount !== null) citationsCount = citCount;

      if (ns === "failed" || ev.event_type === "error") {
        status = "failed";
        detail = readStringMeta(ev.metadata, "error_detail") || ev.message;
        failedCompetitor = comp.name;
      } else if (
        ns === "completed" ||
        ev.message.toLowerCase().includes("gathered") ||
        ev.message.toLowerCase().includes("completed")
      ) {
        status = "completed";
        detail = ev.message;
      } else if (
        ev.event_type === "tool_call" ||
        ev.event_type === "tool_result" ||
        ns === "started" ||
        ns === "progress"
      ) {
        if (status !== "completed" && status !== "failed") {
          status = "running";
          detail = ev.message;
        }
      }
    }

    if (
      run.status === "failed" &&
      failedNode === "specialist_research" &&
      status === "running"
    ) {
      status = "failed";
      if (!failedCompetitor) failedCompetitor = comp.name;
      detail = errorDetail || "Specialist task failed during execution.";
    }

    if (
      run.status === "failed" &&
      errorDetail &&
      errorDetail.toLowerCase().includes(compLower) &&
      failedNode === "specialist_research"
    ) {
      status = "failed";
      failedCompetitor = comp.name;
    }

    return {
      competitor: comp.name,
      status,
      detail,
      citationsCount,
    };
  });

  let activeNode: WorkflowNodeId | null = failedNode || lastActiveNode;
  if (run.status === "discovering") activeNode = "discovery";
  else if (run.status === "awaiting_approval") activeNode = "hitl_approval";
  else if (run.status === "researching") activeNode = "specialist_research";
  else if (run.status === "verifying") {
    activeNode =
      lastActiveNode === "targeted_research"
        ? "targeted_research"
        : "critic_verifier";
  } else if (run.status === "synthesizing") activeNode = "synthesizer";
  else if (run.status === "completed") activeNode = "memory_indexer";

  let activeEdge: string | null = null;
  if (run.status === "discovering") activeEdge = "start->discovery";
  else if (run.status === "awaiting_approval") activeEdge = "discovery->hitl_approval";
  else if (run.status === "researching") activeEdge = "hitl_approval->specialist_research";
  else if (run.status === "verifying") {
    activeEdge =
      lastActiveNode === "targeted_research"
        ? "targeted_research->critic_verifier"
        : "specialist_research->critic_verifier";
  } else if (run.status === "synthesizing") activeEdge = "critic_verifier->synthesizer";
  else if (run.status === "completed") activeEdge = "memory_indexer->end";

  return {
    nodeStatuses,
    activeNode,
    activeEdge,
    failedNode,
    failedCompetitor,
    errorDetail,
    recoveryHint: run.status === "failed" ? inferRecoveryHint(errorDetail) : null,
    subtasks,
    nodeEvents,
    nodeDurationsMs,
    guardrailsApplied: Array.from(guardrailsSet),
    hasTargetedLoopRun,
  };
}

export function WorkflowXRay({
  run,
  events,
  productName,
  onRetryMission,
  isRetrying = false,
  onOpenHitl,
  defaultMode,
}: WorkflowXRayProps) {
  const [mode, setMode] = useState<"live" | "tutor">(
    () => defaultMode ?? (run ? "live" : "tutor")
  );
  const [canvasEngine, setCanvasEngine] = useState<"three" | "floorplan">("three");
  const [tutorStepIndex, setTutorStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5>(1);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [selectedConceptId, setSelectedConceptId] =
    useState<AgenticConceptId | null>(null);
  const [manualSelectedNode, setManualSelectedNode] =
    useState<WorkflowNodeId | null>(null);
  const [tutorRecoveryNotice, setTutorRecoveryNotice] = useState<string | null>(
    null
  );
  const isPlayingRef = useRef(isPlaying);
  const tutorStepIndexRef = useRef(tutorStepIndex);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    tutorStepIndexRef.current = tutorStepIndex;
  }, [tutorStepIndex]);

  // Helper that advances one tutor step cleanly without nesting setState inside another updater
  const advanceOneStepCleanly = useMemo(
    () => () => {
      const currentIdx = tutorStepIndexRef.current;
      if (currentIdx >= TUTOR_STEPS.length - 1) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }
      const nextIdx = currentIdx + 1;
      tutorStepIndexRef.current = nextIdx;
      setTutorStepIndex(nextIdx);
      const nextStep = TUTOR_STEPS[nextIdx];
      if (nextStep?.activeNode) {
        setManualSelectedNode(nextStep.activeNode);
      }
    },
    []
  );

  // Auto-advance playback in Explainer Tutor mode when voice narration is off.
  // When voice is active, step advancement waits for utterance completion (onend) so speech is never cut off mid-sentence.
  useEffect(() => {
    const speechSupported =
      typeof window !== "undefined" && "speechSynthesis" in window;
    if (mode !== "tutor" || !isPlaying || (voiceEnabled && speechSupported)) {
      return;
    }
    const delayMs = playbackSpeed === 1.5 ? 2300 : 3400;
    const timer = setTimeout(() => {
      if (!isPlayingRef.current) return;
      advanceOneStepCleanly();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [mode, isPlaying, voiceEnabled, playbackSpeed, tutorStepIndex, advanceOneStepCleanly]);

  const currentTutorStep = TUTOR_STEPS[tutorStepIndex] ?? TUTOR_STEPS[0];

  // Optional browser Web Speech narration bound strictly to active playback (`isPlaying`):
  // Pausing or scrubbing while paused never speaks unexpectedly; scrubbing while playing debounces and resumes from the target step.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    let cancelled = false;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let handledEnd = false;

    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;

    if (mode === "tutor" && voiceEnabled && isPlaying) {
      const spokenText = `${currentTutorStep.title}. ${currentTutorStep.narration.whatIsHappening}`;
      const wordCount = Math.max(1, spokenText.trim().split(/\s+/).length);
      const rate = playbackSpeed === 1.5 ? 1.25 : 1.0;
      const watchdogMs = Math.max(6000, Math.round((wordCount / (2.0 * rate)) * 1000) + 3500);

      const finishAndAdvance = (pauseMs: number) => {
        if (handledEnd || cancelled) return;
        handledEnd = true;
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        if (!isPlayingRef.current) return;
        advanceTimer = setTimeout(() => {
          if (cancelled || !isPlayingRef.current) return;
          advanceOneStepCleanly();
        }, pauseMs);
      };

      // 160ms debounce + gap after cancel() prevents Chromium/Edge speech queue stalls and avoids stutter during timeline scrubbing
      startTimer = setTimeout(() => {
        if (cancelled || !isPlayingRef.current) return;
        const utter = new SpeechSynthesisUtterance(spokenText);
        utter.rate = rate;
        activeUtteranceRef.current = utter;

        utter.onend = () => finishAndAdvance(450);
        utter.onerror = (event) => {
          if (event.error === "canceled" || event.error === "interrupted") return;
          finishAndAdvance(700);
        };

        window.speechSynthesis.speak(utter);
        watchdogTimer = setTimeout(() => finishAndAdvance(250), watchdogMs);
      }, 160);
    }

    return () => {
      cancelled = true;
      if (startTimer) clearTimeout(startTimer);
      if (advanceTimer) clearTimeout(advanceTimer);
      if (watchdogTimer) clearTimeout(watchdogTimer);
      activeUtteranceRef.current = null;
      window.speechSynthesis.cancel();
    };
  }, [
    mode,
    voiceEnabled,
    isPlaying,
    tutorStepIndex,
    playbackSpeed,
    currentTutorStep,
    advanceOneStepCleanly,
  ]);

  const liveSnapshot = useMemo(
    () => buildLiveSnapshot(run, events),
    [run, events]
  );

  const activeStatuses: Record<WorkflowNodeId, NodeVisualStatus> =
    mode === "tutor"
      ? currentTutorStep.nodeStatuses
      : liveSnapshot.nodeStatuses;

  const activeSubtasks: TutorSubtask[] =
    mode === "tutor" ? currentTutorStep.subtasks : liveSnapshot.subtasks;

  const activeEdge: string | null =
    mode === "tutor" ? currentTutorStep.activeEdge : liveSnapshot.activeEdge;

  const selectedConcept = useMemo(
    () => AGENTIC_CONCEPTS.find((c) => c.id === selectedConceptId) ?? null,
    [selectedConceptId]
  );

  const highlightedNodeIds = useMemo(() => {
    if (selectedConcept) return new Set<WorkflowNodeId>(selectedConcept.nodeIds);
    return new Set<WorkflowNodeId>();
  }, [selectedConcept]);

  const effectiveSelectedNode: WorkflowNodeId =
    manualSelectedNode ??
    (mode === "tutor"
      ? currentTutorStep.activeNode ?? "discovery"
      : liveSnapshot.failedNode ?? liveSnapshot.activeNode ?? "discovery");

  const inspectedMeta = NODE_MAP[effectiveSelectedNode];
  const inspectedStatus = activeStatuses[effectiveSelectedNode];

  const goToTutorStep = (idx: number) => {
    const clamped = Math.max(0, Math.min(TUTOR_STEPS.length - 1, idx));
    tutorStepIndexRef.current = clamped;
    setTutorStepIndex(clamped);
    setTutorRecoveryNotice(null);
    const step = TUTOR_STEPS[clamped];
    if (step?.activeNode) {
      setManualSelectedNode(step.activeNode);
    }
  };

  const handleToggleMode = (nextMode: "live" | "tutor") => {
    setMode(nextMode);
    isPlayingRef.current = false;
    setIsPlaying(false);
    setTutorRecoveryNotice(null);
    if (nextMode === "tutor") {
      const step = TUTOR_STEPS[tutorStepIndex];
      setManualSelectedNode(step?.activeNode ?? "discovery");
    } else {
      setManualSelectedNode(
        liveSnapshot.failedNode ?? liveSnapshot.activeNode ?? "discovery"
      );
    }
  };

  const handleSelectConcept = (id: AgenticConceptId) => {
    setSelectedConceptId((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        const concept = AGENTIC_CONCEPTS.find((c) => c.id === next);
        if (concept && concept.nodeIds.length > 0) {
          setManualSelectedNode(concept.nodeIds[0]);
        }
      }
      return next;
    });
  };

  const handleSimulatedTutorRecovery = (kind: "retry" | "skip") => {
    setIsPlaying(false);
    setTutorRecoveryNotice(
      kind === "retry"
        ? "Simulated 1-Click Retry executed: Make worker recovered and completed!"
        : "Simulated Skip Blocked Competitor: Make excluded; Zapier + n8n proceed to Critic!"
    );
    goToTutorStep(5);
  };

  const showFailureBanner =
    mode === "tutor"
      ? Boolean(currentTutorStep.simulatedRecoverableFailure)
      : run?.status === "failed";

  const failureNodeName =
    mode === "tutor"
      ? "specialist_research"
      : liveSnapshot.failedNode || "orchestrator";
  const failureCompetitor =
    mode === "tutor"
      ? currentTutorStep.sampleTelemetry.failedCompetitor || null
      : liveSnapshot.failedCompetitor;
  const failureMessage =
    mode === "tutor"
      ? currentTutorStep.sampleTelemetry.errorDetail || "Simulated failure"
      : liveSnapshot.errorDetail || run?.error_message || "Mission failed.";
  const failureHint =
    mode === "tutor"
      ? currentTutorStep.sampleTelemetry.recoveryHint || ""
      : liveSnapshot.recoveryHint || "";

  return (
    <div className="space-y-4">
      {/* Studio Control Header + Explainer Player + Concept Strip */}
      <section className="rounded-xl border border-slate-800 bg-[#0f1623] p-4 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/40 bg-teal-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal-300">
                <Box className="w-3.5 h-3.5" />
                3D Architecture &amp; AI Tutor
              </span>
              <span className="text-xs font-medium text-slate-400">
                {mode === "tutor"
                  ? "Guided Walkthrough · Zero API Key"
                  : productName
                    ? `Live Trace: ${productName}`
                    : "Live Mission Trace"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Orbit the 3D pipeline, inspect Floorplan wires, read exact prompts &amp; mapped backend modules interactively.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Engine Switcher: Three.js 3D vs Floorplan 2D */}
            <div
              role="group"
              aria-label="Diagram visualization engine"
              className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1"
            >
              <button
                type="button"
                onClick={() => setCanvasEngine("three")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  canvasEngine === "three"
                    ? "bg-slate-800 text-teal-300 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                3D Orbit
              </button>
              <button
                type="button"
                onClick={() => setCanvasEngine("floorplan")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  canvasEngine === "floorplan"
                    ? "bg-slate-800 text-teal-300 border border-slate-700"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Floorplan 2D
              </button>
            </div>

            {/* Mode Switcher: Live vs Zero-Key Tutor */}
            <div
              role="group"
              aria-label="X-Ray mode switcher"
              className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1"
            >
              <button
                type="button"
                onClick={() => handleToggleMode("live")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === "live"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Live Run
              </button>
              <button
                type="button"
                onClick={() => handleToggleMode("tutor")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  mode === "tutor"
                    ? "bg-teal-500 text-slate-950 font-bold"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Explainer Tutor
              </button>
            </div>
          </div>
        </div>

        {/* GitDiagram-Style Explainer Player Bar */}
        {mode === "tutor" && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) {
                      isPlayingRef.current = false;
                      if (typeof window !== "undefined" && "speechSynthesis" in window) {
                        window.speechSynthesis.cancel();
                      }
                      setIsPlaying(false);
                    } else {
                      if (tutorStepIndex >= TUTOR_STEPS.length - 1) {
                        goToTutorStep(0);
                      }
                      isPlayingRef.current = true;
                      setIsPlaying(true);
                    }
                  }}
                  className="inline-flex min-w-[144px] items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-400 transition-colors cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Play Walkthrough
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    goToTutorStep(tutorStepIndex - 1);
                  }}
                  disabled={tutorStepIndex === 0}
                  aria-label="Previous walkthrough step"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </button>

                <button
                  type="button"
                  onClick={() => {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    goToTutorStep(tutorStepIndex + 1);
                  }}
                  disabled={tutorStepIndex >= TUTOR_STEPS.length - 1}
                  aria-label="Next walkthrough step"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPlaybackSpeed((s) => (s === 1 ? 1.5 : 1))}
                  title="Playback speed"
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] font-mono text-teal-300 hover:bg-slate-800 cursor-pointer"
                >
                  {playbackSpeed}x
                </button>

                <button
                  type="button"
                  onClick={() => setVoiceEnabled((v) => !v)}
                  title="Toggle browser voice narration"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium cursor-pointer ${
                    voiceEnabled
                      ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                      : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {voiceEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  Voice
                </button>

                <button
                  type="button"
                  onClick={() => {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    goToTutorStep(0);
                  }}
                  title="Reset walkthrough to step 1"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-200">
                {isPlaying && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/40 bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                    {voiceEnabled ? "Narrating" : "Playing"}
                  </span>
                )}
                <span className="font-mono text-teal-400">
                  {tutorStepIndex + 1}/{TUTOR_STEPS.length}
                </span>
                <span className="font-semibold">{currentTutorStep.title}</span>
              </div>
            </div>

            {/* Interactive Timeline Scrubber & Chapter Pills (seek smoothly without forcing Pause) */}
            <input
              type="range"
              aria-label="Tutor walkthrough timeline scrubber"
              min={0}
              max={TUTOR_STEPS.length - 1}
              value={tutorStepIndex}
              onChange={(e) => goToTutorStep(Number(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer"
            />
            <div className="flex flex-wrap gap-1">
              {TUTOR_STEPS.map((step, idx) => {
                const isCurrent = idx === tutorStepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToTutorStep(idx)}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      isCurrent
                        ? "bg-teal-500 text-slate-950 font-bold"
                        : idx < tutorStepIndex
                          ? "bg-teal-500/15 text-teal-300 border border-teal-500/30"
                          : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {step.stageBadge}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === "live" && !run && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <span>
              No active mission selected. Run a mission from Intelligence Desk or launch the zero-key Explainer Tutor right now.
            </span>
            <button
              type="button"
              onClick={() => handleToggleMode("tutor")}
              className="inline-flex items-center gap-1 rounded-md bg-teal-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-teal-400 cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Open Explainer Tutor
            </button>
          </div>
        )}

        {tutorRecoveryNotice && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-medium text-emerald-200 flex items-center justify-between gap-2">
            <span>{tutorRecoveryNotice}</span>
            <button
              type="button"
              onClick={() => setTutorRecoveryNotice(null)}
              aria-label="Dismiss recovery notice"
              className="text-emerald-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Clickable Agentic AI Concept Strip */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Brain className="w-3.5 h-3.5 text-teal-400" />
              Agentic AI Concepts (click to highlight 3D modules &amp; explain):
            </span>
            {selectedConcept && (
              <button
                type="button"
                onClick={() => setSelectedConceptId(null)}
                className="text-[11px] font-medium text-teal-300 hover:underline cursor-pointer"
              >
                Clear highlight
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AGENTIC_CONCEPTS.map((concept) => {
              const active = selectedConceptId === concept.id;
              return (
                <button
                  key={concept.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectConcept(concept.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "border-teal-400 bg-teal-500 text-slate-950 font-semibold"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-teal-500/50 hover:text-teal-200"
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {concept.shortTitle}
                </button>
              );
            })}
          </div>
        </div>

        {selectedConcept && (
          <div className="rounded-lg border border-teal-500/35 bg-slate-950/90 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  {selectedConcept.title}
                </h3>
                <p className="text-slate-400">{selectedConcept.tagline}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConceptId(null)}
                aria-label="Close concept explainer"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="font-semibold text-teal-300 mb-1">
                  Plain-English Principle
                </p>
                <p className="text-slate-300 leading-relaxed">
                  {selectedConcept.beginnerExplanation}
                </p>
              </div>
              <div className="rounded-md bg-slate-900/90 border border-slate-800 p-2.5">
                <p className="font-semibold text-sky-300 mb-1">
                  How MoatRadar Implements It
                </p>
                <p className="text-slate-300 leading-relaxed">
                  {selectedConcept.moatRadarImplementation}
                </p>
                <p className="mt-1.5 font-mono text-[10px] text-teal-300 bg-slate-950 rounded px-2 py-1 border border-slate-800">
                  {selectedConcept.contractSnippet}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Failure Diagnostic & 1-Click Recovery Banner */}
      {showFailureBanner && (
        <section
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 space-y-2"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-rose-100">
                  Workflow Paused at Node:{" "}
                  <span className="font-mono">{failureNodeName}</span>
                  {failureCompetitor ? ` (${failureCompetitor})` : ""}
                </h3>
                <p className="text-xs text-rose-200/90">{failureMessage}</p>
                {failureHint && (
                  <p className="text-xs text-rose-300 font-medium">{failureHint}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={mode === "live" && (isRetrying || !onRetryMission)}
                onClick={() => {
                  if (mode === "tutor") {
                    handleSimulatedTutorRecovery("retry");
                  } else if (onRetryMission) {
                    void onRetryMission();
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`}
                />
                {isRetrying ? "Retrying..." : "1-Click Retry Stage"}
              </button>

              {failureCompetitor && (
                <button
                  type="button"
                  disabled={mode === "live" && (isRetrying || !onRetryMission)}
                  onClick={() => {
                    if (mode === "tutor") {
                      handleSimulatedTutorRecovery("skip");
                    } else if (onRetryMission) {
                      void onRetryMission({
                        skipCompetitors: [failureCompetitor],
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-950/60 disabled:opacity-50 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip {failureCompetitor} &amp; Retry
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Studio Split: Interactive 3D/Floorplan Canvas (8 col) + Tabbed Inspector (4 col) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <section className="xl:col-span-8">
          {canvasEngine === "three" ? (
            <WorkflowThreeStage
              statuses={activeStatuses}
              selectedNodeId={effectiveSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
              activeEdge={activeEdge}
              subtasks={activeSubtasks}
              onSelectNode={(id) => setManualSelectedNode(id)}
              onSwitchToFloorplan={() => setCanvasEngine("floorplan")}
            />
          ) : (
            <WorkflowFloorplanCanvas
              statuses={activeStatuses}
              selectedNodeId={effectiveSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
              activeEdge={activeEdge}
              subtasks={activeSubtasks}
              onSelectNode={(id) => setManualSelectedNode(id)}
            />
          )}
        </section>

        <WorkflowNodeInspector
          mode={mode}
          inspectedMeta={inspectedMeta}
          inspectedStatus={inspectedStatus}
          currentTutorStep={currentTutorStep}
          run={run}
          liveNodeEvents={liveSnapshot.nodeEvents[inspectedMeta.id]}
          liveDurationMs={liveSnapshot.nodeDurationsMs[inspectedMeta.id]}
          failureMessage={failureMessage}
          failureCompetitor={failureCompetitor}
          isRetrying={isRetrying}
          selectedConceptId={selectedConceptId}
          onSelectConcept={handleSelectConcept}
          onSelectNode={(id) => setManualSelectedNode(id)}
          onRetryMission={onRetryMission}
          onSimulatedRecovery={handleSimulatedTutorRecovery}
          onOpenHitl={onOpenHitl}
        />
      </div>
    </div>
  );
}

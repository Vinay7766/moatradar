"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  SkipForward,
  Sparkles,
  UserCheck,
  Wrench,
  X,
  XCircle,
  Zap,
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
  return val.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function inferRecoveryHint(errorText: string | null): string {
  if (!errorText) {
    return "Retry from the last saved checkpoint or verify your active provider settings.";
  }
  const lower = errorText.toLowerCase();
  if (lower.includes("ollama") || lower.includes("model") || lower.includes("not found")) {
    return "Check that your Ollama model is pulled locally (or switch provider/model in BYOK Settings) and click Retry Stage.";
  }
  if (lower.includes("api key") || lower.includes("401") || lower.includes("403") || lower.includes("unauthorized")) {
    return "Your provider API key looks invalid or missing. Update it in BYOK Keys and click Retry Stage.";
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

  // Derive stage statuses cleanly from authoritative MissionRun status + events
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
          if (id === "targeted_research" && !hasTargetedLoopRun) {
            nodeStatuses[id] = "idle";
          } else {
            nodeStatuses[id] = "completed";
          }
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

  // Build parallel per-competitor subtask pills
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

  // Determine active node & animated edge for beam flow
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

function statusPillClasses(status: NodeVisualStatus): string {
  switch (status) {
    case "running":
      return "bg-teal-500/20 text-teal-200 border-teal-400/50";
    case "paused":
      return "bg-amber-500/20 text-amber-200 border-amber-400/50";
    case "completed":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-400/50";
    case "failed":
      return "bg-rose-500/25 text-rose-200 border-rose-400/70";
    case "retrying":
      return "bg-indigo-500/25 text-indigo-200 border-indigo-400/60";
    default:
      return "bg-slate-800/80 text-slate-400 border-slate-700";
  }
}

function cardDepthClasses(
  status: NodeVisualStatus,
  isSelected: boolean,
  isConceptHighlighted: boolean
): string {
  const ring = isSelected
    ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950"
    : isConceptHighlighted
      ? "ring-2 ring-amber-400/90 ring-offset-2 ring-offset-slate-950"
      : "";

  switch (status) {
    case "running":
      return `border-teal-400/80 bg-slate-900/95 shadow-[0_14px_34px_-10px_rgba(20,184,166,0.55)] animate-xray-pulse ${ring}`;
    case "paused":
      return `border-amber-400/80 bg-slate-900/95 shadow-[0_14px_34px_-10px_rgba(245,158,11,0.45)] ${ring}`;
    case "completed":
      return `border-emerald-500/60 bg-slate-900/90 shadow-[0_12px_28px_-12px_rgba(16,185,129,0.38)] ${ring}`;
    case "failed":
      return `border-rose-500 bg-rose-950/60 shadow-[0_14px_36px_-8px_rgba(244,63,94,0.65)] ${ring}`;
    case "retrying":
      return `border-indigo-400/80 bg-slate-900/95 shadow-[0_14px_34px_-10px_rgba(129,140,248,0.55)] ${ring}`;
    default:
      return `border-slate-700/80 bg-slate-900/75 shadow-[0_10px_24px_-12px_rgba(15,23,42,0.8)] ${ring}`;
  }
}

function conceptBadgeStyle(
  accent: string,
  active: boolean
): string {
  if (active) {
    return "bg-indigo-700 text-white border-indigo-700 shadow-sm";
  }
  switch (accent) {
    case "teal":
      return "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100";
    case "emerald":
      return "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
    case "amber":
      return "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100";
    case "indigo":
      return "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100";
    case "rose":
      return "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100";
    case "sky":
      return "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100";
    case "violet":
      return "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100";
    default:
      return "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100";
  }
}

function statusIcon(status: NodeVisualStatus) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-300 shrink-0" />;
    case "paused":
      return <UserCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-rose-300 shrink-0" />;
    case "retrying":
      return <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300 shrink-0" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  }
}

function subtaskPillClasses(status: SubtaskStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 border-emerald-400/50 text-emerald-200";
    case "running":
      return "bg-teal-500/20 border-teal-400/60 text-teal-100";
    case "failed":
      return "bg-rose-500/25 border-rose-400 text-rose-100";
    default:
      return "bg-slate-800/90 border-slate-700 text-slate-300";
  }
}

function HorizontalDataBeam({
  active,
  variant = "normal",
}: {
  active: boolean;
  variant?: "normal" | "loop" | "failed";
}) {
  const stroke =
    variant === "failed"
      ? "#fb7185"
      : variant === "loop"
        ? "#f59e0b"
        : active
          ? "#2dd4bf"
          : "#475569";

  return (
    <div
      aria-hidden="true"
      className="hidden md:flex items-center justify-center w-9 shrink-0"
    >
      <svg viewBox="0 0 44 20" className="w-full h-5 overflow-visible">
        <line
          x1="2"
          y1="10"
          x2="38"
          y2="10"
          stroke={stroke}
          strokeWidth={active ? 2.5 : 1.5}
          strokeOpacity={active ? 0.95 : 0.45}
          className={active ? "animate-beam-flow" : ""}
        />
        <polygon
          points="36,5 43,10 36,15"
          fill={stroke}
          fillOpacity={active ? 1 : 0.5}
        />
      </svg>
    </div>
  );
}

function VerticalStageBeam({
  active,
  label,
}: {
  active: boolean;
  label?: string;
}) {
  const stroke = active ? "#38bdf8" : "#475569";
  return (
    <div
      aria-hidden="true"
      className="flex flex-col items-center justify-center py-1"
    >
      <svg viewBox="0 0 40 32" className="w-8 h-7 overflow-visible">
        <line
          x1="20"
          y1="2"
          x2="20"
          y2="24"
          stroke={stroke}
          strokeWidth={active ? 2.5 : 1.5}
          strokeOpacity={active ? 0.95 : 0.45}
          className={active ? "animate-beam-flow" : ""}
        />
        <polygon
          points="15,22 20,30 25,22"
          fill={stroke}
          fillOpacity={active ? 1 : 0.5}
        />
      </svg>
      {label && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          {label}
        </span>
      )}
    </div>
  );
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
  const [tutorStepIndex, setTutorStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedConceptId, setSelectedConceptId] =
    useState<AgenticConceptId | null>(null);
  const [manualSelectedNode, setManualSelectedNode] =
    useState<WorkflowNodeId | null>(null);
  const [tutorRecoveryNotice, setTutorRecoveryNotice] = useState<string | null>(
    null
  );

  // Auto-advance playback in Preview Tutor mode
  useEffect(() => {
    if (mode !== "tutor" || !isPlaying) return;
    const timer = setInterval(() => {
      setTutorStepIndex((prev) => {
        if (prev >= TUTOR_STEPS.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        const nextIdx = prev + 1;
        const nextStep = TUTOR_STEPS[nextIdx];
        if (nextStep?.activeNode) {
          setManualSelectedNode(nextStep.activeNode);
        }
        return nextIdx;
      });
    }, 3400);
    return () => clearInterval(timer);
  }, [mode, isPlaying]);

  const liveSnapshot = useMemo(
    () => buildLiveSnapshot(run, events),
    [run, events]
  );

  const currentTutorStep = TUTOR_STEPS[tutorStepIndex] ?? TUTOR_STEPS[0];

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
    setTutorStepIndex(clamped);
    setTutorRecoveryNotice(null);
    const step = TUTOR_STEPS[clamped];
    if (step?.activeNode) {
      setManualSelectedNode(step.activeNode);
    }
  };

  const handleToggleMode = (nextMode: "live" | "tutor") => {
    setMode(nextMode);
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

  const criticLoopActive =
    activeStatuses.targeted_research === "running" ||
    activeStatuses.critic_verifier === "retrying" ||
    activeEdge === "critic_verifier->targeted_research" ||
    activeEdge === "targeted_research->critic_verifier";

  const renderNodeCard = (node: WorkflowNodeMeta, wide = false) => {
    const status = activeStatuses[node.id];
    const isSelected = effectiveSelectedNode === node.id;
    const isConceptHighlighted = highlightedNodeIds.has(node.id);
    const liveCount = liveSnapshot.nodeEvents[node.id].length;

    return (
      <button
        key={node.id}
        type="button"
        onClick={() => setManualSelectedNode(node.id)}
        aria-pressed={isSelected}
        aria-label={`Inspect LangGraph node ${node.id} (${status})`}
        className={`text-left rounded-xl border p-3.5 transition-all transform-3d-card xray-tilt-card cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
          wide ? "w-full" : "w-full"
        } ${cardDepthClasses(status, isSelected, isConceptHighlighted)}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-bold text-cyan-300 font-mono shrink-0">
                {node.stepNumber}
              </span>
              <span className="text-xs font-semibold text-white truncate">
                {node.title}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-mono text-slate-400 truncate">
              {node.shortLabel}
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0 ${statusPillClasses(
              status
            )}`}
          >
            {statusIcon(status)}
            {status}
          </span>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-slate-300 line-clamp-2">
          {node.role}
        </p>

        {/* Parallel per-competitor subtask pills inside specialist_research */}
        {node.id === "specialist_research" && (
          <div className="mt-2.5 rounded-lg bg-slate-950/75 border border-slate-800 p-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                <Cpu className="w-3 h-3" />
                Parallel Sub-Tasks (Semaphore 3)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {activeSubtasks.filter((s) => s.status === "completed").length}/
                {activeSubtasks.length} done
              </span>
            </div>
            {activeSubtasks.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                Waiting for approved competitors from HITL gate...
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeSubtasks.map((sub) => (
                  <span
                    key={sub.competitor}
                    title={sub.detail}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${subtaskPillClasses(
                      sub.status
                    )}`}
                  >
                    {sub.status === "running" && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    )}
                    {sub.status === "completed" && (
                      <CheckCircle2 className="w-2.5 h-2.5" />
                    )}
                    {sub.status === "failed" && (
                      <XCircle className="w-2.5 h-2.5" />
                    )}
                    {sub.status === "pending" && <Clock className="w-2.5 h-2.5" />}
                    <span>{sub.competitor}</span>
                    {typeof sub.citationsCount === "number" && (
                      <span className="opacity-75 font-mono text-[10px]">
                        ({sub.citationsCount})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap gap-1">
            {node.conceptIds.slice(0, 2).map((cid) => {
              const cMeta = AGENTIC_CONCEPTS.find((c) => c.id === cid);
              return (
                <span
                  key={cid}
                  className="rounded bg-slate-800/90 border border-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-300"
                >
                  {cMeta?.shortTitle ?? cid}
                </span>
              );
            })}
          </div>
          {mode === "live" && liveCount > 0 && (
            <span className="text-[10px] font-mono text-cyan-300">
              {liveCount} event{liveCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Mode Bar & Playback Controls */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-indigo-700" />
              <h2 className="text-base font-bold text-slate-900">
                Workflow X-Ray &amp; Agentic AI Tutor
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                {mode === "tutor"
                  ? "Sample: FlowPulse (Zero-Key Sandbox)"
                  : productName
                    ? `Live: ${productName}`
                    : "Live Mission Trace"}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Inspect every LangGraph node, prompt contract, guardrail, parallel subtask, and Critic retry loop in real time or guided Tutor mode.
            </p>
          </div>

          <div
            role="group"
            aria-label="X-Ray mode switcher"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1"
          >
            <button
              type="button"
              onClick={() => handleToggleMode("live")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === "live"
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Live Mission X-Ray
              {run && (
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-mono text-teal-800">
                  {run.status}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode("tutor")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === "tutor"
                  ? "bg-indigo-700 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Preview Tutor (No API Key Needed)
            </button>
          </div>
        </div>

        {/* Preview Tutor Playback Bar + Scrubber */}
        {mode === "tutor" && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Play
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    goToTutorStep(tutorStepIndex - 1);
                  }}
                  disabled={tutorStepIndex === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    goToTutorStep(tutorStepIndex + 1);
                  }}
                  disabled={tutorStepIndex >= TUTOR_STEPS.length - 1}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next Step
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    goToTutorStep(0);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              <div className="text-xs font-semibold text-indigo-950">
                Step {tutorStepIndex + 1} / {TUTOR_STEPS.length}:{" "}
                <span className="font-bold">{currentTutorStep.title}</span>
              </div>
            </div>

            {/* Step Timeline Scrubber */}
            <div className="space-y-1.5">
              <input
                type="range"
                aria-label="Tutor walkthrough timeline scrubber"
                min={0}
                max={TUTOR_STEPS.length - 1}
                value={tutorStepIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  goToTutorStep(Number(e.target.value));
                }}
                className="w-full accent-indigo-700 cursor-pointer"
              />
              <div className="flex flex-wrap gap-1">
                {TUTOR_STEPS.map((step, idx) => {
                  const isCurrent = idx === tutorStepIndex;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        goToTutorStep(idx);
                      }}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        isCurrent
                          ? "bg-indigo-700 text-white"
                          : idx < tutorStepIndex
                            ? "bg-indigo-100 text-indigo-900 hover:bg-indigo-200"
                            : "bg-white text-slate-600 border border-indigo-100 hover:bg-indigo-50"
                      }`}
                    >
                      {step.stageBadge}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Notice when Live Mode has no active run */}
        {mode === "live" && !run && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <span>
              No live mission is selected yet. Launch a mission from the Dossier Workbench or explore the workflow right now in Zero-Key Preview Tutor mode.
            </span>
            <button
              type="button"
              onClick={() => handleToggleMode("tutor")}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Switch to Preview Tutor
            </button>
          </div>
        )}

        {tutorRecoveryNotice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900 flex items-center justify-between gap-2">
            <span>{tutorRecoveryNotice}</span>
            <button
              type="button"
              onClick={() => setTutorRecoveryNotice(null)}
              aria-label="Dismiss recovery notice"
              className="text-emerald-700 hover:text-emerald-950"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Clickable Agentic AI Concept Badge Strip */}
        <div className="pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Brain className="w-3.5 h-3.5 text-indigo-700" />
              Click an Agentic AI Concept Badge to highlight its nodes &amp; see how it works:
            </span>
            {selectedConcept && (
              <button
                type="button"
                onClick={() => setSelectedConceptId(null)}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline"
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${conceptBadgeStyle(
                    concept.accentColor,
                    active
                  )}`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {concept.shortTitle}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Concept Explainer Panel */}
        {selectedConcept && (
          <div className="rounded-lg border border-indigo-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedConcept.title}
                </h3>
                <p className="text-xs text-slate-600">
                  {selectedConcept.tagline}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConceptId(null)}
                aria-label="Close concept explainer"
                className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-md bg-white border border-slate-200 p-2.5">
                <p className="font-semibold text-slate-800 mb-1">
                  Plain-English Principle
                </p>
                <p className="text-slate-700 leading-relaxed">
                  {selectedConcept.beginnerExplanation}
                </p>
              </div>
              <div className="rounded-md bg-white border border-slate-200 p-2.5">
                <p className="font-semibold text-indigo-900 mb-1">
                  How MoatRadar Implements It
                </p>
                <p className="text-slate-700 leading-relaxed">
                  {selectedConcept.moatRadarImplementation}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <pre className="rounded-md bg-slate-900 text-cyan-200 px-3 py-2 text-[11px] font-mono overflow-x-auto flex-1 min-w-[260px]">
                {selectedConcept.contractSnippet}
              </pre>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600">
                  Jump to node:
                </span>
                {selectedConcept.nodeIds.map((nid) => (
                  <button
                    key={nid}
                    type="button"
                    onClick={() => setManualSelectedNode(nid)}
                    className="rounded border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-mono text-indigo-800 hover:bg-indigo-50"
                  >
                    {nid}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Failure Localization Banner with 1-Click Recovery */}
      {showFailureBanner && (
        <section
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <h3 className="text-sm font-bold text-rose-950">
                Fault Pinpointed in{" "}
                <span className="font-mono underline">{failureNodeName}</span>
                {failureCompetitor ? ` (${failureCompetitor})` : ""}
              </h3>
            </div>
            <p className="text-xs text-rose-900">{failureMessage}</p>
            <p className="text-[11px] text-rose-800">{failureHint}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50 transition-colors"
            >
              {isRetrying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Retry Stage
            </button>

            {failureCompetitor && (
              <button
                type="button"
                disabled={mode === "live" && (isRetrying || !onRetryMission)}
                onClick={() => {
                  if (mode === "tutor") {
                    handleSimulatedTutorRecovery("skip");
                  } else if (onRetryMission) {
                    void onRetryMission({ skipCompetitors: [failureCompetitor] });
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50 transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" />
                Skip {failureCompetitor} &amp; Retry
              </button>
            )}
          </div>
        </section>
      )}

      {/* Main Split: 3D-Perspective Pipeline Canvas + Side Node Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left/Center: 3D-Perspective Pipeline Visualizer */}
        <section className="xl:col-span-8 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 md:p-5 text-slate-100 shadow-lg perspective-stage overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                LangGraph 3D-Perspective DAG Topology
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-teal-400" />
                Running
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                HITL Pause
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Completed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Failed
              </span>
            </div>
          </div>

          {/* Tier 1: START -> discovery -> hitl_approval */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="flex items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-3 py-2 text-[11px] font-mono font-bold text-cyan-300 shrink-0">
              START
            </div>
            <HorizontalDataBeam active={activeEdge === "start->discovery"} />
            <div className="flex-1 min-w-0">
              {renderNodeCard(NODE_MAP.discovery)}
            </div>
            <HorizontalDataBeam
              active={
                activeEdge === "discovery->hitl_approval" ||
                activeStatuses.discovery === "completed"
              }
            />
            <div className="flex-1 min-w-0">
              {renderNodeCard(NODE_MAP.hitl_approval)}
            </div>
          </div>

          <VerticalStageBeam
            active={
              activeEdge === "hitl_approval->specialist_research" ||
              activeStatuses.specialist_research !== "idle"
            }
            label="Command(resume=approved)"
          />

          {/* Tier 2: specialist_research -> critic_verifier <-> targeted_research */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/40 p-3 space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
              <div className="lg:w-[44%] min-w-0">
                {renderNodeCard(NODE_MAP.specialist_research, true)}
              </div>

              <HorizontalDataBeam
                active={
                  activeEdge === "specialist_research->critic_verifier" ||
                  activeStatuses.critic_verifier !== "idle"
                }
              />

              <div className="flex-1 min-w-0">
                {renderNodeCard(NODE_MAP.critic_verifier)}
              </div>
            </div>

            {/* Conditional Retry Loop Arc between critic_verifier and targeted_research */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center pt-1">
              <div className="lg:col-span-5 flex items-center justify-center">
                <div className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GitBranch
                      className={`w-4 h-4 ${
                        criticLoopActive ? "text-amber-400" : "text-slate-400"
                      }`}
                    />
                    <div>
                      <p className="text-[11px] font-semibold text-slate-200">
                        Conditional Reflection Loop
                      </p>
                      <p className="text-[10px] font-mono text-slate-400">
                        _route_after_critic()
                      </p>
                    </div>
                  </div>
                  <svg
                    viewBox="0 0 120 34"
                    aria-hidden="true"
                    className="w-28 h-8 shrink-0 overflow-visible"
                  >
                    <path
                      d="M 8 24 C 35 2, 85 2, 112 24"
                      fill="none"
                      stroke={criticLoopActive ? "#f59e0b" : "#475569"}
                      strokeWidth={criticLoopActive ? 2.5 : 1.5}
                      className={criticLoopActive ? "animate-beam-flow" : ""}
                    />
                    <path
                      d="M 112 26 C 85 34, 35 34, 8 26"
                      fill="none"
                      stroke={
                        activeEdge === "targeted_research->critic_verifier"
                          ? "#38bdf8"
                          : "#475569"
                      }
                      strokeWidth={
                        activeEdge === "targeted_research->critic_verifier"
                          ? 2.5
                          : 1.3
                      }
                      className={
                        activeEdge === "targeted_research->critic_verifier"
                          ? "animate-beam-flow"
                          : ""
                      }
                    />
                    <polygon
                      points="107,18 116,24 107,28"
                      fill={criticLoopActive ? "#f59e0b" : "#475569"}
                    />
                    <polygon
                      points="13,21 4,26 13,31"
                      fill={
                        activeEdge === "targeted_research->critic_verifier"
                          ? "#38bdf8"
                          : "#475569"
                      }
                    />
                  </svg>
                </div>
              </div>

              <div className="lg:col-span-7">
                {renderNodeCard(NODE_MAP.targeted_research, true)}
              </div>
            </div>
          </div>

          <VerticalStageBeam
            active={
              activeEdge === "critic_verifier->synthesizer" ||
              activeStatuses.synthesizer !== "idle"
            }
            label="Critic passed=True"
          />

          {/* Tier 3: synthesizer -> memory_indexer -> END */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="flex-1 min-w-0">
              {renderNodeCard(NODE_MAP.synthesizer)}
            </div>
            <HorizontalDataBeam
              active={
                activeEdge === "synthesizer->memory_indexer" ||
                activeStatuses.memory_indexer !== "idle"
              }
            />
            <div className="flex-1 min-w-0">
              {renderNodeCard(NODE_MAP.memory_indexer)}
            </div>
            <HorizontalDataBeam
              active={
                activeEdge === "memory_indexer->end" ||
                activeStatuses.memory_indexer === "completed"
              }
            />
            <div className="flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 text-[11px] font-mono font-bold text-emerald-300 shrink-0">
              END
            </div>
          </div>
        </section>

        {/* Right Column: Click-Any-Node Side Inspector */}
        <aside className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4 xl:sticky xl:top-4">
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 text-xs font-bold font-mono text-indigo-800">
                  {inspectedMeta.stepNumber}
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  {inspectedMeta.title}
                </h3>
              </div>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Node ID: {inspectedMeta.id}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${
                inspectedStatus === "completed"
                  ? "bg-emerald-100 text-emerald-800"
                  : inspectedStatus === "failed"
                    ? "bg-rose-100 text-rose-800"
                    : inspectedStatus === "paused"
                      ? "bg-amber-100 text-amber-800"
                      : inspectedStatus === "running"
                        ? "bg-teal-100 text-teal-800"
                        : inspectedStatus === "retrying"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-slate-100 text-slate-600"
              }`}
            >
              {inspectedStatus}
            </span>
          </div>

          {/* HITL Shortcut in Live Mode */}
          {mode === "live" &&
            inspectedMeta.id === "hitl_approval" &&
            inspectedStatus === "paused" &&
            onOpenHitl && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-950">
                  Human-in-the-Loop Approval Required
                </p>
                <p className="text-xs text-amber-900">
                  Graph execution is paused cleanly in SQLite checkpoints. Review and approve competitors to launch parallel specialist research.
                </p>
                <button
                  type="button"
                  onClick={onOpenHitl}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Open HITL Approval Panel
                </button>
              </div>
            )}

          {/* Inspector Node Failure Recovery Controls */}
          {inspectedStatus === "failed" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
              <p className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                Stage Failure Details
              </p>
              <p className="text-xs text-rose-900">{failureMessage}</p>
              <div className="flex flex-wrap gap-2 pt-1">
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
                  className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Stage
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
                    className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <SkipForward className="w-3 h-3" />
                    Skip {failureCompetitor} &amp; Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Plain-English Narration */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-teal-700" />
              {mode === "tutor" ? "Step Narration" : "What This Stage Does"}
            </p>
            <p className="text-xs text-slate-700 leading-relaxed">
              {mode === "tutor"
                ? currentTutorStep.narration.whatIsHappening
                : inspectedMeta.role}
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <strong className="text-slate-800">Why it exists:</strong>{" "}
              {mode === "tutor"
                ? currentTutorStep.narration.whyItMatters
                : inspectedMeta.whyItExists}
            </p>
          </div>

          {/* Sanitized Runtime / Sample Telemetry */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              {mode === "tutor"
                ? "Sample Stage Telemetry"
                : "Live Sanitized Telemetry"}
            </p>
            {mode === "tutor" ? (
              <div className="space-y-1.5 text-xs text-slate-700">
                <p>
                  <strong className="text-slate-900">Inputs:</strong>{" "}
                  {currentTutorStep.sampleTelemetry.inputsSummary}
                </p>
                <p>
                  <strong className="text-slate-900">Outputs:</strong>{" "}
                  {currentTutorStep.sampleTelemetry.outputsSummary}
                </p>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-slate-600">
                  {typeof currentTutorStep.sampleTelemetry.durationMs === "number" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      {currentTutorStep.sampleTelemetry.durationMs} ms
                    </span>
                  )}
                  {typeof currentTutorStep.sampleTelemetry.criticScore === "number" && (
                    <span className="rounded bg-indigo-50 text-indigo-800 px-1.5 py-0.5">
                      Critic {(currentTutorStep.sampleTelemetry.criticScore * 100).toFixed(0)}%
                    </span>
                  )}
                  {typeof currentTutorStep.sampleTelemetry.iterationCount === "number" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      Loop #{currentTutorStep.sampleTelemetry.iterationCount}
                    </span>
                  )}
                </div>
                {currentTutorStep.sampleTelemetry.diffHeadline && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                    {currentTutorStep.sampleTelemetry.diffHeadline}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">
                    Events: {liveSnapshot.nodeEvents[inspectedMeta.id].length}
                  </span>
                  {typeof liveSnapshot.nodeDurationsMs[inspectedMeta.id] ===
                    "number" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      {liveSnapshot.nodeDurationsMs[inspectedMeta.id]} ms
                    </span>
                  )}
                  {run?.critic_score !== null && run?.critic_score !== undefined && (
                    <span className="rounded bg-indigo-50 text-indigo-800 px-1.5 py-0.5">
                      Critic {(run.critic_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {liveSnapshot.nodeEvents[inspectedMeta.id].length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No live events recorded for {inspectedMeta.id} yet.
                  </p>
                ) : (
                  <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {liveSnapshot.nodeEvents[inspectedMeta.id]
                      .slice(-4)
                      .map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] text-slate-700"
                        >
                          <span className="font-mono text-slate-500 mr-1.5">
                            [{ev.event_type}]
                          </span>
                          {ev.message}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Instructions Given (Prompt Template Summary) */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-indigo-700" />
              How Instructions Are Given
            </p>
            <p className="text-[11px] text-slate-600">
              <strong className="text-slate-800">System Role:</strong>{" "}
              {inspectedMeta.instructionsGiven.systemRole}
            </p>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              {inspectedMeta.instructionsGiven.promptSummary}
            </p>
            <div className="flex flex-wrap gap-1 pt-1">
              {inspectedMeta.instructionsGiven.injectedContext.map((ctx) => (
                <span
                  key={ctx}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700"
                >
                  {ctx}
                </span>
              ))}
            </div>
          </div>

          {/* Expected Output Schema */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-teal-700" />
              How Output Is Taken ({inspectedMeta.outputContract.schemaName})
            </p>
            <ul className="space-y-1">
              {inspectedMeta.outputContract.fields.map((field) => (
                <li
                  key={field}
                  className="text-[11px] font-mono text-slate-700 bg-slate-50 rounded px-2 py-0.5 border border-slate-100"
                >
                  {field}
                </li>
              ))}
            </ul>
          </div>

          {/* Active Guardrails */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-700" />
              Active Guardrails
            </p>
            <ul className="space-y-1">
              {inspectedMeta.activeGuardrails.map((g) => (
                <li
                  key={g}
                  className="flex items-start gap-1.5 text-[11px] text-slate-700"
                >
                  <Lock className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Concepts & Source Code References */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <FileCode2 className="w-3.5 h-3.5 text-slate-700" />
              Mapped Concepts &amp; Source Files
            </p>
            <div className="flex flex-wrap gap-1">
              {inspectedMeta.conceptIds.map((cid) => {
                const cMeta = AGENTIC_CONCEPTS.find((c) => c.id === cid);
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => handleSelectConcept(cid)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${conceptBadgeStyle(
                      cMeta?.accentColor ?? "indigo",
                      selectedConceptId === cid
                    )}`}
                  >
                    {cMeta?.shortTitle ?? cid}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1 pt-1">
              {inspectedMeta.sourceFiles.map((file) => (
                <div
                  key={file}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600"
                >
                  <Database className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{file}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

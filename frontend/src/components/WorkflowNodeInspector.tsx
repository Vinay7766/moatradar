"use client";

import { useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code2,
  Database,
  FileCode2,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  SkipForward,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import {
  AGENTIC_CONCEPTS,
  AgenticConceptId,
  NodeVisualStatus,
  SOURCE_FILE_GUIDES,
  TutorStep,
  WORKFLOW_NODES,
  WorkflowNodeId,
  WorkflowNodeMeta,
} from "@/data/agenticTutorData";
import { AgentEvent, MissionRun } from "@/lib/types";

type InspectorTab = "story" | "prompt" | "guardrails" | "code";

interface WorkflowNodeInspectorProps {
  mode: "live" | "tutor";
  inspectedMeta: WorkflowNodeMeta;
  inspectedStatus: NodeVisualStatus;
  currentTutorStep: TutorStep;
  run: MissionRun | null;
  liveNodeEvents: AgentEvent[];
  liveDurationMs?: number;
  failureMessage: string;
  failureCompetitor: string | null;
  isRetrying: boolean;
  selectedConceptId: AgenticConceptId | null;
  onSelectConcept: (id: AgenticConceptId) => void;
  onSelectNode: (id: WorkflowNodeId) => void;
  onRetryMission?: (opts?: { skipCompetitors?: string[] }) => Promise<void>;
  onSimulatedRecovery: (kind: "retry" | "skip") => void;
  onOpenHitl?: () => void;
}

const SAMPLE_PROMPT_RENDERED: Record<WorkflowNodeId, string> = {
  discovery:
    `SYSTEM: Senior Product Strategy Discovery Agent.\nTASK: Identify 3-6 real competitors for "FlowPulse" targeting "Operations Teams".\nEVIDENCE: [<source_evidence> 18 verified DuckDuckGo hits] -> JSON(_DiscoveryOutput)`,
  hitl_approval:
    `CHECKPOINT GATE (No LLM): Graph suspended cleanly in checkpoints.db.\nEmits discovered_competitors=[Zapier, Make, n8n].\nWaiting for PM payload: Command(resume=approved_competitors).`,
  specialist_research:
    `SYSTEM: Multi-domain Intelligence Specialist (Semaphore=3).\nFOR EACH competitor IN [Zapier, Make, n8n]: extract DomainFinding(product, pricing, voc, momentum) strictly from <source_evidence>.`,
  critic_verifier:
    `SYSTEM: Fact-Verification Critic (temperature=0.0).\nAUDIT: Compare DomainFindings against 63 known_urls.\nCHECK: Are pricing tiers & VoC complaints cited? Emit CriticReport(passed, gaps[]).`,
  targeted_research:
    `SYSTEM: Surgical Gap Resolver.\nEXECUTE async_search_web("Make enterprise pricing limits 2026").\nAPPEND new verified citations -> increment iteration_count -> route back to critic_verifier.`,
  synthesizer:
    `SYSTEM: Principal Product Strategist.\nTRANSFORM verified findings into DossierPayload: executive_brief_md, feature_matrix, pricing_matrix, battlecards, voc_insights, opportunities.`,
  memory_indexer:
    `PERSISTENCE STAGE (No LLM): Run compute_snapshot_diff(prev, current) -> Save SQLite Snapshot #2 -> Upsert 84 chunks into ChromaDB(workspace_id).`,
};

export function WorkflowNodeInspector({
  mode,
  inspectedMeta,
  inspectedStatus,
  currentTutorStep,
  run,
  liveNodeEvents,
  liveDurationMs,
  failureMessage,
  failureCompetitor,
  isRetrying,
  selectedConceptId,
  onSelectConcept,
  onSelectNode,
  onRetryMission,
  onSimulatedRecovery,
  onOpenHitl,
}: WorkflowNodeInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("story");
  const [showRenderedPrompt, setShowRenderedPrompt] = useState(true);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [expandedGuardrail, setExpandedGuardrail] = useState<string | null>(null);

  const nodeIdx = WORKFLOW_NODES.findIndex((n) => n.id === inspectedMeta.id);
  const prevNode = WORKFLOW_NODES[(nodeIdx - 1 + WORKFLOW_NODES.length) % WORKFLOW_NODES.length];
  const nextNode = WORKFLOW_NODES[(nodeIdx + 1) % WORKFLOW_NODES.length];

  return (
    <aside
      aria-label="Interactive node inspector"
      className="xl:col-span-4 rounded-xl border border-slate-800 bg-[#0f1623] shadow-xl flex flex-col xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] overflow-hidden"
    >
      {/* Inspector Header + Prev/Next Node Stepper */}
      <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-950/60 space-y-2.5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-teal-500/15 border border-teal-500/40 text-xs font-bold font-mono text-teal-300 shrink-0">
                {inspectedMeta.stepNumber}
              </span>
              <h3 className="text-sm font-bold text-slate-100 truncate">
                {inspectedMeta.title}
              </h3>
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
              {inspectedMeta.id}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onSelectNode(prevNode.id)}
              title={`Previous: ${prevNode.title}`}
              aria-label={`Select previous node ${prevNode.title}`}
              className="p-1 rounded-md border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-100 hover:border-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSelectNode(nextNode.id)}
              title={`Next: ${nextNode.title}`}
              aria-label={`Select next node ${nextNode.title}`}
              className="p-1 rounded-md border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-100 hover:border-slate-700 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              inspectedStatus === "completed"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : inspectedStatus === "failed"
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                  : inspectedStatus === "paused"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : inspectedStatus === "running"
                      ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                      : inspectedStatus === "retrying"
                        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                        : "border-slate-700 bg-slate-800/80 text-slate-400"
            }`}
          >
            {inspectedStatus}
          </span>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            {mode === "live" && typeof liveDurationMs === "number" && (
              <span>{liveDurationMs} ms</span>
            )}
            {mode === "tutor" &&
              typeof currentTutorStep.sampleTelemetry.durationMs === "number" && (
                <span>{currentTutorStep.sampleTelemetry.durationMs} ms</span>
              )}
          </div>
        </div>

        {/* 4 Interactive Inspector Tabs */}
        <div
          role="tablist"
          aria-label="Node inspector tabs"
          className="grid grid-cols-4 gap-1 rounded-lg bg-slate-900/90 p-1 border border-slate-800"
        >
          {(
            [
              { id: "story", label: "Story" },
              { id: "prompt", label: "Prompt" },
              { id: "guardrails", label: "Safety" },
              { id: "code", label: "Code" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "bg-teal-500/20 text-teal-200 border border-teal-500/40"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Interactive Body */}
      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-3.5 text-xs">
        {/* Contextual Actions (HITL & Failure Recovery always surfaced when relevant) */}
        {mode === "live" &&
          inspectedMeta.id === "hitl_approval" &&
          inspectedStatus === "paused" &&
          onOpenHitl && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="font-semibold text-amber-200">
                Human-in-the-Loop Gate Active
              </p>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Execution is suspended in SQLite checkpoints. Confirm approved competitors to launch specialist fan-out.
              </p>
              <button
                type="button"
                onClick={onOpenHitl}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Open HITL Approval Desk
              </button>
            </div>
          )}

        {inspectedStatus === "failed" && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 space-y-2">
            <p className="font-bold text-rose-200 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              Stage Failure Recovery
            </p>
            <p className="text-[11px] text-rose-200/90 leading-relaxed">
              {failureMessage}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={mode === "live" && (isRetrying || !onRetryMission)}
                onClick={() => {
                  if (mode === "tutor") {
                    onSimulatedRecovery("retry");
                  } else if (onRetryMission) {
                    void onRetryMission();
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
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
                      onSimulatedRecovery("skip");
                    } else if (onRetryMission) {
                      void onRetryMission({
                        skipCompetitors: [failureCompetitor],
                      });
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-950/60 disabled:opacity-50 cursor-pointer"
                >
                  <SkipForward className="w-3 h-3" />
                  Skip {failureCompetitor}
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: STORY & LIVE TELEMETRY */}
        {activeTab === "story" && (
          <>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
              <p className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-teal-400" />
                {mode === "tutor" ? "What Is Happening Now" : "Node Role"}
              </p>
              <p className="text-slate-300 leading-relaxed">
                {mode === "tutor"
                  ? currentTutorStep.narration.whatIsHappening
                  : inspectedMeta.role}
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
                <strong className="text-slate-200">Why it exists:</strong>{" "}
                {mode === "tutor"
                  ? currentTutorStep.narration.whyItMatters
                  : inspectedMeta.whyItExists}
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
              <p className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                {mode === "tutor" ? "Sample IO Snapshot" : "Live Node Telemetry"}
              </p>

              {mode === "tutor" ? (
                <div className="space-y-1.5 text-[11px] text-slate-300">
                  <p>
                    <strong className="text-teal-300">In:</strong>{" "}
                    {currentTutorStep.sampleTelemetry.inputsSummary}
                  </p>
                  <p>
                    <strong className="text-emerald-300">Out:</strong>{" "}
                    {currentTutorStep.sampleTelemetry.outputsSummary}
                  </p>
                  {typeof currentTutorStep.sampleTelemetry.criticScore === "number" && (
                    <span className="inline-block rounded border border-teal-500/30 bg-teal-500/15 px-2 py-0.5 font-mono text-teal-300">
                      Critic Score {(currentTutorStep.sampleTelemetry.criticScore * 100).toFixed(0)}%
                    </span>
                  )}
                  {currentTutorStep.sampleTelemetry.diffHeadline && (
                    <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                      {currentTutorStep.sampleTelemetry.diffHeadline}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                    <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-slate-300">
                      Events: {liveNodeEvents.length}
                    </span>
                    {run?.critic_score !== null &&
                      run?.critic_score !== undefined && (
                        <span className="rounded bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-teal-300">
                          Critic {(run.critic_score * 100).toFixed(0)}%
                        </span>
                      )}
                  </div>
                  {liveNodeEvents.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      No events logged for <span className="font-mono">{inspectedMeta.id}</span> yet.
                    </p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto studio-scroll pr-1">
                      {liveNodeEvents.slice(-5).map((ev) => (
                        <li
                          key={ev.id}
                          className="rounded border border-slate-800 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-300"
                        >
                          <span className="font-mono text-teal-400 mr-1.5">
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

            {/* Concept Badges inside Story for quick cross-highlighting */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Concepts Used Here (Click to spotlight 3D graph)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inspectedMeta.conceptIds.map((cid) => {
                  const cMeta = AGENTIC_CONCEPTS.find((c) => c.id === cid);
                  const active = selectedConceptId === cid;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => onSelectConcept(cid)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? "border-teal-400 bg-teal-500 text-slate-950 font-semibold"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:border-teal-500/50 hover:text-teal-200"
                      }`}
                    >
                      {cMeta?.shortTitle ?? cid}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* TAB 2: PROMPT & OUTPUT SCHEMA */}
        {activeTab === "prompt" && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-teal-400" />
                Prompt Contract
              </span>
              <button
                type="button"
                onClick={() => setShowRenderedPrompt((p) => !p)}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono text-teal-300 hover:border-teal-500/50 cursor-pointer"
              >
                {showRenderedPrompt ? "View Template Vars" : "View Rendered Example"}
              </button>
            </div>

            {showRenderedPrompt ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-teal-200">
                {SAMPLE_PROMPT_RENDERED[inspectedMeta.id]}
              </pre>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-slate-100">System:</strong>{" "}
                  {inspectedMeta.instructionsGiven.systemRole}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {inspectedMeta.instructionsGiven.promptSummary}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {inspectedMeta.instructionsGiven.injectedContext.map((ctx) => (
                    <span
                      key={ctx}
                      className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono text-sky-300"
                    >
                      {ctx}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
              <p className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                Structured Output ({inspectedMeta.outputContract.schemaName})
              </p>
              <ul className="space-y-1">
                {inspectedMeta.outputContract.fields.map((field) => (
                  <li
                    key={field}
                    className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-200"
                  >
                    {field}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* TAB 3: INTERACTIVE GUARDRAILS */}
        {activeTab === "guardrails" && (
          <div className="space-y-2">
            <p className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Runtime Guardrails Enforced Here
            </p>
            <div className="space-y-1.5">
              {inspectedMeta.activeGuardrails.map((g) => {
                const isOpen = expandedGuardrail === g;
                return (
                  <div
                    key={g}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedGuardrail(isOpen ? null : g)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-900/70 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 text-[11px] font-medium text-slate-200">
                        <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{g}</span>
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <p className="px-3 pb-2.5 pt-1 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
                        Active during <span className="font-mono text-teal-300">{inspectedMeta.id}</span> execution: prevents invalid URLs, schema drift, or untrusted prompt-injection strings from reaching downstream state.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: GITDIAGRAM-STYLE CODE EXPLORER */}
        {activeTab === "code" && (
          <div className="space-y-2">
            <p className="font-semibold text-slate-200 flex items-center gap-1.5">
              <FileCode2 className="w-3.5 h-3.5 text-sky-400" />
              Click Any Source File to Inspect Role
            </p>
            <div className="space-y-1.5">
              {inspectedMeta.sourceFiles.map((filePath) => {
                const guide = SOURCE_FILE_GUIDES[filePath];
                const isOpen =
                  expandedFile === filePath ||
                  (expandedFile === null && filePath === inspectedMeta.sourceFiles[0]);
                return (
                  <div
                    key={filePath}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFile(isOpen ? "" : filePath)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-900/80 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Database className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span className="font-mono text-[11px] text-slate-100 truncate">
                          {filePath}
                        </span>
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && guide && (
                      <div className="px-3 pb-3 pt-1.5 border-t border-slate-800/80 space-y-2 text-[11px]">
                        <p className="text-slate-300 leading-relaxed">{guide.role}</p>
                        <div className="flex flex-wrap gap-1">
                          {guide.keySymbols.map((sym) => (
                            <span
                              key={sym}
                              className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300"
                            >
                              {sym}
                            </span>
                          ))}
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          <strong className="text-slate-200">Data Flow:</strong>{" "}
                          {guide.flowSummary}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

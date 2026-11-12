"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Maximize2,
  PauseCircle,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  NodeVisualStatus,
  TutorSubtask,
  WORKFLOW_NODES,
  WorkflowNodeId,
  WorkflowNodeMeta,
} from "@/data/agenticTutorData";

const NODE_MAP: Record<WorkflowNodeId, WorkflowNodeMeta> = Object.fromEntries(
  WORKFLOW_NODES.map((n) => [n.id, n])
) as Record<WorkflowNodeId, WorkflowNodeMeta>;

interface WorkflowFloorplanCanvasProps {
  statuses: Record<WorkflowNodeId, NodeVisualStatus>;
  selectedNodeId: WorkflowNodeId;
  highlightedNodeIds: Set<WorkflowNodeId>;
  activeEdge: string | null;
  subtasks: TutorSubtask[];
  onSelectNode: (id: WorkflowNodeId) => void;
}

const NODE_POSITIONS: Record<
  WorkflowNodeId,
  { x: number; y: number; zone: string }
> = {
  discovery: { x: 40, y: 76, zone: "z1" },
  hitl_approval: { x: 280, y: 76, zone: "z1" },
  specialist_research: { x: 545, y: 66, zone: "z2" },
  critic_verifier: { x: 545, y: 270, zone: "z3" },
  targeted_research: { x: 805, y: 270, zone: "z3" },
  synthesizer: { x: 280, y: 270, zone: "z4" },
  memory_indexer: { x: 40, y: 270, zone: "z4" },
};

const WIRES: {
  id: string;
  d: string;
  packetColor: string;
  dashed?: boolean;
}[] = [
  {
    id: "discovery->hitl_approval",
    d: "M 236 122 C 258 122, 258 122, 280 122",
    packetColor: "#2dd4bf",
  },
  {
    id: "hitl_approval->specialist_research",
    d: "M 476 122 C 510 122, 510 112, 545 112",
    packetColor: "#2dd4bf",
  },
  {
    id: "specialist_research->critic_verifier",
    d: "M 643 176 C 643 220, 643 226, 643 270",
    packetColor: "#2dd4bf",
  },
  {
    id: "critic_verifier->targeted_research",
    d: "M 741 300 C 770 256, 778 256, 805 300",
    packetColor: "#fbbf24",
    dashed: true,
  },
  {
    id: "targeted_research->critic_verifier",
    d: "M 805 338 C 778 378, 770 378, 741 338",
    packetColor: "#38bdf8",
    dashed: true,
  },
  {
    id: "critic_verifier->synthesizer",
    d: "M 545 316 C 510 316, 510 316, 476 316",
    packetColor: "#34d399",
  },
  {
    id: "synthesizer->memory_indexer",
    d: "M 280 316 C 258 316, 258 316, 236 316",
    packetColor: "#34d399",
  },
];

function cardStyle(
  status: NodeVisualStatus,
  isSelected: boolean,
  isConceptMatch: boolean,
  isDimmed: boolean
): string {
  const base =
    status === "running"
      ? "border-teal-400 bg-slate-900/95 shadow-[0_0_24px_rgba(45,212,191,0.22)]"
      : status === "paused"
        ? "border-amber-400 bg-slate-900/95 shadow-[0_0_22px_rgba(251,191,36,0.18)]"
        : status === "completed"
          ? "border-emerald-500/70 bg-slate-900/95"
          : status === "failed"
            ? "border-rose-500 bg-rose-950/40 shadow-[0_0_22px_rgba(244,63,94,0.25)]"
            : status === "retrying"
              ? "border-sky-400 bg-slate-900/95"
              : "border-slate-700/80 bg-slate-900/80";

  const ring = isSelected
    ? " ring-2 ring-teal-400 ring-offset-2 ring-offset-[#070b12]"
    : isConceptMatch
      ? " ring-2 ring-sky-400/80"
      : "";

  const fade = isDimmed ? " opacity-35" : " opacity-100";
  return `${base}${ring}${fade}`;
}

function StatusGlyph({ status }: { status: NodeVisualStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin" />;
    case "paused":
      return <PauseCircle className="w-3.5 h-3.5 text-amber-400" />;
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "retrying":
      return <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />;
    case "failed":
      return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-slate-500" />;
  }
}

export function WorkflowFloorplanCanvas({
  statuses,
  selectedNodeId,
  highlightedNodeIds,
  activeEdge,
  subtasks,
  onSelectNode,
}: WorkflowFloorplanCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<WorkflowNodeId | null>(null);

  const hasFilter = highlightedNodeIds.size > 0;

  return (
    <div className="relative h-[530px] w-full rounded-xl border border-slate-800 bg-blueprint-grid overflow-hidden select-none">
      {/* Top Pan/Zoom Toolbar (Floorplan Style) */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/90 backdrop-blur-md p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.12).toFixed(2))))}
            aria-label="Zoom out blueprint"
            className="p-1.5 rounded text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-[11px] font-mono text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.12).toFixed(2))))}
            aria-label="Zoom in blueprint"
            className="p-1.5 rounded text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-teal-300 hover:bg-slate-800 cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            Fit
          </button>
        </div>

        <div className="rounded-lg border border-slate-700/80 bg-slate-950/90 backdrop-blur-md px-2.5 py-1 text-[11px] text-slate-300">
          Drag background to pan · Hover a node to trace wires
        </div>
      </div>

      {/* Interactive Pannable/Zoomable Architectural Floorplan */}
      <div
        className={`h-full w-full ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setDragging({
            startX: e.clientX,
            startY: e.clientY,
            originX: pan.x,
            originY: pan.y,
          });
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          setPan({
            x: dragging.originX + (e.clientX - dragging.startX),
            y: dragging.originY + (e.clientY - dragging.startY),
          });
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.08 : -0.08;
          setZoom((z) => Math.min(1.5, Math.max(0.65, Number((z + delta).toFixed(2)))));
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            width: 1040,
            height: 450,
          }}
          className="relative mx-auto mt-10 transition-transform duration-75"
        >
          {/* Architectural Zone Rooms */}
          <div className="absolute left-5 top-10 w-[470px] h-[165px] rounded-2xl border border-teal-500/25 bg-slate-900/35">
            <span className="px-3 py-1 inline-block text-[10px] font-mono font-bold uppercase tracking-wider text-teal-400/90">
              Room 01 · Ingestion &amp; HITL Gate
            </span>
          </div>
          <div className="absolute left-[515px] top-10 w-[495px] h-[165px] rounded-2xl border border-sky-500/25 bg-slate-900/35">
            <span className="px-3 py-1 inline-block text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400/90">
              Room 02 · Concurrent Collector Workers
            </span>
          </div>
          <div className="absolute left-[515px] top-[226px] w-[495px] h-[175px] rounded-2xl border border-amber-500/25 bg-slate-900/35">
            <span className="px-3 py-1 inline-block text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400/90">
              Room 03 · Critic Audit &amp; Reflection Loop
            </span>
          </div>
          <div className="absolute left-5 top-[226px] w-[470px] h-[175px] rounded-2xl border border-emerald-500/25 bg-slate-900/35">
            <span className="px-3 py-1 inline-block text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400/90">
              Room 04 · Synthesis &amp; Vector Memory
            </span>
          </div>

          {/* SVG Spatial Data Wires */}
          <svg
            width={1040}
            height={450}
            className="absolute inset-0 pointer-events-none"
          >
            {WIRES.map((wire) => {
              const [from, to] = wire.id.split("->") as [
                WorkflowNodeId,
                WorkflowNodeId,
              ];
              const isEdgeActive = activeEdge === wire.id;
              const isHoverLinked =
                hoveredNodeId === from || hoveredNodeId === to;
              const fromCompleted = statuses[from] === "completed";
              const lit = isEdgeActive || isHoverLinked || fromCompleted;

              return (
                <g key={wire.id}>
                  <path
                    d={wire.d}
                    fill="none"
                    stroke={
                      isEdgeActive || isHoverLinked
                        ? wire.packetColor
                        : fromCompleted
                          ? "#10b981"
                          : "#334155"
                    }
                    strokeWidth={isEdgeActive || isHoverLinked ? 3 : 2}
                    strokeOpacity={lit ? 0.95 : 0.45}
                    strokeDasharray={wire.dashed && !isEdgeActive ? "6 5" : undefined}
                    className={isEdgeActive || isHoverLinked ? "animate-beam-flow" : ""}
                  />
                  {(isEdgeActive || isHoverLinked) && (
                    <circle r="4.5" fill={wire.packetColor}>
                      <animateMotion dur="1.4s" repeatCount="indefinite" path={wire.d} />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Architectural Node Cards */}
          {(Object.keys(NODE_POSITIONS) as WorkflowNodeId[]).map((id) => {
            const meta = NODE_MAP[id];
            const pos = NODE_POSITIONS[id];
            const status = statuses[id];
            const isSelected = selectedNodeId === id;
            const isConceptMatch = highlightedNodeIds.has(id);
            const dimmed =
              (hasFilter && !isConceptMatch && !isSelected) ||
              (hoveredNodeId !== null &&
                hoveredNodeId !== id &&
                !WIRES.some(
                  (w) =>
                    (w.id.startsWith(`${hoveredNodeId}->`) && w.id.endsWith(`->${id}`)) ||
                    (w.id.endsWith(`->${hoveredNodeId}`) && w.id.startsWith(`${id}->`))
                ));

            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectNode(id)}
                onMouseEnter={() => setHoveredNodeId(id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                style={{ left: pos.x, top: pos.y }}
                className={`absolute w-[196px] rounded-xl border p-3 text-left transition-all cursor-pointer ${cardStyle(
                  status,
                  isSelected,
                  isConceptMatch,
                  dimmed
                )}`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold text-teal-300 flex items-center justify-center shrink-0">
                      {meta.stepNumber}
                    </span>
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {meta.title}
                    </span>
                  </span>
                  <StatusGlyph status={status} />
                </div>

                <p className="mt-1.5 font-mono text-[10px] text-slate-400 truncate">
                  {meta.id} · {status}
                </p>

                {id === "specialist_research" && subtasks.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800 flex flex-wrap gap-1">
                    {subtasks.slice(0, 4).map((st) => (
                      <span
                        key={st.competitor}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium border ${
                          st.status === "completed"
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : st.status === "failed"
                              ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                              : st.status === "running"
                                ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                                : "border-slate-700 bg-slate-800 text-slate-400"
                        }`}
                      >
                        {st.competitor}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}

          {/* Orbit Worker Summary Chip inside Room 2 */}
          {subtasks.length > 0 && (
            <div
              style={{ left: 775, top: 76 }}
              className="absolute w-[210px] rounded-xl border border-slate-800 bg-slate-950/90 p-2.5 space-y-1.5"
            >
              <p className="text-[10px] font-mono font-bold uppercase text-sky-300">
                Parallel Fan-Out Pods ({subtasks.length})
              </p>
              <div className="space-y-1">
                {subtasks.slice(0, 3).map((st) => (
                  <div
                    key={st.competitor}
                    className="flex items-center justify-between text-[11px] text-slate-300"
                  >
                    <span className="truncate font-medium">{st.competitor}</span>
                    <span
                      className={`font-mono text-[10px] ${
                        st.status === "completed"
                          ? "text-emerald-400"
                          : st.status === "failed"
                            ? "text-rose-400"
                            : st.status === "running"
                              ? "text-teal-400"
                              : "text-slate-500"
                      }`}
                    >
                      {st.citationsCount ? `${st.citationsCount} src` : st.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

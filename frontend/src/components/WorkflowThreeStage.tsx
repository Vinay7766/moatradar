"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Compass, Layers, RotateCcw } from "lucide-react";
import {
  NodeVisualStatus,
  TutorSubtask,
  WORKFLOW_NODES,
  WorkflowNodeId,
} from "@/data/agenticTutorData";

interface WorkflowThreeStageProps {
  statuses: Record<WorkflowNodeId, NodeVisualStatus>;
  selectedNodeId: WorkflowNodeId;
  highlightedNodeIds: Set<WorkflowNodeId>;
  activeEdge: string | null;
  subtasks: TutorSubtask[];
  onSelectNode: (id: WorkflowNodeId) => void;
  onSwitchToFloorplan?: () => void;
}

type CameraPreset = "iso" | "top" | "front";

const NODE_COORDS: Record<WorkflowNodeId, [number, number, number]> = {
  discovery: [-7.2, 0.7, -3.2],
  hitl_approval: [-2.4, 0.7, -3.2],
  specialist_research: [2.8, 0.85, -3.0],
  critic_verifier: [2.8, 0.85, 2.2],
  targeted_research: [7.6, 1.35, -0.4],
  synthesizer: [-2.4, 0.7, 3.0],
  memory_indexer: [-7.2, 0.7, 3.0],
};

const EDGE_DEFS: {
  id: string;
  from: WorkflowNodeId;
  to: WorkflowNodeId;
  archHeight?: number;
  sideOffset?: number;
}[] = [
  { id: "discovery->hitl_approval", from: "discovery", to: "hitl_approval" },
  {
    id: "hitl_approval->specialist_research",
    from: "hitl_approval",
    to: "specialist_research",
  },
  {
    id: "specialist_research->critic_verifier",
    from: "specialist_research",
    to: "critic_verifier",
  },
  {
    id: "critic_verifier->targeted_research",
    from: "critic_verifier",
    to: "targeted_research",
    archHeight: 1.9,
    sideOffset: 0.7,
  },
  {
    id: "targeted_research->critic_verifier",
    from: "targeted_research",
    to: "critic_verifier",
    archHeight: 0.6,
    sideOffset: -0.7,
  },
  {
    id: "critic_verifier->synthesizer",
    from: "critic_verifier",
    to: "synthesizer",
  },
  {
    id: "synthesizer->memory_indexer",
    from: "synthesizer",
    to: "memory_indexer",
  },
];

const ZONES: {
  title: string;
  x: number;
  z: number;
  w: number;
  d: number;
  color: number;
}[] = [
  {
    title: "ZONE 1 · DISCOVERY & GATE",
    x: -4.8,
    z: -3.2,
    w: 7.4,
    d: 3.4,
    color: 0x0f766e,
  },
  {
    title: "ZONE 2 · PARALLEL FAN-OUT",
    x: 5.0,
    z: -2.9,
    w: 7.2,
    d: 3.8,
    color: 0x0284c7,
  },
  {
    title: "ZONE 3 · CRITIC REFLECTION LOOP",
    x: 5.0,
    z: 1.6,
    w: 7.2,
    d: 3.6,
    color: 0xd97706,
  },
  {
    title: "ZONE 4 · SYNTHESIS & MEMORY",
    x: -4.8,
    z: 3.0,
    w: 7.4,
    d: 3.4,
    color: 0x059669,
  },
];

function statusHex(status: NodeVisualStatus): number {
  switch (status) {
    case "running":
      return 0x2dd4bf;
    case "paused":
      return 0xfbbf24;
    case "completed":
      return 0x34d399;
    case "retrying":
      return 0x38bdf8;
    case "failed":
      return 0xfb7185;
    default:
      return 0x64748b;
  }
}

function makeLabelTexture(
  stepNum: string,
  title: string,
  subtitle: string,
  accentCss: string
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 148;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Pill dark glass background
    ctx.fillStyle = "rgba(8, 12, 20, 0.90)";
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 22);
    ctx.fill();
    ctx.stroke();

    // Step circle badge
    ctx.fillStyle = accentCss;
    ctx.beginPath();
    ctx.arc(54, 56, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#080c14";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stepNum, 54, 57);

    // Title
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title.slice(0, 24), 88, 56);

    // Mono node id subtitle
    ctx.fillStyle = "#94a3b8";
    ctx.font = "22px monospace";
    ctx.fillText(subtitle, 88, 98);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeZoneTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(4, 6, 504, 52, 12);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 33);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function WorkflowThreeStage({
  statuses,
  selectedNodeId,
  highlightedNodeIds,
  activeEdge,
  subtasks,
  onSelectNode,
  onSwitchToFloorplan,
}: WorkflowThreeStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<WorkflowNodeId | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("iso");

  // Mutable live props ref synchronized via effect so animation loop stays smooth without rebuilding WebGL scene
  const livePropsRef = useRef({
    statuses,
    selectedNodeId,
    highlightedNodeIds,
    activeEdge,
    subtasks,
    onSelectNode,
  });

  useEffect(() => {
    livePropsRef.current = {
      statuses,
      selectedNodeId,
      highlightedNodeIds,
      activeEdge,
      subtasks,
      onSelectNode,
    };
  });

  const presetTriggerRef = useRef<((preset: CameraPreset) => void) | null>(
    null
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setWebglError(true));
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b12, 0.022);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(0.5, 11.5, 13.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = 7;
    controls.maxDistance = 28;
    controls.target.set(0.2, 0.6, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.85);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0x5eead4, 1.35);
    keyLight.position.set(8, 16, 10);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-12, 8, -10);
    scene.add(rimLight);

    // Architectural blueprint grid floor
    const grid = new THREE.GridHelper(28, 28, 0x1e293b, 0x0f172a);
    grid.position.y = 0;
    scene.add(grid);

    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableMaterials: THREE.Material[] = [];
    const disposableTextures: THREE.Texture[] = [];

    // Architectural Zone Slabs
    ZONES.forEach((zone) => {
      const slabGeo = new THREE.BoxGeometry(zone.w, 0.12, zone.d);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.75,
        metalness: 0.25,
        transparent: true,
        opacity: 0.82,
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(zone.x, 0.06, zone.z);
      scene.add(slab);

      const edgeGeo = new THREE.EdgesGeometry(slabGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: zone.color,
        transparent: true,
        opacity: 0.45,
      });
      const wire = new THREE.LineSegments(edgeGeo, edgeMat);
      wire.position.copy(slab.position);
      scene.add(wire);

      const zoneTex = makeZoneTexture(zone.title);
      const zoneMat = new THREE.SpriteMaterial({
        map: zoneTex,
        transparent: true,
        depthWrite: false,
      });
      const zoneSprite = new THREE.Sprite(zoneMat);
      zoneSprite.scale.set(4.5, 0.56, 1);
      zoneSprite.position.set(zone.x, 0.28, zone.z + zone.d / 2 - 0.35);
      scene.add(zoneSprite);

      disposableGeometries.push(slabGeo, edgeGeo);
      disposableMaterials.push(slabMat, edgeMat, zoneMat);
      disposableTextures.push(zoneTex);
    });

    // Interactive Node Pedestals
    type NodeRig = {
      id: WorkflowNodeId;
      group: THREE.Group;
      coreMesh: THREE.Mesh;
      coreMat: THREE.MeshStandardMaterial;
      ringMesh: THREE.Mesh;
      ringMat: THREE.MeshBasicMaterial;
      baseY: number;
    };

    const nodeRigs: Record<WorkflowNodeId, NodeRig> = {} as Record<
      WorkflowNodeId,
      NodeRig
    >;
    const pickables: THREE.Object3D[] = [];

    const coreGeo = new THREE.BoxGeometry(2.35, 0.65, 1.45);
    const capGeo = new THREE.BoxGeometry(2.05, 0.14, 1.15);
    const ringGeo = new THREE.RingGeometry(1.38, 1.54, 36);
    disposableGeometries.push(coreGeo, capGeo, ringGeo);

    WORKFLOW_NODES.forEach((meta) => {
      const [nx, ny, nz] = NODE_COORDS[meta.id];
      const group = new THREE.Group();
      group.position.set(nx, ny, nz);

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0f172a,
        emissiveIntensity: 0.4,
        roughness: 0.35,
        metalness: 0.55,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { nodeId: meta.id };
      group.add(coreMesh);
      pickables.push(coreMesh);

      const capMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.6,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.y = 0.4;
      capMesh.userData = { nodeId: meta.id };
      group.add(capMesh);
      pickables.push(capMesh);

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = -0.34;
      group.add(ringMesh);

      const labelTex = makeLabelTexture(
        String(meta.stepNumber),
        meta.title,
        meta.id,
        "#2dd4bf"
      );
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex,
        transparent: true,
        depthWrite: false,
      });
      const labelSprite = new THREE.Sprite(labelMat);
      labelSprite.scale.set(3.25, 0.94, 1);
      labelSprite.position.set(0, 1.32, 0);
      group.add(labelSprite);

      scene.add(group);
      nodeRigs[meta.id] = {
        id: meta.id,
        group,
        coreMesh,
        coreMat,
        ringMesh,
        ringMat,
        baseY: ny,
      };
      disposableMaterials.push(coreMat, capMat, ringMat, labelMat);
      disposableTextures.push(labelTex);
    });

    // Edge spline tubes + animated data packets
    type EdgeRig = {
      id: string;
      curve: THREE.CatmullRomCurve3;
      tubeMat: THREE.MeshBasicMaterial;
      packetMesh: THREE.Mesh;
      packetMat: THREE.MeshBasicMaterial;
      phase: number;
    };

    const packetGeo = new THREE.SphereGeometry(0.14, 14, 14);
    disposableGeometries.push(packetGeo);

    const edgeRigs: EdgeRig[] = EDGE_DEFS.map((edge, idx) => {
      const start = new THREE.Vector3(...NODE_COORDS[edge.from]);
      const end = new THREE.Vector3(...NODE_COORDS[edge.to]);
      const mid = start.clone().lerp(end, 0.5);
      mid.y += edge.archHeight ?? 0.55;
      if (edge.sideOffset) {
        mid.z += edge.sideOffset;
      }

      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.055, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.75,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);

      const packetMat = new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        transparent: true,
        opacity: 0.95,
      });
      const packetMesh = new THREE.Mesh(packetGeo, packetMat);
      scene.add(packetMesh);

      disposableGeometries.push(tubeGeo);
      disposableMaterials.push(tubeMat, packetMat);

      return {
        id: edge.id,
        curve,
        tubeMat,
        packetMesh,
        packetMat,
        phase: (idx * 0.19) % 1,
      };
    });

    // Dynamic orbiting satellite pods around specialist_research
    const podGroup = new THREE.Group();
    const specPos = NODE_COORDS.specialist_research;
    podGroup.position.set(specPos[0], specPos[1] + 0.1, specPos[2]);
    scene.add(podGroup);

    const podGeo = new THREE.OctahedronGeometry(0.24, 0);
    disposableGeometries.push(podGeo);
    const podPool: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        emissive: 0x0f766e,
        emissiveIntensity: 0.6,
        roughness: 0.25,
        metalness: 0.7,
      });
      const mesh = new THREE.Mesh(podGeo, mat);
      mesh.visible = false;
      podGroup.add(mesh);
      podPool.push({ mesh, mat });
      disposableMaterials.push(mat);
    }

    // Camera transition state
    let camTweenTargetPos: THREE.Vector3 | null = null;
    let camTweenTargetLook: THREE.Vector3 | null = null;

    presetTriggerRef.current = (preset: CameraPreset) => {
      setCameraPreset(preset);
      if (preset === "iso") {
        camTweenTargetPos = new THREE.Vector3(0.5, 11.5, 13.8);
        camTweenTargetLook = new THREE.Vector3(0.2, 0.6, 0);
      } else if (preset === "top") {
        camTweenTargetPos = new THREE.Vector3(0.2, 18.5, 0.8);
        camTweenTargetLook = new THREE.Vector3(0.2, 0.5, 0);
      } else {
        camTweenTargetPos = new THREE.Vector3(0.2, 4.8, 16.5);
        camTweenTargetLook = new THREE.Vector3(0.2, 0.8, 0);
      }
    };

    // Raycaster hover & click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const updatePointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      // Cancel preset tween immediately when user grabs controls
      camTweenTargetPos = null;
      camTweenTargetLook = null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      const hitNode = hits[0]?.object?.userData?.nodeId as
        | WorkflowNodeId
        | undefined;
      renderer.domElement.style.cursor = hitNode ? "pointer" : "grab";
      setHoveredNode((prev) => (prev === (hitNode ?? null) ? prev : hitNode ?? null));
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dx = Math.abs(e.clientX - pointerDownPos.x);
      const dy = Math.abs(e.clientY - pointerDownPos.y);
      if (dx > 6 || dy > 6) return; // drag orbit, not click
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      const hitNode = hits[0]?.object?.userData?.nodeId as
        | WorkflowNodeId
        | undefined;
      if (hitNode) {
        livePropsRef.current.onSelectNode(hitNode);
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    // Resize observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation loop
    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const {
        statuses: curStatuses,
        selectedNodeId: curSelected,
        highlightedNodeIds: curHighlighted,
        activeEdge: curActiveEdge,
        subtasks: curSubtasks,
      } = livePropsRef.current;

      const hasConceptFilter = curHighlighted.size > 0;

      // Update nodes
      (Object.keys(nodeRigs) as WorkflowNodeId[]).forEach((id, idx) => {
        const rig = nodeRigs[id];
        const status = curStatuses[id];
        const isSelected = curSelected === id;
        const isConceptMatch = curHighlighted.has(id);
        const dimmed = hasConceptFilter && !isConceptMatch && !isSelected;

        const baseColor = statusHex(status);
        rig.coreMat.color.setHex(dimmed ? 0x0f172a : 0x1e293b);
        rig.coreMat.emissive.setHex(baseColor);
        rig.coreMat.emissiveIntensity =
          status === "running" || status === "retrying"
            ? 0.45 + 0.25 * Math.sin(elapsed * 4.5 + idx)
            : isSelected || isConceptMatch
              ? 0.5
              : dimmed
                ? 0.08
                : 0.24;

        rig.ringMat.color.setHex(isSelected ? 0x5eead4 : baseColor);
        rig.ringMat.opacity = isSelected
          ? 0.95
          : status === "running" || status === "paused"
            ? 0.65 + 0.25 * Math.sin(elapsed * 4)
            : dimmed
              ? 0.12
              : 0.45;

        const targetScale = isSelected ? 1.09 : isConceptMatch ? 1.04 : 1.0;
        rig.group.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          0.12
        );
        const bob =
          status === "running" || isSelected
            ? Math.sin(elapsed * 2.4 + idx) * 0.08
            : 0;
        rig.group.position.y = rig.baseY + bob;
      });

      // Update edges & data packets
      edgeRigs.forEach((edge, i) => {
        const isEdgeActive = curActiveEdge === edge.id;
        const fromId = edge.id.split("->")[0] as WorkflowNodeId;
        const fromCompleted = curStatuses[fromId] === "completed";

        if (isEdgeActive) {
          edge.tubeMat.color.setHex(0x2dd4bf);
          edge.tubeMat.opacity = 0.95;
          edge.packetMesh.visible = true;
          edge.packetMat.color.setHex(
            edge.id.includes("targeted_research") ? 0xfbbf24 : 0x5eead4
          );
          const t = (elapsed * 0.68 + edge.phase) % 1;
          edge.curve.getPointAt(t, edge.packetMesh.position);
        } else if (fromCompleted) {
          edge.tubeMat.color.setHex(0x10b981);
          edge.tubeMat.opacity = 0.45;
          edge.packetMesh.visible = true;
          edge.packetMat.color.setHex(0x34d399);
          const t = (elapsed * 0.25 + i * 0.22) % 1;
          edge.curve.getPointAt(t, edge.packetMesh.position);
        } else {
          edge.tubeMat.color.setHex(0x334155);
          edge.tubeMat.opacity = 0.42;
          edge.packetMesh.visible = false;
        }
      });

      // Update orbiting competitor subtask satellites
      const visiblePods = curSubtasks.slice(0, 6);
      podPool.forEach((pod, i) => {
        const task = visiblePods[i];
        if (!task) {
          pod.mesh.visible = false;
          return;
        }
        pod.mesh.visible = true;
        const angle = (i / Math.max(visiblePods.length, 1)) * Math.PI * 2 + elapsed * 0.55;
        const radius = 1.95;
        pod.mesh.position.set(
          Math.cos(angle) * radius,
          0.35 + Math.sin(elapsed * 2 + i) * 0.12,
          Math.sin(angle) * radius
        );
        pod.mesh.rotation.y = elapsed * 1.3 + i;
        const hex =
          task.status === "completed"
            ? 0x34d399
            : task.status === "failed"
              ? 0xfb7185
              : task.status === "running"
                ? 0x2dd4bf
                : 0x64748b;
        pod.mat.color.setHex(hex);
        pod.mat.emissive.setHex(hex);
      });

      // Smooth preset camera transition
      if (camTweenTargetPos && camTweenTargetLook) {
        camera.position.lerp(camTweenTargetPos, 0.08);
        controls.target.lerp(camTweenTargetLook, 0.08);
        if (camera.position.distanceTo(camTweenTargetPos) < 0.06) {
          camTweenTargetPos = null;
          camTweenTargetLook = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      disposableGeometries.forEach((g) => g.dispose());
      disposableMaterials.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglError) {
    return (
      <div className="h-[520px] rounded-xl border border-slate-800 bg-blueprint-grid flex flex-col items-center justify-center p-6 text-center space-y-3">
        <Box className="w-8 h-8 text-teal-400" />
        <p className="text-sm font-semibold text-slate-100">
          3D WebGL context unavailable in this browser session
        </p>
        <p className="text-xs text-slate-400 max-w-md">
          Switch cleanly to the interactive 2D Architectural Floorplan canvas to inspect and zoom the pipeline.
        </p>
        {onSwitchToFloorplan && (
          <button
            type="button"
            onClick={onSwitchToFloorplan}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400"
          >
            <Layers className="w-3.5 h-3.5" />
            Switch to 2D Floorplan Canvas
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-[530px] w-full rounded-xl border border-slate-800 bg-blueprint-grid overflow-hidden">
      {/* Three.js Canvas Mount */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Top-Left Camera Controls HUD */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/85 backdrop-blur-md p-1 shadow-lg">
          <Compass className="w-3.5 h-3.5 text-teal-400 ml-1.5 mr-0.5" />
          {(
            [
              { id: "iso", label: "3D Isometric" },
              { id: "top", label: "Top Plan" },
              { id: "front", label: "Side Profile" },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => presetTriggerRef.current?.(preset.id)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                cameraPreset === preset.id
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                  : "text-slate-400 hover:text-slate-100 border border-transparent"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => presetTriggerRef.current?.("iso")}
            title="Reset 3D camera"
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Hovered or Interaction Hint Pill */}
        <div className="rounded-lg border border-slate-700/80 bg-slate-950/85 backdrop-blur-md px-2.5 py-1 text-[11px] text-slate-300">
          {hoveredNode ? (
            <span>
              Click to inspect{" "}
              <strong className="font-mono text-teal-300">{hoveredNode}</strong>
            </span>
          ) : (
            <span>Drag to orbit · Scroll to zoom · Click any 3D module</span>
          )}
        </div>
      </div>

      {/* Bottom Legend HUD */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            Running
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            HITL Pause
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            Critic Loop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            Failed
          </span>
        </div>

        {subtasks.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/85 backdrop-blur-md px-2.5 py-1 text-[11px] text-slate-300">
            <span className="font-mono text-teal-300">{subtasks.length}</span> orbiting competitor satellites
          </div>
        )}
      </div>
    </div>
  );
}

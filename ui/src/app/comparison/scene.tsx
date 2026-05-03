"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Line, Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { providerHex } from "@/lib/showcase-helpers";
import {
  buildManifold,
  findCornerOccupants,
  type AxisRanges,
  type CornerLabel,
  type Hover,
  type LabPoint,
  type Variant,
  type View,
} from "./scene-data";
import {
  pickTicks,
  tickFraction,
  formatCostTick,
  formatLatencyTick,
  formatEloTick,
} from "./ticks";

// ─── Geometry constants ──────────────────────────────────────────────────────

const SCALE = 1.6;
const RADIUS_2D = 5.2;
const RADIUS_3D = 6.6;
const DOT_R = 0.05;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// ─── View configs ────────────────────────────────────────────────────────────

interface ViewConfig {
  angle: number;
  height: number;
  radius: number;
  xSpread: number;
  zSpread: number;
  flatness: number;
  mix: [number, number, number];
  /** 0 normally; 0..1 during 2D↔2D transitions to drive the cube-edge peek */
  peekFactor: number;
}

const VIEW_CONFIGS: Record<View, ViewConfig> = {
  cost:    { angle: 0,           height: 0,   radius: RADIUS_2D, xSpread: 1, zSpread: 0, flatness: 1, mix: [1, 0, 0], peekFactor: 0 },
  latency: { angle: Math.PI / 2, height: 0,   radius: RADIUS_2D, xSpread: 0, zSpread: 1, flatness: 1, mix: [0, 1, 0], peekFactor: 0 },
  "3d":    { angle: Math.PI / 4, height: 2.6, radius: RADIUS_3D, xSpread: 1, zSpread: 1, flatness: 0, mix: [0, 0, 1], peekFactor: 0 },
};

const PEEK_HEIGHT = 1.05;       // camera Y bump at midpoint of 2D↔2D
const PEEK_FLAT_DROP = 0.25;    // briefly drops flatness to add 3D shading hint
const STEP_2D_TO_2D = 0.011;    // ~1.5s
const STEP_OTHER = 0.018;       // ~0.9s

function configFromCamera(
  camera: THREE.Camera,
  currentMix: [number, number, number],
  currentXSpread: number,
  currentZSpread: number,
  currentFlatness: number
): ViewConfig {
  const x = camera.position.x;
  const y = camera.position.y;
  const z = camera.position.z;
  const radius = Math.max(0.001, Math.sqrt(x * x + z * z));
  const angle = Math.atan2(-x, z);
  return {
    angle,
    height: y,
    radius,
    xSpread: currentXSpread,
    zSpread: currentZSpread,
    flatness: currentFlatness,
    mix: [...currentMix] as [number, number, number],
    peekFactor: 0,
  };
}

function lerpConfig(a: ViewConfig, b: ViewConfig, t: number): ViewConfig {
  let da = b.angle - a.angle;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;
  return {
    angle: a.angle + da * t,
    height: a.height + (b.height - a.height) * t,
    radius: a.radius + (b.radius - a.radius) * t,
    xSpread: a.xSpread + (b.xSpread - a.xSpread) * t,
    zSpread: a.zSpread + (b.zSpread - a.zSpread) * t,
    flatness: a.flatness + (b.flatness - a.flatness) * t,
    mix: [
      a.mix[0] + (b.mix[0] - a.mix[0]) * t,
      a.mix[1] + (b.mix[1] - a.mix[1]) * t,
      a.mix[2] + (b.mix[2] - a.mix[2]) * t,
    ],
    peekFactor: 0,
  };
}

function isFlat2DConfig(cfg: ViewConfig): boolean {
  return cfg.flatness > 0.7 && Math.abs(cfg.height) < 0.5;
}

function applyCameraFromConfig(camera: THREE.Camera, cfg: ViewConfig) {
  const x = -cfg.radius * Math.sin(cfg.angle);
  const z = cfg.radius * Math.cos(cfg.angle);
  camera.position.set(x, cfg.height, z);
  camera.lookAt(0, 0, 0);
}

function pointPosition(p: LabPoint, cfg: ViewConfig): [number, number, number] {
  return [p.nx * SCALE * cfg.xSpread, p.ny * SCALE, p.nz * SCALE * cfg.zSpread];
}

function frontierScore(p: LabPoint, mix: [number, number, number]): number {
  return (
    mix[0] * (p.isFrontierCost ? 1 : 0) +
    mix[1] * (p.isFrontierLat ? 1 : 0) +
    mix[2] * (p.isFrontier3d ? 1 : 0)
  );
}

// ─── NDC axis-edge picker ──────────────────────────────────────────────────
// Picks which of the 4 candidate cube edges parallel to a given axis should
// host that axis's label/ticks, based on screen-space NDC projection. Robust
// under arbitrary orbits.

type V3 = [number, number, number];
interface Edge { start: V3; end: V3; midpoint: V3 }

const _ndc = new THREE.Vector3();

function midpoint(a: V3, b: V3): V3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

// 4 candidate edges parallel to each axis. Coordinates are at the cube extremes
// (±SCALE on the perpendicular axes).
function candidateEdges(axis: "x" | "y" | "z"): Edge[] {
  const s = SCALE;
  const edges: Edge[] = [];
  const make = (a: V3, b: V3): Edge => ({ start: a, end: b, midpoint: midpoint(a, b) });

  if (axis === "x") {
    edges.push(
      make([-s, -s, -s], [s, -s, -s]),
      make([-s, -s,  s], [s, -s,  s]),
      make([-s,  s, -s], [s,  s, -s]),
      make([-s,  s,  s], [s,  s,  s]),
    );
  } else if (axis === "z") {
    edges.push(
      make([-s, -s, -s], [-s, -s,  s]),
      make([ s, -s, -s], [ s, -s,  s]),
      make([-s,  s, -s], [-s,  s,  s]),
      make([ s,  s, -s], [ s,  s,  s]),
    );
  } else {
    edges.push(
      make([-s, -s, -s], [-s,  s, -s]),
      make([ s, -s, -s], [ s,  s, -s]),
      make([-s, -s,  s], [-s,  s,  s]),
      make([ s, -s,  s], [ s,  s,  s]),
    );
  }
  return edges;
}

// Pick the edge whose midpoint, projected to NDC, is most "outside" the cube
// in the direction we want for that axis label:
//   - X / Z axes: bottom of screen (most negative NDC y)
//   - Y axis:     side of screen (most extreme NDC x)
// Tie-break by NDC z (closer to camera = less occluded).
function pickAxisEdge(axis: "x" | "y" | "z", camera: THREE.Camera): Edge {
  const edges = candidateEdges(axis);
  let best = edges[0];
  let bestScore = -Infinity;

  for (const e of edges) {
    _ndc.set(e.midpoint[0], e.midpoint[1], e.midpoint[2]).project(camera);
    let score: number;
    if (axis === "y") {
      score = Math.abs(_ndc.x);
    } else {
      score = -_ndc.y;
    }
    // Tie-break: prefer edges closer to camera (smaller NDC z = nearer).
    score -= 0.05 * _ndc.z;

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

// ─── Top-level scene wrapper ─────────────────────────────────────────────────

interface SceneProps {
  points: LabPoint[];
  axes: AxisRanges;
  view: View;
  variant: Variant;
  hover: Hover | null;
  setHover: (h: Hover | null) => void;
}

export function LabScene(props: SceneProps) {
  return (
    <div className="relative h-[640px] w-full bg-gradient-to-b from-[#0b0b10] to-[#050507]">
      <Canvas
        camera={{ position: [0, 0, RADIUS_2D], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <SceneContents {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function SceneContents({
  points,
  axes,
  view,
  variant,
  hover,
  setHover,
}: SceneProps) {
  const animRef = useRef<ViewConfig>({ ...VIEW_CONFIGS.cost });
  const fromCfg = useRef<ViewConfig>({ ...VIEW_CONFIGS.cost });
  const toCfg = useRef<ViewConfig>({ ...VIEW_CONFIGS.cost });
  const progressRef = useRef(1);
  const lastView = useRef<View>("cost");
  const isPeekingRef = useRef(false);

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (lastView.current !== view) {
      fromCfg.current = configFromCamera(
        camera,
        animRef.current.mix,
        animRef.current.xSpread,
        animRef.current.zSpread,
        animRef.current.flatness
      );
      toCfg.current = { ...VIEW_CONFIGS[view] };
      isPeekingRef.current =
        isFlat2DConfig(fromCfg.current) && isFlat2DConfig(toCfg.current);
      progressRef.current = 0;
      lastView.current = view;
      if (controlsRef.current) controlsRef.current.enabled = false;
    }

    if (progressRef.current < 1) {
      const step = isPeekingRef.current ? STEP_2D_TO_2D : STEP_OTHER;
      progressRef.current = Math.min(1, progressRef.current + step);
      const p = easeOutCubic(progressRef.current);
      animRef.current = lerpConfig(fromCfg.current, toCfg.current, p);

      // 2D↔2D peek: lift camera + briefly fade in 3D cube edges + soften flatness
      if (isPeekingRef.current) {
        const peek = Math.sin(Math.PI * progressRef.current);
        animRef.current.height += PEEK_HEIGHT * peek;
        animRef.current.flatness = Math.max(
          0,
          animRef.current.flatness - PEEK_FLAT_DROP * peek
        );
        animRef.current.peekFactor = peek;
      }

      applyCameraFromConfig(camera, animRef.current);
    } else if (view === "3d") {
      if (controlsRef.current && !controlsRef.current.enabled) {
        controlsRef.current.enabled = true;
      }
      animRef.current.mix = [...VIEW_CONFIGS["3d"].mix];
      animRef.current.xSpread = VIEW_CONFIGS["3d"].xSpread;
      animRef.current.zSpread = VIEW_CONFIGS["3d"].zSpread;
      animRef.current.flatness = VIEW_CONFIGS["3d"].flatness;
      animRef.current.peekFactor = 0;
    } else {
      animRef.current.peekFactor = 0;
    }

    if (controlsRef.current) controlsRef.current.target.set(0, 0, 0);

    const flat = animRef.current.flatness;
    if (ambientRef.current) ambientRef.current.intensity = 0.55 + 0.85 * flat;
    if (directionalRef.current) directionalRef.current.intensity = 0.55 * (1 - flat);
  });

  const hoveredModelId = hover?.kind === "model" ? hover.point.modelId : null;
  const hoveredCornerKey =
    hover?.kind === "corner"
      ? `${hover.corner.sx},${hover.corner.sy},${hover.corner.sz}`
      : null;

  return (
    <>
      <ambientLight ref={ambientRef} intensity={1.4} />
      <directionalLight ref={directionalRef} position={[5, 6, 8]} intensity={0} />
      <directionalLight position={[-4, -3, -5]} intensity={0.12} color="#7aa3ff" />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.5}
        maxDistance={12}
        enabled={false}
      />

      <Frame animRef={animRef} />

      {variant === "manifold" && (
        <>
          <FrontierCurve points={points} mode={0} animRef={animRef} />
          <FrontierCurve points={points} mode={1} animRef={animRef} />
          <ManifoldMesh points={points} animRef={animRef} />
        </>
      )}

      <PointsLayer
        points={points}
        animRef={animRef}
        hoveredModelId={hoveredModelId}
        setHover={setHover}
      />

      <CornerGlyphs
        points={points}
        animRef={animRef}
        hoveredCornerKey={hoveredCornerKey}
        setHover={setHover}
      />

      <AxisTicks axes={axes} animRef={animRef} />
      <AxisLabels animRef={animRef} />
    </>
  );
}

// ─── Cube frame ──────────────────────────────────────────────────────────────

interface EdgeSpec {
  a: [number, number, number];
  b: [number, number, number];
  mode: 0 | 1 | 2;
}

function buildEdgeSpecs(): EdgeSpec[] {
  const s = SCALE;
  const edges: EdgeSpec[] = [];

  edges.push(
    { a: [-s, -s, 0], b: [s, -s, 0], mode: 0 },
    { a: [s, -s, 0], b: [s, s, 0], mode: 0 },
    { a: [s, s, 0], b: [-s, s, 0], mode: 0 },
    { a: [-s, s, 0], b: [-s, -s, 0], mode: 0 }
  );

  edges.push(
    { a: [0, -s, -s], b: [0, -s, s], mode: 1 },
    { a: [0, -s, s], b: [0, s, s], mode: 1 },
    { a: [0, s, s], b: [0, s, -s], mode: 1 },
    { a: [0, s, -s], b: [0, -s, -s], mode: 1 }
  );

  const corners: [number, number, number][] = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s, s],  [s, -s, s],  [s, s, s],  [-s, s, s],
  ];
  edges.push(
    { a: corners[0], b: corners[1], mode: 2 },
    { a: corners[1], b: corners[5], mode: 2 },
    { a: corners[5], b: corners[4], mode: 2 },
    { a: corners[4], b: corners[0], mode: 2 },
    { a: corners[3], b: corners[2], mode: 2 },
    { a: corners[2], b: corners[6], mode: 2 },
    { a: corners[6], b: corners[7], mode: 2 },
    { a: corners[7], b: corners[3], mode: 2 },
    { a: corners[0], b: corners[3], mode: 2 },
    { a: corners[1], b: corners[2], mode: 2 },
    { a: corners[5], b: corners[6], mode: 2 },
    { a: corners[4], b: corners[7], mode: 2 }
  );

  return edges;
}

function Frame({ animRef }: { animRef: React.MutableRefObject<ViewConfig> }) {
  const groupRef = useRef<THREE.Group>(null);
  const edges = useMemo(() => buildEdgeSpecs(), []);

  useFrame(() => {
    if (!groupRef.current) return;
    const cfg = animRef.current;
    const mix = cfg.mix;
    const peek = cfg.peekFactor ?? 0;
    groupRef.current.traverse((obj) => {
      const m = obj.userData?.mode;
      if (m == null) return;
      const mat = (obj as unknown as { material?: THREE.Material & { opacity?: number } }).material;
      if (!mat || typeof mat.opacity !== "number") return;
      const baseOpacity = m === 2 ? 0.55 : 0.45;
      let opacity = mix[m as 0 | 1 | 2] * baseOpacity;
      // During 2D↔2D peek, briefly reveal the 3D cube edges
      if (m === 2 && peek > 0) {
        opacity = Math.max(opacity, peek * 0.32);
      }
      mat.opacity = opacity;
    });
  });

  return (
    <group ref={groupRef}>
      {edges.map((e, i) => (
        <Line
          key={i}
          points={[new THREE.Vector3(...e.a), new THREE.Vector3(...e.b)]}
          color="#ffffff"
          opacity={0}
          transparent
          lineWidth={1}
          userData={{ mode: e.mode }}
        />
      ))}
    </group>
  );
}

// ─── Axis labels ─────────────────────────────────────────────────────────────

// Camera-aware axis label placement.
// Each axis label rides on whichever cube edge is currently facing the camera —
// recomputed every frame. In flat 2D views, the label sits on the active 2D
// rectangle (cost-rect at Z=0 or lat-rect at X=0). In 3D, it slides out to the
// cube's outer edge on the camera-facing side, so labels never end up "behind"
// the plot or pointing the wrong way as you orbit.
function AxisLabels({ animRef }: { animRef: React.MutableRefObject<ViewConfig> }) {
  const costGroupRef = useRef<THREE.Group>(null);
  const latGroupRef = useRef<THREE.Group>(null);
  const eloGroupRef = useRef<THREE.Group>(null);

  const costLabelRef = useRef<HTMLSpanElement>(null);
  const latLabelRef = useRef<HTMLSpanElement>(null);
  const eloLabelRef = useRef<HTMLSpanElement>(null);

  const { camera } = useThree();

  useFrame(() => {
    const s = SCALE;
    const cfg = animRef.current;
    const mix = cfg.mix;

    // 3D-mode positions come from the picker; 2D positions stay on the rect.
    const xEdge = pickAxisEdge("x", camera);
    const zEdge = pickAxisEdge("z", camera);
    const yEdge = pickAxisEdge("y", camera);

    const xMid = xEdge.midpoint;
    const zMid = zEdge.midpoint;
    const yMid = yEdge.midpoint;

    // Cost label: 2D rect at z=0; 3D at xEdge midpoint (which lives at the cube's
    // bottom-front-or-back edge depending on camera).
    if (costGroupRef.current) {
      const z = mix[2] * xMid[2];
      // Sit just below the tick row (which sits at -s - 0.20). Anything below
      // ~-s - 0.4 starts being clipped by the camera frustum in 2D mode.
      const y = -s - 0.42;
      costGroupRef.current.position.set(0, y, z);
    }

    // Latency label: 2D rect at x=0; 3D at zEdge midpoint.
    if (latGroupRef.current) {
      const x = mix[2] * zMid[0];
      latGroupRef.current.position.set(x, -s - 0.42, 0);
    }

    // Elo label: vertical edge, pushed outward in XZ so it doesn't sit ON the cube edge.
    //   2D cost-view: x=-s, z=0 → pushed to (-s - 0.25, 0, 0)
    //   2D lat-view:  x=0, z=-s → pushed to (0, 0, -s - 0.25)
    //   3D view:      yEdge midpoint pushed outward along its XZ direction
    if (eloGroupRef.current) {
      const baseX = mix[0] * -s + mix[2] * yMid[0];
      const baseZ = mix[1] * -s + mix[2] * yMid[2];
      const len = Math.sqrt(baseX * baseX + baseZ * baseZ) || 1;
      const offsetMag = 0.25;
      const ex = baseX + (baseX / len) * offsetMag;
      const ez = baseZ + (baseZ / len) * offsetMag;
      eloGroupRef.current.position.set(ex, 0, ez);
    }

    if (costLabelRef.current) costLabelRef.current.style.opacity = String(Math.min(1, mix[0] + mix[2]));
    if (latLabelRef.current) latLabelRef.current.style.opacity = String(Math.min(1, mix[1] + mix[2]));
    if (eloLabelRef.current) eloLabelRef.current.style.opacity = "1";
  });

  return (
    <>
      <group ref={costGroupRef}>
        <Html center distanceFactor={6} occlude={false} pointerEvents="none">
          <span
            ref={costLabelRef}
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/60 whitespace-nowrap"
          >
            $ Cost
          </span>
        </Html>
      </group>

      <group ref={latGroupRef}>
        <Html center distanceFactor={6} occlude={false} pointerEvents="none">
          <span
            ref={latLabelRef}
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/60 whitespace-nowrap"
          >
            Latency
          </span>
        </Html>
      </group>

      <group ref={eloGroupRef}>
        <Html center distanceFactor={6} occlude={false} pointerEvents="none">
          <span
            ref={eloLabelRef}
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/60 whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            Elo
          </span>
        </Html>
      </group>
    </>
  );
}

function AxisTicks({
  axes,
  animRef,
}: {
  axes: AxisRanges;
  animRef: React.MutableRefObject<ViewConfig>;
}) {
  const { camera } = useThree();

  const costTicks = useMemo(
    () => pickTicks(axes.cost.min, axes.cost.max, axes.cost.scale),
    [axes.cost.min, axes.cost.max, axes.cost.scale]
  );
  const latTicks = useMemo(
    () => pickTicks(axes.latency.min, axes.latency.max, axes.latency.scale),
    [axes.latency.min, axes.latency.max, axes.latency.scale]
  );
  const eloTicks = useMemo(
    () => pickTicks(axes.elo.min, axes.elo.max, axes.elo.scale),
    [axes.elo.min, axes.elo.max, axes.elo.scale]
  );

  return (
    <>
      {costTicks.map((v) => (
        <Tick
          key={`cost-${v}`}
          value={v}
          axis="cost"
          axes={axes}
          animRef={animRef}
          camera={camera}
          formatter={formatCostTick}
        />
      ))}
      {latTicks.map((v) => (
        <Tick
          key={`lat-${v}`}
          value={v}
          axis="latency"
          axes={axes}
          animRef={animRef}
          camera={camera}
          formatter={formatLatencyTick}
        />
      ))}
      {eloTicks.map((v) => (
        <Tick
          key={`elo-${v}`}
          value={v}
          axis="elo"
          axes={axes}
          animRef={animRef}
          camera={camera}
          formatter={formatEloTick}
        />
      ))}
    </>
  );
}

function Tick({
  value,
  axis,
  axes,
  animRef,
  camera,
  formatter,
}: {
  value: number;
  axis: "cost" | "latency" | "elo";
  axes: AxisRanges;
  animRef: React.MutableRefObject<ViewConfig>;
  camera: THREE.Camera;
  formatter: (v: number) => string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const range = axis === "cost" ? axes.cost : axis === "latency" ? axes.latency : axes.elo;
  const fraction = tickFraction(value, range.min, range.max, range.scale);

  useFrame(() => {
    if (!groupRef.current) return;
    const cfg = animRef.current;
    const mix = cfg.mix;
    const s = SCALE;

    // Pick the camera-facing edge for this axis.
    const pickerAxis = axis === "cost" ? "x" : axis === "latency" ? "z" : "y";
    const edge = pickAxisEdge(pickerAxis, camera);

    // Tick position = lerp along the edge by fraction (0..1) using SAME normalization
    // as the points: data fraction → world position.
    const t = fraction;
    const ex = edge.start[0] + (edge.end[0] - edge.start[0]) * t;
    const ey = edge.start[1] + (edge.end[1] - edge.start[1]) * t;
    const ez = edge.start[2] + (edge.end[2] - edge.start[2]) * t;

    // Outward offset so the label sits beyond the cube.
    let ox = 0, oy = 0, oz = 0;
    if (axis === "cost" || axis === "latency") {
      // Below the bottom face, leaving room above for the axis-name label.
      oy = -0.20;
    } else {
      // Outward in XZ from the cube center.
      const len = Math.sqrt(edge.midpoint[0] ** 2 + edge.midpoint[2] ** 2) || 1;
      ox = (edge.midpoint[0] / len) * 0.32;
      oz = (edge.midpoint[2] / len) * 0.32;
    }

    // Blend with 2D-rect positions (Z=0 for cost, X=0 for lat, x=-s|z=-s for elo).
    let wx = ex, wy = ey, wz = ez;
    if (axis === "cost") {
      wz = mix[2] * ez; // 0 in 2D, edge.z in 3D
      wy = -SCALE; // always at bottom
    } else if (axis === "latency") {
      wx = mix[2] * ex;
      wy = -SCALE;
    } else {
      // Elo: x and z blend across views
      wx = mix[0] * -s + mix[2] * edge.midpoint[0];
      wz = mix[1] * -s + mix[2] * edge.midpoint[2];
      wy = ey; // tick's y position along the vertical edge
    }

    groupRef.current.position.set(wx + ox, wy + oy, wz + oz);

    // Visibility: fade with view mix (cost ticks visible in cost-view + 3d, etc.).
    if (labelRef.current) {
      const opacity =
        axis === "cost"
          ? mix[0] + mix[2]
          : axis === "latency"
          ? mix[1] + mix[2]
          : 1;
      labelRef.current.style.opacity = String(Math.min(1, opacity * 0.85));
    }
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={8} occlude={false} pointerEvents="none">
        <span
          ref={labelRef}
          className="font-mono text-[9px] tabular-nums text-white/55 whitespace-nowrap"
        >
          {formatter(value)}
        </span>
      </Html>
    </group>
  );
}

// ─── Points layer ────────────────────────────────────────────────────────────

function PointsLayer({
  points,
  animRef,
  hoveredModelId,
  setHover,
}: {
  points: LabPoint[];
  animRef: React.MutableRefObject<ViewConfig>;
  hoveredModelId: string | null;
  setHover: (h: Hover | null) => void;
}) {
  return (
    <group>
      {points.map((p) => (
        <ModelPoint
          key={p.modelId}
          point={p}
          animRef={animRef}
          isHover={p.modelId === hoveredModelId}
          setHover={setHover}
        />
      ))}
    </group>
  );
}

function ModelPoint({
  point,
  animRef,
  isHover,
  setHover,
}: {
  point: LabPoint;
  animRef: React.MutableRefObject<ViewConfig>;
  isHover: boolean;
  setHover: (h: Hover | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const borderMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const color = providerHex(point.provider);

  useFrame(() => {
    const cfg = animRef.current;
    if (groupRef.current) {
      const [px, py, pz] = pointPosition(point, cfg);
      groupRef.current.position.set(px, py, pz);
      // Smooth scale-up on hover
      const targetScale = isHover ? 1.35 : 1;
      const cur = groupRef.current.scale.x;
      groupRef.current.scale.setScalar(cur + (targetScale - cur) * 0.18);
    }

    const fScore = frontierScore(point, cfg.mix);
    const flat = cfg.flatness;

    if (borderMatRef.current) {
      borderMatRef.current.opacity = fScore * flat * (isHover ? 1 : 0.85);
    }
    if (haloMatRef.current) {
      // Bumped: more visible halo in 3D
      haloMatRef.current.opacity = fScore * (1 - flat) * (isHover ? 0.6 : 0.42);
    }
    if (bodyMatRef.current) {
      bodyMatRef.current.emissiveIntensity = 0.28 + 0.72 * flat;
      bodyMatRef.current.roughness = 0.35 + 0.65 * flat;
      bodyMatRef.current.metalness = 0.15 * (1 - flat);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Hit area */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover({ kind: "model", point });
        }}
        onPointerOut={() => setHover(null)}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 2D border ring (billboarded) */}
      <Billboard>
        <mesh>
          <ringGeometry args={[DOT_R * 1.18, DOT_R * 1.42, 32]} />
          <meshBasicMaterial
            ref={borderMatRef}
            color="#fbbf24"
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>

      {/* 3D halo — slightly larger, more visible */}
      <mesh>
        <sphereGeometry args={[DOT_R * 1.55, 18, 18]} />
        <meshBasicMaterial
          ref={haloMatRef}
          color="#fbbf24"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* Body */}
      <mesh>
        <sphereGeometry args={[DOT_R, 24, 24]} />
        <meshStandardMaterial
          ref={bodyMatRef}
          color={color}
          emissive={color}
          emissiveIntensity={1.0}
          roughness={1.0}
          metalness={0.0}
        />
      </mesh>
    </group>
  );
}

// ─── Frontier curve ──────────────────────────────────────────────────────────

function FrontierCurve({
  points,
  mode,
  animRef,
}: {
  points: LabPoint[];
  mode: 0 | 1;
  animRef: React.MutableRefObject<ViewConfig>;
}) {
  const sorted = useMemo(() => {
    const flag = mode === 0 ? "isFrontierCost" : "isFrontierLat";
    return points
      .filter((p) => p[flag])
      .sort((a, b) => (mode === 0 ? a.cost - b.cost : a.latency - b.latency));
  }, [points, mode]);

  const lineRef = useRef<THREE.Line>(null);
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(sorted.length, 2) * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [sorted.length]);

  useFrame(() => {
    if (!lineRef.current || !matRef.current) return;
    const cfg = animRef.current;
    const attr = geometry.attributes.position as THREE.BufferAttribute;
    if (sorted.length >= 2) {
      for (let i = 0; i < sorted.length; i++) {
        const [px, py, pz] = pointPosition(sorted[i], cfg);
        attr.setXYZ(i, px, py, pz);
      }
      // eslint-disable-next-line react-hooks/immutability -- Three.js BufferAttribute upload trigger
      attr.needsUpdate = true;
    }
    matRef.current.opacity = cfg.mix[mode] * 0.7;
  });

  if (sorted.length < 2) return null;

  return (
    <line ref={lineRef as unknown as React.Ref<THREE.Line>}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial ref={matRef} color="#fbbf24" transparent opacity={0} linewidth={2} />
    </line>
  );
}

// ─── Manifold surface ────────────────────────────────────────────────────────

function ManifoldMesh({
  points,
  animRef,
}: {
  points: LabPoint[];
  animRef: React.MutableRefObject<ViewConfig>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const m = buildManifold(points, 28);
    const res = m.res;
    const verts = (res + 1) * (res + 1);
    const positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const indices: number[] = [];

    const colorLow = new THREE.Color("#1e3a8a");
    const colorMid = new THREE.Color("#7c3aed");
    const colorHigh = new THREE.Color("#fbbf24");

    let k = 0;
    for (let i = 0; i <= res; i++) {
      const nx = -1 + (2 * i) / res;
      for (let j = 0; j <= res; j++) {
        const nz = -1 + (2 * j) / res;
        const ny = m.grid[i][j];
        positions[k * 3] = nx * SCALE;
        positions[k * 3 + 1] = ny * SCALE;
        positions[k * 3 + 2] = nz * SCALE;
        const t = (ny + 1) / 2;
        const c =
          t < 0.5
            ? colorLow.clone().lerp(colorMid, t * 2)
            : colorMid.clone().lerp(colorHigh, (t - 0.5) * 2);
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
        k++;
      }
    }

    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const a = i * (res + 1) + j;
        const b = a + 1;
        const c = a + (res + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [points]);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.Material & { opacity?: number };
    if (mat && typeof mat.opacity === "number") {
      mat.opacity = 0.45 * animRef.current.mix[2];
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial vertexColors transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ─── Corner glyphs (no labels — just hoverable triangles) ────────────────────

function CornerGlyphs({
  points,
  animRef,
  hoveredCornerKey,
  setHover,
}: {
  points: LabPoint[];
  animRef: React.MutableRefObject<ViewConfig>;
  hoveredCornerKey: string | null;
  setHover: (h: Hover | null) => void;
}) {
  const occupants = useMemo(() => findCornerOccupants(points), [points]);

  return (
    <group>
      {occupants.map((occ) => {
        const { corner, point } = occ;
        const key = `${corner.sx},${corner.sy},${corner.sz}`;
        const isHover = key === hoveredCornerKey;
        const dotColor =
          corner.vibe === "dream"
            ? "#fbbf24"
            : corner.vibe === "good"
            ? "#34d399"
            : corner.vibe === "bad"
            ? "#fb7185"
            : corner.vibe === "void"
            ? "#71717a"
            : "#cbd5e1";

        return (
          <CornerGlyph
            key={key}
            corner={corner}
            occupant={point}
            isHover={isHover}
            setHover={setHover}
            color={dotColor}
            animRef={animRef}
          />
        );
      })}
    </group>
  );
}

function CornerGlyph({
  corner,
  occupant,
  isHover,
  setHover,
  color,
  animRef,
}: {
  corner: CornerLabel;
  occupant: LabPoint | null;
  isHover: boolean;
  setHover: (h: Hover | null) => void;
  color: string;
  animRef: React.MutableRefObject<ViewConfig>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hitMeshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const x = corner.sx * SCALE;
  const y = corner.sy * SCALE;
  const z = corner.sz * SCALE;

  useFrame(() => {
    const m3 = animRef.current.mix[2];
    if (matRef.current) {
      matRef.current.opacity = m3 * (isHover ? 1 : 0.9);
    }
    if (ringMatRef.current) {
      ringMatRef.current.opacity = m3 * (isHover ? 0.8 : 0);
    }
    if (groupRef.current) {
      const target = isHover ? 1.5 : 1;
      const cur = groupRef.current.scale.x;
      groupRef.current.scale.setScalar(cur + (target - cur) * 0.2);
    }
    // Disable hit testing while corners are barely visible (in 2D modes)
    if (hitMeshRef.current) hitMeshRef.current.visible = m3 > 0.5;
  });

  return (
    <group ref={groupRef} position={[x, y, z]}>
      {/* Hit area — only raycasts when the corner is meaningfully visible (3D mode) */}
      <mesh
        ref={hitMeshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover({ kind: "corner", corner, occupant });
        }}
        onPointerOut={() => setHover(null)}
      >
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Hover ring (faint glow when hovered) */}
      <Billboard>
        <mesh>
          <ringGeometry args={[0.085, 0.115, 32]} />
          <meshBasicMaterial
            ref={ringMatRef}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>

      {/* Glyph (octahedron — reads as a 3D corner marker) */}
      <mesh>
        <octahedronGeometry args={[0.06, 0]} />
        <meshBasicMaterial ref={matRef} color={color} transparent opacity={0} />
      </mesh>
    </group>
  );
}

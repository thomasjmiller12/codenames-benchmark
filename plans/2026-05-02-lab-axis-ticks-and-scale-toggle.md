# Lab: NDC Edge Picker, Tick Scales, and Log/Linear Toggle

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the `/lab` 3D capability volume readable as a real chart — axes labeled with actual price/latency/Elo values at tick positions on the camera-facing edge, and a log↔linear toggle for cost and latency.

**Architecture:**
- Replace the `Math.sign(camera.x/z)` heuristic in `AxisLabels` with a proper NDC-projection edge picker that scores each candidate edge by screen-space position. The picker returns the world-space edge that's most "outside" the projected cube hull on the relevant side (bottom for X/Z, side for Y).
- Tick scales reuse the picked edge: each axis renders a small set of `<Html>` value labels along the edge at "nice" positions (powers of 10 for log, round numbers for linear).
- Scale toggle threads through `build3DPoints` so points and ticks share the same normalization.

**Tech Stack:** Next.js 16, React 19, react-three-fiber, drei, Three.js. UI-only changes — no Python, no DB, no tests (codebase has no UI tests).

**Out of scope:** elaborate orbit-past-180° robustness (sign heuristic was already fine for normal use; this version handles it for free as a side-effect). Per-axis independent scale toggles (we'll use one toggle for both log axes).

**Verification model:** No unit tests. After each task, hit `http://localhost:3000/lab` (dev server is running on port 3000), visually verify, and run `npm run lint` from `ui/` (must report only the 5 pre-existing warnings, 0 errors).

---

## Task 1: Refactor `build3DPoints` to accept scale + return axis ranges

**Why first:** Everything downstream (scene normalization, tick positioning, tick generation) depends on knowing each axis's `min`, `max`, and `scale`. Threading this once at the data layer is cleaner than recomputing in five places.

**Files:**
- Modify: `ui/src/app/lab/scene-data.ts`

**Step 1: Add types**

In `scene-data.ts`, near the top after `View`:

```ts
export type Scale = "log" | "linear";

export interface AxisRange {
  min: number;        // raw min in data units
  max: number;        // raw max in data units
  scale: Scale;       // log or linear normalization
}

export interface AxisRanges {
  cost: AxisRange;
  latency: AxisRange;
  elo: AxisRange;     // always linear; included for symmetry
}
```

**Step 2: Update `build3DPoints` signature**

Change the signature to accept `costScale` and `latencyScale` and return both points and axis ranges:

```ts
export function build3DPoints(
  models: Model[],
  costScale: Scale = "log",
  latencyScale: Scale = "log"
): { points: LabPoint[]; axes: AxisRanges } {
  if (models.length === 0) {
    return {
      points: [],
      axes: {
        cost: { min: 0, max: 1, scale: costScale },
        latency: { min: 0, max: 1, scale: latencyScale },
        elo: { min: 1500, max: 1500, scale: "linear" },
      },
    };
  }
  // ... existing body ...
}
```

Inside, replace the hard-coded log transforms:

```ts
const costTransform = costScale === "log"
  ? (c: number) => Math.log10(Math.max(c, 1e-6))
  : (c: number) => c;
const lcMin = Math.min(...costs.map(costTransform));
const lcMax = Math.max(...costs.map(costTransform));

const latTransform = latencyScale === "log"
  ? (l: number) => Math.log10(Math.max(l, 1))
  : (l: number) => l;
const llMin = Math.min(...lats.map(latTransform));
const llMax = Math.max(...lats.map(latTransform));
```

The `nx`/`nz` formulas stay the same since they normalize the *transformed* values. `nx` of a point at the smallest cost is still −1, etc.

At the end of the function, return:

```ts
return {
  points: enriched,
  axes: {
    cost: { min: Math.min(...costs), max: Math.max(...costs), scale: costScale },
    latency: { min: Math.min(...lats), max: Math.max(...lats), scale: latencyScale },
    elo: { min: eMin, max: eMax, scale: "linear" },
  },
};
```

**Step 3: Update consumers**

In `ui/src/app/lab/client.tsx`, change:

```ts
const points: LabPoint[] = useMemo(() => build3DPoints(filtered), [filtered]);
```

to:

```ts
const { points, axes } = useMemo(
  () => build3DPoints(filtered, "log", "log"),
  [filtered]
);
```

(Scale params will be wired to state in Task 2.)

**Step 4: Verify**

```bash
cd ui && npm run lint 2>&1 | tail -10
```

Expected: 0 errors. Then `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/lab` returns 200. Visit the page; everything should look identical.

**Step 5: Commit**

```bash
git add ui/src/app/lab/scene-data.ts ui/src/app/lab/client.tsx
git commit -m "lab: thread scale + axis ranges through build3DPoints"
```

---

## Task 2: Add log/linear scale toggle to controls

**Files:**
- Modify: `ui/src/app/lab/controls.tsx`
- Modify: `ui/src/app/lab/client.tsx`

**Step 1: Extend `Props` and add scale toggle UI**

In `controls.tsx`, add `scale` and `setScale` to `Props`:

```ts
import type { Scale, Variant, View } from "./scene-data";

interface Props {
  view: View;
  setView: (v: View) => void;
  variant: Variant;
  setVariant: (v: Variant) => void;
  scale: Scale;
  setScale: (s: Scale) => void;
}
```

Add a third `ButtonGroup` after the Variant group:

```tsx
<div className="hidden h-9 w-px bg-border/60 md:block" aria-hidden />

<ButtonGroup label="Scale">
  <Btn on={scale === "log"} onClick={() => setScale("log")} icon={Box} label="Log" />
  <Btn on={scale === "linear"} onClick={() => setScale("linear")} icon={Box} label="Linear" />
</ButtonGroup>
```

(Use a more appropriate icon if there's a better lucide one — `LineChart` and `BarChart` work; pick `LineChart` for log and `BarChart` for linear.)

**Step 2: Wire state in `client.tsx`**

Add scale state:

```ts
const [scale, setScale] = useState<Scale>("log");
```

Pass to `build3DPoints`:

```ts
const { points, axes } = useMemo(
  () => build3DPoints(filtered, scale, scale),
  [filtered, scale]
);
```

(Both cost and latency use the same toggle. We can split this later if it ever matters.)

Pass to `LabControls`:

```tsx
<LabControls
  view={view}
  setView={setView}
  variant={variant}
  setVariant={setVariant}
  scale={scale}
  setScale={setScale}
/>
```

Pass `axes` to `LabScene` (we'll consume it in Task 5+):

```tsx
<LabScene
  points={points}
  axes={axes}
  view={view}
  variant={variant}
  hover={hover}
  setHover={setHover}
/>
```

**Step 3: Update `LabScene` props signature**

In `ui/src/app/lab/scene.tsx`, extend `SceneProps`:

```ts
import type { AxisRanges } from "./scene-data";

interface SceneProps {
  points: LabPoint[];
  axes: AxisRanges;
  view: View;
  variant: Variant;
  hover: Hover | null;
  setHover: (h: Hover | null) => void;
}
```

`SceneContents` accepts `axes` as well; for now just plumb it through (no consumers yet).

**Step 4: Verify**

`/lab` loads. Click "Linear" → cost dots compress toward the cheap end (because GPT-5 is ~1000x the cost of cheap models). Click "Log" → spread back out. Lint clean.

**Step 5: Commit**

```bash
git add ui/src/app/lab/controls.tsx ui/src/app/lab/client.tsx ui/src/app/lab/scene.tsx
git commit -m "lab: add log/linear scale toggle"
```

---

## Task 3: NDC edge picker

**Why now:** Tick scales need a stable, properly-placed axis edge. The sign heuristic works, but ticks would inherit any wrongness it has. The NDC picker is robust under arbitrary orbits.

**Files:**
- Modify: `ui/src/app/lab/scene.tsx` (add `pickAxisEdge` helper near top, before `AxisLabels`)

**Step 1: Implement `pickAxisEdge`**

Add a new helper above the `AxisLabels` function:

```ts
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
```

Note: `Vector3.project(camera)` mutates the vector to NDC coordinates (range −1 to +1 on each axis, with y+ up and z+ far). Reusing `_ndc` avoids per-frame allocations inside `useFrame`.

**Step 2: Don't wire it yet**

Just compile it. `AxisLabels` still uses the sign heuristic. Verify lint clean and `/lab` works.

**Step 3: Commit**

```bash
git add ui/src/app/lab/scene.tsx
git commit -m "lab: add NDC-projection axis edge picker (unused yet)"
```

---

## Task 4: Replace sign heuristic in `AxisLabels` with NDC picker

**Files:**
- Modify: `ui/src/app/lab/scene.tsx` (replace the body of `AxisLabels`'s `useFrame`)

**Step 1: Use `pickAxisEdge` in `useFrame`**

Replace the position-computation block in `AxisLabels` with:

```ts
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
    const y = -s - 0.25; // always slightly below the bottom of the cube
    costGroupRef.current.position.set(0, y, z);
  }

  // Latency label: 2D rect at x=0; 3D at zEdge midpoint.
  if (latGroupRef.current) {
    const x = mix[2] * zMid[0];
    latGroupRef.current.position.set(x, -s - 0.25, 0);
  }

  // Elo label: vertical edge.
  //   2D cost-view: x=-s, z=0
  //   2D lat-view:  x=0, z=-s
  //   3D view:      yEdge midpoint (corner closest to camera)
  if (eloGroupRef.current) {
    const ex = mix[0] * -s + mix[2] * yMid[0];
    const ez = mix[1] * -s + mix[2] * yMid[2];
    eloGroupRef.current.position.set(ex, 0, ez);
  }

  // Opacity (unchanged from current).
  if (costLabelRef.current) costLabelRef.current.style.opacity = String(Math.min(1, mix[0] + mix[2]));
  if (latLabelRef.current) latLabelRef.current.style.opacity = String(Math.min(1, mix[1] + mix[2]));
  if (eloLabelRef.current) eloLabelRef.current.style.opacity = "1";
});
```

The picker's midpoint y for X/Z axes will be ±SCALE (top or bottom), but we always put labels at y = −s − 0.25 (just under the bottom face). The picker chooses which Z (for cost) or which X (for latency) edge to use; the y is fixed to "below cube" by us.

**Step 2: Verify**

Visit `/lab`. Switch to 3D and orbit. Labels should now sit on the camera-facing bottom edges no matter how you rotate. Switch to 2D Cost — cost label below the cost-rect. Switch to 2D Latency — latency label below the lat-rect.

Edge case to check: orbit past 90° in 3D (drag the camera all the way around). Labels should hop to the new visible edge instead of going behind the cube.

**Step 3: Commit**

```bash
git add ui/src/app/lab/scene.tsx
git commit -m "lab: AxisLabels use NDC edge picker for 3D positioning"
```

---

## Task 5: Tick generation utilities

**Files:**
- Create: `ui/src/app/lab/ticks.ts`

**Step 1: Implement nice-tick generators**

```ts
import type { Scale } from "./scene-data";

/** Major orders of magnitude that fall within [min, max], inclusive. */
export function niceLogTicks(min: number, max: number): number[] {
  if (min <= 0 || max <= 0 || max <= min) return [];
  const ticks: number[] = [];
  const startK = Math.floor(Math.log10(min));
  const endK = Math.ceil(Math.log10(max));
  for (let k = startK; k <= endK; k++) {
    const v = Math.pow(10, k);
    if (v >= min * 0.99 && v <= max * 1.01) ticks.push(v);
  }
  return ticks;
}

/** Round-number ticks within [min, max], approximately `count` of them. */
export function niceLinearTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const rawStep = range / Math.max(1, count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  const step = candidates.reduce((best, c) =>
    Math.abs(c - rawStep) < Math.abs(best - rawStep) ? c : best
  );
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10))); // trim float dust
  }
  return ticks;
}

export function pickTicks(min: number, max: number, scale: Scale): number[] {
  return scale === "log" ? niceLogTicks(min, max) : niceLinearTicks(min, max);
}

/** Position a tick along an edge in the SAME normalization the points use. */
export function tickFraction(value: number, min: number, max: number, scale: Scale): number {
  if (scale === "log") {
    if (value <= 0 || min <= 0 || max <= 0) return 0;
    const lv = Math.log10(value);
    const lo = Math.log10(min);
    const hi = Math.log10(max);
    return hi === lo ? 0 : (lv - lo) / (hi - lo);
  }
  return max === min ? 0 : (value - min) / (max - min);
}

// Formatters tuned for short tick labels.
export function formatCostTick(v: number): string {
  if (v < 0.01) return `$${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (v < 1) return `$${v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (v < 10) return `$${v.toFixed(1)}`;
  return `$${Math.round(v)}`;
}

export function formatLatencyTick(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

export function formatEloTick(v: number): string {
  return Math.round(v).toString();
}
```

**Step 2: Verify**

These are pure functions — no UI changes yet. Just lint:

```bash
cd ui && npm run lint 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add ui/src/app/lab/ticks.ts
git commit -m "lab: add tick generation + formatting utilities"
```

---

## Task 6: `<AxisTicks>` component

**Files:**
- Modify: `ui/src/app/lab/scene.tsx`

**Step 1: Add component**

Just below `AxisLabels`, add:

```tsx
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
      // Below the bottom face.
      oy = -0.32;
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
```

**Step 2: Add to scene**

In `SceneContents` JSX, add before `<AxisLabels />`:

```tsx
<AxisTicks axes={axes} animRef={animRef} />
```

`axes` needs to flow into `SceneContents`; add to its props (already in `SceneProps` from Task 2) and destructure.

**Step 3: Imports**

Top of `scene.tsx`:

```ts
import {
  pickTicks,
  tickFraction,
  formatCostTick,
  formatLatencyTick,
  formatEloTick,
} from "./ticks";
import type { AxisRanges } from "./scene-data";
```

**Step 4: Verify**

Visit `/lab`:
- 2D Cost view: tick values on the bottom edge ($0.001, $0.01, $0.1, $1) and Elo values on the left edge (1100, 1300, 1500, ...)
- 2D Latency view: tick values on the bottom edge (200ms, 1s, 10s) + Elo on left
- 3D view: all three axes have tick labels riding along their picked edges
- Toggle Linear: cost ticks become evenly-spaced round numbers ($0.20, $0.40, $0.60, ...)
- Orbit in 3D: tick labels stay on the camera-facing edges

Lint clean.

**Step 5: Commit**

```bash
git add ui/src/app/lab/scene.tsx
git commit -m "lab: tick scales with actual values on each axis edge"
```

---

## Task 7: Polish

Things likely to need tweaking after Task 6 lands. Each is a small commit if needed.

**Files:**
- Modify: `ui/src/app/lab/scene.tsx`
- Maybe: `ui/src/app/lab/ticks.ts` (formatter tweaks)

**Likely tweaks:**

1. **Tick label collision with axis label**: The axis name ("$ Cost") and the rightmost tick value may overlap. Move the axis name farther outward (e.g., y = −s − 0.55 instead of −s − 0.25), or move tick values to y = −s − 0.18.

2. **Too many cost ticks under "linear"**: The default 5 ticks may produce 6–7 with rounding. Cap at `count = 4` for cost and latency in linear mode, or reduce density.

3. **Labels overlap on small viewports**: If tick labels collide horizontally at small distances, increase `distanceFactor` from 8 to 10.

4. **Elo tick on top edge**: The Y-axis edge picker chooses the closest XZ corner; tick labels run from y=−s to y=+s along that edge. The topmost tick may be at y=+s — if it visually clashes with the top of the cube, offset the entire vertical column slightly outward.

5. **Format edge cases**: $0.001 may render as "$0" if formatter rounds too aggressively. Verify.

**Verification:**

For each tweak, hit `/lab`, switch through all 3 views and Log/Linear, confirm visual cleanness.

**Commits:** One per tweak, with messages like `lab: pull axis name out so tick labels don't collide`.

---

## Verification checklist (post-implementation)

- [ ] `cd ui && npm run lint` → only the 5 pre-existing warnings; 0 errors
- [ ] `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/lab` → 200
- [ ] 2D Cost view: bottom axis shows `$0.001 $0.01 $0.1 $1` (or similar based on data range), left axis shows Elo ticks
- [ ] 2D Latency view: bottom axis shows latency ticks (`200ms 1s 10s` etc.), left axis shows Elo
- [ ] 3D view: all three axes labeled with tick values, all on camera-facing edges
- [ ] Click "Linear": cost ticks become evenly-spaced round numbers
- [ ] Click "Log" → cost ticks return to powers of 10
- [ ] Orbit in 3D past 90°: tick labels migrate to new visible edges, never go "behind" the cube
- [ ] Hover a dot → side panel still shows correct values (sanity check: nothing broke in the hover path)

---

## Notes on what to skip

- **Tick MARKS** (small line segments perpendicular to edge): not in this plan. The text labels alone read fine. Add later if needed.
- **Per-axis scale toggle** (separate log/linear for cost vs latency): one shared toggle covers the obvious use case. Trivial to split later if asked.
- **Animated tick transitions**: when scale flips Log↔Linear, ticks pop to new positions. Animating this is possible but YAGNI.
- **"Nice" log subticks** (e.g., 0.02, 0.05 between 0.01 and 0.1): the major-orders-only version is cleaner; subticks usually add noise without info.

import type { Model } from "@/lib/types";

export type Variant = "scatter" | "manifold";
export type View = "cost" | "latency" | "3d";
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

// Discriminated hover state — drives the side panel and dot/corner highlighting.
export type Hover =
  | { kind: "model"; point: LabPoint }
  | { kind: "corner"; corner: CornerLabel; occupant: LabPoint | null };

export interface LabPoint {
  modelId: string;
  displayName: string;
  provider: string;
  cost: number;
  latency: number;
  elo: number;
  // Normalized coords in [-1, 1]; X=cost, Y=elo, Z=latency
  // Convention: X- = cheap, Y+ = strong, Z- = fast (so "dream" is (-1, +1, -1))
  nx: number;
  ny: number;
  nz: number;
  // Three frontier flags — golden halos depend on which view we're in.
  isFrontierCost: boolean; // Pareto on (cost ↓, elo ↑)
  isFrontierLat: boolean;  // Pareto on (latency ↓, elo ↑)
  isFrontier3d: boolean;   // Pareto on all three
}

export interface CornerLabel {
  // signX, signY, signZ each ∈ {-1, +1}
  sx: -1 | 1;
  sy: -1 | 1;
  sz: -1 | 1;
  title: string;
  description: string;
  vibe: "dream" | "good" | "neutral" | "bad" | "void";
}

// 8 corners of the trade-off cube. Coordinates use the convention above:
// X- = cheap, X+ = expensive
// Y- = weak,  Y+ = strong
// Z- = fast,  Z+ = slow
export const CORNERS: CornerLabel[] = [
  { sx: -1, sy: 1,  sz: -1, title: "DREAM",            description: "Cheap, strong, fast — the corner everyone wants.",          vibe: "dream"   },
  { sx: 1,  sy: 1,  sz: -1, title: "Premium Apex",     description: "Strong and fast — but you pay for it.",                    vibe: "good"    },
  { sx: -1, sy: 1,  sz: 1,  title: "Patient Bargain",  description: "Cheap and strong, if you can wait.",                       vibe: "good"    },
  { sx: 1,  sy: 1,  sz: 1,  title: "Brute Force",      description: "Strong, but slow AND expensive. Big-model territory.",     vibe: "neutral" },
  { sx: -1, sy: -1, sz: -1, title: "Quick & Cheap",    description: "Fast, free, and weak. A baseline.",                        vibe: "neutral" },
  { sx: 1,  sy: -1, sz: -1, title: "Wasted Money",     description: "Expensive, fast, but no smarter for it.",                  vibe: "bad"     },
  { sx: -1, sy: -1, sz: 1,  title: "The Wasteland",    description: "Slow AND weak — at least it's cheap.",                     vibe: "bad"     },
  { sx: 1,  sy: -1, sz: 1,  title: "Money Pit",        description: "Expensive, slow, AND weak. Avoid.",                        vibe: "void"    },
];

// ─── Build normalized 3D points and 3D Pareto frontier ───────────────────────

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

  const costs = models.map((m) => m.avg_cost_per_game);
  const lats = models.map((m) => m.avg_latency_ms);
  const elos = models.map((m) => m.solo_rating);

  // Cost: log scale (typical 0.001 → 1.0 spans 3 orders of magnitude) or linear
  const costTransform = costScale === "log"
    ? (c: number) => Math.log10(Math.max(c, 1e-6))
    : (c: number) => c;
  const lcMin = Math.min(...costs.map(costTransform));
  const lcMax = Math.max(...costs.map(costTransform));
  // Latency: log scale (small models ~500ms, big ones ~30s) or linear
  const latTransform = latencyScale === "log"
    ? (l: number) => Math.log10(Math.max(l, 1))
    : (l: number) => l;
  const llMin = Math.min(...lats.map(latTransform));
  const llMax = Math.max(...lats.map(latTransform));
  const eMin = Math.min(...elos);
  const eMax = Math.max(...elos);

  const norm = (v: number, lo: number, hi: number) =>
    hi === lo ? 0 : (v - lo) / (hi - lo) * 2 - 1;

  const enriched = models.map((m): LabPoint => ({
    modelId: m.model_id,
    displayName: m.display_name,
    provider: m.provider,
    cost: m.avg_cost_per_game,
    latency: m.avg_latency_ms,
    elo: m.solo_rating,
    nx: norm(costTransform(m.avg_cost_per_game), lcMin, lcMax),
    ny: norm(m.solo_rating, eMin, eMax),
    nz: norm(latTransform(m.avg_latency_ms), llMin, llMax),
    isFrontierCost: false,
    isFrontierLat: false,
    isFrontier3d: false,
  }));

  // 2D Pareto on (cost ↓, elo ↑)
  markFrontier2D(enriched, (p) => p.cost, (p) => p.elo, "isFrontierCost");
  // 2D Pareto on (latency ↓, elo ↑)
  markFrontier2D(enriched, (p) => p.latency, (p) => p.elo, "isFrontierLat");

  // 3D Pareto: A dominates B if A.cost <= B.cost, A.latency <= B.latency,
  //            A.elo >= B.elo, with at least one strict inequality.
  for (const a of enriched) {
    let dominated = false;
    for (const b of enriched) {
      if (b === a) continue;
      const cleq = b.cost <= a.cost;
      const lleq = b.latency <= a.latency;
      const egeq = b.elo >= a.elo;
      const strictly =
        b.cost < a.cost || b.latency < a.latency || b.elo > a.elo;
      if (cleq && lleq && egeq && strictly) {
        dominated = true;
        break;
      }
    }
    a.isFrontier3d = !dominated;
  }

  return {
    points: enriched,
    axes: {
      cost: { min: Math.min(...costs), max: Math.max(...costs), scale: costScale },
      latency: { min: Math.min(...lats), max: Math.max(...lats), scale: latencyScale },
      elo: { min: eMin, max: eMax, scale: "linear" },
    },
  };
}

function markFrontier2D(
  points: LabPoint[],
  costFn: (p: LabPoint) => number,
  qualityFn: (p: LabPoint) => number,
  flag: "isFrontierCost" | "isFrontierLat"
) {
  // Sort by cost ascending; sweep — frontier is monotonically increasing in quality.
  const sorted = [...points].sort((a, b) => costFn(a) - costFn(b));
  let bestQ = -Infinity;
  for (const p of sorted) {
    const q = qualityFn(p);
    if (q > bestQ) {
      p[flag] = true;
      bestQ = q;
    }
  }
}

// ─── Manifold: IDW-interpolated Elo surface over (cost, latency) plane ───────

export interface ManifoldGrid {
  // grid of normalized Elo values, ny[i][j] for i,j in 0..res
  res: number;
  // Each cell stores the interpolated normalized Elo (Y coord)
  grid: number[][];
  // The (nx, nz) extent the grid covers — should be [-1, 1] x [-1, 1]
}

export function buildManifold(points: LabPoint[], res: number = 24): ManifoldGrid {
  // Use only frontier points so the surface represents what's *achievable*
  // Fall back to all points if frontier is too sparse
  const src = points.filter((p) => p.isFrontier3d);
  const sample = src.length >= 3 ? src : points;

  const grid: number[][] = [];
  for (let i = 0; i <= res; i++) {
    const row: number[] = [];
    const nx = -1 + (2 * i) / res;
    for (let j = 0; j <= res; j++) {
      const nz = -1 + (2 * j) / res;
      // IDW with power 4 + smoothing for a tent-like surface
      let wsum = 0;
      let vsum = 0;
      for (const p of sample) {
        const dx = nx - p.nx;
        const dz = nz - p.nz;
        const d2 = dx * dx + dz * dz + 0.01;
        const w = 1 / (d2 * d2);
        wsum += w;
        vsum += w * p.ny;
      }
      row.push(wsum > 0 ? vsum / wsum : 0);
    }
    grid.push(row);
  }
  return { res, grid };
}

// ─── Corners: find the model closest to each corner of the cube ──────────────

export interface CornerOccupant {
  corner: CornerLabel;
  point: LabPoint | null;
  distance: number;
}

export function findCornerOccupants(points: LabPoint[]): CornerOccupant[] {
  return CORNERS.map((corner) => {
    let best: LabPoint | null = null;
    let bestDist = Infinity;
    for (const p of points) {
      const dx = p.nx - corner.sx;
      const dy = p.ny - corner.sy;
      const dz = p.nz - corner.sz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return { corner, point: best, distance: bestDist };
  });
}

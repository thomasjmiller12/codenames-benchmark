import type { Game } from "./types";

// ─── Identity helpers ───────────────────────────────────────────────────────

export function deriveMonogram(displayName: string): string {
  const cleaned = displayName.replace(/[^a-zA-Z0-9\s\-]/g, " ");
  const words = cleaned.split(/[\s\-]+/).filter((w) => w.length > 0);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const w = words[0];
    return (w.length >= 2 ? w.slice(0, 2) : w).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function classifyTier(rating: number): {
  label: string;
  gradient: string;
  ring: string;
} {
  if (rating >= 1700)
    return {
      label: "S TIER",
      gradient: "from-amber-300 via-yellow-400 to-orange-500",
      ring: "ring-amber-400/40",
    };
  if (rating >= 1550)
    return {
      label: "A TIER",
      gradient: "from-emerald-400 to-emerald-600",
      ring: "ring-emerald-400/30",
    };
  if (rating >= 1400)
    return {
      label: "B TIER",
      gradient: "from-sky-400 to-blue-600",
      ring: "ring-sky-400/30",
    };
  return {
    label: "C TIER",
    gradient: "from-zinc-500 to-zinc-700",
    ring: "ring-zinc-500/30",
  };
}

const PROVIDER_GRADIENTS: Record<string, string> = {
  Anthropic: "from-orange-500 via-amber-500 to-rose-600",
  OpenAI: "from-emerald-500 via-teal-500 to-cyan-600",
  Google: "from-sky-500 via-blue-500 to-indigo-600",
  Meta: "from-violet-500 via-purple-500 to-fuchsia-600",
  Mistral: "from-rose-500 via-pink-500 to-red-600",
  Other: "from-zinc-500 to-zinc-700",
};

export function providerGradient(provider: string): string {
  return PROVIDER_GRADIENTS[provider] ?? PROVIDER_GRADIENTS.Other;
}

const PROVIDER_HEX: Record<string, string> = {
  Anthropic: "#f97316",
  OpenAI: "#10b981",
  Google: "#3b82f6",
  Meta: "#a855f7",
  Mistral: "#ef4444",
  Other: "#737373",
};

export function providerHex(provider: string): string {
  return PROVIDER_HEX[provider] ?? PROVIDER_HEX.Other;
}

// ─── Pareto frontier ────────────────────────────────────────────────────────

export interface ParetoPoint<T> {
  data: T;
  cost: number;
  quality: number;
  isFrontier: boolean;
}

export function computeParetoFrontier<T>(
  points: T[],
  costFn: (p: T) => number,
  qualityFn: (p: T) => number
): ParetoPoint<T>[] {
  const enriched = points.map((p) => ({
    data: p,
    cost: costFn(p),
    quality: qualityFn(p),
    isFrontier: false,
  }));

  const sorted = [...enriched].sort((a, b) => a.cost - b.cost);
  let bestQuality = -Infinity;
  for (const p of sorted) {
    if (p.quality > bestQuality) {
      p.isFrontier = true;
      bestQuality = p.quality;
    }
  }

  return sorted;
}

// ─── Direct matchup ─────────────────────────────────────────────────────────

export interface DirectMatchup {
  total: number;
  aWins: number;
  bWins: number;
  ties: number;
  pairs: { a: number; b: number; pairId: number; experimentId: string | null }[];
  recentGames: Game[];
}

export function computeDirectMatchup(
  games: Game[],
  modelA: string,
  modelB: string
): DirectMatchup {
  const direct = games.filter(
    (g) =>
      (g.red_sm_model === modelA && g.blue_sm_model === modelB) ||
      (g.red_sm_model === modelB && g.blue_sm_model === modelA)
  );

  let aWins = 0;
  let bWins = 0;
  for (const g of direct) {
    if (!g.winner) continue;
    const winnerModel =
      g.winner === "red" ? g.red_sm_model : g.blue_sm_model;
    if (winnerModel === modelA) aWins++;
    else if (winnerModel === modelB) bWins++;
  }

  const pairKey = (g: Game) =>
    g.pair_id != null && g.experiment_id != null
      ? `${g.experiment_id}:${g.pair_id}`
      : null;

  const pairBuckets = new Map<string, Game[]>();
  for (const g of direct) {
    const k = pairKey(g);
    if (!k) continue;
    const arr = pairBuckets.get(k) ?? [];
    arr.push(g);
    pairBuckets.set(k, arr);
  }

  const pairs: DirectMatchup["pairs"] = [];
  let ties = 0;
  for (const [, gs] of pairBuckets) {
    if (gs.length !== 2) continue;
    let a = 0;
    let b = 0;
    for (const g of gs) {
      if (!g.winner) continue;
      const w = g.winner === "red" ? g.red_sm_model : g.blue_sm_model;
      if (w === modelA) a++;
      else if (w === modelB) b++;
    }
    pairs.push({
      a,
      b,
      pairId: gs[0].pair_id!,
      experimentId: gs[0].experiment_id,
    });
    if (a === 1 && b === 1) ties++;
  }

  return {
    total: direct.length,
    aWins,
    bWins,
    ties,
    pairs,
    recentGames: direct.slice(0, 6),
  };
}

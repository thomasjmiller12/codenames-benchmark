# Insights Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Insights" page to the dashboard that surfaces interesting behavioral differences between strong and weak models through aggregate statistics computed from game/turn data.

**Architecture:** A new `/insights` route following the existing server-component-fetches → client-component-renders pattern. A single `getInsightsData()` function in `data.ts` runs several SQL queries against the `games`, `turns`, and `models` tables, returning a typed `InsightsData` object. The client renders ~8 insight cards using Recharts (already installed) with bar charts, scatter plots, and grouped comparisons.

**Tech Stack:** Next.js App Router, better-sqlite3 (direct SQLite reads), Recharts, shadcn/ui Card/Table/Badge/Tabs, Tailwind CSS, Lucide icons.

---

## Insight Metrics

Here are the 8 insight sections the page will display:

1. **First Clue Ambition** — Average `clue_count` on turn 1 per model. Do strong models go big early?
2. **Turns to Win** — Average `total_turns` for games won, per model. Efficiency metric.
3. **Red vs Blue Win Rate** — Per-model win rate split by team color. Does side advantage differ by model?
4. **Assassin Discipline** — Rate at which a model's operative hits the assassin card. Measures safety.
5. **Clue Sizing Strategy** — Distribution of `clue_count` values (1 through 5+) per model. Conservative vs aggressive.
6. **Guess Accuracy** — Percentage of guesses that are CORRECT across all turns, per model.
7. **Comeback Rate** — When a model is behind (opponent has fewer remaining cards), how often do they win? Measures clutch play.
8. **Operative Obedience** — How many guesses operatives actually make vs. `clue_count + 1` max. Do they use all their guesses?

---

## Task 1: Add TypeScript types for insights data

**Files:**
- Modify: `ui/src/lib/types.ts`

**Step 1: Add the InsightsData types**

Add at the end of `ui/src/lib/types.ts`:

```typescript
// ─── Insights ────────────────────────────────────────────────────────────────

export interface ModelInsight {
  model_id: string;
  display_name: string;
  solo_rating: number;
}

export interface FirstClueAmbition extends ModelInsight {
  avg_first_clue_count: number;
  games: number;
}

export interface TurnsToWin extends ModelInsight {
  avg_turns_to_win: number;
  wins: number;
}

export interface RedBlueWinRate extends ModelInsight {
  red_win_rate: number;
  red_games: number;
  blue_win_rate: number;
  blue_games: number;
}

export interface AssassinRate extends ModelInsight {
  assassin_deaths: number;
  total_games: number;
  assassin_rate: number;
}

export interface ClueSizeDistribution extends ModelInsight {
  distribution: { size: number; count: number; pct: number }[];
  total_clues: number;
}

export interface GuessAccuracy extends ModelInsight {
  correct_guesses: number;
  total_guesses: number;
  accuracy: number;
}

export interface ComebackRate extends ModelInsight {
  comebacks: number;
  games_behind: number;
  comeback_rate: number;
}

export interface OperativeObedience extends ModelInsight {
  avg_guesses_used: number;
  avg_max_guesses: number;
  usage_ratio: number;
}

export interface InsightsData {
  firstClueAmbition: FirstClueAmbition[];
  turnsToWin: TurnsToWin[];
  redBlueWinRate: RedBlueWinRate[];
  assassinRate: AssassinRate[];
  clueSizeDistribution: ClueSizeDistribution[];
  guessAccuracy: GuessAccuracy[];
  comebackRate: ComebackRate[];
  operativeObedience: OperativeObedience[];
}
```

**Step 2: Commit**

```bash
git add ui/src/lib/types.ts
git commit -m "feat(insights): add TypeScript types for insights data"
```

---

## Task 2: Add data fetching function for insights

**Files:**
- Modify: `ui/src/lib/data.ts`

**Step 1: Add `getInsightsData()` to `data.ts`**

Add this function at the bottom of `ui/src/lib/data.ts`. It runs 8 SQL queries and assembles the `InsightsData` object. Import the new types at the top of the file alongside the existing imports.

Add to the import block at the top:

```typescript
import type {
  Model,
  Game,
  GameReplay,
  RatingHistory,
  Turn,
  Guess,
  CardType,
  InsightsData,
  FirstClueAmbition,
  TurnsToWin,
  RedBlueWinRate,
  AssassinRate,
  ClueSizeDistribution,
  GuessAccuracy,
  ComebackRate,
  OperativeObedience,
} from "./types";
```

Then add the function:

```typescript
// ─── Insights ────────────────────────────────────────────────────────────────

const EMPTY_INSIGHTS: InsightsData = {
  firstClueAmbition: [],
  turnsToWin: [],
  redBlueWinRate: [],
  assassinRate: [],
  clueSizeDistribution: [],
  guessAccuracy: [],
  comebackRate: [],
  operativeObedience: [],
};

export function getInsightsData(): InsightsData {
  const db = getDb();
  if (!db) return EMPTY_INSIGHTS;

  // Helper: model display info keyed by model_id
  const modelRows = db
    .prepare("SELECT model_id, display_name, solo_rating FROM models")
    .all() as { model_id: string; display_name: string; solo_rating: number }[];
  const modelMap = new Map(modelRows.map((m) => [m.model_id, m]));

  function modelInfo(id: string) {
    const m = modelMap.get(id);
    return {
      model_id: id,
      display_name: m ? deriveDisplayName(m) : id,
      solo_rating: m?.solo_rating ?? 1500,
    };
  }

  // 1. First Clue Ambition — avg clue_count on turn 1
  const firstClueRows = db
    .prepare(
      `SELECT sm_model as model_id, AVG(clue_count) as avg_cc, COUNT(*) as games
       FROM turns
       WHERE turn_number = 1 AND clue_count IS NOT NULL AND sm_model IS NOT NULL
       GROUP BY sm_model
       HAVING games >= 3`
    )
    .all() as { model_id: string; avg_cc: number; games: number }[];

  const firstClueAmbition: FirstClueAmbition[] = firstClueRows.map((r) => ({
    ...modelInfo(r.model_id),
    avg_first_clue_count: r.avg_cc,
    games: r.games,
  }));

  // 2. Turns to Win — avg total_turns for games won, per model (solo mode: sm = op)
  const turnsToWinRows = db
    .prepare(
      `SELECT model_id, AVG(total_turns) as avg_turns, COUNT(*) as wins
       FROM (
         SELECT red_sm_model as model_id, total_turns
         FROM games WHERE status = 'completed' AND winner = 'red'
         UNION ALL
         SELECT blue_sm_model as model_id, total_turns
         FROM games WHERE status = 'completed' AND winner = 'blue'
       )
       GROUP BY model_id
       HAVING wins >= 3`
    )
    .all() as { model_id: string; avg_turns: number; wins: number }[];

  const turnsToWin: TurnsToWin[] = turnsToWinRows.map((r) => ({
    ...modelInfo(r.model_id),
    avg_turns_to_win: r.avg_turns,
    wins: r.wins,
  }));

  // 3. Red vs Blue Win Rate
  const redBlueRows = db
    .prepare(
      `SELECT model_id,
              SUM(CASE WHEN team = 'red' THEN 1 ELSE 0 END) as red_games,
              SUM(CASE WHEN team = 'red' AND won = 1 THEN 1 ELSE 0 END) as red_wins,
              SUM(CASE WHEN team = 'blue' THEN 1 ELSE 0 END) as blue_games,
              SUM(CASE WHEN team = 'blue' AND won = 1 THEN 1 ELSE 0 END) as blue_wins
       FROM (
         SELECT red_sm_model as model_id, 'red' as team,
                CASE WHEN winner = 'red' THEN 1 ELSE 0 END as won
         FROM games WHERE status = 'completed'
         UNION ALL
         SELECT blue_sm_model as model_id, 'blue' as team,
                CASE WHEN winner = 'blue' THEN 1 ELSE 0 END as won
         FROM games WHERE status = 'completed'
       )
       GROUP BY model_id
       HAVING red_games >= 2 AND blue_games >= 2`
    )
    .all() as {
    model_id: string;
    red_games: number;
    red_wins: number;
    blue_games: number;
    blue_wins: number;
  }[];

  const redBlueWinRate: RedBlueWinRate[] = redBlueRows.map((r) => ({
    ...modelInfo(r.model_id),
    red_win_rate: r.red_games > 0 ? r.red_wins / r.red_games : 0,
    red_games: r.red_games,
    blue_win_rate: r.blue_games > 0 ? r.blue_wins / r.blue_games : 0,
    blue_games: r.blue_games,
  }));

  // 4. Assassin Discipline — rate of assassin deaths per model (as operative)
  const assassinRows = db
    .prepare(
      `SELECT model_id,
              SUM(CASE WHEN win_condition = 'assassin' THEN 1 ELSE 0 END) as assassin_deaths,
              COUNT(*) as total_games
       FROM (
         SELECT red_sm_model as model_id, win_condition
         FROM games WHERE status = 'completed' AND winner = 'blue'
         UNION ALL
         SELECT blue_sm_model as model_id, win_condition
         FROM games WHERE status = 'completed' AND winner = 'red'
       )
       GROUP BY model_id
       HAVING total_games >= 3`
    )
    .all() as { model_id: string; assassin_deaths: number; total_games: number }[];

  const assassinRate: AssassinRate[] = assassinRows.map((r) => ({
    ...modelInfo(r.model_id),
    assassin_deaths: r.assassin_deaths,
    total_games: r.total_games,
    assassin_rate: r.total_games > 0 ? r.assassin_deaths / r.total_games : 0,
  }));

  // 5. Clue Size Distribution — histogram of clue_count per model
  const clueSizeRows = db
    .prepare(
      `SELECT sm_model as model_id,
              MIN(clue_count, 5) as size,
              COUNT(*) as cnt
       FROM turns
       WHERE sm_model IS NOT NULL AND clue_count IS NOT NULL
       GROUP BY sm_model, size`
    )
    .all() as { model_id: string; size: number; cnt: number }[];

  // Group by model
  const clueSizeMap = new Map<string, { size: number; count: number }[]>();
  for (const r of clueSizeRows) {
    if (!clueSizeMap.has(r.model_id)) clueSizeMap.set(r.model_id, []);
    clueSizeMap.get(r.model_id)!.push({ size: r.size, count: r.cnt });
  }

  const clueSizeDistribution: ClueSizeDistribution[] = [];
  for (const [model_id, dist] of clueSizeMap) {
    const total = dist.reduce((sum, d) => sum + d.count, 0);
    if (total < 5) continue;
    clueSizeDistribution.push({
      ...modelInfo(model_id),
      distribution: dist
        .map((d) => ({ ...d, pct: d.count / total }))
        .sort((a, b) => a.size - b.size),
      total_clues: total,
    });
  }

  // 6. Guess Accuracy — % of correct guesses per model (as operative)
  const guessRows = db
    .prepare(
      `SELECT op_model as model_id, guesses_json
       FROM turns
       WHERE op_model IS NOT NULL AND guesses_json IS NOT NULL`
    )
    .all() as { model_id: string; guesses_json: string }[];

  const accMap = new Map<string, { correct: number; total: number }>();
  for (const r of guessRows) {
    if (!accMap.has(r.model_id)) accMap.set(r.model_id, { correct: 0, total: 0 });
    const acc = accMap.get(r.model_id)!;
    try {
      const guesses = JSON.parse(r.guesses_json) as { result: string }[];
      for (const g of guesses) {
        acc.total++;
        if (g.result === "CORRECT" || g.result === "HIT") acc.correct++;
      }
    } catch {
      // skip malformed
    }
  }

  const guessAccuracy: GuessAccuracy[] = [];
  for (const [model_id, acc] of accMap) {
    if (acc.total < 10) continue;
    guessAccuracy.push({
      ...modelInfo(model_id),
      correct_guesses: acc.correct,
      total_guesses: acc.total,
      accuracy: acc.correct / acc.total,
    });
  }

  // 7. Comeback Rate — when behind at any point mid-game, how often do they win?
  // "Behind" = at game end, the losing side had fewer remaining (i.e. was closer to winning)
  // Simpler: games where a model won despite NOT being the starting team (starting team has 9 cards = harder)
  // Actually let's define comeback as: won as the non-starting team (started with 8 cards, disadvantage)
  const comebackRows = db
    .prepare(
      `SELECT model_id,
              SUM(won) as comebacks,
              COUNT(*) as games_behind
       FROM (
         SELECT red_sm_model as model_id,
                CASE WHEN winner = 'red' THEN 1 ELSE 0 END as won
         FROM games g
         JOIN boards b ON g.board_id = b.board_id
         WHERE g.status = 'completed' AND b.starting_team = 'blue'
         UNION ALL
         SELECT blue_sm_model as model_id,
                CASE WHEN winner = 'blue' THEN 1 ELSE 0 END as won
         FROM games g
         JOIN boards b ON g.board_id = b.board_id
         WHERE g.status = 'completed' AND b.starting_team = 'red'
       )
       GROUP BY model_id
       HAVING games_behind >= 3`
    )
    .all() as { model_id: string; comebacks: number; games_behind: number }[];

  const comebackRate: ComebackRate[] = comebackRows.map((r) => ({
    ...modelInfo(r.model_id),
    comebacks: r.comebacks,
    games_behind: r.games_behind,
    comeback_rate: r.games_behind > 0 ? r.comebacks / r.games_behind : 0,
  }));

  // 8. Operative Obedience — avg guesses used vs max allowed (clue_count + 1)
  const obedienceRows = db
    .prepare(
      `SELECT op_model as model_id, guesses_json, clue_count
       FROM turns
       WHERE op_model IS NOT NULL AND guesses_json IS NOT NULL AND clue_count IS NOT NULL`
    )
    .all() as { model_id: string; guesses_json: string; clue_count: number }[];

  const obMap = new Map<string, { guesses_sum: number; max_sum: number; count: number }>();
  for (const r of obedienceRows) {
    if (!obMap.has(r.model_id)) obMap.set(r.model_id, { guesses_sum: 0, max_sum: 0, count: 0 });
    const ob = obMap.get(r.model_id)!;
    try {
      const guesses = JSON.parse(r.guesses_json) as unknown[];
      ob.guesses_sum += guesses.length;
      ob.max_sum += r.clue_count + 1;
      ob.count++;
    } catch {
      // skip
    }
  }

  const operativeObedience: OperativeObedience[] = [];
  for (const [model_id, ob] of obMap) {
    if (ob.count < 5) continue;
    const avgUsed = ob.guesses_sum / ob.count;
    const avgMax = ob.max_sum / ob.count;
    operativeObedience.push({
      ...modelInfo(model_id),
      avg_guesses_used: avgUsed,
      avg_max_guesses: avgMax,
      usage_ratio: avgMax > 0 ? avgUsed / avgMax : 0,
    });
  }

  return {
    firstClueAmbition,
    turnsToWin,
    redBlueWinRate,
    assassinRate,
    clueSizeDistribution,
    guessAccuracy,
    comebackRate,
    operativeObedience,
  };
}
```

**Step 2: Verify it compiles**

```bash
cd ui && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add ui/src/lib/data.ts
git commit -m "feat(insights): add getInsightsData() with 8 SQL-driven metrics"
```

---

## Task 3: Add the Insights nav item to the sidebar

**Files:**
- Modify: `ui/src/components/layout/sidebar.tsx`

**Step 1: Add the Insights nav entry**

Add `Lightbulb` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Trophy,
  Crosshair,
  ScatterChart as ScatterChartIcon,
  Lightbulb,
} from "lucide-react";
```

Add to the `nav` array (after Comparison):

```typescript
const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/head-to-head", label: "Head to Head", icon: Crosshair },
  { href: "/comparison", label: "Comparison", icon: ScatterChartIcon },
  { href: "/insights", label: "Insights", icon: Lightbulb },
];
```

**Step 2: Commit**

```bash
git add ui/src/components/layout/sidebar.tsx
git commit -m "feat(insights): add Insights nav item to sidebar"
```

---

## Task 4: Create the Insights server page

**Files:**
- Create: `ui/src/app/insights/page.tsx`

**Step 1: Create the server component**

```typescript
import { getInsightsData } from "@/lib/data";
import { InsightsClient } from "./client";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const data = getInsightsData();
  return <InsightsClient data={data} />;
}
```

**Step 2: Commit**

```bash
git add ui/src/app/insights/page.tsx
git commit -m "feat(insights): add insights server page"
```

---

## Task 5: Create the Insights client component — layout and top cards

**Files:**
- Create: `ui/src/app/insights/client.tsx`

**Step 1: Create the client component with all 8 insight sections**

This is the main component. It renders a grid of insight cards. Each card has a title, a short explanation, and a Recharts visualization.

```tsx
"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Lightbulb,
  Target,
  Zap,
  Shield,
  BarChart3,
  Crosshair,
  TrendingUp,
  Brain,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InsightsData } from "@/lib/types";
import { CHART_COLORS, TEAM_COLORS } from "@/lib/constants";
import { formatWinRate } from "@/lib/format";

interface Props {
  data: InsightsData;
}

// Truncate long model names for chart labels
function shortName(name: string, max = 14): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

// Custom tooltip wrapper
function ChartTooltip({
  active,
  payload,
  labelKey,
  valueKey,
  valueFormat,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  labelKey: string;
  valueKey: string;
  valueFormat?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const val = d[valueKey] as number;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d[labelKey] as string}</p>
      <p className="text-muted-foreground">
        {valueFormat ? valueFormat(val) : val.toFixed(2)}
      </p>
    </div>
  );
}

export function InsightsClient({ data }: Props) {
  // Sort each dataset by rating so higher-rated models appear first/left
  const firstClue = useMemo(
    () =>
      [...data.firstClueAmbition]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({ ...d, short_name: shortName(d.display_name) })),
    [data.firstClueAmbition]
  );

  const turnsWin = useMemo(
    () =>
      [...data.turnsToWin]
        .sort((a, b) => a.avg_turns_to_win - b.avg_turns_to_win)
        .map((d) => ({ ...d, short_name: shortName(d.display_name) })),
    [data.turnsToWin]
  );

  const redBlue = useMemo(
    () =>
      [...data.redBlueWinRate]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          red_pct: d.red_win_rate * 100,
          blue_pct: d.blue_win_rate * 100,
        })),
    [data.redBlueWinRate]
  );

  const assassin = useMemo(
    () =>
      [...data.assassinRate]
        .sort((a, b) => a.assassin_rate - b.assassin_rate)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          rate_pct: d.assassin_rate * 100,
        })),
    [data.assassinRate]
  );

  const accuracy = useMemo(
    () =>
      [...data.guessAccuracy]
        .sort((a, b) => b.accuracy - a.accuracy)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          acc_pct: d.accuracy * 100,
        })),
    [data.guessAccuracy]
  );

  const comeback = useMemo(
    () =>
      [...data.comebackRate]
        .sort((a, b) => b.comeback_rate - a.comeback_rate)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          rate_pct: d.comeback_rate * 100,
        })),
    [data.comebackRate]
  );

  const obedience = useMemo(
    () =>
      [...data.operativeObedience]
        .sort((a, b) => b.usage_ratio - a.usage_ratio)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          ratio_pct: d.usage_ratio * 100,
        })),
    [data.operativeObedience]
  );

  // Clue size: transform to grouped bar data
  const clueSize = useMemo(() => {
    const sorted = [...data.clueSizeDistribution].sort(
      (a, b) => b.solo_rating - a.solo_rating
    );
    // Build per-size data: [{size: 1, "Model A": 30, "Model B": 45, ...}]
    const sizes = [1, 2, 3, 4, 5];
    return sizes.map((s) => {
      const row: Record<string, number | string> = {
        size: s === 5 ? "5+" : String(s),
      };
      for (const model of sorted.slice(0, 8)) {
        const entry = model.distribution.find((d) => d.size === s);
        row[model.display_name] = entry ? Math.round(entry.pct * 100) : 0;
      }
      return row;
    });
  }, [data.clueSizeDistribution]);

  const clueSizeModels = useMemo(
    () =>
      [...data.clueSizeDistribution]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .slice(0, 8)
        .map((m) => m.display_name),
    [data.clueSizeDistribution]
  );

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Lightbulb className="h-6 w-6 text-yellow-400" />
          Insights
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Behavioral patterns and strategic differences between models
        </p>
      </div>

      {/* Grid of insight cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. First Clue Ambition */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-yellow-400" />
              First Clue Ambition
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Average clue number on the opening turn. Higher = more ambitious opening.
            </p>
          </CardHeader>
          <CardContent>
            {firstClue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={firstClue}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as { payload: Record<string, unknown> }[]}
                        labelKey="display_name"
                        valueKey="avg_first_clue_count"
                        valueFormat={(v) => `${v.toFixed(2)} words`}
                      />
                    )}
                  />
                  <Bar dataKey="avg_first_clue_count" radius={[4, 4, 0, 0]}>
                    {firstClue.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 2. Turns to Win */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-green-400" />
              Turns to Win
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Average number of turns in games the model won. Lower = more efficient.
            </p>
          </CardHeader>
          <CardContent>
            {turnsWin.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={turnsWin}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as { payload: Record<string, unknown> }[]}
                        labelKey="display_name"
                        valueKey="avg_turns_to_win"
                        valueFormat={(v) => `${v.toFixed(1)} turns`}
                      />
                    )}
                  />
                  <Bar dataKey="avg_turns_to_win" radius={[4, 4, 0, 0]}>
                    {turnsWin.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 3. Red vs Blue Win Rate */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-purple-400" />
              Red vs Blue Win Rate
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Win rate by team color. Red starts first (9 cards) but must find more.
            </p>
          </CardHeader>
          <CardContent>
            {redBlue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={redBlue}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">
                            {d.display_name}
                          </p>
                          <p className="text-red-400">
                            Red: {(d.red_pct as number).toFixed(1)}% ({d.red_games} games)
                          </p>
                          <p className="text-blue-400">
                            Blue: {(d.blue_pct as number).toFixed(1)}% ({d.blue_games} games)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="red_pct" name="Red" fill={TEAM_COLORS.red.hex} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="blue_pct" name="Blue" fill={TEAM_COLORS.blue.hex} radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 4. Assassin Discipline */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-red-400" />
              Assassin Discipline
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              % of losses caused by hitting the assassin. Lower = more disciplined.
            </p>
          </CardHeader>
          <CardContent>
            {assassin.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={assassin}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, "auto"]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as { payload: Record<string, unknown> }[]}
                        labelKey="display_name"
                        valueKey="rate_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% assassin rate`}
                      />
                    )}
                  />
                  <Bar dataKey="rate_pct" radius={[4, 4, 0, 0]}>
                    {assassin.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 5. Guess Accuracy */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crosshair className="h-4 w-4 text-cyan-400" />
              Guess Accuracy
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              % of operative guesses that correctly identify a team word.
            </p>
          </CardHeader>
          <CardContent>
            {accuracy.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={accuracy}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as { payload: Record<string, unknown> }[]}
                        labelKey="display_name"
                        valueKey="acc_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% accurate`}
                      />
                    )}
                  />
                  <Bar dataKey="acc_pct" radius={[4, 4, 0, 0]}>
                    {accuracy.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 6. Comeback Rate */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Comeback Rate
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Win rate when playing as the non-starting team (8 cards, going second).
            </p>
          </CardHeader>
          <CardContent>
            {comeback.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={comeback}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as { payload: Record<string, unknown> }[]}
                        labelKey="display_name"
                        valueKey="rate_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% comeback rate`}
                      />
                    )}
                  />
                  <Bar dataKey="rate_pct" radius={[4, 4, 0, 0]}>
                    {comeback.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 7. Operative Obedience */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-orange-400" />
              Operative Obedience
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              % of available guesses actually used (max = clue count + 1). Higher = more aggressive.
            </p>
          </CardHeader>
          <CardContent>
            {obedience.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={obedience}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as { payload: Record<string, unknown> }[]}
                        labelKey="display_name"
                        valueKey="ratio_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% of max guesses used`}
                      />
                    )}
                  />
                  <Bar dataKey="ratio_pct" radius={[4, 4, 0, 0]}>
                    {obedience.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 8. Clue Size Strategy */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              Clue Size Strategy
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribution of clue numbers across all turns. Shows conservative (1-2) vs ambitious (3+) tendencies.
            </p>
          </CardHeader>
          <CardContent>
            {clueSize.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={clueSize}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <XAxis
                    dataKey="size"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    label={{
                      value: "Clue Number",
                      position: "insideBottom",
                      offset: -2,
                      style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">
                            Clue number: {label}
                          </p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }}>
                              {p.name}: {p.value}%
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {clueSizeModels.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd ui && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add ui/src/app/insights/client.tsx
git commit -m "feat(insights): add insights client component with 8 chart sections"
```

---

## Task 6: Verify and fix any build issues

**Step 1: Run the dev build**

```bash
cd ui && npm run build
```

**Step 2: Fix any TypeScript or build errors that come up**

Common issues to watch for:
- Missing Recharts imports (Cell, Legend, CartesianGrid)
- Type mismatches in tooltip render props
- The `hsl(var(...))` pattern for tick colors may not work with OKLch theme — if so, replace with a hardcoded gray like `"#888"`

**Step 3: Start dev server and verify visually**

```bash
cd ui && npm run dev
```

Navigate to `http://localhost:3000/insights` and verify:
- All 8 cards render (may show "Not enough data yet" if DB is empty)
- Sidebar highlights "Insights" when on the page
- Charts render with proper colors and tooltips
- No console errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(insights): resolve build and rendering issues"
```

---

## Task 7: Filter out hidden models from insights data

**Step 1: Update `getInsightsData()` to respect HIDDEN_MODELS**

At the top of the function, after the `modelMap` setup, add filtering. The simplest approach: filter the final arrays.

Add the import at the top of `data.ts` (should already be there since it's used in `getModels()`):

```typescript
import { HIDDEN_MODELS } from "./constants";
```

At the end of `getInsightsData()`, before the return, filter each array:

```typescript
const isVisible = (m: { model_id: string }) => !HIDDEN_MODELS.includes(m.model_id);

return {
  firstClueAmbition: firstClueAmbition.filter(isVisible),
  turnsToWin: turnsToWin.filter(isVisible),
  redBlueWinRate: redBlueWinRate.filter(isVisible),
  assassinRate: assassinRate.filter(isVisible),
  clueSizeDistribution: clueSizeDistribution.filter(isVisible),
  guessAccuracy: guessAccuracy.filter(isVisible),
  comebackRate: comebackRate.filter(isVisible),
  operativeObedience: operativeObedience.filter(isVisible),
};
```

**Step 2: Commit**

```bash
git add ui/src/lib/data.ts
git commit -m "feat(insights): filter out hidden models from insights data"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | TypeScript types | `ui/src/lib/types.ts` |
| 2 | Data fetching (8 SQL queries) | `ui/src/lib/data.ts` |
| 3 | Sidebar nav item | `ui/src/components/layout/sidebar.tsx` |
| 4 | Server page | `ui/src/app/insights/page.tsx` |
| 5 | Client component (all charts) | `ui/src/app/insights/client.tsx` |
| 6 | Build verification | Various |
| 7 | Hidden model filtering | `ui/src/lib/data.ts` |

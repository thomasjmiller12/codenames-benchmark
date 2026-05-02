"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Swords,
  ChevronUp,
  ChevronDown,
  Minus,
  Play,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  computeDirectMatchup,
  deriveMonogram,
} from "@/lib/showcase-helpers";
import type { Model, Game, RatingHistory } from "@/lib/types";
import { AgentPortrait } from "@/components/showcase/agent-portrait";
import { ClassificationStamp } from "@/components/showcase/classification-stamp";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatDateTime, formatRating } from "@/lib/format";
import { ELO_BASELINE } from "@/lib/constants";

type Direction = "higher" | "lower";

interface StatRow {
  label: string;
  hint: string;
  aValue: number | null;
  bValue: number | null;
  display: (v: number) => string;
  better: Direction;
}

const tooltipStyle = {
  background: "oklch(0.16 0.01 260)",
  border: "1px solid oklch(0.25 0.01 260)",
  borderRadius: "8px",
  color: "#e5e5e5",
  fontSize: "13px",
};

export function HeadToHeadClient({
  models,
  games,
  ratingHistory,
}: {
  models: Model[];
  games: Game[];
  ratingHistory: RatingHistory[];
}) {
  const sortedModels = useMemo(
    () => [...models].sort((a, b) => b.solo_rating - a.solo_rating),
    [models]
  );

  const [aId, setAId] = useState<string>(sortedModels[0]?.model_id ?? "");
  const [bId, setBId] = useState<string>(
    sortedModels[1]?.model_id ?? sortedModels[0]?.model_id ?? ""
  );

  const a = sortedModels.find((m) => m.model_id === aId) ?? sortedModels[0];
  const b = sortedModels.find((m) => m.model_id === bId) ?? sortedModels[1];

  const matchup = useMemo(
    () =>
      a && b
        ? computeDirectMatchup(games, a.model_id, b.model_id)
        : { total: 0, aWins: 0, bWins: 0, ties: 0, pairs: [], recentGames: [] },
    [games, a, b]
  );

  // Rating history (solo) for both
  const chartData = useMemo(() => {
    if (!a || !b) return [];
    const aHist = ratingHistory
      .filter((r) => r.model_id === a.model_id && r.rating_type === "solo")
      .sort((x, y) => x.game_number - y.game_number);
    const bHist = ratingHistory
      .filter((r) => r.model_id === b.model_id && r.rating_type === "solo")
      .sort((x, y) => x.game_number - y.game_number);
    const maxLen = Math.max(aHist.length, bHist.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      game: i + 1,
      [a.display_name]: aHist[i]?.rating ?? null,
      [b.display_name]: bHist[i]?.rating ?? null,
    }));
  }, [a, b, ratingHistory]);

  // Sort matchup games by pair_id to group mirrored encounters
  const sortedH2H = useMemo(() => {
    const direct = games.filter(
      (g) =>
        a &&
        b &&
        ((g.red_sm_model === a.model_id && g.blue_sm_model === b.model_id) ||
          (g.red_sm_model === b.model_id && g.blue_sm_model === a.model_id))
    );
    return [...direct].sort((x, y) => {
      if (x.pair_id != null && y.pair_id != null && x.pair_id !== y.pair_id) {
        return y.pair_id - x.pair_id;
      }
      return 0;
    });
  }, [games, a, b]);

  if (sortedModels.length < 2 || !a || !b) {
    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="TICKET · TALE OF THE TAPE"
          title="Head to Head"
          description="Stack any two agents head-to-head."
        />
        <p className="text-sm text-muted-foreground">
          Need at least two agents to stage a faceoff.
        </p>
      </div>
    );
  }

  const totalAGames = a.solo_games + a.spymaster_games + a.operative_games;
  const totalBGames = b.solo_games + b.spymaster_games + b.operative_games;
  const aSweepRate = totalPair(a) ? a.pair_sweeps / totalPair(a) : null;
  const bSweepRate = totalPair(b) ? b.pair_sweeps / totalPair(b) : null;
  const aAssassinRate =
    totalAGames > 0 ? a.assassin_losses / totalAGames : null;
  const bAssassinRate =
    totalBGames > 0 ? b.assassin_losses / totalBGames : null;

  const rows: StatRow[] = [
    {
      label: "ELO RATING",
      hint: "Bradley-Terry MLE",
      aValue: a.solo_rating,
      bValue: b.solo_rating,
      display: (v) => formatRating(v),
      better: "higher",
    },
    {
      label: "PAIR SWEEPS",
      hint: "% of mirrored pairs swept 2-0",
      aValue: aSweepRate,
      bValue: bSweepRate,
      display: (v) => `${(v * 100).toFixed(0)}%`,
      better: "higher",
    },
    {
      label: "ASSASSIN LOSSES",
      hint: "% of games lost to assassin",
      aValue: aAssassinRate,
      bValue: bAssassinRate,
      display: (v) => `${(v * 100).toFixed(1)}%`,
      better: "lower",
    },
    {
      label: "TOKENS / TURN",
      hint: "Avg tokens consumed per move",
      aValue: a.avg_tokens_per_turn > 0 ? a.avg_tokens_per_turn : null,
      bValue: b.avg_tokens_per_turn > 0 ? b.avg_tokens_per_turn : null,
      display: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
      better: "lower",
    },
    {
      label: "$ / GAME",
      hint: "Avg API cost per full game",
      aValue: a.avg_cost_per_game > 0 ? a.avg_cost_per_game : null,
      bValue: b.avg_cost_per_game > 0 ? b.avg_cost_per_game : null,
      display: (v) => formatCost(v),
      better: "lower",
    },
    {
      label: "AVG LATENCY",
      hint: "Avg per-move latency",
      aValue: a.avg_latency_ms > 0 ? a.avg_latency_ms : null,
      bValue: b.avg_latency_ms > 0 ? b.avg_latency_ms : null,
      display: (v) =>
        v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`,
      better: "lower",
    },
    {
      label: "TOTAL GAMES",
      hint: "Sample size — bigger = more confident",
      aValue: totalAGames || null,
      bValue: totalBGames || null,
      display: (v) => v.toFixed(0),
      better: "higher",
    },
  ];

  let aTape = 0;
  let bTape = 0;
  for (const r of rows) {
    if (r.aValue == null || r.bValue == null) continue;
    if (r.aValue === r.bValue) continue;
    const aWins = r.better === "higher" ? r.aValue > r.bValue : r.aValue < r.bValue;
    if (aWins) aTape++;
    else bTape++;
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="TICKET · TALE OF THE TAPE"
        title="Head to Head"
        description="Stack any two agents. The Tape reads the stat-line; the Direct Matchup reads the actual games."
      />

      {/* Selectors */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
        <ModelPicker
          label="Red Corner"
          color="red"
          value={a.model_id}
          onChange={setAId}
          options={sortedModels}
        />
        <div className="hidden items-center justify-center md:flex">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            VS
          </span>
        </div>
        <ModelPicker
          label="Blue Corner"
          color="blue"
          value={b.model_id}
          onChange={setBId}
          options={sortedModels}
        />
      </div>

      {/* Hero faceoff */}
      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <CornerCard model={a} side="red" tapeWins={aTape} />
        <div className="flex items-center justify-center py-6 md:py-0">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-2xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber-400/40 bg-background/80 font-mono text-xl font-black tracking-widest text-amber-300 shadow-[0_0_40px_rgba(251,191,36,0.25)]">
              <Swords className="h-9 w-9" strokeWidth={2.5} />
            </div>
          </div>
        </div>
        <CornerCard model={b} side="blue" tapeWins={bTape} />
      </div>

      {/* THE TAPE */}
      <Panel
        eyebrow="◆ THE TAPE ◆"
        sub="Stat-line breakdown"
      >
        <div className="divide-y divide-border/40">
          {rows.map((r) => (
            <TapeRow key={r.label} row={r} />
          ))}
        </div>
      </Panel>

      {/* Direct Matchup */}
      <Panel
        eyebrow="◇ DIRECT MATCHUP ◇"
        sub="Games these two have actually played"
      >
        {matchup.total === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              These agents have never met in the field.
            </p>
            <p className="mt-2 text-sm text-foreground/70">
              Run a benchmark with both models to populate the head-to-head record.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto_1fr]">
            <Score
              label={a.display_name}
              value={matchup.aWins}
              total={matchup.total}
              color="red"
            />
            <div className="flex items-center justify-center border-y border-border/40 px-6 py-4 md:border-x md:border-y-0">
              <div className="text-center">
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {matchup.aWins}
                  <span className="mx-2 text-muted-foreground">—</span>
                  {matchup.bWins}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {matchup.total} games · {matchup.pairs.length} pairs ·{" "}
                  {matchup.ties} split
                </p>
              </div>
            </div>
            <Score
              label={b.display_name}
              value={matchup.bWins}
              total={matchup.total}
              color="blue"
              reverse
            />
            {matchup.recentGames.length > 0 && (
              <div className="md:col-span-3 border-t border-border/40 px-4 py-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Recent encounters
                </p>
                <div className="flex flex-wrap gap-2">
                  {matchup.recentGames.map((g) => (
                    <GameChip
                      key={g.game_id}
                      game={g}
                      modelA={a}
                      modelB={b}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Rating progression */}
      {chartData.length > 0 && (
        <Panel
          eyebrow="◈ RATING PROGRESSION ◈"
          sub="Solo Elo evolution as games were played"
        >
          <div className="px-4 pb-4 pt-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="game"
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={{ stroke: "#404040" }}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine
                  y={ELO_BASELINE}
                  stroke="#525252"
                  strokeDasharray="3 3"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey={a.display_name}
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={b.display_name}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 flex justify-center gap-6">
              <div className="flex items-center gap-2 text-xs">
                <div className="h-2 w-4 rounded-full bg-red-500" />
                <span className="text-muted-foreground">{a.display_name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-2 w-4 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">{b.display_name}</span>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Shared games table */}
      {sortedH2H.length > 0 && (
        <Panel
          eyebrow="◉ SHARED GAMES ◉"
          sub={`${sortedH2H.length} encounters logged`}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-4 sm:pl-6 text-xs hidden sm:table-cell">
                    Date
                  </TableHead>
                  <TableHead className="text-xs">{a.display_name}</TableHead>
                  <TableHead className="text-xs">{b.display_name}</TableHead>
                  <TableHead className="text-xs">Winner</TableHead>
                  <TableHead className="text-xs text-right hidden sm:table-cell">
                    Turns
                  </TableHead>
                  <TableHead className="text-xs text-right hidden md:table-cell">
                    Cost
                  </TableHead>
                  <TableHead className="text-xs text-right pr-4 sm:pr-6">
                    {""}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedH2H.map((game, idx) => {
                  const aIsRed = game.red_sm_model === a.model_id;
                  const winnerModel =
                    game.winner === "red"
                      ? game.red_sm_model
                      : game.blue_sm_model;
                  const aWon = winnerModel === a.model_id;
                  const gameHref = `/games/${game.game_id}`;
                  const prev = idx > 0 ? sortedH2H[idx - 1] : null;
                  const isNewPair =
                    game.pair_id != null && prev?.pair_id !== game.pair_id;
                  const isPairSecond =
                    game.pair_id != null && prev?.pair_id === game.pair_id;
                  return (
                    <TableRow
                      key={game.game_id}
                      className={`border-border/30 cursor-pointer transition-colors hover:bg-accent/30 ${
                        isNewPair && idx > 0
                          ? "border-t-2 border-t-border/60"
                          : ""
                      } ${isPairSecond ? "bg-muted/10" : ""}`}
                    >
                      <TableCell className="pl-4 sm:pl-6 text-xs text-muted-foreground font-mono hidden sm:table-cell">
                        <Link href={gameHref} className="block">
                          {formatDateTime(game.completed_at)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={gameHref} className="block">
                          <Badge
                            variant="outline"
                            className={
                              aIsRed
                                ? "border-red-500/40 bg-red-500/10 text-red-400 text-[10px]"
                                : "border-blue-500/40 bg-blue-500/10 text-blue-400 text-[10px]"
                            }
                          >
                            {aIsRed ? "Red" : "Blue"}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={gameHref} className="block">
                          <Badge
                            variant="outline"
                            className={
                              !aIsRed
                                ? "border-red-500/40 bg-red-500/10 text-red-400 text-[10px]"
                                : "border-blue-500/40 bg-blue-500/10 text-blue-400 text-[10px]"
                            }
                          >
                            {!aIsRed ? "Red" : "Blue"}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={gameHref} className="block">
                          <Badge
                            variant="outline"
                            className={
                              aWon
                                ? "border-red-500/40 bg-red-500/10 text-red-400 text-[10px]"
                                : "border-blue-500/40 bg-blue-500/10 text-blue-400 text-[10px]"
                            }
                          >
                            {aWon ? a.display_name : b.display_name}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm hidden sm:table-cell">
                        <Link href={gameHref} className="block">
                          {game.total_turns}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground hidden md:table-cell">
                        <Link href={gameHref} className="block">
                          {formatCost(game.total_cost_usd)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right pr-4 sm:pr-6">
                        <Link
                          href={gameHref}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          Replay
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function totalPair(m: Model): number {
  return m.pair_sweeps + m.pair_splits + m.pair_losses;
}

// ─── Reusable Panel ─────────────────────────────────────────────────────────

function Panel({
  eyebrow,
  sub,
  children,
}: {
  eyebrow: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-amber-300/70">
          {eyebrow}
        </p>
        {sub && (
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {sub}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Pickers + corner cards + tape rows ────────────────────────────────────

function ModelPicker({
  label,
  color,
  value,
  onChange,
  options,
}: {
  label: string;
  color: "red" | "blue";
  value: string;
  onChange: (v: string) => void;
  options: Model[];
}) {
  const accent =
    color === "red"
      ? "text-red-400 border-red-500/40"
      : "text-blue-400 border-blue-500/40";
  return (
    <div className={`rounded-md border bg-card/40 px-3 py-2.5 ${accent}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em]">
        {label}
      </p>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="mt-1 w-full border-0 bg-transparent p-0 text-base font-bold text-foreground focus:ring-0 focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m.model_id} value={m.model_id}>
              {m.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CornerCard({
  model,
  side,
  tapeWins,
}: {
  model: Model;
  side: "red" | "blue";
  tapeWins: number;
}) {
  const sideLabel = side === "red" ? "RED CORNER" : "BLUE CORNER";
  const accent =
    side === "red"
      ? "from-red-500/30 via-red-500/5 to-transparent border-red-500/40"
      : "from-blue-500/30 via-blue-500/5 to-transparent border-blue-500/40";
  const tagColor = side === "red" ? "text-red-300" : "text-blue-300";
  const totalGames =
    model.solo_games + model.spymaster_games + model.operative_games;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-gradient-to-br ${accent} p-5`}
    >
      <div className="pointer-events-none absolute -bottom-4 -right-4 select-none font-mono text-[120px] font-black leading-none text-foreground/[0.06]">
        {deriveMonogram(model.display_name)}
      </div>

      <div className="relative flex items-start gap-4">
        <AgentPortrait
          monogram={deriveMonogram(model.display_name)}
          provider={model.provider}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-mono text-[10px] uppercase tracking-[0.25em] ${tagColor}`}
          >
            {sideLabel}
          </p>
          <h3 className="mt-1 truncate font-mono text-xl font-bold uppercase tracking-tight">
            {model.display_name}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {model.provider}
          </p>
          <div className="mt-2">
            <ClassificationStamp rating={model.solo_rating} />
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-2 border-t border-border/40 pt-4">
        <CornerStat label="Elo" value={formatRating(model.solo_rating)} big />
        <CornerStat label="Games" value={totalGames.toString()} />
        <CornerStat
          label="Pairs"
          value={
            totalPair(model) > 0
              ? `${model.pair_sweeps}-${model.pair_splits}-${model.pair_losses}`
              : "—"
          }
        />
      </div>

      <div className="relative mt-4 inline-flex items-center gap-2 rounded-sm border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
        Tape Score · {tapeWins}
      </div>

      {/* Decorative scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 4px)",
        }}
      />
    </div>
  );
}

function CornerStat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-mono font-bold tabular-nums ${
          big ? "text-2xl" : "text-base"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TapeRow({ row }: { row: StatRow }) {
  const { aValue, bValue, display, better, label, hint } = row;

  let aWin = false;
  let bWin = false;
  if (aValue != null && bValue != null && aValue !== bValue) {
    if (better === "higher") {
      aWin = aValue > bValue;
      bWin = !aWin;
    } else {
      aWin = aValue < bValue;
      bWin = !aWin;
    }
  }

  let bar = 0.5;
  if (aValue != null && bValue != null) {
    const max = Math.max(Math.abs(aValue), Math.abs(bValue), 0.0001);
    const gap = Math.abs(aValue - bValue) / max;
    const skew = Math.min(0.45, gap * 0.5);
    if (aWin) bar = 0.5 + skew;
    else if (bWin) bar = 0.5 - skew;
  }

  return (
    <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-background/40">
      <div
        className={`flex items-center justify-end gap-2 text-right font-mono text-base font-bold tabular-nums ${
          aWin ? "text-red-300" : "text-foreground/60"
        }`}
      >
        {aWin && <ChevronUp className="h-4 w-4 text-red-400" strokeWidth={3} />}
        {bWin && (
          <ChevronDown
            className="h-4 w-4 text-foreground/30"
            strokeWidth={3}
          />
        )}
        <span>{aValue != null ? display(aValue) : "—"}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-center gap-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/90">
            {label}
          </p>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">{hint}</p>
        <div className="relative mx-auto h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-muted/40">
          <div
            className="absolute inset-y-0 left-0 bg-red-500/60"
            style={{ width: `${bar * 100}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-blue-500/60"
            style={{ width: `${(1 - bar) * 100}%` }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/30" />
        </div>
      </div>

      <div
        className={`flex items-center gap-2 text-left font-mono text-base font-bold tabular-nums ${
          bWin ? "text-blue-300" : "text-foreground/60"
        }`}
      >
        <span>{bValue != null ? display(bValue) : "—"}</span>
        {bWin && (
          <ChevronUp className="h-4 w-4 text-blue-400" strokeWidth={3} />
        )}
        {aWin && (
          <ChevronDown
            className="h-4 w-4 text-foreground/30"
            strokeWidth={3}
          />
        )}
        {!aWin && !bWin && (
          <Minus className="h-4 w-4 text-foreground/20" strokeWidth={2.5} />
        )}
      </div>
    </div>
  );
}

function Score({
  label,
  value,
  total,
  color,
  reverse,
}: {
  label: string;
  value: number;
  total: number;
  color: "red" | "blue";
  reverse?: boolean;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const accent = color === "red" ? "text-red-300" : "text-blue-300";
  const bar = color === "red" ? "bg-red-500/70" : "bg-blue-500/70";
  return (
    <div className={`px-5 py-4 ${reverse ? "text-right" : ""}`}>
      <p
        className={`truncate font-mono text-[10px] uppercase tracking-[0.2em] ${accent}`}
      >
        {label}
      </p>
      <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{value}</p>
      <div
        className={`mt-2 h-1.5 overflow-hidden rounded-full bg-muted/40 ${
          reverse ? "ml-auto" : ""
        }`}
        style={{ maxWidth: 220 }}
      >
        <div
          className={`h-full ${bar}`}
          style={{ width: `${pct}%`, marginLeft: reverse ? "auto" : 0 }}
        />
      </div>
    </div>
  );
}

function GameChip({
  game,
  modelA,
  modelB,
}: {
  game: Game;
  modelA: Model;
  modelB: Model;
}) {
  if (!game.winner) {
    return (
      <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Draw
      </span>
    );
  }
  const winnerModel =
    game.winner === "red" ? game.red_sm_model : game.blue_sm_model;
  const aWon = winnerModel === modelA.model_id;
  const tag = aWon
    ? `${deriveMonogram(modelA.display_name)} ✓`
    : `${deriveMonogram(modelB.display_name)} ✓`;
  return (
    <Link
      href={`/games/${game.game_id}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
        aWon
          ? "border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/15"
          : "border-blue-500/50 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15"
      }`}
      title={`${formatCost(game.total_cost_usd)} · ${game.total_turns} turns · ${game.win_condition.replace("_", " ")}`}
    >
      <span>{tag}</span>
      <span className="text-foreground/40">·</span>
      <span className="text-foreground/60">{game.total_turns}T</span>
    </Link>
  );
}

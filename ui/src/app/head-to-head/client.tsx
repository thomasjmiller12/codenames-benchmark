"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { ELO_BASELINE } from "@/lib/constants";
import { formatRating, formatWinRate, formatCost, formatDateTime, getWinRate } from "@/lib/format";
import { Swords } from "lucide-react";
import type { Model, Game, RatingHistory } from "@/lib/types";

const tooltipStyle = {
  background: "oklch(0.16 0.01 260)",
  border: "1px solid oklch(0.25 0.01 260)",
  borderRadius: "8px",
  color: "#e5e5e5",
  fontSize: "13px",
};

interface Props {
  models: Model[];
  games: Game[];
  ratingHistory: RatingHistory[];
}

export function HeadToHeadClient({ models, games, ratingHistory }: Props) {
  const [modelA, setModelA] = useState(models[0]?.model_id ?? "");
  const [modelB, setModelB] = useState(models[1]?.model_id ?? models[0]?.model_id ?? "");

  if (models.length < 2) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Head to Head</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare two models side by side
          </p>
        </div>
        <Card className="bg-card/50">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              At least two models are needed for head-to-head comparison.
              Run more benchmarks to unlock this feature.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const a = models.find((m) => m.model_id === modelA) ?? models[0];
  const b = models.find((m) => m.model_id === modelB) ?? models[1];

  // Rating history comparison (solo)
  const aHistory = ratingHistory
    .filter((r) => r.model_id === a.model_id && r.rating_type === "solo")
    .sort((x, y) => x.game_number - y.game_number);
  const bHistory = ratingHistory
    .filter((r) => r.model_id === b.model_id && r.rating_type === "solo")
    .sort((x, y) => x.game_number - y.game_number);

  const maxLen = Math.max(aHistory.length, bHistory.length);
  const chartData = Array.from({ length: maxLen }, (_, i) => ({
    game: i + 1,
    [a.display_name]: aHistory[i]?.rating ?? null,
    [b.display_name]: bHistory[i]?.rating ?? null,
  }));

  const hasChartData = chartData.length > 0;

  // Head-to-head games
  const h2hGames = games.filter(
    (g) =>
      (g.red_sm_model === a.model_id && g.blue_sm_model === b.model_id) ||
      (g.red_sm_model === b.model_id && g.blue_sm_model === a.model_id)
  );

  const aWins = h2hGames.filter(
    (g) =>
      (g.red_sm_model === a.model_id && g.winner === "red") ||
      (g.blue_sm_model === a.model_id && g.winner === "blue")
  ).length;
  const bWins = h2hGames.length - aWins;

  // Comparison stats
  const stats = [
    {
      label: "Solo Elo",
      aVal: a.solo_rating,
      bVal: b.solo_rating,
      format: formatRating,
    },
    {
      label: "Spymaster Elo",
      aVal: a.spymaster_rating,
      bVal: b.spymaster_rating,
      format: formatRating,
    },
    {
      label: "Operative Elo",
      aVal: a.operative_rating,
      bVal: b.operative_rating,
      format: formatRating,
    },
    {
      label: "Win Rate",
      aVal: getWinRate(a.solo_wins, a.solo_games),
      bVal: getWinRate(b.solo_wins, b.solo_games),
      format: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: "Red Win Rate",
      aVal: getWinRate(a.red_wins, a.red_games),
      bVal: getWinRate(b.red_wins, b.red_games),
      format: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: "Blue Win Rate",
      aVal: getWinRate(a.blue_wins, a.blue_games),
      bVal: getWinRate(b.blue_wins, b.blue_games),
      format: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      label: "Avg Cost/Game",
      aVal: a.avg_cost_per_game,
      bVal: b.avg_cost_per_game,
      format: formatCost,
    },
    {
      label: "Avg Latency",
      aVal: a.avg_latency_ms,
      bVal: b.avg_latency_ms,
      format: (v: number) => v > 0 ? `${(v / 1000).toFixed(1)}s` : "—",
    },
    {
      label: "Total Cost",
      aVal: a.total_cost_usd,
      bVal: b.total_cost_usd,
      format: formatCost,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Head to Head</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare two models side by side
        </p>
      </div>

      {/* Model selectors */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="text-xs text-red-400 font-medium mb-1.5 block uppercase tracking-wider">
            Model A
          </label>
          <Select value={modelA} onValueChange={(v) => v && setModelA(v)}>
            <SelectTrigger className="border-red-500/30 bg-red-500/5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.model_id} value={m.model_id}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-center pt-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <Swords className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="flex-1">
          <label className="text-xs text-blue-400 font-medium mb-1.5 block uppercase tracking-wider">
            Model B
          </label>
          <Select value={modelB} onValueChange={(v) => v && setModelB(v)}>
            <SelectTrigger className="border-blue-500/30 bg-blue-500/5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.model_id} value={m.model_id}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* H2H Record */}
      {h2hGames.length > 0 && (
        <Card className="bg-card/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-red-400">
                {a.display_name}
              </span>
              <span className="text-xs text-muted-foreground">
                Head-to-Head Record
              </span>
              <span className="text-sm font-medium text-blue-400">
                {b.display_name}
              </span>
            </div>
            <div className="relative h-6 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-red-500 transition-all duration-500"
                style={{
                  width: `${h2hGames.length > 0 ? (aWins / h2hGames.length) * 100 : 50}%`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {aWins} - {bWins}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats comparison */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Stat Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.map((stat) => {
            const total = stat.aVal + stat.bVal;
            const aPct = total > 0 ? (stat.aVal / total) * 100 : 50;
            const aWinning = stat.aVal > stat.bVal;
            const bWinning = stat.bVal > stat.aVal;

            return (
              <div key={stat.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`font-mono text-sm font-bold ${
                      aWinning ? "text-red-400" : "text-muted-foreground"
                    }`}
                  >
                    {stat.format(stat.aVal)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stat.label}
                  </span>
                  <span
                    className={`font-mono text-sm font-bold ${
                      bWinning ? "text-blue-400" : "text-muted-foreground"
                    }`}
                  >
                    {stat.format(stat.bVal)}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-red-500/60 transition-all duration-500"
                    style={{ width: `${aPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 right-0 bg-blue-500/60 transition-all duration-500"
                    style={{ width: `${100 - aPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Rating History Comparison */}
      {hasChartData && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Rating Progression (Solo)
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* Shared Games */}
      {h2hGames.length > 0 && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Shared Games
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-6 text-xs">Date</TableHead>
                  <TableHead className="text-xs">{a.display_name}</TableHead>
                  <TableHead className="text-xs">{b.display_name}</TableHead>
                  <TableHead className="text-xs">Winner</TableHead>
                  <TableHead className="text-xs text-right">Turns</TableHead>
                  <TableHead className="text-xs text-right pr-6">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h2hGames.map((game) => {
                  const aIsRed = game.red_sm_model === a.model_id;
                  const winnerModel =
                    game.winner === "red"
                      ? game.red_sm_model
                      : game.blue_sm_model;
                  const aWon = winnerModel === a.model_id;

                  return (
                    <TableRow
                      key={game.game_id}
                      className="border-border/30 hover:bg-accent/30"
                    >
                      <TableCell className="pl-6 text-xs text-muted-foreground font-mono">
                        {formatDateTime(game.completed_at)}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {game.total_turns}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground pr-6">
                        {formatCost(game.total_cost_usd)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

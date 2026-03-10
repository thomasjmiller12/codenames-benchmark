"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  BarChart,
  Bar,
} from "recharts";
import { PROVIDER_COLORS, ELO_BASELINE } from "@/lib/constants";
import {
  formatRating,
  formatCost,
  formatWinRate,
  formatTokens,
  formatDateTime,
  getModelDisplayName,
  getWinRate,
} from "@/lib/format";
import { ArrowLeft, Zap, DollarSign, Gamepad2, ThumbsUp, ThumbsDown } from "lucide-react";
import type { Model, Game, RatingHistory } from "@/lib/types";

const tooltipStyle = {
  background: "oklch(0.16 0.01 260)",
  border: "1px solid oklch(0.25 0.01 260)",
  borderRadius: "8px",
  color: "#e5e5e5",
  fontSize: "13px",
};

interface Props {
  model: Model;
  models: Model[];
  games: Game[];
  ratingHistory: RatingHistory[];
}

export function ModelDetailClient({ model, models, games, ratingHistory }: Props) {
  // Rating history for this model
  const soloHistory = ratingHistory
    .filter((r) => r.model_id === model.model_id && r.rating_type === "solo")
    .sort((a, b) => a.game_number - b.game_number);
  const smHistory = ratingHistory
    .filter(
      (r) => r.model_id === model.model_id && r.rating_type === "spymaster"
    )
    .sort((a, b) => a.game_number - b.game_number);
  const opHistory = ratingHistory
    .filter(
      (r) => r.model_id === model.model_id && r.rating_type === "operative"
    )
    .sort((a, b) => a.game_number - b.game_number);

  // Merge into one array for the line chart
  const ratingChartData = soloHistory.map((s, i) => ({
    game: s.game_number,
    solo: s.rating,
    spymaster: smHistory[i]?.rating ?? 1500,
    operative: opHistory[i]?.rating ?? 1500,
  }));

  const hasRatingHistory = ratingChartData.length > 0;

  // Radar chart data (normalized 0-100)
  const maxRating = 1750;
  const minRating = 1300;
  const normalize = (v: number) =>
    Math.max(0, ((v - minRating) / (maxRating - minRating)) * 100);

  const radarData = [
    { axis: "Solo", value: normalize(model.solo_rating), fullMark: 100 },
    {
      axis: "Spymaster",
      value: normalize(model.spymaster_rating),
      fullMark: 100,
    },
    {
      axis: "Operative",
      value: normalize(model.operative_rating),
      fullMark: 100,
    },
    {
      axis: "Win Rate",
      value: getWinRate(
        model.solo_wins + model.spymaster_wins + model.operative_wins,
        model.solo_games + model.spymaster_games + model.operative_games
      ),
      fullMark: 100,
    },
    {
      axis: "Efficiency",
      value: Math.min(
        100,
        ((model.solo_wins + model.spymaster_wins + model.operative_wins) /
          Math.max(model.total_cost_usd, 0.1)) *
          2
      ),
      fullMark: 100,
    },
  ];

  // Win rate by role bar chart
  const winRoleData = [
    {
      role: "Solo",
      wins: model.solo_wins,
      losses: model.solo_games - model.solo_wins,
    },
    {
      role: "Spymaster",
      wins: model.spymaster_wins,
      losses: model.spymaster_games - model.spymaster_wins,
    },
    {
      role: "Operative",
      wins: model.operative_wins,
      losses: model.operative_games - model.operative_wins,
    },
  ];

  const hasWinData = winRoleData.some((d) => d.wins + d.losses > 0);

  // Model's games
  const modelGames = games
    .filter(
      (g) =>
        g.red_sm_model === model.model_id ||
        g.blue_sm_model === model.model_id
    )
    .slice(0, 8);

  // Compute opponent stats
  const allModelGames = games.filter(
    (g) =>
      g.red_sm_model === model.model_id || g.blue_sm_model === model.model_id
  );
  const opponentMap = new Map<
    string,
    { wins: number; games: number }
  >();
  for (const g of allModelGames) {
    const isRed = g.red_sm_model === model.model_id;
    const opponentId = isRed ? g.blue_sm_model : g.red_sm_model;
    const won =
      (isRed && g.winner === "red") || (!isRed && g.winner === "blue");
    const entry = opponentMap.get(opponentId) ?? { wins: 0, games: 0 };
    entry.games++;
    if (won) entry.wins++;
    opponentMap.set(opponentId, entry);
  }

  const MIN_GAMES = 2;
  const opponentStats = Array.from(opponentMap.entries())
    .filter(([, s]) => s.games >= MIN_GAMES)
    .map(([id, s]) => ({
      opponentId: id,
      wins: s.wins,
      games: s.games,
      winRate: (s.wins / s.games) * 100,
    }));

  const easiestOpponents = [...opponentStats]
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, 3);
  const hardestOpponents = [...opponentStats]
    .sort((a, b) => a.winRate - b.winRate || b.games - a.games)
    .slice(0, 3);

  const totalGames =
    model.solo_games + model.spymaster_games + model.operative_games;
  const totalWins =
    model.solo_wins + model.spymaster_wins + model.operative_wins;

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Leaderboard
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {model.display_name}
              </h1>
              <Badge
                variant="outline"
                className={`${PROVIDER_COLORS[model.provider] ?? ""}`}
              >
                {model.provider}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              {model.model_id}
            </p>
          </div>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="bg-card/50 border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" /> Solo Elo
            </div>
            <p className="text-2xl font-bold font-mono">
              {formatRating(model.solo_rating)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {model.solo_games} games played
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Gamepad2 className="h-3.5 w-3.5" /> Win Rate
            </div>
            <p className="text-2xl font-bold font-mono">
              {formatWinRate(totalWins, totalGames)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {totalWins}W / {totalGames - totalWins}L
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Gamepad2 className="h-3.5 w-3.5" /> Games
            </div>
            <p className="text-2xl font-bold font-mono">{totalGames}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              across all roles
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" /> Cost
            </div>
            <p className="text-2xl font-bold font-mono">
              {formatCost(model.avg_cost_per_game)}/game
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {formatCost(model.total_cost_usd)} total
              {model.avg_tokens_per_game > 0 && (
                <> · ~{formatTokens(model.avg_tokens_per_game)} tokens/game</>
              )}
              {model.avg_latency_ms > 0 && (
                <> · {(model.avg_latency_ms / 1000).toFixed(1)}s avg latency</>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rating History */}
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Rating History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasRatingHistory ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={ratingChartData}>
                    <XAxis
                      dataKey="game"
                      tick={{ fill: "#a3a3a3", fontSize: 11 }}
                      axisLine={{ stroke: "#404040" }}
                      tickLine={false}
                      label={{
                        value: "Game #",
                        position: "insideBottom",
                        offset: -5,
                        fill: "#737373",
                        fontSize: 11,
                      }}
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
                      dataKey="solo"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      name="Solo"
                    />
                    <Line
                      type="monotone"
                      dataKey="spymaster"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="Spymaster"
                    />
                    <Line
                      type="monotone"
                      dataKey="operative"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      name="Operative"
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 flex justify-center gap-6">
                  {[
                    { label: "Solo", color: "#f97316" },
                    { label: "Spymaster", color: "#3b82f6" },
                    { label: "Operative", color: "#22c55e" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-2 text-xs">
                      <div
                        className="h-2 w-4 rounded-full"
                        style={{ background: l.color }}
                      />
                      <span className="text-muted-foreground">{l.label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Not enough games for rating history
              </p>
            )}
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Performance Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={310}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#404040" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                />
                <Radar
                  name={model.display_name}
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Opponent Matchups */}
      {opponentStats.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ThumbsUp className="h-4 w-4 text-emerald-400" />
                Best Matchups
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="pl-6 text-xs">Opponent</TableHead>
                    <TableHead className="text-xs text-right">Record</TableHead>
                    <TableHead className="text-xs text-right pr-6">Win Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {easiestOpponents.map((opp) => (
                    <TableRow key={opp.opponentId} className="border-border/30 hover:bg-accent/30">
                      <TableCell className="pl-6 text-sm">
                        <Link
                          href={`/models/${encodeURIComponent(opp.opponentId)}`}
                          className="hover:text-primary transition-colors"
                        >
                          {getModelDisplayName(opp.opponentId, models)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono text-right">
                        {opp.wins}W / {opp.games - opp.wins}L
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <span className="text-sm font-bold text-emerald-400 font-mono">
                          {opp.winRate.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {easiestOpponents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                        Not enough games
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ThumbsDown className="h-4 w-4 text-red-400" />
                Worst Matchups
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="pl-6 text-xs">Opponent</TableHead>
                    <TableHead className="text-xs text-right">Record</TableHead>
                    <TableHead className="text-xs text-right pr-6">Win Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hardestOpponents.map((opp) => (
                    <TableRow key={opp.opponentId} className="border-border/30 hover:bg-accent/30">
                      <TableCell className="pl-6 text-sm">
                        <Link
                          href={`/models/${encodeURIComponent(opp.opponentId)}`}
                          className="hover:text-primary transition-colors"
                        >
                          {getModelDisplayName(opp.opponentId, models)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono text-right">
                        {opp.wins}W / {opp.games - opp.wins}L
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <span className="text-sm font-bold text-red-400 font-mono">
                          {opp.winRate.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {hardestOpponents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                        Not enough games
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Win Rate by Role + Recent Games */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Win Rate by Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasWinData ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={winRoleData} barCategoryGap="30%">
                  <XAxis
                    dataKey="role"
                    tick={{ fill: "#a3a3a3", fontSize: 11 }}
                    axisLine={{ stroke: "#404040" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#a3a3a3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="wins"
                    name="Wins"
                    fill="#22c55e"
                    radius={[4, 4, 0, 0]}
                    stackId="a"
                  />
                  <Bar
                    dataKey="losses"
                    name="Losses"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    stackId="a"
                    fillOpacity={0.4}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No games played yet
              </p>
            )}

            {/* Red vs Blue Win Rate */}
            {(model.red_games > 0 || model.blue_games > 0) && (
              <div className="mt-6 pt-5 border-t border-border/40">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                  Win Rate by Team Color
                </p>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-red-400">
                        Red Team
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatWinRate(model.red_wins, model.red_games)}{" "}
                        <span className="text-[10px]">
                          ({model.red_wins}W / {model.red_games - model.red_wins}L)
                        </span>
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-red-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${model.red_games > 0 ? (model.red_wins / model.red_games) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-blue-400">
                        Blue Team
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatWinRate(model.blue_wins, model.blue_games)}{" "}
                        <span className="text-[10px]">
                          ({model.blue_wins}W / {model.blue_games - model.blue_wins}L)
                        </span>
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${model.blue_games > 0 ? (model.blue_wins / model.blue_games) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Recent Games
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {modelGames.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="pl-6 text-xs">Date</TableHead>
                    <TableHead className="text-xs">Opponent</TableHead>
                    <TableHead className="text-xs">Team</TableHead>
                    <TableHead className="text-xs text-right pr-6">
                      Result
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelGames.map((game) => {
                    const isRed = game.red_sm_model === model.model_id;
                    const opponentId = isRed
                      ? game.blue_sm_model
                      : game.red_sm_model;
                    const won =
                      (isRed && game.winner === "red") ||
                      (!isRed && game.winner === "blue");

                    return (
                      <TableRow
                        key={game.game_id}
                        className="border-border/30 hover:bg-accent/30"
                      >
                        <TableCell className="pl-6 text-xs text-muted-foreground font-mono">
                          {formatDateTime(game.completed_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getModelDisplayName(opponentId, models)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              isRed
                                ? "border-red-500/40 bg-red-500/10 text-red-400 text-[10px]"
                                : "border-blue-500/40 bg-blue-500/10 text-blue-400 text-[10px]"
                            }
                          >
                            {isRed ? "Red" : "Blue"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Badge
                            variant="outline"
                            className={
                              won
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px]"
                                : "border-red-500/40 bg-red-500/10 text-red-400 text-[10px]"
                            }
                          >
                            {won ? "W" : "L"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No games played yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

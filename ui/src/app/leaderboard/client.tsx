"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PROVIDER_COLORS, ELO_BASELINE } from "@/lib/constants";
import { ENABLE_ROLE_RATINGS } from "@/lib/feature-flags";
import { formatRating, formatWinRate, formatCost, formatTokens } from "@/lib/format";
import type { RatingType, Model } from "@/lib/types";

function getRating(model: Model, type: RatingType) {
  return type === "solo"
    ? model.solo_rating
    : type === "spymaster"
    ? model.spymaster_rating
    : model.operative_rating;
}

function getCI(model: Model, type: RatingType): { lower: number; upper: number } {
  if (type === "solo") return { lower: model.solo_ci_lower, upper: model.solo_ci_upper };
  if (type === "spymaster") return { lower: model.spymaster_ci_lower, upper: model.spymaster_ci_upper };
  return { lower: model.operative_ci_lower, upper: model.operative_ci_upper };
}

function getGames(model: Model, type: RatingType) {
  return type === "solo"
    ? model.solo_games
    : type === "spymaster"
    ? model.spymaster_games
    : model.operative_games;
}

function getWins(model: Model, type: RatingType) {
  return type === "solo"
    ? model.solo_wins
    : type === "spymaster"
    ? model.spymaster_wins
    : model.operative_wins;
}

function formatCI(rating: number, ci: { lower: number; upper: number }): string {
  if (ci.lower === ci.upper) return "";
  const margin = Math.round((ci.upper - ci.lower) / 2);
  return `\u00B1${margin}`;
}

const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

export function LeaderboardClient({ models }: { models: Model[] }) {
  const [ratingType, setRatingType] = useState<RatingType>("solo");

  const sorted = [...models].sort(
    (a, b) => getRating(b, ratingType) - getRating(a, ratingType)
  );

  if (models.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            No models registered yet
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Model rankings by Bradley-Terry rating
          </p>
        </div>
        {ENABLE_ROLE_RATINGS && (
          <Tabs
            value={ratingType}
            onValueChange={(v) => v && setRatingType(v as RatingType)}
          >
            <TabsList>
              <TabsTrigger value="solo">Solo</TabsTrigger>
              <TabsTrigger value="spymaster">Spymaster</TabsTrigger>
              <TabsTrigger value="operative">Operative</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <Card className="bg-card/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-12 pl-4 sm:pl-6 text-xs">#</TableHead>
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-xs">Rating</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Win Rate</TableHead>
                  <TableHead className="text-xs text-right">Games</TableHead>
                  <TableHead className="text-xs text-center hidden md:table-cell">Pairs (W/D/L)</TableHead>
                  <TableHead className="text-xs text-right hidden lg:table-cell">Tok/Turn</TableHead>
                  <TableHead className="text-xs text-right hidden lg:table-cell">Assassin L</TableHead>
                  <TableHead className="text-xs text-right hidden md:table-cell">$/Game</TableHead>
                  <TableHead className="text-xs text-right pr-4 sm:pr-6 hidden lg:table-cell">Avg Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((model, idx) => {
                  const rating = getRating(model, ratingType);
                  const ci = getCI(model, ratingType);
                  const gamesCount = getGames(model, ratingType);
                  const wins = getWins(model, ratingType);
                  const winRate = gamesCount > 0 ? (wins / gamesCount) * 100 : 0;
                  const ciStr = formatCI(rating, ci);

                  return (
                    <TableRow
                      key={model.model_id}
                      className="border-border/30 transition-colors hover:bg-accent/30"
                    >
                      <TableCell className="pl-4 sm:pl-6 font-mono text-sm font-bold">
                        {idx < 3 && models.length > 3 ? (
                          <span className="text-lg">{medals[idx]}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {idx + 1}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/models/${encodeURIComponent(model.model_id)}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <span className="font-medium text-sm">
                            {model.display_name}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 hidden sm:inline-flex ${
                              PROVIDER_COLORS[model.provider] ?? ""
                            }`}
                          >
                            {model.provider}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className="text-base font-bold">{formatRating(rating)}</span>
                        {ciStr && (
                          <span className="text-xs text-muted-foreground ml-1">{ciStr}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {gamesCount > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 w-16 rounded-full bg-muted">
                              <div
                                className="absolute h-full rounded-full bg-emerald-500/60"
                                style={{ width: `${winRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">
                              {formatWinRate(wins, gamesCount)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {gamesCount}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs hidden md:table-cell">
                        {(model.pair_sweeps + model.pair_splits + model.pair_losses) > 0 ? (
                          <span>
                            <span className="text-emerald-400">{model.pair_sweeps}W</span>
                            {" / "}
                            <span className="text-muted-foreground">{model.pair_splits}D</span>
                            {" / "}
                            <span className="text-red-400">{model.pair_losses}L</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground hidden lg:table-cell">
                        {model.avg_tokens_per_turn > 0
                          ? formatTokens(model.avg_tokens_per_turn)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-400 hidden lg:table-cell">
                        {gamesCount > 0
                          ? `${((model.assassin_losses / gamesCount) * 100).toFixed(0)}%`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground hidden md:table-cell">
                        {formatCost(model.avg_cost_per_game)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground pr-4 sm:pr-6 hidden lg:table-cell">
                        {model.avg_latency_ms > 0 ? `${(model.avg_latency_ms / 1000).toFixed(1)}s` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

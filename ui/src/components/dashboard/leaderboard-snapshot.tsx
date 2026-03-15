"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PROVIDER_COLORS } from "@/lib/constants";
import { formatRating } from "@/lib/format";
import type { Model } from "@/lib/types";
import { ArrowRight } from "lucide-react";

const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

export function LeaderboardSnapshot({ models }: { models: Model[] }) {
  const top = [...models]
    .sort((a, b) => b.solo_rating - a.solo_rating)
    .slice(0, 5);

  if (top.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Top Models
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-12 text-center">
            No models registered yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href="/leaderboard" className="block group">
      <Card className="bg-card/50 transition-colors group-hover:bg-card/70">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Top Models</CardTitle>
          <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-foreground transition-colors">
            Full leaderboard <ArrowRight className="h-3 w-3" />
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          {top.map((model, idx) => {
            const winRate =
              model.solo_games > 0
                ? ((model.solo_wins / model.solo_games) * 100).toFixed(0)
                : "0";

            return (
              <div
                key={model.model_id}
                className="flex items-center gap-3 py-1.5"
              >
                <span className="w-6 text-center text-sm shrink-0">
                  {idx < 3 ? (
                    <span className="text-base">{medals[idx]}</span>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">
                      {idx + 1}
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {model.display_name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 hidden sm:inline-flex shrink-0 ${
                        PROVIDER_COLORS[model.provider] ?? ""
                      }`}
                    >
                      {model.provider}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-sm font-bold">
                    {formatRating(model.solo_rating)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1.5">
                    {winRate}%
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </Link>
  );
}

export function RedBlueWinRate({
  redWins,
  blueWins,
}: {
  redWins: number;
  blueWins: number;
}) {
  const total = redWins + blueWins;

  if (total === 0) {
    return (
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Red vs Blue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-12 text-center">
            No games played yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const redPct = ((redWins / total) * 100).toFixed(1);
  const bluePct = ((blueWins / total) * 100).toFixed(1);

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Red vs Blue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          {/* Big numbers */}
          <div className="flex items-end justify-center gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-red-400">
                {redPct}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {redWins} wins
              </div>
            </div>
            <div className="text-muted-foreground text-sm font-medium pb-1">
              vs
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-blue-400">
                {bluePct}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {blueWins} wins
              </div>
            </div>
          </div>

          {/* Bar */}
          <div className="w-full max-w-xs">
            <div className="flex h-3 rounded-full overflow-hidden">
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${redPct}%` }}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${bluePct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-red-400 font-medium">RED</span>
              <span className="text-[10px] text-muted-foreground">
                {total} games
              </span>
              <span className="text-[10px] text-blue-400 font-medium">
                BLUE
              </span>
            </div>
          </div>

          {/* First-move advantage note */}
          <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
            Red goes first with 9 words vs Blue&apos;s 8 — first-move advantage
            is a known Codenames factor
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

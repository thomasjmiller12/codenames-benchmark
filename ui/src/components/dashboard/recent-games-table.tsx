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
import { Badge } from "@/components/ui/badge";
import { PairResultBadge } from "@/components/pair-result-badge";
import { Play } from "lucide-react";
import { formatDateTime, formatCost, getModelDisplayName } from "@/lib/format";
import { buildPairMap, getPairResultGeneric } from "@/lib/pairs";
import type { Game, Model } from "@/lib/types";

export function RecentGamesTable({
  games,
  models,
}: {
  games: Game[];
  models: Model[];
}) {
  if (games.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Top Recent Games</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            No games played yet. Run a benchmark to see results here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pairMap = buildPairMap(games);

  // Show recent games between top-rated models (top half by solo Elo)
  const sortedModels = [...models].sort((a, b) => b.solo_rating - a.solo_rating);
  const topCount = Math.max(2, Math.ceil(sortedModels.length / 2));
  const topModelIds = new Set(sortedModels.slice(0, topCount).map((m) => m.model_id));

  const topGames = games.filter(
    (g) => topModelIds.has(g.red_sm_model) && topModelIds.has(g.blue_sm_model)
  );

  // Fall back to all games if not enough top games
  const recent = (topGames.length >= 5 ? topGames : games).slice(0, 10);

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Top Recent Games</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="pl-4 sm:pl-6 text-xs hidden sm:table-cell">Date</TableHead>
              <TableHead className="pl-4 sm:pl-0 text-xs">Red Team</TableHead>
              <TableHead className="text-xs">Blue Team</TableHead>
              <TableHead className="text-xs">Result</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Pair</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Condition</TableHead>
              <TableHead className="text-xs text-right hidden sm:table-cell">Turns</TableHead>
              <TableHead className="text-xs text-right hidden lg:table-cell">Cost</TableHead>
              <TableHead className="text-xs text-right pr-4 sm:pr-6"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((game) => {
              const pairResult = getPairResultGeneric(game, pairMap);

              return (
                <TableRow
                  key={game.game_id}
                  className="border-border/30 cursor-pointer transition-colors hover:bg-accent/30"
                >
                  <TableCell className="pl-4 sm:pl-6 text-xs text-muted-foreground font-mono hidden sm:table-cell">
                    <Link href={`/games/${game.game_id}`} className="block">
                      {formatDateTime(game.completed_at)}
                    </Link>
                  </TableCell>
                  <TableCell className="pl-4 sm:pl-0 text-sm">
                    <Link href={`/games/${game.game_id}`} className="flex items-center">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2 shrink-0" />
                      <span className="truncate">{getModelDisplayName(game.red_sm_model, models)}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={`/games/${game.game_id}`} className="flex items-center">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-2 shrink-0" />
                      <span className="truncate">{getModelDisplayName(game.blue_sm_model, models)}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/games/${game.game_id}`} className="block">
                      <Badge
                        variant="outline"
                        className={
                          game.winner === "red"
                            ? "border-red-500/40 bg-red-500/10 text-red-400"
                            : "border-blue-500/40 bg-blue-500/10 text-blue-400"
                        }
                      >
                        {game.winner === "red" ? "Red" : "Blue"} wins
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Link href={`/games/${game.game_id}`} className="block">
                      {pairResult ? (
                        <PairResultBadge label={pairResult.label} variant={pairResult.variant} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50">unpaired</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                    <Link href={`/games/${game.game_id}`} className="block">
                      {game.win_condition === "all_words"
                        ? "All words"
                        : game.win_condition === "assassin"
                        ? "Assassin"
                        : "Turn limit"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono hidden sm:table-cell">
                    <Link href={`/games/${game.game_id}`} className="block">
                      {game.total_turns}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono text-muted-foreground hidden lg:table-cell">
                    <Link href={`/games/${game.game_id}`} className="block">
                      {formatCost(game.total_cost_usd)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right pr-4 sm:pr-6">
                    <Link
                      href={`/games/${game.game_id}`}
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
      </CardContent>
    </Card>
  );
}

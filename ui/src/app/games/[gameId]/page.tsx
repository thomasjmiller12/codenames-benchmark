import { getGameReplay, getGames, getModels } from "@/lib/data";
import { GameReplayClient } from "./client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getModelDisplayName, formatCost } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GameReplayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const [replay, models] = await Promise.all([
    getGameReplay(gameId),
    getModels(),
  ]);

  // If we have full replay data (board + turns), show the interactive replay
  if (replay && replay.turns.length > 0) {
    return <GameReplayClient replay={replay} models={models} />;
  }

  // Otherwise show a summary of the game from the games table
  const games = await getGames();
  const game = games.find((g) => g.game_id === gameId);

  if (!game) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Game Not Found</h1>
        <p className="text-sm text-muted-foreground">
          No game found with ID: {gameId}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Game Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getModelDisplayName(game.red_sm_model, models)}{" "}
            <span className="text-red-400">vs</span>{" "}
            {getModelDisplayName(game.blue_sm_model, models)}
          </p>
        </div>
        {game.winner && (
          <Badge
            variant="outline"
            className={
              game.winner === "red"
                ? "border-red-500/40 bg-red-500/10 text-red-400 text-sm px-3 py-1"
                : "border-blue-500/40 bg-blue-500/10 text-blue-400 text-sm px-3 py-1"
            }
          >
            {game.winner === "red" ? "Red" : "Blue"} wins
          </Badge>
        )}
      </div>

      <Card className="bg-card/50">
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Turns</p>
            <p className="text-lg font-bold font-mono">{game.total_turns}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Condition</p>
            <p className="text-lg font-bold capitalize">
              {game.win_condition.replace("_", " ")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Red Remaining</p>
            <p className="text-lg font-bold font-mono text-red-400">
              {game.red_remaining}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Blue Remaining</p>
            <p className="text-lg font-bold font-mono text-blue-400">
              {game.blue_remaining}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground text-center py-8">
            Board replay data is not available for this game.
            <br />
            <span className="text-xs">
              Turn-by-turn replays require board and turn data to be stored during the benchmark.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

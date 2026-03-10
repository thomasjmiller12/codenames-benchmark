import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentGamesTable } from "@/components/dashboard/recent-games-table";
import { WinConditionPie, RatingDistribution } from "@/components/dashboard/charts";
import { getModels, getGames, getOverallStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [models, games, overallStats] = await Promise.all([
    getModels(),
    getGames(),
    getOverallStats(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of the Codenames LLM benchmark results
        </p>
      </div>

      <StatsCards overallStats={overallStats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WinConditionPie
          data={{
            winByAllWords: overallStats.winByAllWords,
            winByAssassin: overallStats.winByAssassin,
            winByTurnLimit: overallStats.winByTurnLimit,
            totalGames: overallStats.totalGames,
          }}
        />
        <RatingDistribution models={models} />
      </div>

      <RecentGamesTable games={games} models={models} />
    </div>
  );
}

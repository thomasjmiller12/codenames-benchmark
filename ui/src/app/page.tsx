import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentGamesTable } from "@/components/dashboard/recent-games-table";
import { WinConditionPie, RatingDistribution } from "@/components/dashboard/charts";
import { LeaderboardSnapshot, RedBlueWinRate } from "@/components/dashboard/leaderboard-snapshot";
import { SectionHeader } from "@/components/ui/section-header";
import { getModels, getGames, getOverallStats } from "@/lib/data";

export const revalidate = 300; // re-fetch at most every 5 minutes

export default async function DashboardPage() {
  const [models, games, overallStats] = await Promise.all([
    getModels(),
    getGames(100), // Dashboard only shows ~10 recent games
    getOverallStats(),
  ]);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="SITUATION REPORT"
        title="Dashboard"
        description="Field briefing on the Codenames LLM benchmark — agents in the program, games logged, and the cost of running them."
      />

      <StatsCards overallStats={overallStats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeaderboardSnapshot models={models} />
        <RedBlueWinRate
          redWins={overallStats.redWins}
          blueWins={overallStats.blueWins}
        />
      </div>

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

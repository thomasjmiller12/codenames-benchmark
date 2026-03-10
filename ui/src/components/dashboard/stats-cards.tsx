import { Card, CardContent } from "@/components/ui/card";
import { Gamepad2, Bot, Clock, DollarSign } from "lucide-react";
import { formatCost } from "@/lib/format";

interface OverallStats {
  totalGames: number;
  totalPairs: number;
  totalModels: number;
  avgTurns: number;
  totalCost: number;
  redWins: number;
  blueWins: number;
}

export function StatsCards({ overallStats }: { overallStats: OverallStats }) {
  const stats = [
    {
      label: "Paired Games",
      value: overallStats.totalGames.toString(),
      sub: `${overallStats.totalPairs} pairs`,
      icon: Gamepad2,
      accent: "text-red-400",
      border: "border-l-red-500",
    },
    {
      label: "Models Tested",
      value: overallStats.totalModels.toString(),
      sub: "unique LLMs",
      icon: Bot,
      accent: "text-blue-400",
      border: "border-l-blue-500",
    },
    {
      label: "Avg Game Length",
      value: overallStats.avgTurns > 0 ? overallStats.avgTurns.toFixed(1) : "—",
      sub: "turns per game",
      icon: Clock,
      accent: "text-amber-400",
      border: "border-l-amber-500",
    },
    {
      label: "Total Cost",
      value: overallStats.totalCost > 0 ? formatCost(overallStats.totalCost) : "$0.00",
      sub: "API spend",
      icon: DollarSign,
      accent: "text-emerald-400",
      border: "border-l-emerald-500",
    },
  ];

  const redRate = overallStats.totalGames > 0
    ? ((overallStats.redWins / overallStats.totalGames) * 100).toFixed(1)
    : "0.0";
  const blueRate = overallStats.totalGames > 0
    ? ((overallStats.blueWins / overallStats.totalGames) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={`border-l-4 ${stat.border} bg-card/50`}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ${stat.accent}`}
              >
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight font-mono">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {overallStats.totalGames > 0 && (
        <Card className="bg-card/50">
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Red vs Blue Win Rate
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-red-400 font-mono w-14 text-right">
                  {redRate}%
                </span>
                <span className="text-xs text-muted-foreground">Red</span>
              </div>
              <div className="relative h-3 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-red-500 rounded-l-full transition-all duration-500"
                  style={{
                    width: `${overallStats.totalGames > 0 ? (overallStats.redWins / overallStats.totalGames) * 100 : 50}%`,
                  }}
                />
                <div
                  className="absolute inset-y-0 right-0 bg-blue-500 rounded-r-full transition-all duration-500"
                  style={{
                    width: `${overallStats.totalGames > 0 ? (overallStats.blueWins / overallStats.totalGames) * 100 : 50}%`,
                  }}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">Blue</span>
                <span className="text-sm font-bold text-blue-400 font-mono w-14">
                  {blueRate}%
                </span>
              </div>
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-muted-foreground font-mono">
              <span>{overallStats.redWins} wins</span>
              <span>{overallStats.blueWins} wins</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

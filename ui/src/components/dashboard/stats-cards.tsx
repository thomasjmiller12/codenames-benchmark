import { Card, CardContent } from "@/components/ui/card";
import { Gamepad2, Bot, Clock, DollarSign } from "lucide-react";
import { formatCost } from "@/lib/format";

interface OverallStats {
  totalGames: number;
  totalPairs: number;
  totalModels: number;
  avgTurns: number;
  totalCost: number;
}

export function StatsCards({ overallStats }: { overallStats: OverallStats }) {
  const stats = [
    {
      label: "Total Games",
      value: overallStats.totalGames.toString(),
      sub: `${overallStats.totalPairs} pairs completed`,
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

  return (
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
  );
}

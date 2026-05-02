import { Gamepad2, Bot, Clock, DollarSign, type LucideIcon } from "lucide-react";
import { formatCost } from "@/lib/format";

interface OverallStats {
  totalGames: number;
  totalPairs: number;
  totalModels: number;
  avgTurns: number;
  totalCost: number;
}

interface StatTile {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  code: string;
  gradient: string;
  border: string;
  iconAccent: string;
}

export function StatsCards({ overallStats }: { overallStats: OverallStats }) {
  const stats: StatTile[] = [
    {
      label: "Total Games",
      value: overallStats.totalGames.toLocaleString(),
      sub: `${overallStats.totalPairs.toLocaleString()} mirrored pairs`,
      icon: Gamepad2,
      code: "01",
      gradient: "from-rose-500/15 via-rose-500/5 to-transparent",
      border: "border-rose-500/30",
      iconAccent: "text-rose-300",
    },
    {
      label: "Models Tested",
      value: overallStats.totalModels.toString(),
      sub: "unique LLMs in the field",
      icon: Bot,
      code: "02",
      gradient: "from-sky-500/15 via-sky-500/5 to-transparent",
      border: "border-sky-500/30",
      iconAccent: "text-sky-300",
    },
    {
      label: "Avg Game Length",
      value: overallStats.avgTurns > 0 ? overallStats.avgTurns.toFixed(1) : "—",
      sub: "turns per game",
      icon: Clock,
      code: "03",
      gradient: "from-amber-500/15 via-amber-500/5 to-transparent",
      border: "border-amber-500/30",
      iconAccent: "text-amber-300",
    },
    {
      label: "Total Cost",
      value:
        overallStats.totalCost > 0 ? formatCost(overallStats.totalCost) : "$0.00",
      sub: "API spend across all games",
      icon: DollarSign,
      code: "04",
      gradient: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      border: "border-emerald-500/30",
      iconAccent: "text-emerald-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`group relative overflow-hidden rounded-lg border bg-gradient-to-br p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-card/80 ${stat.gradient} ${stat.border}`}
        >
          {/* Header row: icon + code */}
          <div className="flex items-start justify-between">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-background/60 ${stat.iconAccent}`}
            >
              <stat.icon className="h-4 w-4" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              #{stat.code}
            </span>
          </div>

          {/* Headline number */}
          <p className="mt-5 font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-[2rem]">
            {stat.value}
          </p>

          {/* Label */}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/85">
            {stat.label}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.sub}</p>

          {/* Decorative scanlines */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 4px)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

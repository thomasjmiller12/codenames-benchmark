"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Trophy,
  Crosshair,
  ScatterChart as ScatterChartIcon,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/head-to-head", label: "Head to Head", icon: Crosshair },
  { href: "/comparison", label: "Comparison", icon: ScatterChartIcon },
  { href: "/insights", label: "Insights", icon: Lightbulb },
];

interface SidebarProps {
  totalGames?: number;
  totalModels?: number;
}

export function Sidebar({ totalGames = 0, totalModels = 0 }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-blue-600 font-bold text-white text-sm">
          CN
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            Codenames
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground">
            LLM Benchmark
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 h-6 w-1 rounded-r-full bg-primary" />
              )}
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-6 py-4">
        <p className="text-[11px] text-muted-foreground">
          {totalGames} {totalGames === 1 ? "game" : "games"} played
        </p>
        <p className="text-[11px] text-muted-foreground">
          {totalModels} {totalModels === 1 ? "model" : "models"} benchmarked
        </p>
      </div>
    </aside>
  );
}

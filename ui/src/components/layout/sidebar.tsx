"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Trophy,
  Crosshair,
  ScatterChart as ScatterChartIcon,
  Lightbulb,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar on escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-blue-600 font-bold text-white text-sm shrink-0">
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
        {/* Close button — mobile only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden -mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
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
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-sidebar px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-red-500 to-blue-600 font-bold text-white text-[10px]">
            CN
          </div>
          <span className="text-sm font-semibold text-foreground">Codenames</span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-sidebar transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out md:flex",
          desktopCollapsed ? "w-0 overflow-hidden border-r-0" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop collapse/expand toggle */}
      <button
        onClick={() => setDesktopCollapsed(!desktopCollapsed)}
        className={cn(
          "fixed top-4 z-50 hidden md:flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-300",
          desktopCollapsed ? "left-4" : "left-[232px]"
        )}
        aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {desktopCollapsed ? (
          <PanelLeft className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      {/* Spacer to push main content — syncs with sidebar width */}
      <div
        className={cn(
          "hidden md:block shrink-0 transition-all duration-300",
          desktopCollapsed ? "w-0" : "w-60"
        )}
      />
    </>
  );
}

"use client";

import { BarChart, Box, Cuboid, Layers3, LineChart, ScatterChart } from "lucide-react";
import type { Scale, Variant, View } from "./scene-data";

interface Props {
  view: View;
  setView: (v: View) => void;
  variant: Variant;
  setVariant: (v: Variant) => void;
  scale: Scale;
  setScale: (s: Scale) => void;
}

export function LabControls({ view, setView, variant, setVariant, scale, setScale }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <ButtonGroup label="View">
        <Btn on={view === "cost"} onClick={() => setView("cost")} icon={ScatterChart} label="Cost × Elo" />
        <Btn on={view === "latency"} onClick={() => setView("latency")} icon={ScatterChart} label="Latency × Elo" />
        <Btn on={view === "3d"} onClick={() => setView("3d")} icon={Cuboid} label="3D Cube" accent />
      </ButtonGroup>

      <div className="hidden h-9 w-px bg-border/60 md:block" aria-hidden />

      <ButtonGroup label="Variant">
        <Btn on={variant === "scatter"} onClick={() => setVariant("scatter")} icon={Box} label="Scatter" />
        <Btn on={variant === "manifold"} onClick={() => setVariant("manifold")} icon={Layers3} label="Frontier" />
      </ButtonGroup>

      <div className="hidden h-9 w-px bg-border/60 md:block" aria-hidden />

      <ButtonGroup label="Scale">
        <Btn on={scale === "log"} onClick={() => setScale("log")} icon={LineChart} label="Log" />
        <Btn on={scale === "linear"} onClick={() => setScale("linear")} icon={BarChart} label="Linear" />
      </ButtonGroup>
    </div>
  );
}

function ButtonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/80">
        {label}
      </span>
      <div className="flex gap-1 rounded-md border border-border/70 bg-background/60 p-1 shadow-inner">
        {children}
      </div>
    </div>
  );
}

function Btn({
  on,
  onClick,
  icon: Icon,
  label,
  accent,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Box;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all ${
        on
          ? accent
            ? "bg-amber-400/20 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.6),0_0_12px_-4px_rgba(251,191,36,0.5)]"
            : "bg-foreground/15 text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

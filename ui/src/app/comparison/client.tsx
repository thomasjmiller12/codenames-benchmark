"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, Box, Layers3 } from "lucide-react";
import type { ComponentType } from "react";
import type { Model } from "@/lib/types";
import { providerHex } from "@/lib/showcase-helpers";
import { SectionHeader } from "@/components/ui/section-header";
import { LabControls } from "./controls";
import { SidePanel } from "./side-panel";
import {
  build3DPoints,
  type Hover,
  type Scale,
  type Variant,
  type View,
} from "./scene-data";

const ComparisonScene = dynamic(() => import("./scene").then((m) => m.ComparisonScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-[640px] items-center justify-center bg-card/40 text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground">
      Booting WebGL…
    </div>
  ),
});

export function ComparisonClient({ models }: { models: Model[] }) {
  const [view, setView] = useState<View>("cost");
  const [variant, setVariant] = useState<Variant>("scatter");
  const [scale, setScale] = useState<Scale>("log");
  const [hover, setHover] = useState<Hover | null>(null);

  const filtered = useMemo(
    () =>
      models.filter(
        (m) => m.solo_games > 0 && m.avg_cost_per_game > 0 && m.avg_latency_ms > 0
      ),
    [models]
  );

  const { points, axes } = useMemo(
    () => build3DPoints(filtered, scale, scale),
    [filtered, scale]
  );
  const providers = useMemo(() => {
    const set = new Set(points.map((p) => p.provider));
    return Array.from(set).sort();
  }, [points]);

  if (filtered.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <p className="text-sm text-muted-foreground">No data yet.</p>
      </div>
    );
  }

  const frontierCount = points.filter((p) => {
    if (view === "cost") return p.isFrontierCost;
    if (view === "latency") return p.isFrontierLat;
    return p.isFrontier3d;
  }).length;

  const viewTitle =
    view === "cost"
      ? "Cost × Elo"
      : view === "latency"
      ? "Latency × Elo"
      : "Cost × Elo × Latency";

  return (
    <div className="space-y-6">
      <Header />

      <LabControls
        view={view}
        setView={setView}
        variant={variant}
        setVariant={setVariant}
        scale={scale}
        setScale={setScale}
      />

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/40 px-4 py-2.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {viewTitle}
          </p>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-amber-300/70">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              {frontierCount} on frontier
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span>{points.length} models</span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="lg:border-r lg:border-border/60">
            <ComparisonScene
              points={points}
              axes={axes}
              view={view}
              variant={variant}
              hover={hover}
              setHover={setHover}
            />
          </div>
          <div className="border-t border-border/60 bg-background/30 lg:h-[640px] lg:border-t-0">
            <SidePanel
              hover={hover}
              view={view}
              pointsCount={points.length}
              frontierCount={frontierCount}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 bg-background/30 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Providers
          </span>
          {providers.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <span
                className="block h-2.5 w-2.5 rounded-full ring-1 ring-foreground/20"
                style={{ background: providerHex(p) }}
              />
              <span className="font-mono text-[11px] uppercase tracking-wider text-foreground/85">
                {p}
              </span>
            </div>
          ))}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {view === "3d" ? "Drag to rotate · Scroll to zoom" : "Pick another view to rotate"}
          </span>
        </div>
      </div>

      <VariantBlurb variant={variant} view={view} />
    </div>
  );
}

function Header() {
  return (
    <SectionHeader
      eyebrow="INTEL · CAPABILITY VOLUME"
      title="Comparison"
      description="Two flat views (Cost × Elo, Latency × Elo) live on adjacent faces of the same cube — switch between them to rotate the camera around. The 3D view lifts you above the corner so all three axes are visible at once."
    />
  );
}

function VariantBlurb({ variant, view }: { variant: Variant; view: View }) {
  const items: Record<Variant, { title: string; body: string; icon: ComponentType<{ className?: string }> }> = {
    scatter: {
      title: "Scatter",
      icon: Box,
      body:
        view === "3d"
          ? "Each model is a sphere in (cost × Elo × latency) space. Golden halos mark the 3D Pareto frontier — no other model is cheaper, faster, AND stronger. Hover a corner of the cube to see what that extreme represents."
          : view === "cost"
          ? "Each model is a flat dot. Yellow border = 2D cost-Elo Pareto frontier. Switch to Latency × Elo to rotate around and re-rank by speed."
          : "Each model is a flat dot. Yellow border = 2D latency-Elo Pareto frontier. Switch to Cost × Elo to rotate back.",
    },
    manifold: {
      title: "Frontier",
      icon: Layers3,
      body:
        view === "3d"
          ? "An IDW-interpolated Elo surface fit through the 3D Pareto-frontier points. The 'roof' of what's currently achievable: anything below the surface is fair, anything above is impossible (so far)."
          : "A line through the 2D Pareto frontier — for any " + (view === "cost" ? "cost" : "latency") + " budget, the highest-Elo model. Switch view to rotate; the line collapses and the perpendicular curve fades in. Lift to 3D and the line becomes a surface.",
    },
  };
  const item = items[variant];
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 bg-card/30 p-4">
      <Icon className="mt-0.5 h-4 w-4 text-amber-300/80 shrink-0" />
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-300/80">
          {item.title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
      </div>
    </div>
  );
}

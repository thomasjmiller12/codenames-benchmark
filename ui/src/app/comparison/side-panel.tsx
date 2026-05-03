"use client";

import { providerHex } from "@/lib/showcase-helpers";
import { formatCost } from "@/lib/format";
import type { Hover, LabPoint, CornerLabel, View } from "./scene-data";

interface Props {
  hover: Hover | null;
  view: View;
  pointsCount: number;
  frontierCount: number;
}

export function SidePanel({ hover, view, pointsCount, frontierCount }: Props) {
  return (
    <div className="flex h-full flex-col p-4">
      {hover === null ? (
        <DefaultPanel view={view} pointsCount={pointsCount} frontierCount={frontierCount} />
      ) : hover.kind === "model" ? (
        <ModelPanel point={hover.point} />
      ) : (
        <CornerPanel corner={hover.corner} occupant={hover.occupant} />
      )}
    </div>
  );
}

// ─── Default (nothing hovered) ───────────────────────────────────────────────

function DefaultPanel({
  view,
  pointsCount,
  frontierCount,
}: {
  view: View;
  pointsCount: number;
  frontierCount: number;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
          Inspector
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hover a dot or a corner to see its position on each axis.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border/40 bg-background/30 p-3">
        <StatRow label="View" value={
          view === "cost" ? "Cost × Elo" : view === "latency" ? "Latency × Elo" : "3D Cube"
        } />
        <StatRow label="Models" value={String(pointsCount)} />
        <StatRow
          label="On frontier"
          value={`${frontierCount}`}
          accent
        />
      </div>

      <div className="mt-auto rounded-md border border-amber-300/20 bg-amber-400/5 p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300/80">
          Tip
        </p>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-white/70">
          Switch the View buttons to rotate the camera around the cube. The 3D button lifts the camera up and out so you can see all three axes at once.
        </p>
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={`font-mono text-xs tabular-nums ${
          accent ? "text-amber-300" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Model hover ─────────────────────────────────────────────────────────────

function ModelPanel({ point }: { point: LabPoint }) {
  const color = providerHex(point.provider);
  const costPct = (point.nx + 1) / 2;
  const latPct = (point.nz + 1) / 2;
  const eloPct = (point.ny + 1) / 2;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 block h-3 w-3 shrink-0 rounded-full ring-1 ring-foreground/20"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-tight">
            {point.displayName}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
            {point.provider}
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border/40 bg-background/30 p-3">
        <ContinuousBar
          icon="$"
          label="Cost / game"
          percent={costPct}
          valueText={formatCost(point.cost)}
          accent={color}
        />
        <ContinuousBar
          icon="⚡"
          label="Latency"
          percent={latPct}
          valueText={
            point.latency >= 1000
              ? `${(point.latency / 1000).toFixed(1)}s`
              : `${point.latency.toFixed(0)}ms`
          }
          accent={color}
        />
        <ContinuousBar
          icon="↑"
          label="Elo"
          percent={eloPct}
          valueText={String(Math.round(point.elo))}
          accent={color}
        />
      </div>

      <div className="space-y-1.5 rounded-md border border-border/40 bg-background/30 p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          Frontier
        </p>
        <FrontierFlag flag="Cost × Elo" on={point.isFrontierCost} />
        <FrontierFlag flag="Latency × Elo" on={point.isFrontierLat} />
        <FrontierFlag flag="3D Pareto" on={point.isFrontier3d} />
      </div>
    </div>
  );
}

function FrontierFlag({ flag, on }: { flag: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px]">
      <span className="text-white/65">{flag}</span>
      <span className={on ? "text-amber-300" : "text-white/30"}>
        {on ? "● on" : "○ off"}
      </span>
    </div>
  );
}

function ContinuousBar({
  icon,
  label,
  percent,
  valueText,
  accent,
}: {
  icon: string;
  label: string;
  percent: number;
  valueText: string;
  accent: string;
}) {
  const p = Math.max(0, Math.min(1, percent));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span className="text-white/70">
          <span className="mr-1.5 text-amber-300/80">{icon}</span>
          {label}
        </span>
        <span className="tabular-nums text-foreground">{valueText}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/8">
        {/* fill bar from left to percent */}
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${p * 100}%`, background: accent, opacity: 0.55 }}
        />
        {/* marker pin */}
        <div
          className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full ring-1 ring-black/40"
          style={{ left: `calc(${p * 100}% - 2px)`, background: accent }}
        />
      </div>
    </div>
  );
}

// ─── Corner hover ────────────────────────────────────────────────────────────

function CornerPanel({
  corner,
  occupant,
}: {
  corner: CornerLabel;
  occupant: LabPoint | null;
}) {
  const accentText =
    corner.vibe === "dream"
      ? "text-amber-300"
      : corner.vibe === "good"
      ? "text-emerald-300"
      : corner.vibe === "bad"
      ? "text-rose-300"
      : corner.vibe === "void"
      ? "text-zinc-400"
      : "text-foreground";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
          Corner
        </p>
        <h3 className={`mt-1 font-mono text-sm font-bold uppercase tracking-[0.15em] ${accentText}`}>
          {corner.title}
        </h3>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{corner.description}</p>
      </div>

      <div className="space-y-2.5 rounded-md border border-border/40 bg-background/30 p-3">
        <BinaryBar
          icon="$"
          label="Cost"
          isHigh={corner.sx === 1}
          good={corner.sx === -1}
          highText="expensive"
          lowText="cheap"
        />
        <BinaryBar
          icon="⚡"
          label="Latency"
          isHigh={corner.sz === 1}
          good={corner.sz === -1}
          highText="slow"
          lowText="fast"
        />
        <BinaryBar
          icon="↑"
          label="Elo"
          isHigh={corner.sy === 1}
          good={corner.sy === 1}
          highText="strong"
          lowText="weak"
        />
      </div>

      {occupant && (
        <div className="space-y-1 rounded-md border border-border/40 bg-background/30 p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
            Closest model
          </p>
          <div className="flex items-center gap-2">
            <span
              className="block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-foreground/20"
              style={{ background: providerHex(occupant.provider) }}
            />
            <span className="truncate text-sm font-semibold">{occupant.displayName}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BinaryBar({
  icon,
  label,
  isHigh,
  good,
  lowText,
  highText,
}: {
  icon: string;
  label: string;
  isHigh: boolean;
  good: boolean;
  lowText: string;
  highText: string;
}) {
  const valueText = isHigh ? highText : lowText;
  const segs = 10;
  const filledCount = Math.floor(segs / 2);
  const fillStart = isHigh ? segs - filledCount : 0;
  const fillEnd = isHigh ? segs : filledCount;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span className="text-white/70">
          <span className="mr-1.5 text-amber-300/80">{icon}</span>
          {label}
        </span>
        <span
          className={`uppercase tracking-wider ${
            good ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {valueText}
        </span>
      </div>
      <div className="flex h-1.5 gap-px">
        {Array.from({ length: segs }).map((_, i) => {
          const inside = i >= fillStart && i < fillEnd;
          return (
            <div
              key={i}
              className={`flex-1 rounded-[1px] ${
                inside ? (good ? "bg-emerald-400" : "bg-rose-400/85") : "bg-white/8"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

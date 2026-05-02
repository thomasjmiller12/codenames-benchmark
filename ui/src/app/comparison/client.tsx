"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  computeParetoFrontier,
  deriveMonogram,
  providerHex,
  type ParetoPoint,
} from "@/lib/showcase-helpers";
import type { Model } from "@/lib/types";
import { AgentPortrait } from "@/components/showcase/agent-portrait";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCost, formatRating } from "@/lib/format";

type Axis = "cost" | "latency";

export function ComparisonClient({ models }: { models: Model[] }) {
  const [axis, setAxis] = useState<Axis>("cost");
  const [logScale, setLogScale] = useState<boolean>(true);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const xLabel = axis === "cost" ? "$ per Game" : "Avg Latency";

  const filtered = useMemo(() => {
    const xVal = (m: Model) =>
      axis === "cost" ? m.avg_cost_per_game : m.avg_latency_ms;
    return models.filter((m) => xVal(m) > 0 && m.solo_games > 0);
  }, [models, axis]);

  const points = useMemo(() => {
    const xVal = (m: Model) =>
      axis === "cost" ? m.avg_cost_per_game : m.avg_latency_ms;
    return computeParetoFrontier(
      filtered,
      (m) => xVal(m),
      (m) => m.solo_rating
    );
  }, [filtered, axis]);

  if (filtered.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <p className="text-sm text-muted-foreground">No data yet.</p>
      </div>
    );
  }

  const frontier = points.filter((p) => p.isFrontier);
  const dominated = points.filter((p) => !p.isFrontier);
  const champion = frontier[frontier.length - 1];

  return (
    <div className="space-y-8">
      <Header />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-mono uppercase tracking-widest text-muted-foreground">
          X-Axis
        </span>
        <div className="flex gap-1">
          <Toggle
            on={axis === "cost"}
            onClick={() => setAxis("cost")}
            label="Cost"
          />
          <Toggle
            on={axis === "latency"}
            onClick={() => setAxis("latency")}
            label="Latency"
          />
        </div>
        <span className="ml-2 font-mono uppercase tracking-widest text-muted-foreground">
          Scale
        </span>
        <div className="flex gap-1">
          <Toggle
            on={!logScale}
            onClick={() => setLogScale(false)}
            label="Linear"
          />
          <Toggle
            on={logScale}
            onClick={() => setLogScale(true)}
            label="Log"
          />
        </div>
      </div>

      {/* Frontier viz */}
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card/50">
        <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-4 py-2.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Capability Frontier · {axis === "cost" ? "Cost" : "Latency"} vs. Elo
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber-300/70">
            {frontier.length} on Frontier · {dominated.length} Dominated
          </p>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 px-4 pb-4 pt-4">
            <FrontierPlot
              points={points}
              xLabel={xLabel}
              axis={axis}
              logScale={logScale}
              hoverId={hoverId}
              setHoverId={setHoverId}
            />
          </div>
          <ProviderKey points={points} />
        </div>
      </div>

      {/* Frontier roster */}
      <div className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          On the Frontier
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {frontier.map((p, i) => (
            <FrontierCard
              key={p.data.model_id}
              point={p}
              axis={axis}
              rank={i + 1}
              isChampion={p.data.model_id === champion?.data.model_id}
              onMouseEnter={() => setHoverId(p.data.model_id)}
              onMouseLeave={() => setHoverId(null)}
            />
          ))}
        </div>
      </div>

      {dominated.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Dominated · A Frontier Model Beats These on Both Axes
          </h2>
          <Card className="bg-card/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-6 text-xs">Agent</TableHead>
                      <TableHead className="text-xs text-right">Elo</TableHead>
                      <TableHead className="text-xs text-right">{xLabel}</TableHead>
                      <TableHead className="text-xs text-right pr-4 sm:pr-6">
                        Beaten By
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dominated.map((p) => {
                      const dominator = findNearestDominator(p, frontier);
                      return (
                        <DominatedRow
                          key={p.data.model_id}
                          point={p}
                          dominator={dominator}
                          axis={axis}
                          onMouseEnter={() => setHoverId(p.data.model_id)}
                          onMouseLeave={() => setHoverId(null)}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <SectionHeader
      eyebrow="INTEL · CAPABILITY FRONTIER"
      title="Comparison"
      description="For every cost or latency point, the highest-Elo model. Anything below the frontier is dominated — there's a model that's both cheaper/faster and stronger."
    />
  );
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        on
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

interface PlotProps {
  points: ParetoPoint<Model>[];
  xLabel: string;
  axis: Axis;
  logScale: boolean;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
}

function FrontierPlot({
  points,
  xLabel,
  axis,
  logScale,
  hoverId,
  setHoverId,
}: PlotProps) {
  const W = 900;
  const H = 480;
  const M = { top: 28, right: 32, bottom: 56, left: 64 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const xVals = points.map((p) => p.cost);
  const yVals = points.map((p) => p.quality);
  const xMinRaw = Math.min(...xVals);
  const xMaxRaw = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);

  const yPad = Math.max(20, (yMax - yMin) * 0.08);
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  const useLog = logScale && xMinRaw > 0;
  const xLo = useLog
    ? xMinRaw * 0.7
    : Math.max(0, xMinRaw - (xMaxRaw - xMinRaw) * 0.1);
  const xHi = useLog ? xMaxRaw * 1.3 : xMaxRaw + (xMaxRaw - xMinRaw) * 0.1;

  const xScale = (v: number) => {
    if (useLog) {
      const l = Math.log(v);
      const lo = Math.log(xLo);
      const hi = Math.log(xHi);
      return ((l - lo) / (hi - lo)) * innerW;
    }
    return ((v - xLo) / (xHi - xLo)) * innerW;
  };
  const yScale = (v: number) =>
    innerH - ((v - yLo) / (yHi - yLo)) * innerH;

  const xTicks = useMemo(() => {
    if (useLog) {
      const ticks: number[] = [];
      const start = Math.floor(Math.log10(xLo));
      const end = Math.ceil(Math.log10(xHi));
      for (let k = start; k <= end; k++) {
        ticks.push(Math.pow(10, k));
        ticks.push(3 * Math.pow(10, k));
      }
      return ticks.filter((t) => t >= xLo && t <= xHi);
    }
    const n = 5;
    const step = (xHi - xLo) / n;
    return Array.from({ length: n + 1 }, (_, i) => xLo + i * step);
  }, [xLo, xHi, useLog]);

  const yTicks = useMemo(() => {
    const n = 5;
    const step = (yHi - yLo) / n;
    return Array.from({ length: n + 1 }, (_, i) => yLo + i * step);
  }, [yLo, yHi]);

  const formatX = (v: number) => {
    if (axis === "cost") return formatCost(v);
    return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v.toFixed(0)}ms`;
  };
  const formatY = (v: number) => Math.round(v).toString();

  const frontier = points.filter((p) => p.isFrontier);
  const sortedFrontier = [...frontier].sort((a, b) => a.cost - b.cost);

  const frontierPath = sortedFrontier
    .map((p, i) => {
      const x = xScale(p.cost);
      const y = yScale(p.quality);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const stepPath = sortedFrontier
    .map((p, i) => {
      const x = xScale(p.cost);
      const y = yScale(p.quality);
      if (i === 0) return `M${x.toFixed(2)},${y.toFixed(2)}`;
      const prev = sortedFrontier[i - 1];
      const py = yScale(prev.quality);
      return `L${x.toFixed(2)},${py.toFixed(2)} L${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        style={{ minWidth: 600 }}
      >
        <defs>
          <linearGradient id="frontier-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
          <filter id="dot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${M.left},${M.top})`}>
          {yTicks.map((t, i) => (
            <line
              key={`yg-${i}`}
              x1={0}
              y1={yScale(t)}
              x2={innerW}
              y2={yScale(t)}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="2 3"
            />
          ))}
          {xTicks.map((t, i) => (
            <line
              key={`xg-${i}`}
              x1={xScale(t)}
              y1={0}
              x2={xScale(t)}
              y2={innerH}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="2 3"
            />
          ))}

          {sortedFrontier.length > 1 && (
            <path
              d={`${stepPath} L${xScale(sortedFrontier[sortedFrontier.length - 1].cost).toFixed(2)},${innerH} L${xScale(sortedFrontier[0].cost).toFixed(2)},${innerH} Z`}
              fill="url(#frontier-fill)"
              opacity={0.55}
            />
          )}

          {sortedFrontier.length > 1 && (
            <path
              d={frontierPath}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1.75}
              strokeOpacity={0.55}
              strokeDasharray="4 3"
            />
          )}

          {points
            .filter((p) => !p.isFrontier)
            .map((p) => {
              const cx = xScale(p.cost);
              const cy = yScale(p.quality);
              const isHover = p.data.model_id === hoverId;
              return (
                <g
                  key={p.data.model_id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverId(p.data.model_id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHover ? 5.5 : 4}
                    fill={providerHex(p.data.provider)}
                    fillOpacity={isHover ? 0.65 : 0.32}
                    stroke={providerHex(p.data.provider)}
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />
                </g>
              );
            })}

          {sortedFrontier.map((p) => {
            const cx = xScale(p.cost);
            const cy = yScale(p.quality);
            const isHover = p.data.model_id === hoverId;
            return (
              <g
                key={p.data.model_id}
                className="cursor-pointer"
                onMouseEnter={() => setHoverId(p.data.model_id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={14}
                  fill={providerHex(p.data.provider)}
                  fillOpacity={isHover ? 0.18 : 0.08}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHover ? 8 : 6.5}
                  fill={providerHex(p.data.provider)}
                  stroke="#fbbf24"
                  strokeWidth={isHover ? 2 : 1.5}
                  filter={isHover ? "url(#dot-glow)" : undefined}
                />
              </g>
            );
          })}

          {hoverId &&
            (() => {
              const hovered = points.find((p) => p.data.model_id === hoverId);
              if (!hovered) return null;
              const cx = xScale(hovered.cost);
              const cy = yScale(hovered.quality);
              const name = hovered.data.display_name;
              const elo = `${Math.round(hovered.quality)} Elo`;
              const xVal =
                axis === "cost"
                  ? formatCost(hovered.cost)
                  : hovered.cost >= 1000
                  ? `${(hovered.cost / 1000).toFixed(1)}s`
                  : `${hovered.cost.toFixed(0)}ms`;
              const subtitle = `${elo} · ${xVal}${hovered.isFrontier ? " · frontier" : ""}`;
              const titleW = name.length * 6.6;
              const subW = subtitle.length * 5.4;
              const padX = 10;
              const w = Math.max(titleW, subW) + padX * 2;
              const h = 36;
              // Position label so it stays inside the plot area
              const labelX = cx + 14 + w > innerW ? cx - w - 14 : cx + 14;
              const labelY = Math.max(0, cy - h - 4);
              return (
                <g transform={`translate(${labelX}, ${labelY})`}>
                  <rect
                    x={0}
                    y={0}
                    width={w}
                    height={h}
                    rx={4}
                    fill="rgba(15,15,18,0.95)"
                    stroke={
                      hovered.isFrontier
                        ? "rgba(251,191,36,0.6)"
                        : "rgba(255,255,255,0.15)"
                    }
                  />
                  <text
                    x={padX}
                    y={15}
                    fill="rgba(255,255,255,0.95)"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={11}
                    fontWeight={600}
                  >
                    {name}
                  </text>
                  <text
                    x={padX}
                    y={28}
                    fill="rgba(255,255,255,0.6)"
                    fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                    fontSize={10}
                  >
                    {subtitle}
                  </text>
                </g>
              );
            })()}

          {yTicks.map((t, i) => (
            <text
              key={`yt-${i}`}
              x={-12}
              y={yScale(t) + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.55)"
              fontFamily="var(--font-geist-mono), ui-monospace, monospace"
              fontSize={11}
            >
              {formatY(t)}
            </text>
          ))}
          <text
            x={-44}
            y={innerH / 2}
            transform={`rotate(-90, -44, ${innerH / 2})`}
            textAnchor="middle"
            fill="rgba(255,255,255,0.55)"
            fontFamily="var(--font-geist-mono), ui-monospace, monospace"
            fontSize={11}
            style={{ letterSpacing: "0.18em" }}
          >
            ELO RATING
          </text>

          {xTicks.map((t, i) => (
            <text
              key={`xt-${i}`}
              x={xScale(t)}
              y={innerH + 18}
              textAnchor="middle"
              fill="rgba(255,255,255,0.55)"
              fontFamily="var(--font-geist-mono), ui-monospace, monospace"
              fontSize={11}
            >
              {formatX(t)}
            </text>
          ))}
          <text
            x={innerW / 2}
            y={innerH + 42}
            textAnchor="middle"
            fill="rgba(255,255,255,0.55)"
            fontFamily="var(--font-geist-mono), ui-monospace, monospace"
            fontSize={11}
            style={{ letterSpacing: "0.18em" }}
          >
            {xLabel.toUpperCase()}
            {useLog ? " · LOG" : ""}
          </text>

          <line
            x1={0}
            y1={innerH}
            x2={innerW}
            y2={innerH}
            stroke="rgba(255,255,255,0.18)"
          />
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="rgba(255,255,255,0.18)" />
        </g>
      </svg>
    </div>
  );
}

function ProviderKey({ points }: { points: ParetoPoint<Model>[] }) {
  const providers = useMemo(() => {
    const set = new Set(points.map((p) => p.data.provider));
    return Array.from(set).sort();
  }, [points]);

  if (providers.length === 0) return null;

  return (
    <div className="border-t border-border/60 bg-background/30 px-4 py-3 lg:min-w-[160px] lg:border-l lg:border-t-0 lg:py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        Provider
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 lg:mt-3 lg:flex-col lg:gap-x-0 lg:gap-y-2.5">
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
      </div>
    </div>
  );
}

function FrontierCard({
  point,
  axis,
  rank,
  isChampion,
  onMouseEnter,
  onMouseLeave,
}: {
  point: ParetoPoint<Model>;
  axis: Axis;
  rank: number;
  isChampion: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const m = point.data;
  return (
    <Link
      href={`/models/${encodeURIComponent(m.model_id)}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative flex items-center gap-3 rounded-md border border-amber-400/20 bg-card/60 p-3 transition-all hover:border-amber-400/50 hover:bg-card ${
        isChampion ? "ring-1 ring-amber-400/40" : ""
      }`}
    >
      <AgentPortrait
        monogram={deriveMonogram(m.display_name)}
        provider={m.provider}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/70">
            #{rank}
          </span>
          <span className="truncate text-sm font-bold">{m.display_name}</span>
          {isChampion && (
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300/90">
              · APEX
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-baseline gap-3 font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">
            <span className="text-foreground">{formatRating(m.solo_rating)}</span>{" "}
            ELO
          </span>
          <span className="tabular-nums">
            <span className="text-foreground">
              {axis === "cost"
                ? formatCost(m.avg_cost_per_game)
                : `${(m.avg_latency_ms / 1000).toFixed(1)}s`}
            </span>{" "}
            {axis === "cost" ? "/G" : "AVG"}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DominatedRow({
  point,
  dominator,
  axis,
  onMouseEnter,
  onMouseLeave,
}: {
  point: ParetoPoint<Model>;
  dominator: ParetoPoint<Model> | null;
  axis: Axis;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const m = point.data;
  const href = `/models/${encodeURIComponent(m.model_id)}`;
  return (
    <TableRow
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="border-border/30 transition-colors hover:bg-accent/30"
    >
      <TableCell className="pl-4 sm:pl-6">
        <Link
          href={href}
          className="flex items-center gap-2 hover:underline"
        >
          <span
            className="block h-2 w-2 shrink-0 rounded-full"
            style={{ background: providerHex(m.provider) }}
          />
          <span className="truncate font-mono text-xs">{m.display_name}</span>
        </Link>
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
        {formatRating(m.solo_rating)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {axis === "cost"
          ? formatCost(m.avg_cost_per_game)
          : `${(m.avg_latency_ms / 1000).toFixed(1)}s`}
      </TableCell>
      <TableCell className="pr-4 sm:pr-6 text-right font-mono text-[11px] uppercase tracking-wider text-amber-300/70">
        {dominator ? (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>▸</span>
            <span>{dominator.data.display_name}</span>
          </span>
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
}

function findNearestDominator(
  point: ParetoPoint<Model>,
  frontier: ParetoPoint<Model>[]
): ParetoPoint<Model> | null {
  const candidates = frontier.filter(
    (f) => f.cost <= point.cost && f.quality >= point.quality
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => Math.abs(a.cost - point.cost) - Math.abs(b.cost - point.cost)
  );
  return candidates[0];
}

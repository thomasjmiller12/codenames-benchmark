"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";
import { ELO_BASELINE } from "@/lib/constants";
import { ENABLE_ROLE_RATINGS } from "@/lib/feature-flags";
import { formatRating, formatCost } from "@/lib/format";
import type { Model, RatingType } from "@/lib/types";

type XMetric = "cost" | "latency";

const PROVIDER_DOT_COLORS: Record<string, string> = {
  Anthropic: "#f97316",
  OpenAI: "#22c55e",
  Google: "#3b82f6",
  Meta: "#a855f7",
  Mistral: "#ef4444",
  Other: "#737373",
};

const tooltipStyle = {
  background: "oklch(0.16 0.01 260)",
  border: "1px solid oklch(0.25 0.01 260)",
  borderRadius: "8px",
  color: "#e5e5e5",
  fontSize: "13px",
};

function getRating(model: Model, type: RatingType) {
  return type === "solo"
    ? model.solo_rating
    : type === "spymaster"
    ? model.spymaster_rating
    : model.operative_rating;
}

function getGames(model: Model, type: RatingType) {
  return type === "solo"
    ? model.solo_games
    : type === "spymaster"
    ? model.spymaster_games
    : model.operative_games;
}

interface DataPoint {
  name: string;
  x: number;
  y: number;
  provider: string;
  games: number;
}

function CustomTooltip({
  active,
  payload,
  xMetric,
}: {
  active?: boolean;
  payload?: { payload: DataPoint }[];
  xMetric: XMetric;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="font-medium text-sm">{d.name}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Elo: {formatRating(d.y)}
      </p>
      <p className="text-xs text-muted-foreground">
        {xMetric === "cost"
          ? `Cost/Game: ${formatCost(d.x)}`
          : `Avg Latency: ${(d.x / 1000).toFixed(1)}s`}
      </p>
      <p className="text-xs text-muted-foreground">{d.games} games</p>
    </div>
  );
}

export function ComparisonClient({ models }: { models: Model[] }) {
  const [xMetric, setXMetric] = useState<XMetric>("cost");
  const [ratingType, setRatingType] = useState<RatingType>("solo");

  const filtered = models.filter((m) => getGames(m, ratingType) > 0);

  const byProvider = new Map<string, DataPoint[]>();
  for (const m of filtered) {
    const xVal = xMetric === "cost" ? m.avg_cost_per_game : m.avg_latency_ms;
    if (xVal <= 0) continue;
    const point: DataPoint = {
      name: m.display_name,
      x: xVal,
      y: getRating(m, ratingType),
      provider: m.provider,
      games: getGames(m, ratingType),
    };
    const list = byProvider.get(m.provider) ?? [];
    list.push(point);
    byProvider.set(m.provider, list);
  }

  const xLabel = xMetric === "cost" ? "Avg Cost per Game ($)" : "Avg Latency (s)";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Comparison</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Plot model performance against cost or latency
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Tabs
          value={xMetric}
          onValueChange={(v) => setXMetric(v as XMetric)}
        >
          <TabsList>
            <TabsTrigger value="cost">Cost vs Elo</TabsTrigger>
            <TabsTrigger value="latency">Latency vs Elo</TabsTrigger>
          </TabsList>
        </Tabs>

        {ENABLE_ROLE_RATINGS && (
          <Tabs
            value={ratingType}
            onValueChange={(v) => setRatingType(v as RatingType)}
          >
            <TabsList>
              <TabsTrigger value="solo">Solo</TabsTrigger>
              <TabsTrigger value="spymaster">Spymaster</TabsTrigger>
              <TabsTrigger value="operative">Operative</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {xMetric === "cost" ? "Cost" : "Latency"} vs Elo ({ratingType})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">
              No data available
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                <XAxis
                  dataKey="x"
                  type="number"
                  name={xLabel}
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={{ stroke: "#404040" }}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    xMetric === "cost"
                      ? `$${v.toFixed(2)}`
                      : `${(v / 1000).toFixed(1)}s`
                  }
                >
                  <Label
                    value={xLabel}
                    position="bottom"
                    offset={0}
                    style={{ fill: "#a3a3a3", fontSize: 12 }}
                  />
                </XAxis>
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Elo"
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                >
                  <Label
                    value="Elo Rating"
                    angle={-90}
                    position="insideLeft"
                    offset={10}
                    style={{ fill: "#a3a3a3", fontSize: 12 }}
                  />
                </YAxis>
                <ReferenceLine
                  y={ELO_BASELINE}
                  stroke="#525252"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  content={<CustomTooltip xMetric={xMetric} />}
                  cursor={{ strokeDasharray: "3 3", stroke: "#525252" }}
                />
                {[...byProvider.entries()].map(([provider, data]) => (
                  <Scatter
                    key={provider}
                    name={provider}
                    data={data}
                    fill={PROVIDER_DOT_COLORS[provider] ?? "#737373"}
                    shape={((props: { cx: number; cy: number; fill: string }) => (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={7}
                        fill={props.fill}
                        fillOpacity={0.85}
                        stroke={props.fill}
                        strokeWidth={2}
                        strokeOpacity={0.3}
                      />
                    )) as unknown as undefined}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap justify-center gap-5">
            {[...byProvider.keys()].map((provider) => (
              <div key={provider} className="flex items-center gap-2 text-xs">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: PROVIDER_DOT_COLORS[provider] ?? "#737373",
                  }}
                />
                <span className="text-muted-foreground">{provider}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

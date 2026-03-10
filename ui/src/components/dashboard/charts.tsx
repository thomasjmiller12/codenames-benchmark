"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Model } from "@/lib/types";

// ─── Win Condition Pie ──────────────────────────────────────────────────────

interface WinConditionData {
  winByAllWords: number;
  winByAssassin: number;
  winByTurnLimit: number;
  totalGames: number;
}

export function WinConditionPie({ data }: { data: WinConditionData }) {
  if (data.totalGames === 0) {
    return (
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Win Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-12 text-center">
            No games played yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const pieData = [
    { name: "All Words", value: data.winByAllWords, color: "#22c55e" },
    { name: "Assassin", value: data.winByAssassin, color: "#ef4444" },
    { name: "Turn Limit", value: data.winByTurnLimit, color: "#eab308" },
  ].filter((d) => d.value > 0);

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Win Conditions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.16 0.01 260)",
                  border: "1px solid oklch(0.25 0.01 260)",
                  borderRadius: "8px",
                  color: "#e5e5e5",
                  fontSize: "13px",
                }}
                formatter={(value) => [
                  `${value} games (${((Number(value) / data.totalGames) * 100).toFixed(0)}%)`,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-center gap-6">
          {pieData.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: d.color }}
              />
              <span className="text-muted-foreground">{d.name}</span>
              <span className="font-mono font-medium">{d.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Rating Distribution ────────────────────────────────────────────────────

export function RatingDistribution({ models }: { models: Model[] }) {
  if (models.length === 0) {
    return (
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Elo Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-12 text-center">
            No models registered yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const ratings = models.map((m) => m.solo_rating);
  const min = Math.floor(Math.min(...ratings) / 50) * 50;
  const max = Math.ceil(Math.max(...ratings) / 50) * 50;

  const buckets: Record<string, number> = {};
  for (let b = min; b <= max; b += 50) {
    buckets[`${b}`] = 0;
  }
  for (const r of ratings) {
    const bucket = Math.floor(r / 50) * 50;
    buckets[`${bucket}`] = (buckets[`${bucket}`] || 0) + 1;
  }

  const chartData = Object.entries(buckets).map(([rating, count]) => ({
    rating,
    count,
  }));

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Elo Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barCategoryGap="20%">
            <XAxis
              dataKey="rating"
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              axisLine={{ stroke: "#404040" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.16 0.01 260)",
                border: "1px solid oklch(0.25 0.01 260)",
                borderRadius: "8px",
                color: "#e5e5e5",
                fontSize: "13px",
              }}
              formatter={(value) => [`${value} models`]}
              labelFormatter={(label) => `Rating ${label}-${Number(label) + 49}`}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={`hsl(${210 + idx * 10}, 70%, ${50 + idx * 3}%)`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import {
  Lightbulb,
  Target,
  Zap,
  Shield,
  BarChart3,
  Crosshair,
  TrendingUp,
  Brain,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InsightsData } from "@/lib/types";
import { CHART_COLORS, TEAM_COLORS } from "@/lib/constants";

interface Props {
  data: InsightsData;
}

// Truncate long model names for chart labels
function shortName(name: string, max = 14): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "\u2026";
}

// Custom tooltip wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({
  active,
  payload,
  labelKey,
  valueKey,
  valueFormat,
}: {
  active?: boolean;
  payload?: readonly any[];
  labelKey: string;
  valueKey: string;
  valueFormat?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  const val = d[valueKey] as number;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d[labelKey] as string}</p>
      <p className="text-muted-foreground">
        {valueFormat ? valueFormat(val) : val.toFixed(2)}
      </p>
    </div>
  );
}

export function InsightsClient({ data }: Props) {
  // Sort each dataset by rating so higher-rated models appear first/left
  const firstClue = useMemo(
    () =>
      [...data.firstClueAmbition]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({ ...d, short_name: shortName(d.display_name) })),
    [data.firstClueAmbition]
  );

  const turnsWin = useMemo(
    () =>
      [...data.turnsToWin]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({ ...d, short_name: shortName(d.display_name) })),
    [data.turnsToWin]
  );

  const redBlue = useMemo(
    () =>
      [...data.redBlueWinRate]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          red_pct: d.red_win_rate * 100,
          blue_pct: d.blue_win_rate * 100,
        })),
    [data.redBlueWinRate]
  );

  const assassin = useMemo(
    () =>
      [...data.assassinRate]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          rate_pct: d.assassin_rate * 100,
        })),
    [data.assassinRate]
  );

  const accuracy = useMemo(
    () =>
      [...data.guessAccuracy]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          acc_pct: d.accuracy * 100,
        })),
    [data.guessAccuracy]
  );

  const comeback = useMemo(
    () =>
      [...data.comebackRate]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          rate_pct: d.comeback_rate * 100,
        })),
    [data.comebackRate]
  );

  const obedience = useMemo(
    () =>
      [...data.operativeObedience]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .map((d) => ({
          ...d,
          short_name: shortName(d.display_name),
          ratio_pct: d.usage_ratio * 100,
        })),
    [data.operativeObedience]
  );

  // Clue size: transform to grouped bar data
  const clueSize = useMemo(() => {
    const sorted = [...data.clueSizeDistribution].sort(
      (a, b) => b.solo_rating - a.solo_rating
    );
    // Build per-size data: [{size: 1, "Model A": 30, "Model B": 45, ...}]
    const sizes = [1, 2, 3, 4, 5];
    return sizes.map((s) => {
      const row: Record<string, number | string> = {
        size: s === 5 ? "5+" : String(s),
      };
      for (const model of sorted.slice(0, 8)) {
        const entry = model.distribution.find((d) => d.size === s);
        row[model.display_name] = entry ? Math.round(entry.pct * 100) : 0;
      }
      return row;
    });
  }, [data.clueSizeDistribution]);

  const clueSizeModels = useMemo(
    () =>
      [...data.clueSizeDistribution]
        .sort((a, b) => b.solo_rating - a.solo_rating)
        .slice(0, 8)
        .map((m) => m.display_name),
    [data.clueSizeDistribution]
  );

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Lightbulb className="h-6 w-6 text-yellow-400" />
          Insights
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Behavioral patterns and strategic differences between models
        </p>
      </div>

      {/* Grid of insight cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. First Clue Ambition */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-yellow-400" />
              First Clue Ambition
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Average clue number on the opening turn. Higher = more ambitious opening.
            </p>
          </CardHeader>
          <CardContent>
            {firstClue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={firstClue}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        labelKey="display_name"
                        valueKey="avg_first_clue_count"
                        valueFormat={(v) => `${v.toFixed(2)} words`}
                      />
                    )}
                  />
                  <Bar dataKey="avg_first_clue_count" radius={[4, 4, 0, 0]}>
                    {firstClue.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 2. Turns to Win */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-green-400" />
              Turns to Win
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Average number of turns in games the model won. Lower = more efficient.
            </p>
          </CardHeader>
          <CardContent>
            {turnsWin.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={turnsWin}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        labelKey="display_name"
                        valueKey="avg_turns_to_win"
                        valueFormat={(v) => `${v.toFixed(1)} turns`}
                      />
                    )}
                  />
                  <Bar dataKey="avg_turns_to_win" radius={[4, 4, 0, 0]}>
                    {turnsWin.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 3. Red vs Blue Win Rate */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-purple-400" />
              Red vs Blue Win Rate
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Win rate by team color. Red starts first (9 cards) but must find more.
            </p>
          </CardHeader>
          <CardContent>
            {redBlue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={redBlue}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">
                            {d.display_name}
                          </p>
                          <p className="text-red-400">
                            Red: {(d.red_pct as number).toFixed(1)}% ({d.red_games} games)
                          </p>
                          <p className="text-blue-400">
                            Blue: {(d.blue_pct as number).toFixed(1)}% ({d.blue_games} games)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="red_pct" name="Red" fill={TEAM_COLORS.red.hex} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="blue_pct" name="Blue" fill={TEAM_COLORS.blue.hex} radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 4. Assassin Discipline */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-red-400" />
              Assassin Discipline
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              % of losses caused by hitting the assassin. Lower = more disciplined.
            </p>
          </CardHeader>
          <CardContent>
            {assassin.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={assassin}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, "auto"]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        labelKey="display_name"
                        valueKey="rate_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% assassin rate`}
                      />
                    )}
                  />
                  <Bar dataKey="rate_pct" radius={[4, 4, 0, 0]}>
                    {assassin.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 5. Guess Accuracy */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crosshair className="h-4 w-4 text-cyan-400" />
              Guess Accuracy
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              % of operative guesses that correctly identify a team word.
            </p>
          </CardHeader>
          <CardContent>
            {accuracy.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={accuracy}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        labelKey="display_name"
                        valueKey="acc_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% accurate`}
                      />
                    )}
                  />
                  <Bar dataKey="acc_pct" radius={[4, 4, 0, 0]}>
                    {accuracy.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 6. Comeback Rate */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Comeback Rate
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Win rate when playing as the non-starting team (8 cards, going second).
            </p>
          </CardHeader>
          <CardContent>
            {comeback.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={comeback}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        labelKey="display_name"
                        valueKey="rate_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% comeback rate`}
                      />
                    )}
                  />
                  <Bar dataKey="rate_pct" radius={[4, 4, 0, 0]}>
                    {comeback.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 7. Operative Obedience */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-orange-400" />
              Operative Obedience
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              % of available guesses actually used (max = clue count + 1). Higher = more aggressive.
            </p>
          </CardHeader>
          <CardContent>
            {obedience.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={obedience}
                  margin={{ top: 8, right: 8, bottom: 60, left: 0 }}
                >
                  <XAxis
                    dataKey="short_name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload}
                        labelKey="display_name"
                        valueKey="ratio_pct"
                        valueFormat={(v) => `${v.toFixed(1)}% of max guesses used`}
                      />
                    )}
                  />
                  <Bar dataKey="ratio_pct" radius={[4, 4, 0, 0]}>
                    {obedience.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 8. Clue Size Strategy */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              Clue Size Strategy
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribution of clue numbers across all turns. Shows conservative (1-2) vs ambitious (3+) tendencies.
            </p>
          </CardHeader>
          <CardContent>
            {clueSize.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={clueSize}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <XAxis
                    dataKey="size"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    label={{
                      value: "Clue Number",
                      position: "insideBottom",
                      offset: -2,
                      style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">
                            Clue number: {label}
                          </p>
                          {payload.map((p, i) => (
                            <p key={i} style={{ color: p.color }}>
                              {p.name}: {p.value}%
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {clueSizeModels.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

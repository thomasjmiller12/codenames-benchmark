import type { Scale } from "./scene-data";

/** Major orders of magnitude that fall within [min, max], inclusive. */
export function niceLogTicks(min: number, max: number): number[] {
  if (min <= 0 || max <= 0 || max <= min) return [];
  const ticks: number[] = [];
  const startK = Math.floor(Math.log10(min));
  const endK = Math.ceil(Math.log10(max));
  for (let k = startK; k <= endK; k++) {
    const v = Math.pow(10, k);
    if (v >= min * 0.99 && v <= max * 1.01) ticks.push(v);
  }
  return ticks;
}

/** Round-number ticks within [min, max], approximately `count` of them. */
export function niceLinearTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const rawStep = range / Math.max(1, count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  const step = candidates.reduce((best, c) =>
    Math.abs(c - rawStep) < Math.abs(best - rawStep) ? c : best
  );
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10))); // trim float dust
  }
  return ticks;
}

export function pickTicks(min: number, max: number, scale: Scale): number[] {
  return scale === "log" ? niceLogTicks(min, max) : niceLinearTicks(min, max);
}

/** Position a tick along an edge in the SAME normalization the points use. */
export function tickFraction(value: number, min: number, max: number, scale: Scale): number {
  if (scale === "log") {
    if (value <= 0 || min <= 0 || max <= 0) return 0;
    const lv = Math.log10(value);
    const lo = Math.log10(min);
    const hi = Math.log10(max);
    return hi === lo ? 0 : (lv - lo) / (hi - lo);
  }
  return max === min ? 0 : (value - min) / (max - min);
}

// Formatters tuned for short tick labels.
export function formatCostTick(v: number): string {
  if (v < 0.01) return `$${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (v < 1) return `$${v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (v < 10) return `$${v.toFixed(1)}`;
  return `$${Math.round(v)}`;
}

export function formatLatencyTick(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

export function formatEloTick(v: number): string {
  return Math.round(v).toString();
}

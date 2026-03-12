"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

// Simulate game results: wins (1), ties (0.5), losses (0)
const RESULTS = [
  1, 1, 0.5, 1, 0, 1, 0.5, 1, 1, 0,
  1, 0.5, 0, 1, 1, 0.5, 1, 0, 1, 1,
  0.5, 1, 1, 0, 1, 0.5, 1, 1, 0, 1,
];

function resampleAndRate(results: number[]): number {
  const n = results.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += results[Math.floor(Math.random() * n)];
  }
  const winRate = sum / n;
  // Convert to rough Elo-like rating for visualization
  return 1500 + (winRate - 0.5) * 800;
}

const NUM_BOOTSTRAP = 60;
const MIN_RATING = 1300;
const MAX_RATING = 1700;

export function BootstrapViz() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const shouldReduceMotion = useReducedMotion();
  const [samples, setSamples] = useState<number[]>([]);
  const [phase, setPhase] = useState<"idle" | "sampling" | "done">("idle");
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runBootstrap = useCallback(() => {
    setSamples([]);
    setPhase("sampling");
    let i = 0;
    const addSample = () => {
      if (i >= NUM_BOOTSTRAP) {
        setPhase("done");
        return;
      }
      setSamples((prev) => [...prev, resampleAndRate(RESULTS)]);
      i++;
      animRef.current = setTimeout(addSample, shouldReduceMotion ? 5 : 40);
    };
    addSample();
  }, [shouldReduceMotion]);

  // Auto-start when in view
  useEffect(() => {
    if (isInView && phase === "idle") {
      const t = setTimeout(runBootstrap, 500);
      return () => clearTimeout(t);
    }
  }, [isInView, phase, runBootstrap]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, []);

  // Build histogram
  const BINS = 16;
  const binWidth = (MAX_RATING - MIN_RATING) / BINS;
  const histogram = Array(BINS).fill(0);
  for (const s of samples) {
    const bin = Math.min(BINS - 1, Math.max(0, Math.floor((s - MIN_RATING) / binWidth)));
    histogram[bin]++;
  }
  const maxCount = Math.max(...histogram, 1);

  // CI bounds (2.5th and 97.5th percentile)
  const sorted = [...samples].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.025)] ?? MIN_RATING;
  const hi = sorted[Math.floor(sorted.length * 0.975)] ?? MAX_RATING;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1500;

  return (
    <div ref={ref} className="space-y-6">
      {/* Result pills */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {RESULTS.map((r, i) => (
          <motion.span
            key={i}
            initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: shouldReduceMotion ? 0 : i * 0.02, duration: 0.2 }}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold",
              r === 1 && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
              r === 0.5 && "bg-muted/60 text-muted-foreground border border-border/40",
              r === 0 && "bg-red-500/20 text-red-400 border border-red-500/30"
            )}
          >
            {r === 1 ? "W" : r === 0.5 ? "T" : "L"}
          </motion.span>
        ))}
      </div>

      {/* Sampling status */}
      <div className="text-center">
        <span className="text-xs font-mono text-muted-foreground">
          {phase === "idle" && "Waiting..."}
          {phase === "sampling" && `Resampling... ${samples.length} / ${NUM_BOOTSTRAP}`}
          {phase === "done" && `${NUM_BOOTSTRAP} bootstrap samples collected`}
        </span>
      </div>

      {/* Histogram */}
      <div className="space-y-2">
        <div className="flex items-end justify-center gap-px h-32">
          {histogram.map((count, i) => (
            <div
              key={i}
              className="flex-1 max-w-4 flex flex-col justify-end"
            >
              <div
                className={cn(
                  "rounded-t transition-all duration-200 min-h-[2px]",
                  phase === "done"
                    ? (() => {
                        const binCenter = MIN_RATING + (i + 0.5) * binWidth;
                        return binCenter >= lo && binCenter <= hi
                          ? "bg-primary"
                          : "bg-muted-foreground/20";
                      })()
                    : "bg-primary/60"
                )}
                style={{ height: `${(count / maxCount) * 100}%` }}
              />
            </div>
          ))}
        </div>

        {/* Axis labels */}
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground px-1">
          <span>{MIN_RATING}</span>
          <span>1500</span>
          <span>{MAX_RATING}</span>
        </div>
      </div>

      {/* CI display */}
      {phase === "done" && (
        <motion.div
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* CI line */}
          <div className="relative h-8 mx-8">
            {/* Track */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-border -translate-y-1/2" />
            {/* CI range bar */}
            <div
              className="absolute top-1/2 h-2 rounded-full bg-primary/30 -translate-y-1/2"
              style={{
                left: `${((lo - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100}%`,
                right: `${((MAX_RATING - hi) / (MAX_RATING - MIN_RATING)) * 100}%`,
              }}
            />
            {/* Median point */}
            <div
              className="absolute top-1/2 h-4 w-4 rounded-full bg-primary border-2 border-background -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${((median - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100}%`,
              }}
            />
            {/* CI bound markers */}
            <div
              className="absolute top-1/2 h-3 w-0.5 bg-muted-foreground/50 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${((lo - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100}%`,
              }}
            />
            <div
              className="absolute top-1/2 h-3 w-0.5 bg-muted-foreground/50 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${((hi - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100}%`,
              }}
            />
          </div>

          {/* Label */}
          <div className="text-center space-y-1">
            <div className="text-sm font-mono font-semibold text-foreground">
              {Math.round(median)} <span className="text-muted-foreground font-normal text-xs">({Math.round(lo)} – {Math.round(hi)})</span>
            </div>
            <div className="text-[10px] text-muted-foreground">95% confidence interval</div>
          </div>
        </motion.div>
      )}

      {/* Replay button */}
      {phase === "done" && (
        <div className="text-center">
          <button
            onClick={runBootstrap}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}

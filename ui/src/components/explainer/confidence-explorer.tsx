"use client";

import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TopModel {
  display_name: string;
  solo_rating: number;
  solo_ci_lower: number;
  solo_ci_upper: number;
}

interface ConfidenceExplorerProps {
  models: TopModel[];
}

const MODEL_COLORS = [
  { bg: "bg-red-500", text: "text-red-400", bar: "bg-red-500/30", border: "border-red-500/40", dot: "bg-red-500" },
  { bg: "bg-blue-500", text: "text-blue-400", bar: "bg-blue-500/30", border: "border-blue-500/40", dot: "bg-blue-500" },
  { bg: "bg-emerald-500", text: "text-emerald-400", bar: "bg-emerald-500/30", border: "border-emerald-500/40", dot: "bg-emerald-500" },
  { bg: "bg-amber-500", text: "text-amber-400", bar: "bg-amber-500/30", border: "border-amber-500/40", dot: "bg-amber-500" },
];

function btWinProb(ratingA: number, ratingB: number, theta: number) {
  const gammaA = Math.pow(10, ratingA / 400);
  const gammaB = Math.pow(10, ratingB / 400);
  const sqrtProd = Math.sqrt(gammaA * gammaB);
  const denom = gammaA + gammaB + theta * sqrtProd;
  return {
    pA: gammaA / denom,
    pTie: (theta * sqrtProd) / denom,
    pB: gammaB / denom,
  };
}

export function ConfidenceExplorer({ models }: ConfidenceExplorerProps) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedPair, setSelectedPair] = useState<[number, number]>([0, 1]);

  // Compute the scale range from all models
  const allRatings = models.flatMap((m) => [m.solo_ci_lower, m.solo_ci_upper]);
  const minRating = Math.floor((Math.min(...allRatings) - 30) / 50) * 50;
  const maxRating = Math.ceil((Math.max(...allRatings) + 30) / 50) * 50;
  const range = maxRating - minRating;

  const toPercent = (v: number) => ((v - minRating) / range) * 100;

  // Axis ticks
  const ticks: number[] = [];
  for (let t = minRating; t <= maxRating; t += 50) ticks.push(t);

  // Matchup prediction using the selected pair
  const [iA, iB] = selectedPair;
  const modelA = models[iA];
  const modelB = models[iB];

  const prediction = useMemo(() => {
    if (!modelA || !modelB) return null;
    const { pA, pTie, pB } = btWinProb(modelA.solo_rating - 1500, modelB.solo_rating - 1500, 1.0);

    // CI overlap
    const overlapStart = Math.max(modelA.solo_ci_lower, modelB.solo_ci_lower);
    const overlapEnd = Math.min(modelA.solo_ci_upper, modelB.solo_ci_upper);
    const hasOverlap = overlapStart < overlapEnd;

    return { pA, pTie, pB, hasOverlap };
  }, [modelA, modelB]);

  // Generate all unique pairs for the matchup selector
  const pairs: [number, number][] = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      pairs.push([i, j]);
    }
  }

  return (
    <div className="space-y-10">
      {/* CI chart */}
      <div className="space-y-3">
        {/* Axis */}
        <div className="relative h-6 ml-28 sm:ml-36">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-[10px] font-mono text-muted-foreground/60"
              style={{ left: `${toPercent(t)}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Models */}
        {models.map((model, i) => {
          const color = MODEL_COLORS[i % MODEL_COLORS.length];
          const isInPair = i === iA || i === iB;

          return (
            <motion.div
              key={model.display_name}
              initial={shouldReduceMotion ? {} : { opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: shouldReduceMotion ? 0 : i * 0.1, duration: 0.4 }}
              className={cn(
                "flex items-center gap-3 transition-opacity duration-200",
                !isInPair && "opacity-40"
              )}
            >
              {/* Model name */}
              <div className="w-28 sm:w-36 text-right shrink-0">
                <span className={cn("text-xs sm:text-sm font-medium truncate block", color.text)}>
                  {model.display_name}
                </span>
              </div>

              {/* CI bar */}
              <div className="relative flex-1 h-8">
                {/* Track */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-border -translate-y-1/2" />

                {/* CI range */}
                <div
                  className={cn("absolute top-1/2 h-3 rounded-full -translate-y-1/2 transition-all duration-300", color.bar)}
                  style={{
                    left: `${toPercent(model.solo_ci_lower)}%`,
                    right: `${100 - toPercent(model.solo_ci_upper)}%`,
                  }}
                />

                {/* Rating point */}
                <div
                  className={cn("absolute top-1/2 h-4 w-4 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-background transition-all duration-300", color.dot)}
                  style={{ left: `${toPercent(model.solo_rating)}%` }}
                />

                {/* Rating label */}
                <span
                  className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-mono font-semibold text-foreground"
                  style={{ left: `${toPercent(model.solo_rating)}%` }}
                >
                  {Math.round(model.solo_rating)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Matchup selector */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground text-center">
          Pick a matchup to see predicted outcomes:
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {pairs.map(([a, b]) => {
            const isSelected = a === iA && b === iB;
            const cA = MODEL_COLORS[a % MODEL_COLORS.length];
            const cB = MODEL_COLORS[b % MODEL_COLORS.length];
            return (
              <button
                key={`${a}-${b}`}
                onClick={() => setSelectedPair([a, b])}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all border",
                  isSelected
                    ? "bg-accent border-primary/40 text-foreground"
                    : "bg-card/50 border-border hover:bg-accent/50 text-muted-foreground"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", cA.dot)} />
                <span className="truncate max-w-20">{models[a].display_name}</span>
                <span className="text-muted-foreground/50">vs</span>
                <span className={cn("h-2 w-2 rounded-full", cB.dot)} />
                <span className="truncate max-w-20">{models[b].display_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Matchup prediction */}
      {prediction && modelA && modelB && (
        <motion.div
          key={`${iA}-${iB}`}
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 rounded-xl border border-border bg-card/50 p-5"
        >
          {/* Header */}
          <div className="flex items-center justify-center gap-3 text-sm">
            <span className={cn("font-semibold", MODEL_COLORS[iA % MODEL_COLORS.length].text)}>
              {modelA.display_name}
            </span>
            <span className="text-muted-foreground">vs</span>
            <span className={cn("font-semibold", MODEL_COLORS[iB % MODEL_COLORS.length].text)}>
              {modelB.display_name}
            </span>
          </div>

          {/* Probability bar */}
          <div className="space-y-2">
            <div className="flex h-9 overflow-hidden rounded-xl border border-border">
              <div
                className={cn(
                  "flex items-center justify-center transition-all duration-500 ease-out",
                  MODEL_COLORS[iA % MODEL_COLORS.length].bg
                )}
                style={{ width: `${prediction.pA * 100}%` }}
              >
                {prediction.pA > 0.08 && (
                  <span className="text-xs font-bold text-white">
                    {(prediction.pA * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <div
                className="flex items-center justify-center bg-zinc-600 transition-all duration-500 ease-out"
                style={{ width: `${prediction.pTie * 100}%` }}
              >
                {prediction.pTie > 0.08 && (
                  <span className="text-xs font-bold text-zinc-200">
                    {(prediction.pTie * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "flex items-center justify-center transition-all duration-500 ease-out",
                  MODEL_COLORS[iB % MODEL_COLORS.length].bg
                )}
                style={{ width: `${prediction.pB * 100}%` }}
              >
                {prediction.pB > 0.08 && (
                  <span className="text-xs font-bold text-white">
                    {(prediction.pB * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>{modelA.display_name} wins</span>
              <span>Tie</span>
              <span>{modelB.display_name} wins</span>
            </div>
          </div>

          {/* Overlap interpretation */}
          <div className={cn(
            "rounded-lg px-4 py-3 text-xs leading-relaxed",
            prediction.hasOverlap
              ? "bg-amber-500/10 border border-amber-500/20 text-amber-300/90"
              : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300/90"
          )}>
            {prediction.hasOverlap ? (
              <>
                <strong>Overlapping confidence intervals.</strong>{" "}
                These models&apos; CIs overlap — with more games, the ranking between them could shift.
                The {Math.round(Math.abs(modelA.solo_rating - modelB.solo_rating))}-point
                gap isn&apos;t yet definitive.
              </>
            ) : (
              <>
                <strong>Clear separation.</strong>{" "}
                No CI overlap — we&apos;re confident{" "}
                {modelA.solo_rating > modelB.solo_rating ? modelA.display_name : modelB.display_name}{" "}
                is genuinely stronger. The{" "}
                {Math.round(Math.abs(modelA.solo_rating - modelB.solo_rating))}-point
                gap is statistically significant.
              </>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

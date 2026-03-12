"use client";

import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

function btProbabilities(ratingA: number, ratingB: number, theta: number) {
  // Convert Elo-like ratings to gamma (strength) parameters
  const gammaA = Math.pow(10, ratingA / 400);
  const gammaB = Math.pow(10, ratingB / 400);
  const sqrtProd = Math.sqrt(gammaA * gammaB);

  const denom = gammaA + gammaB + theta * sqrtProd;
  const pA = gammaA / denom;
  const pB = gammaB / denom;
  const pTie = (theta * sqrtProd) / denom;

  return { pA, pB, pTie };
}

export function RatingExplorer() {
  const [ratingA, setRatingA] = useState(1600);
  const [ratingB, setRatingB] = useState(1400);
  const [theta, setTheta] = useState(1.0);
  const shouldReduceMotion = useReducedMotion();

  const diff = ratingA - ratingB;
  const { pA, pB, pTie } = useMemo(
    () => btProbabilities(diff / 2, -diff / 2, theta),
    [diff, theta]
  );

  return (
    <div className="space-y-8">
      {/* Model comparison visual */}
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        <motion.div
          initial={shouldReduceMotion ? {} : { opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center gap-2"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white font-bold text-lg">
            A
          </div>
          <span className="text-lg font-bold font-mono text-foreground">{ratingA}</span>
          <span className="text-[10px] text-muted-foreground">Elo</span>
        </motion.div>

        <div className="text-2xl font-bold text-muted-foreground/40">vs</div>

        <motion.div
          initial={shouldReduceMotion ? {} : { opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center gap-2"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold text-lg">
            B
          </div>
          <span className="text-lg font-bold font-mono text-foreground">{ratingB}</span>
          <span className="text-[10px] text-muted-foreground">Elo</span>
        </motion.div>
      </div>

      {/* Probability bar */}
      <div className="space-y-2">
        <div className="flex h-10 overflow-hidden rounded-xl border border-border">
          <div
            className="flex items-center justify-center bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300 ease-out"
            style={{ width: `${pA * 100}%` }}
          >
            {pA > 0.08 && (
              <span className="text-xs font-bold text-white">{(pA * 100).toFixed(1)}%</span>
            )}
          </div>
          <div
            className="flex items-center justify-center bg-gradient-to-r from-zinc-600 to-zinc-500 transition-all duration-300 ease-out"
            style={{ width: `${pTie * 100}%` }}
          >
            {pTie > 0.08 && (
              <span className="text-xs font-bold text-zinc-200">{(pTie * 100).toFixed(1)}%</span>
            )}
          </div>
          <div
            className="flex items-center justify-center bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
            style={{ width: `${pB * 100}%` }}
          >
            {pB > 0.08 && (
              <span className="text-xs font-bold text-white">{(pB * 100).toFixed(1)}%</span>
            )}
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>A wins</span>
          <span>Tie</span>
          <span>B wins</span>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Rating Difference</label>
            <span className="text-xs font-mono text-muted-foreground">
              {diff > 0 ? "+" : ""}{diff} Elo
            </span>
          </div>
          <input
            type="range"
            min={-600}
            max={600}
            value={diff}
            onChange={(e) => {
              const d = Number(e.target.value);
              setRatingA(1500 + d / 2);
              setRatingB(1500 - d / 2);
            }}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>B dominates</span>
            <span>Equal</span>
            <span>A dominates</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Tie Propensity (θ)</label>
            <span className="text-xs font-mono text-muted-foreground">{theta.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={4}
            step={0.05}
            value={theta}
            onChange={(e) => setTheta(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>No ties</span>
            <span>Many ties</span>
          </div>
        </div>
      </div>

      {/* Formula */}
      <div className="rounded-xl border border-border bg-card/50 px-5 py-5 text-center space-y-3">
        <div className="flex items-center justify-center gap-3 text-foreground">
          <span className="text-sm italic">P</span>
          <span className="text-sm text-muted-foreground">(A beats B)</span>
          <span className="text-sm text-muted-foreground">=</span>
          <div className="flex flex-col items-center">
            <span className="border-b border-muted-foreground/40 px-3 pb-1.5 text-sm font-medium tracking-wide">
              <span className="italic">γ</span><span className="text-[10px] align-sub">A</span>
            </span>
            <span className="pt-1.5 text-sm text-muted-foreground tracking-wide">
              <span className="italic">γ</span><span className="text-[10px] align-sub">A</span>
              {" + "}
              <span className="italic">γ</span><span className="text-[10px] align-sub">B</span>
              {" + "}
              <span className="italic">θ</span>
              {" · "}
              √(<span className="italic">γ</span><span className="text-[10px] align-sub">A</span>
              {" · "}
              <span className="italic">γ</span><span className="text-[10px] align-sub">B</span>)
            </span>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Davidson extension of the Bradley-Terry model
        </div>
      </div>

      {/* Elo callout */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-center space-y-1">
        <div className="text-xs font-medium text-primary">Elo Scale Conversion</div>
        <div className="text-sm text-muted-foreground">
          Log-strength values are centered at <span className="font-mono font-semibold text-foreground">1500</span> and
          scaled so <span className="font-mono font-semibold text-foreground">±400</span> equals one order of magnitude
          — just like chess ratings.
        </div>
      </div>
    </div>
  );
}

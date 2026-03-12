"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

function MiniBoard({ className }: { className?: string }) {
  const cells = Array.from({ length: 9 }, (_, i) => {
    const types = ["RED", "BLUE", "RED", "NEUTRAL", "BLUE", "RED", "BLUE", "NEUTRAL", "ASSASSIN"];
    const colors: Record<string, string> = {
      RED: "bg-red-500/60",
      BLUE: "bg-blue-500/60",
      NEUTRAL: "bg-yellow-700/50",
      ASSASSIN: "bg-zinc-800/80",
    };
    return colors[types[i]];
  });

  return (
    <div className={cn("grid grid-cols-3 gap-0.5 w-12 h-9", className)}>
      {cells.map((color, i) => (
        <div key={i} className={cn("rounded-[2px]", color)} />
      ))}
    </div>
  );
}

interface GameCardProps {
  label: string;
  modelA: string;
  modelB: string;
  colorA: string;
  colorB: string;
  delay: number;
}

function GameCard({ label, modelA, modelB, colorA, colorB, delay }: GameCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: shouldReduceMotion ? 0 : delay, duration: 0.5 }}
      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-4 sm:p-5"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <MiniBoard />
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("font-semibold", colorA === "red" ? "text-red-400" : "text-blue-400")}>
          Model A ({colorA === "red" ? "Red" : "Blue"})
        </span>
        <span className="text-muted-foreground">vs</span>
        <span className={cn("font-semibold", colorB === "red" ? "text-red-400" : "text-blue-400")}>
          Model B ({colorB === "red" ? "Red" : "Blue"})
        </span>
      </div>
    </motion.div>
  );
}

interface PairResultProps {
  score: string;
  label: string;
  variant: "sweep" | "split" | "swept";
  detail: string;
  delay: number;
}

function PairResult({ score, label, variant, detail, delay }: PairResultProps) {
  const shouldReduceMotion = useReducedMotion();
  const variantStyles = {
    sweep: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    split: "bg-muted/60 text-muted-foreground border-border/40",
    swept: "bg-red-500/15 text-red-400 border-red-500/25",
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: shouldReduceMotion ? 0 : delay, duration: 0.4 }}
      className="flex flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "inline-flex items-center rounded px-2 py-1 text-xs font-bold font-mono border",
          variantStyles[variant]
        )}
      >
        {score}
      </span>
      <span className="text-[10px] font-medium text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground">{detail}</span>
    </motion.div>
  );
}

export function MirroredPairs() {
  return (
    <div className="space-y-10">
      {/* Mirrored game cards */}
      <div className="grid gap-4 sm:grid-cols-2 max-w-lg mx-auto">
        <GameCard
          label="Game 1"
          modelA="Model A"
          modelB="Model B"
          colorA="red"
          colorB="blue"
          delay={0}
        />
        <GameCard
          label="Game 2 (mirrored)"
          modelA="Model A"
          modelB="Model B"
          colorA="blue"
          colorB="red"
          delay={0.2}
        />
      </div>

      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border">
          Same board, swapped sides
        </span>
      </div>

      {/* Pair results */}
      <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-10">
        <PairResult score="2-0" label="Sweep" variant="sweep" detail="A wins both" delay={0.1} />
        <PairResult score="1-1" label="Tie" variant="split" detail="Split pair" delay={0.2} />
        <PairResult score="0-2" label="Swept" variant="swept" detail="B wins both" delay={0.3} />
      </div>
    </div>
  );
}

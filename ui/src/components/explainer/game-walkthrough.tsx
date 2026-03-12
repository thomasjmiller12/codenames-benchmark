"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronRight, Play, RotateCcw } from "lucide-react";

interface Step {
  title: string;
  description: string;
  view: "spymaster" | "operative" | "result";
}

const STEPS: Step[] = [
  {
    title: "Spymaster's View",
    description: "The spymaster sees all card colors and must find connections between their team's words.",
    view: "spymaster",
  },
  {
    title: "Giving a Clue",
    description: "The spymaster gives a one-word clue and a number — \"OCEAN 2\" means two words relate to ocean.",
    view: "spymaster",
  },
  {
    title: "Operative's View",
    description: "The operative only sees the words — no colors. They must deduce which cards belong to their team.",
    view: "operative",
  },
  {
    title: "Making Guesses",
    description: "The operative guesses one word at a time. Correct guesses stay revealed; a wrong guess ends the turn.",
    view: "operative",
  },
  {
    title: "Outcome",
    description: "First team to reveal all their words wins. But touch the assassin card — instant loss!",
    view: "result",
  },
];

const MINI_WORDS = ["BEACH", "WAVE", "CASTLE", "MOON", "BOAT", "SAND", "NIGHT", "CROWN", "CORAL"];

type MiniType = "RED" | "BLUE" | "NEUTRAL" | "ASSASSIN";

const MINI_TYPES: MiniType[] = [
  "RED", "RED", "BLUE", "NEUTRAL", "BLUE", "RED", "BLUE", "NEUTRAL", "ASSASSIN",
];

const TYPE_BG: Record<MiniType, string> = {
  RED: "bg-gradient-to-br from-red-500 to-red-700 text-white border-red-400/30",
  BLUE: "bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-400/30",
  NEUTRAL: "bg-gradient-to-br from-yellow-700 to-stone-700 text-yellow-50 border-yellow-600/40",
  ASSASSIN: "bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-300 border-zinc-600/30",
};

const HIDDEN_BG = "bg-gradient-to-br from-stone-700 to-stone-800 text-stone-200 border-stone-600/30";

export function GameWalkthrough() {
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const shouldReduceMotion = useReducedMotion();

  const currentStep = STEPS[step];

  const reset = useCallback(() => {
    setStep(0);
    setRevealed(new Set());
    setAutoPlay(false);
  }, []);

  const advance = useCallback(() => {
    if (step === 3 && revealed.size === 0) {
      // Reveal BEACH (index 0) first
      setRevealed(new Set([0]));
      return;
    }
    if (step === 3 && revealed.size === 1) {
      // Reveal WAVE (index 1) then advance
      setRevealed(new Set([0, 1]));
      return;
    }
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setAutoPlay(false);
    }
  }, [step, revealed]);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setTimeout(advance, 2000);
    return () => clearTimeout(timer);
  }, [autoPlay, step, revealed, advance]);

  const showColors = currentStep.view === "spymaster" || currentStep.view === "result";

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => { setStep(i); setRevealed(new Set()); }}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              i === step ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
            )}
          />
        ))}
      </div>

      {/* Mini board */}
      <div className="max-w-xs mx-auto">
        <div className="grid grid-cols-3 gap-1.5">
          {MINI_WORDS.map((word, i) => {
            const isRevealed = revealed.has(i);
            const showType = showColors || isRevealed;

            return (
              <motion.div
                key={word}
                layout
                className={cn(
                  "relative flex items-center justify-center rounded-lg border p-2 aspect-[4/3] transition-all duration-500",
                  showType ? TYPE_BG[MINI_TYPES[i]] : HIDDEN_BG
                )}
              >
                <span className="text-[9px] sm:text-[10px] font-bold tracking-wide select-none">
                  {word}
                </span>
                {/* Spymaster color ring when hidden */}
                {!showColors && !isRevealed && (
                  <div
                    className={cn(
                      "absolute inset-0 rounded-lg border-2 opacity-0 pointer-events-none",
                      MINI_TYPES[i] === "RED" && "border-red-500",
                      MINI_TYPES[i] === "BLUE" && "border-blue-500",
                      MINI_TYPES[i] === "NEUTRAL" && "border-yellow-600",
                      MINI_TYPES[i] === "ASSASSIN" && "border-zinc-500"
                    )}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Clue banner */}
      <AnimatePresence mode="wait">
        {step >= 1 && step <= 3 && (
          <motion.div
            initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center justify-center"
          >
            <div className="inline-flex items-center gap-3 rounded-xl bg-red-500/15 border border-red-500/25 px-5 py-2.5">
              <span className="text-xs font-medium text-red-400">Red Spymaster</span>
              <span className="text-sm font-bold text-foreground tracking-wider">&quot;OCEAN 2&quot;</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step text */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <h4 className="text-sm font-semibold text-foreground mb-1">{currentStep.title}</h4>
          <p className="text-sm text-muted-foreground">{currentStep.description}</p>
        </motion.div>
      </AnimatePresence>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        {step < STEPS.length - 1 || revealed.size < 2 ? (
          <>
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                autoPlay
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Play className="h-3.5 w-3.5" /> {autoPlay ? "Playing..." : "Auto"}
            </button>
            <button
              onClick={advance}
              className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
          >
            Replay <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

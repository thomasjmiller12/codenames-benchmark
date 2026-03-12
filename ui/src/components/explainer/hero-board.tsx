"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const BOARD_WORDS = [
  "OCEAN", "CASTLE", "DIAMOND", "SHADOW", "ROCKET",
  "FOREST", "BRIDGE", "CRYSTAL", "PHOENIX", "HARBOR",
  "VELVET", "THUNDER", "COMPASS", "BEACON", "GLACIER",
  "MARBLE", "FALCON", "LANTERN", "SUMMIT", "BREEZE",
  "CORAL", "WRAITH", "PRISM", "SPARK", "EMBER",
];

type CardType = "RED" | "BLUE" | "NEUTRAL" | "ASSASSIN";

const BOARD_TYPES: CardType[] = [
  "RED", "BLUE", "RED", "NEUTRAL", "BLUE",
  "BLUE", "RED", "ASSASSIN", "RED", "NEUTRAL",
  "NEUTRAL", "BLUE", "RED", "BLUE", "RED",
  "BLUE", "NEUTRAL", "RED", "BLUE", "NEUTRAL",
  "RED", "NEUTRAL", "BLUE", "RED", "NEUTRAL",
];

const TYPE_STYLES: Record<CardType, string> = {
  RED: "bg-gradient-to-br from-red-500 to-red-700 text-white border-red-400/30 shadow-[0_4px_12px_rgba(220,38,38,0.3)]",
  BLUE: "bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-400/30 shadow-[0_4px_12px_rgba(37,99,235,0.3)]",
  NEUTRAL: "bg-gradient-to-br from-yellow-700 to-stone-700 text-yellow-50 border-yellow-600/40 shadow-[0_4px_12px_rgba(161,98,7,0.3)]",
  ASSASSIN: "bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-300 border-zinc-600/30 shadow-[0_4px_12px_rgba(0,0,0,0.5)]",
};

export function HeroBoard() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2 md:gap-3 max-w-lg mx-auto">
      {BOARD_WORDS.map((word, i) => (
        <motion.div
          key={word}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, rotateY: 90 }}
          whileInView={{ opacity: 1, rotateY: 0 }}
          viewport={{ once: true }}
          transition={{
            delay: shouldReduceMotion ? 0 : i * 0.04,
            duration: 0.5,
            ease: "easeOut",
          }}
          className={cn(
            "relative flex items-center justify-center rounded-lg border p-1 sm:p-2 aspect-[4/3]",
            TYPE_STYLES[BOARD_TYPES[i]]
          )}
          style={{ perspective: 1000 }}
        >
          <span className="text-[8px] sm:text-[10px] md:text-xs font-bold tracking-wide select-none">
            {word}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

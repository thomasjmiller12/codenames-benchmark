"use client";

import { CardType } from "@/lib/types";
import { CARD_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Skull } from "lucide-react";

interface BoardGridProps {
  words: string[];
  keyCard: Record<string, CardType>;
  revealedWords: Set<string>;
  currentGuessWord?: string;
  spymasterView: boolean;
}

/** Scale text down for long words so they always fit the card width */
function wordSizeClass(word: string) {
  if (word.length >= 10) return "text-[7px] sm:text-[8px] md:text-[9px] tracking-wide";
  if (word.length >= 8) return "text-[8px] sm:text-[9px] md:text-[10px] tracking-wide";
  return "text-[9px] sm:text-[10px] md:text-[11px] tracking-wider";
}

export function BoardGrid({
  words,
  keyCard,
  revealedWords,
  currentGuessWord,
  spymasterView,
}: BoardGridProps) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
      {words.map((word) => {
        const cardType = keyCard[word];
        const isRevealed = revealedWords.has(word);
        const isActive = currentGuessWord === word;
        const colors = CARD_COLORS[cardType];
        const sizeClass = wordSizeClass(word);

        return (
          <div
            key={word}
            className={cn(
              "card-flip relative h-[60px] sm:h-[76px] md:h-[88px] rounded-lg sm:rounded-xl",
              isActive && "glow-active"
            )}
          >
            <div
              className={cn(
                "card-flip-inner relative h-full w-full rounded-xl",
                isRevealed && "flipped"
              )}
            >
              {/* Front (unrevealed) */}
              <div
                className={cn(
                  "card-flip-front flex items-center justify-center rounded-xl px-2 text-center",
                  "bg-gradient-to-br from-amber-50 to-amber-100",
                  "border border-amber-200/60",
                  "shadow-[0_2px_8px_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]",
                  spymasterView && !isRevealed && "ring-2 ring-inset",
                  spymasterView &&
                    !isRevealed &&
                    cardType === "RED" &&
                    "ring-red-500/60",
                  spymasterView &&
                    !isRevealed &&
                    cardType === "BLUE" &&
                    "ring-blue-500/60",
                  spymasterView &&
                    !isRevealed &&
                    cardType === "NEUTRAL" &&
                    "ring-amber-600/40",
                  spymasterView &&
                    !isRevealed &&
                    cardType === "ASSASSIN" &&
                    "ring-zinc-700"
                )}
              >
                <span
                  className={cn(
                    "font-bold text-zinc-700 uppercase leading-tight",
                    "drop-shadow-[0_0.5px_0_rgba(255,255,255,0.4)]",
                    sizeClass
                  )}
                >
                  {word}
                </span>
              </div>

              {/* Back (revealed) */}
              <div
                className={cn(
                  "card-flip-back flex flex-col items-center justify-center rounded-xl px-2 text-center",
                  colors.bg,
                  colors.text,
                  colors.border,
                  colors.shadow,
                  "border"
                )}
              >
                <span
                  className={cn(
                    "font-bold uppercase leading-tight",
                    "drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]",
                    sizeClass
                  )}
                >
                  {word}
                </span>
                {cardType === "ASSASSIN" && (
                  <Skull className="mt-1.5 h-4 w-4 text-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.5)]" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

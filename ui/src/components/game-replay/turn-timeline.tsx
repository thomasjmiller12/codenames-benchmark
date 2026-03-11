"use client";

import { Turn } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, X, Minus, Skull } from "lucide-react";

interface TurnTimelineProps {
  turns: Turn[];
  currentTurnIndex: number;
  currentGuessIndex: number;
}

const resultIcons: Record<string, { icon: React.ElementType; color: string }> = {
  CORRECT: { icon: Check, color: "text-emerald-400" },
  WRONG_TEAM: { icon: X, color: "text-red-400" },
  NEUTRAL: { icon: Minus, color: "text-amber-400" },
  ASSASSIN: { icon: Skull, color: "text-red-500" },
};

export function TurnTimeline({
  turns,
  currentTurnIndex,
  currentGuessIndex,
}: TurnTimelineProps) {
  return (
    <ScrollArea className="h-[300px] sm:h-[400px] xl:h-[520px] pr-4">
      <div className="space-y-3">
        {turns.map((turn, tIdx) => {
          const isCurrentTurn = tIdx === currentTurnIndex;
          const isPast = tIdx < currentTurnIndex;
          const teamColor =
            turn.team === "red" ? "bg-red-500" : "bg-blue-500";
          const teamText =
            turn.team === "red" ? "text-red-400" : "text-blue-400";

          return (
            <div
              key={turn.turn_number}
              className={cn(
                "rounded-lg border p-3 transition-all duration-200",
                isCurrentTurn
                  ? "border-primary/50 bg-accent/60"
                  : isPast
                  ? "border-border/30 bg-card/30 opacity-70"
                  : "border-border/20 bg-card/20 opacity-40"
              )}
            >
              {/* Turn header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("h-2.5 w-2.5 rounded-full", teamColor)} />
                <span className="text-xs font-medium text-muted-foreground">
                  Turn {turn.turn_number}
                </span>
                <span className={cn("text-xs font-semibold capitalize", teamText)}>
                  {turn.team}
                </span>
              </div>

              {/* Clue */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "rounded-md px-2.5 py-1 text-sm font-bold uppercase tracking-wider",
                    turn.team === "red"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-blue-500/15 text-blue-300"
                  )}
                >
                  {turn.clue_word}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                  {turn.clue_count}
                </span>
              </div>

              {/* Guesses */}
              <div className="space-y-1">
                {turn.guesses.map((guess, gIdx) => {
                  const isCurrentGuess =
                    isCurrentTurn && gIdx === currentGuessIndex;
                  const isGuessRevealed =
                    isPast || (isCurrentTurn && gIdx <= currentGuessIndex);
                  const result = resultIcons[guess.result];
                  const Icon = result.icon;

                  return (
                    <div
                      key={`${turn.turn_number}-${gIdx}`}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-xs transition-all",
                        isCurrentGuess &&
                          "bg-yellow-500/10 ring-1 ring-yellow-500/30",
                        !isGuessRevealed && "opacity-30"
                      )}
                    >
                      {isGuessRevealed ? (
                        <Icon className={cn("h-3 w-3 shrink-0", result.color)} />
                      ) : (
                        <div className="h-3 w-3 shrink-0 rounded-full bg-muted" />
                      )}
                      <span className="font-medium uppercase tracking-wide">
                        {isGuessRevealed ? guess.word : "???"}
                      </span>
                      {isGuessRevealed && (
                        <span
                          className={cn(
                            "ml-auto text-[10px] font-medium",
                            result.color
                          )}
                        >
                          {guess.result.replace("_", " ")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

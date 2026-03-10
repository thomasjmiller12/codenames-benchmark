"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoardGrid } from "@/components/game-replay/board-grid";
import { TurnTimeline } from "@/components/game-replay/turn-timeline";
import { ReplayControls } from "@/components/game-replay/replay-controls";
import { formatCost, getModelDisplayName } from "@/lib/format";
import { Trophy, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameReplay, Model } from "@/lib/types";

interface Step {
  turnIndex: number;
  guessIndex: number;
}

export function GameReplayClient({
  replay,
  models,
}: {
  replay: GameReplay;
  models: Model[];
}) {
  const steps: Step[] = useMemo(() => {
    const s: Step[] = [];
    replay.turns.forEach((turn, tIdx) => {
      turn.guesses.forEach((_, gIdx) => {
        s.push({ turnIndex: tIdx, guessIndex: gIdx });
      });
    });
    return s;
  }, [replay]);

  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [spymasterView, setSpymasterView] = useState(false);

  const totalSteps = steps.length;

  const { revealedWords, currentGuessWord, currentTurnIndex, currentGuessIndex } =
    useMemo(() => {
      const revealed = new Set<string>();
      let guessWord: string | undefined;
      let turnIdx = -1;
      let guessIdx = -1;

      for (let i = 0; i <= currentStep && i < steps.length; i++) {
        const step = steps[i];
        const turn = replay.turns[step.turnIndex];
        const guess = turn.guesses[step.guessIndex];
        revealed.add(guess.word);

        if (i === currentStep) {
          guessWord = guess.word;
          turnIdx = step.turnIndex;
          guessIdx = step.guessIndex;
        }
      }

      return {
        revealedWords: revealed,
        currentGuessWord: guessWord,
        currentTurnIndex: turnIdx,
        currentGuessIndex: guessIdx,
      };
    }, [currentStep, steps, replay]);

  const stepForward = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  const stepBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, -1));
  }, []);

  const goToStart = useCallback(() => {
    setCurrentStep(-1);
    setIsPlaying(false);
  }, []);

  const goToEnd = useCallback(() => {
    setCurrentStep(totalSteps - 1);
    setIsPlaying(false);
  }, [totalSteps]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentStep >= totalSteps - 1) {
      setIsPlaying(false);
      return;
    }

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200 / speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed, currentStep, totalSteps]);

  const currentTurn =
    currentTurnIndex >= 0 ? replay.turns[currentTurnIndex] : null;

  const redRevealed = Array.from(revealedWords).filter(
    (w) => replay.board.key_card[w] === "RED"
  ).length;
  const blueRevealed = Array.from(revealedWords).filter(
    (w) => replay.board.key_card[w] === "BLUE"
  ).length;

  const totalRed = Object.values(replay.board.key_card).filter(
    (t) => t === "RED"
  ).length;
  const totalBlue = Object.values(replay.board.key_card).filter(
    (t) => t === "BLUE"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Game Replay</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getModelDisplayName(replay.red_sm_model, models)}{" "}
            <span className="text-red-400">vs</span>{" "}
            {getModelDisplayName(replay.blue_sm_model, models)}
          </p>
        </div>
        {replay.winner && (
          <Badge
            variant="outline"
            className={cn(
              "text-sm px-3 py-1",
              replay.winner === "red"
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-blue-500/40 bg-blue-500/10 text-blue-400"
            )}
          >
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            {replay.winner === "red" ? "Red" : "Blue"} wins by{" "}
            {replay.win_condition === "all_words" ? "all words" : replay.win_condition}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/40 px-5 py-3">
            {currentTurn ? (
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-3 w-3 rounded-full",
                    currentTurn.team === "red" ? "bg-red-500" : "bg-blue-500"
                  )}
                />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Clue:
                </span>
                <span
                  className={cn(
                    "text-xl font-bold tracking-wider uppercase",
                    currentTurn.team === "red" ? "text-red-400" : "text-blue-400"
                  )}
                >
                  {currentTurn.clue_word}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-sm font-bold">
                  {currentTurn.clue_count}
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                Press play to start the replay
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="font-mono text-sm font-bold text-red-400">
                  {redRevealed}/{totalRed}
                </span>
              </div>
              <Swords className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-bold text-blue-400">
                  {blueRevealed}/{totalBlue}
                </span>
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-amber-950/20 via-card/40 to-card/60 p-6">
            <BoardGrid
              words={replay.board.words}
              keyCard={replay.board.key_card}
              revealedWords={revealedWords}
              currentGuessWord={currentGuessWord}
              spymasterView={spymasterView}
            />
          </div>

          <ReplayControls
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onStepForward={stepForward}
            onStepBack={stepBack}
            onGoToStart={goToStart}
            onGoToEnd={goToEnd}
            speed={speed}
            onSpeedChange={setSpeed}
            spymasterView={spymasterView}
            onToggleSpymasterView={() => setSpymasterView((v) => !v)}
            currentStep={currentStep + 1}
            totalSteps={totalSteps}
          />

          <Card className="bg-card/50">
            <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Turns</p>
                <p className="text-lg font-bold font-mono">
                  {replay.turns.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Guesses</p>
                <p className="text-lg font-bold font-mono">{totalSteps}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Win Condition</p>
                <p className="text-lg font-bold capitalize">
                  {replay.win_condition.replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-bold font-mono">
                  {formatCost(replay.total_cost_usd)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
            Turn Timeline
          </h3>
          <TurnTimeline
            turns={replay.turns}
            currentTurnIndex={currentTurnIndex}
            currentGuessIndex={currentGuessIndex}
          />
        </div>
      </div>
    </div>
  );
}

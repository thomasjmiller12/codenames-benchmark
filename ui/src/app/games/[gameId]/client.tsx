"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoardGrid } from "@/components/game-replay/board-grid";
import { TurnTimeline } from "@/components/game-replay/turn-timeline";
import { ReplayControls } from "@/components/game-replay/replay-controls";
import { formatCost, getModelDisplayName } from "@/lib/format";
import { Trophy, Swords, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameReplay, Model } from "@/lib/types";

interface Step {
  turnIndex: number;
  guessIndex: number;
}

function buildSteps(replay: GameReplay): Step[] {
  const s: Step[] = [];
  replay.turns.forEach((turn, tIdx) => {
    turn.guesses.forEach((_, gIdx) => {
      s.push({ turnIndex: tIdx, guessIndex: gIdx });
    });
  });
  return s;
}

// ─── Single Game Replay View ───────────────────────────────────────────────

function SingleReplay({
  replay,
  models,
}: {
  replay: GameReplay;
  models: Model[];
}) {
  const steps = useMemo(() => buildSteps(replay), [replay]);
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
    <>
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
    </>
  );
}

// ─── Pair Summary View ─────────────────────────────────────────────────────

function PairSummary({
  game1,
  game2,
  models,
  pairResult,
}: {
  game1: GameReplay;
  game2: GameReplay;
  models: Model[];
  pairResult: string;
}) {
  // Use game1's board (both share the same board)
  const board = game1.board;

  return (
    <div className="space-y-6">
      {/* Pair result header */}
      <Card className="bg-card/50">
        <CardContent className="p-5 text-center">
          <p className="text-2xl font-bold font-mono">{pairResult}</p>
          <p className="text-sm text-muted-foreground mt-1">Pair Result</p>
        </CardContent>
      </Card>

      {/* Shared board */}
      <Card className="bg-card/50">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider text-center">
            Shared Board (Spymaster View)
          </h3>
          <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-amber-950/20 via-card/40 to-card/60 p-6">
            <BoardGrid
              words={board.words}
              keyCard={board.key_card}
              revealedWords={new Set()}
              currentGuessWord={undefined}
              spymasterView={true}
            />
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side turn sequences */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GameTurnSummary replay={game1} models={models} label="Game 1" />
        <GameTurnSummary replay={game2} models={models} label="Game 2" />
      </div>

      {/* Stats comparison */}
      <Card className="bg-card/50">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider text-center">
            Key Stats
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground text-center">Game 1</p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Turns</p>
                  <p className="font-bold font-mono">{game1.turns.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Guesses</p>
                  <p className="font-bold font-mono">{game1.turns.reduce((s, t) => s + t.guesses.length, 0)}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground text-center">Game 2</p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Turns</p>
                  <p className="font-bold font-mono">{game2.turns.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Guesses</p>
                  <p className="font-bold font-mono">{game2.turns.reduce((s, t) => s + t.guesses.length, 0)}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GameTurnSummary({
  replay,
  models,
  label,
}: {
  replay: GameReplay;
  models: Model[];
  label: string;
}) {
  const redName = getModelDisplayName(replay.red_sm_model, models);
  const blueName = getModelDisplayName(replay.blue_sm_model, models);

  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">{label}</h4>
          {replay.winner && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                replay.winner === "red"
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-blue-500/40 bg-blue-500/10 text-blue-400"
              )}
            >
              {replay.winner === "red" ? "Red" : "Blue"} wins
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          <span className="text-red-400">{redName}</span>
          {" vs "}
          <span className="text-blue-400">{blueName}</span>
        </p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {replay.turns.map((turn) => (
            <div
              key={turn.turn_number}
              className={cn(
                "rounded-lg px-3 py-2 text-xs",
                turn.team === "red" ? "bg-red-500/5 border border-red-500/10" : "bg-blue-500/5 border border-blue-500/10"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    turn.team === "red" ? "bg-red-500" : "bg-blue-500"
                  )}
                />
                <span className="font-bold uppercase tracking-wider">
                  {turn.clue_word}
                </span>
                <span className="font-mono text-muted-foreground">{turn.clue_count}</span>
              </div>
              <div className="flex flex-wrap gap-1 ml-4">
                {turn.guesses.map((g, i) => (
                  <span
                    key={i}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-mono",
                      g.result === "CORRECT" && "bg-emerald-500/20 text-emerald-400",
                      g.result === "WRONG_TEAM" && "bg-orange-500/20 text-orange-400",
                      g.result === "NEUTRAL" && "bg-muted text-muted-foreground",
                      g.result === "ASSASSIN" && "bg-red-900/40 text-red-300"
                    )}
                  >
                    {g.word}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

type ViewMode = "game1" | "game2" | "summary";

export function GameReplayClient({
  replay,
  partnerReplay,
  models,
}: {
  replay: GameReplay;
  partnerReplay: GameReplay | null;
  models: Model[];
}) {
  const hasPair = partnerReplay != null;
  const [viewMode, setViewMode] = useState<ViewMode>("game1");

  const activeReplay = viewMode === "game2" && partnerReplay ? partnerReplay : replay;

  // Compute pair result
  let pairResultLabel = "";
  if (hasPair && partnerReplay) {
    // Figure out which model is "model A" (use red_sm_model from game1)
    const modelA = replay.red_sm_model;
    let aWins = 0;
    const g1AWon =
      (replay.red_sm_model === modelA && replay.winner === "red") ||
      (replay.blue_sm_model === modelA && replay.winner === "blue");
    if (g1AWon) aWins++;
    const g2AWon =
      (partnerReplay.red_sm_model === modelA && partnerReplay.winner === "red") ||
      (partnerReplay.blue_sm_model === modelA && partnerReplay.winner === "blue");
    if (g2AWon) aWins++;

    const modelAName = getModelDisplayName(modelA, models);
    const modelBName = getModelDisplayName(replay.blue_sm_model, models);

    if (aWins === 2) pairResultLabel = `2-0 ${modelAName}`;
    else if (aWins === 0) pairResultLabel = `2-0 ${modelBName}`;
    else pairResultLabel = "1-1 Split";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Game Replay</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getModelDisplayName(activeReplay.red_sm_model, models)}{" "}
            <span className="text-red-400">vs</span>{" "}
            {getModelDisplayName(activeReplay.blue_sm_model, models)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasPair && pairResultLabel && (
            <Badge variant="outline" className="text-sm px-3 py-1 border-border/60">
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
              {pairResultLabel}
            </Badge>
          )}
          {activeReplay.winner && viewMode !== "summary" && (
            <Badge
              variant="outline"
              className={cn(
                "text-sm px-3 py-1",
                activeReplay.winner === "red"
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-blue-500/40 bg-blue-500/10 text-blue-400"
              )}
            >
              <Trophy className="h-3.5 w-3.5 mr-1.5" />
              {activeReplay.winner === "red" ? "Red" : "Blue"} wins by{" "}
              {activeReplay.win_condition === "all_words" ? "all words" : activeReplay.win_condition}
            </Badge>
          )}
        </div>
      </div>

      {/* Pair switcher */}
      {hasPair && partnerReplay && (
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("game1")}
            className={cn(
              "flex-1 rounded-lg border px-4 py-3 text-left transition-colors",
              viewMode === "game1"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wider mb-1">Game 1</p>
            <p className="text-sm">
              <span className="text-red-400">{getModelDisplayName(replay.red_sm_model, models)}</span>
              {" vs "}
              <span className="text-blue-400">{getModelDisplayName(replay.blue_sm_model, models)}</span>
            </p>
            {replay.winner && (
              <p className="text-xs text-muted-foreground mt-1">
                {replay.winner === "red" ? "Red" : "Blue"} wins &middot; {replay.turns.length} turns
              </p>
            )}
          </button>
          <button
            onClick={() => setViewMode("game2")}
            className={cn(
              "flex-1 rounded-lg border px-4 py-3 text-left transition-colors",
              viewMode === "game2"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wider mb-1">Game 2</p>
            <p className="text-sm">
              <span className="text-red-400">{getModelDisplayName(partnerReplay.red_sm_model, models)}</span>
              {" vs "}
              <span className="text-blue-400">{getModelDisplayName(partnerReplay.blue_sm_model, models)}</span>
            </p>
            {partnerReplay.winner && (
              <p className="text-xs text-muted-foreground mt-1">
                {partnerReplay.winner === "red" ? "Red" : "Blue"} wins &middot; {partnerReplay.turns.length} turns
              </p>
            )}
          </button>
          <button
            onClick={() => setViewMode("summary")}
            className={cn(
              "rounded-lg border px-4 py-3 text-center transition-colors min-w-[120px]",
              viewMode === "summary"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
            )}
          >
            <p className="text-xs font-medium uppercase tracking-wider mb-1">Pair</p>
            <p className="text-sm font-bold font-mono">{pairResultLabel}</p>
          </button>
        </div>
      )}

      {/* Content */}
      {viewMode === "summary" && hasPair && partnerReplay ? (
        <PairSummary
          game1={replay}
          game2={partnerReplay}
          models={models}
          pairResult={pairResultLabel}
        />
      ) : (
        <SingleReplay replay={activeReplay} models={models} />
      )}
    </div>
  );
}

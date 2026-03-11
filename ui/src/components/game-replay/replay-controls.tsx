"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  SkipBack,
  ChevronLeft,
  Play,
  Pause,
  ChevronRight,
  SkipForward,
  Eye,
  EyeOff,
} from "lucide-react";

interface ReplayControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  spymasterView: boolean;
  onToggleSpymasterView: () => void;
  currentStep: number;
  totalSteps: number;
}

export function ReplayControls({
  isPlaying,
  onTogglePlay,
  onStepForward,
  onStepBack,
  onGoToStart,
  onGoToEnd,
  speed,
  onSpeedChange,
  spymasterView,
  onToggleSpymasterView,
  currentStep,
  totalSteps,
}: ReplayControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-4 rounded-xl border border-border/50 bg-card/60 px-3 sm:px-5 py-3 backdrop-blur-sm">
      {/* Transport controls */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8"
          onClick={onGoToStart}
        >
          <SkipBack className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8"
          onClick={onStepBack}
        >
          <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9 rounded-full"
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          ) : (
            <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-0.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8"
          onClick={onStepForward}
        >
          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8"
          onClick={onGoToEnd}
        >
          <SkipForward className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span>
          {currentStep}/{totalSteps}
        </span>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-[11px] text-muted-foreground hidden sm:inline">Speed</span>
        <Slider
          value={[speed]}
          onValueChange={(v) => onSpeedChange(Array.isArray(v) ? v[0] : v)}
          min={0.5}
          max={4}
          step={0.5}
          className="w-16 sm:w-20"
        />
        <span className="text-xs font-mono w-8">{speed}x</span>
      </div>

      {/* Spymaster toggle */}
      <Button
        variant={spymasterView ? "secondary" : "ghost"}
        size="sm"
        className="gap-1 sm:gap-1.5 text-xs"
        onClick={onToggleSpymasterView}
        title="Toggle spymaster view to see card types"
      >
        {spymasterView ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">Spymaster</span>
        <span className="sm:hidden">Spy</span>
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const PIPELINE_NODES = [
  { label: "Game State", icon: "🎮", color: "from-violet-500/20 to-violet-600/10 border-violet-500/30" },
  { label: "Prompt", icon: "📝", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
  { label: "LLM", icon: "🤖", color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30" },
  { label: "JSON Output", icon: "📦", color: "from-amber-500/20 to-amber-600/10 border-amber-500/30" },
  { label: "Game Action", icon: "⚡", color: "from-red-500/20 to-red-600/10 border-red-500/30" },
];

interface ExampleCardProps {
  title: string;
  input: string;
  output: string;
  defaultOpen?: boolean;
}

function ExampleCard({ title, input, output, defaultOpen }: ExampleCardProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Prompt excerpt</span>
            <pre className="mt-1 rounded-lg bg-background/60 p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
              {input}
            </pre>
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Response</span>
            <pre className="mt-1 rounded-lg bg-background/60 p-3 text-xs text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">
              {output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function LLMPipeline() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-8">
      {/* Flow diagram */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-0">
        {PIPELINE_NODES.map((node, i) => (
          <div key={node.label} className="flex items-center">
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: shouldReduceMotion ? 0 : i * 0.12, duration: 0.4 }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border bg-gradient-to-b px-3 py-3 sm:px-5 sm:py-4",
                node.color
              )}
            >
              <span className="text-lg sm:text-xl">{node.icon}</span>
              <span className="text-[10px] sm:text-xs font-medium text-foreground whitespace-nowrap">
                {node.label}
              </span>
            </motion.div>
            {i < PIPELINE_NODES.length - 1 && (
              <motion.div
                initial={shouldReduceMotion ? {} : { opacity: 0, scaleX: 0 }}
                whileInView={{ opacity: 1, scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: shouldReduceMotion ? 0 : i * 0.12 + 0.1, duration: 0.3 }}
                className="hidden sm:block mx-1 h-px w-6 bg-muted-foreground/30"
              />
            )}
          </div>
        ))}
      </div>

      {/* Callout badges */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {["3 retry attempts", "Clue validation", "Structured output via instructor"].map((label) => (
          <span
            key={label}
            className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[10px] sm:text-xs font-medium text-primary"
          >
            {label}
          </span>
        ))}
      </div>

      {/* Expandable examples */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ExampleCard
          title="Spymaster Prompt → Response"
          input={`You are the RED spymaster.\nYour words: BEACH, WAVE, SAND, CORAL\nAvoid: CASTLE, MOON, CROWN (blue)\nAvoid: NIGHT (assassin)\n\nGive a one-word clue and number.`}
          output={`{\n  "word": "OCEAN",\n  "count": 2\n}`}
        />
        <ExampleCard
          title="Operative Prompt → Response"
          input={`You are the RED operative.\nClue: "OCEAN 2"\nRemaining words: BEACH, WAVE, CASTLE,\nMOON, BOAT, SAND, NIGHT, CROWN, CORAL`}
          output={`{\n  "word": "BEACH",\n  "confidence": 0.92\n}`}
        />
      </div>
    </div>
  );
}

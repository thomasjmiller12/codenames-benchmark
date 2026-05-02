import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  /** The // PREFIX accent line, mono caps. */
  eyebrow: string;
  /** The big page title. */
  title: string;
  /** Subtitle / description. Optional. */
  description?: string;
  /** Right-side slot (e.g. tabs, filters, badges). Optional. */
  actions?: ReactNode;
  /** Visual accent color for the eyebrow. Defaults to amber. */
  accent?: "amber" | "emerald" | "rose" | "sky";
  className?: string;
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  amber: "text-amber-400/80",
  emerald: "text-emerald-400/80",
  rose: "text-rose-400/80",
  sky: "text-sky-400/80",
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  accent = "amber",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/50 pb-5 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "font-mono text-[11px] uppercase tracking-[0.3em]",
            ACCENT[accent]
          )}
        >
          {eyebrow.startsWith("//") ? eyebrow : `// ${eyebrow}`}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

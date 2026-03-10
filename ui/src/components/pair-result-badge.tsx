import { cn } from "@/lib/utils";

interface PairResultBadgeProps {
  label: string;
  variant: "sweep" | "split" | "swept";
  className?: string;
}

export function PairResultBadge({ label, variant, className }: PairResultBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold font-mono leading-none",
        variant === "sweep" && "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
        variant === "split" && "bg-muted/60 text-muted-foreground border border-border/40",
        variant === "swept" && "bg-red-500/15 text-red-400 border border-red-500/25",
        className
      )}
    >
      {label}
    </span>
  );
}

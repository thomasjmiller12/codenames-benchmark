import { cn } from "@/lib/utils";
import { classifyTier } from "@/lib/showcase-helpers";

interface Props {
  rating: number;
  className?: string;
}

export function ClassificationStamp({ rating, className }: Props) {
  const tier = classifyTier(rating);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-sm bg-gradient-to-r px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.18em] text-white shadow-sm",
        tier.gradient,
        className
      )}
    >
      <span className="block h-1 w-1 rounded-full bg-white/80" />
      {tier.label}
    </div>
  );
}

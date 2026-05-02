import { cn } from "@/lib/utils";
import { providerGradient } from "@/lib/showcase-helpers";

interface Props {
  monogram: string;
  provider: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-lg",
  lg: "h-20 w-20 text-2xl",
  xl: "h-28 w-28 text-4xl",
} as const;

export function AgentPortrait({
  monogram,
  provider,
  size = "md",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md font-mono font-bold tracking-tight text-white",
        "bg-gradient-to-br shadow-[inset_0_2px_8px_rgba(255,255,255,0.18),0_4px_14px_rgba(0,0,0,0.45)]",
        providerGradient(provider),
        SIZE_CLASSES[size],
        "flex items-center justify-center",
        className
      )}
    >
      <span className="relative z-10 mix-blend-screen">{monogram}</span>
      {/* CRT scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.55) 2px, rgba(0,0,0,0.55) 3px)",
        }}
      />
      {/* Specular highlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(255,255,255,0.7), transparent 55%)",
        }}
      />
      {/* Corner notch */}
      <div className="pointer-events-none absolute right-0 top-0 h-2 w-2 bg-background/50" />
    </div>
  );
}

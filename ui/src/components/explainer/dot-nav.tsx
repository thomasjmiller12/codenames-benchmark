"use client";

import { cn } from "@/lib/utils";

interface DotNavProps {
  sections: { id: string; label: string }[];
  activeId: string;
}

export function DotNav({ sections, activeId }: DotNavProps) {
  return (
    <nav className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-3 xl:flex">
      {sections.map((s) => {
        const isActive = s.id === activeId;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-label={s.label}
            title={s.label}
            className="group relative flex items-center"
          >
            {/* Label tooltip */}
            <span
              className={cn(
                "absolute right-6 whitespace-nowrap rounded-md bg-card px-2 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 border border-border"
              )}
            >
              {s.label}
            </span>
            {/* Dot */}
            <span
              className={cn(
                "block h-2.5 w-2.5 rounded-full border transition-all duration-300",
                isActive
                  ? "scale-125 border-primary bg-primary"
                  : "border-muted-foreground/40 bg-transparent hover:border-muted-foreground"
              )}
            />
          </a>
        );
      })}
    </nav>
  );
}

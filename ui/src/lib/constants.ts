export const TEAM_COLORS = {
  red: {
    bg: "bg-red-600",
    bgLight: "bg-red-600/20",
    text: "text-red-400",
    border: "border-red-500",
    hex: "#dc2626",
    chart: "hsl(0, 72%, 51%)",
  },
  blue: {
    bg: "bg-blue-600",
    bgLight: "bg-blue-600/20",
    text: "text-blue-400",
    border: "border-blue-500",
    hex: "#2563eb",
    chart: "hsl(214, 84%, 56%)",
  },
} as const;

export const CARD_COLORS = {
  RED: {
    bg: "bg-gradient-to-br from-red-500 to-red-700",
    text: "text-white",
    hex: "#dc2626",
    border: "border-red-400/30",
    shadow: "shadow-[0_4px_12px_rgba(220,38,38,0.3)]",
  },
  BLUE: {
    bg: "bg-gradient-to-br from-blue-500 to-blue-700",
    text: "text-white",
    hex: "#2563eb",
    border: "border-blue-400/30",
    shadow: "shadow-[0_4px_12px_rgba(37,99,235,0.3)]",
  },
  NEUTRAL: {
    bg: "bg-gradient-to-br from-yellow-700 to-stone-700",
    text: "text-yellow-50",
    hex: "#a16207",
    border: "border-yellow-600/40",
    shadow: "shadow-[0_4px_12px_rgba(161,98,7,0.3)]",
  },
  ASSASSIN: {
    bg: "bg-gradient-to-br from-zinc-800 to-zinc-950",
    text: "text-zinc-300",
    hex: "#18181b",
    border: "border-zinc-600/30",
    shadow: "shadow-[0_4px_12px_rgba(0,0,0,0.5)]",
  },
} as const;

export const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  OpenAI: "bg-green-500/20 text-green-300 border-green-500/30",
  Google: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Meta: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

export const CHART_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
];

export const ELO_BASELINE = 1500;

export const HIDDEN_MODELS: string[] = [];

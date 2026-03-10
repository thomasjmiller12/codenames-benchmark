export function formatRating(rating: number): string {
  return Math.round(rating).toString();
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export function formatWinRate(wins: number, total: number): string {
  if (total === 0) return "0%";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getWinRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return (wins / total) * 100;
}

export function getModelDisplayName(
  modelId: string,
  models: { model_id: string; display_name: string }[]
): string {
  return models.find((m) => m.model_id === modelId)?.display_name ?? modelId;
}

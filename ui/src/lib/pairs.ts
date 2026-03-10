import type { Game } from "./types";

export interface PairInfo {
  pair_id: number;
  games: Game[];
  /** Which model won 2-0 (or null for split/incomplete) */
  sweepWinner: string | null;
  /** "2-0", "1-1", or null if pair incomplete */
  label: string | null;
}

/** Composite key for a pair: experiment_id + pair_id */
function pairKey(g: Game): string | null {
  if (g.pair_id == null) return null;
  return `${g.experiment_id ?? ""}:${g.pair_id}`;
}

/**
 * Build a map of compositeKey -> PairInfo from a list of games.
 * Only includes pairs with exactly 2 completed games.
 */
export function buildPairMap(games: Game[]): Map<string, PairInfo> {
  const map = new Map<string, Game[]>();
  for (const g of games) {
    const key = pairKey(g);
    if (key == null) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(g);
  }

  const result = new Map<string, PairInfo>();
  for (const [key, pairGames] of map) {
    if (pairGames.length !== 2) continue;

    const g1 = pairGames[0];
    const modelA = g1.red_sm_model;
    const modelB = g1.blue_sm_model;

    let aWins = 0;
    let bWins = 0;
    for (const g of pairGames) {
      const aIsRed = g.red_sm_model === modelA;
      const aWon = aIsRed ? g.winner === "red" : g.winner === "blue";
      if (aWon) aWins++;
      else bWins++;
    }

    result.set(key, {
      pair_id: pairGames[0].pair_id!,
      games: pairGames,
      sweepWinner: aWins === 2 ? modelA : bWins === 2 ? modelB : null,
      label: aWins === 2 || bWins === 2 ? "2-0" : "1-1",
    });
  }

  return result;
}

/**
 * Get the pair result label for a specific game relative to a specific model.
 */
export function getPairResultForModel(
  game: Game,
  modelId: string,
  pairMap: Map<string, PairInfo>
): { label: string; variant: "sweep" | "split" | "swept" } | null {
  const key = pairKey(game);
  if (key == null) return null;
  const pair = pairMap.get(key);
  if (!pair) return null;

  let modelWins = 0;
  let opponentWins = 0;
  for (const g of pair.games) {
    const isRed = g.red_sm_model === modelId;
    const won = isRed ? g.winner === "red" : g.winner === "blue";
    if (won) modelWins++;
    else opponentWins++;
  }

  if (modelWins === 2) return { label: "2-0", variant: "sweep" };
  if (opponentWins === 2) return { label: "0-2", variant: "swept" };
  return { label: "1-1", variant: "split" };
}

/**
 * Get the pair result label for a game generically (not relative to a specific model).
 */
export function getPairResultGeneric(
  game: Game,
  pairMap: Map<string, PairInfo>
): { label: string; variant: "sweep" | "split" | "swept"; sweepModel?: string } | null {
  const key = pairKey(game);
  if (key == null) return null;
  const pair = pairMap.get(key);
  if (!pair) return null;

  if (pair.sweepWinner) {
    return {
      label: "2-0",
      variant: "sweep",
      sweepModel: pair.sweepWinner,
    };
  }
  return { label: "1-1", variant: "split" };
}

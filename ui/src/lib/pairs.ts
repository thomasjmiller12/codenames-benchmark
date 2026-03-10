import type { Game } from "./types";

export interface PairInfo {
  pair_id: number;
  games: Game[];
  /** Which model won 2-0 (or null for split/incomplete) */
  sweepWinner: string | null;
  /** "2-0", "1-1", or null if pair incomplete */
  label: string | null;
}

/**
 * Build a map of pair_id -> PairInfo from a list of games.
 * Only includes pairs with exactly 2 completed games.
 */
export function buildPairMap(games: Game[]): Map<number, PairInfo> {
  const map = new Map<number, Game[]>();
  for (const g of games) {
    if (g.pair_id == null) continue;
    if (!map.has(g.pair_id)) map.set(g.pair_id, []);
    map.get(g.pair_id)!.push(g);
  }

  const result = new Map<number, PairInfo>();
  for (const [pairId, pairGames] of map) {
    if (pairGames.length !== 2) continue;

    // Determine which model is "model A" (red_sm_model in first game)
    const g1 = pairGames[0];
    const g2 = pairGames[1];
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

    result.set(pairId, {
      pair_id: pairId,
      games: pairGames,
      sweepWinner: aWins === 2 ? modelA : bWins === 2 ? modelB : null,
      label: aWins === 2 || bWins === 2 ? "2-0" : "1-1",
    });
  }

  return result;
}

/**
 * Get the pair result label for a specific game relative to a specific model.
 * Returns { label: "2-0" | "1-1" | "0-2", variant: "sweep" | "split" | "swept" } or null.
 */
export function getPairResultForModel(
  game: Game,
  modelId: string,
  pairMap: Map<number, PairInfo>
): { label: string; variant: "sweep" | "split" | "swept" } | null {
  if (game.pair_id == null) return null;
  const pair = pairMap.get(game.pair_id);
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
 * Shows which team swept or if split.
 */
export function getPairResultGeneric(
  game: Game,
  pairMap: Map<number, PairInfo>
): { label: string; variant: "sweep" | "split" | "swept"; sweepModel?: string } | null {
  if (game.pair_id == null) return null;
  const pair = pairMap.get(game.pair_id);
  if (!pair) return null;

  if (pair.sweepWinner) {
    return {
      label: "2-0",
      variant: pair.sweepWinner === game.red_sm_model || pair.sweepWinner === game.blue_sm_model ? "sweep" : "sweep",
      sweepModel: pair.sweepWinner,
    };
  }
  return { label: "1-1", variant: "split" };
}

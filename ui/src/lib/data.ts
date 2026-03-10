import { getDb } from "./db";
import type {
  Model,
  Game,
  GameReplay,
  RatingHistory,
  Turn,
  Guess,
  CardType,
  InsightsData,
  FirstClueAmbition,
  TurnsToWin,
  RedBlueWinRate,
  AssassinRate,
  ClueSizeDistribution,
  GuessAccuracy,
  ComebackRate,
  OperativeObedience,
} from "./types";
import { HIDDEN_MODELS } from "./constants";

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveProvider(modelId: string): string {
  if (modelId.startsWith("anthropic/")) return "Anthropic";
  if (modelId.startsWith("openai/")) return "OpenAI";
  if (modelId.startsWith("google/")) return "Google";
  if (modelId.startsWith("meta/") || modelId.includes("llama")) return "Meta";
  if (modelId.startsWith("mistral/")) return "Mistral";
  return "Other";
}

function deriveDisplayName(row: { display_name: string; model_id: string }): string {
  if (row.display_name === row.model_id) {
    const parts = row.model_id.split("/");
    return parts[parts.length - 1]
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return row.display_name;
}

// ─── Models ─────────────────────────────────────────────────────────────────

export function getModels(): Model[] {
  const db = getDb();
  if (!db) return [];

  const rows = db.prepare("SELECT * FROM models ORDER BY solo_rating DESC").all() as Record<string, unknown>[];

  // Derive game counts and win counts from actual games table
  // (models table counters may be stale)
  const gameStats = db
    .prepare(
      `SELECT
         model_id,
         SUM(CASE WHEN role = 'solo' THEN 1 ELSE 0 END) as solo_games,
         SUM(CASE WHEN role = 'solo' AND won = 1 THEN 1 ELSE 0 END) as solo_wins,
         SUM(CASE WHEN role = 'spymaster' THEN 1 ELSE 0 END) as spymaster_games,
         SUM(CASE WHEN role = 'spymaster' AND won = 1 THEN 1 ELSE 0 END) as spymaster_wins,
         SUM(CASE WHEN role = 'operative' THEN 1 ELSE 0 END) as operative_games,
         SUM(CASE WHEN role = 'operative' AND won = 1 THEN 1 ELSE 0 END) as operative_wins,
         SUM(CASE WHEN team = 'red' THEN 1 ELSE 0 END) as red_games,
         SUM(CASE WHEN team = 'red' AND won = 1 THEN 1 ELSE 0 END) as red_wins,
         SUM(CASE WHEN team = 'blue' THEN 1 ELSE 0 END) as blue_games,
         SUM(CASE WHEN team = 'blue' AND won = 1 THEN 1 ELSE 0 END) as blue_wins,
         SUM(cost) as total_cost,
         AVG(tokens) as avg_tokens
       FROM (
         SELECT red_sm_model as model_id, mode as role, 'red' as team,
                CASE WHEN winner = 'red' THEN 1 ELSE 0 END as won,
                total_cost_usd as cost,
                total_input_tokens + total_output_tokens as tokens
         FROM games WHERE status = 'completed'
         UNION ALL
         SELECT blue_sm_model as model_id, mode as role, 'blue' as team,
                CASE WHEN winner = 'blue' THEN 1 ELSE 0 END as won,
                total_cost_usd as cost,
                total_input_tokens + total_output_tokens as tokens
         FROM games WHERE status = 'completed'
       )
       GROUP BY model_id`
    )
    .all() as Record<string, unknown>[];

  const statsMap = new Map(gameStats.map((r) => [r.model_id as string, r]));

  // Avg latency per model from the turns table (combines SM and OP roles)
  const latencyStats = db
    .prepare(
      `SELECT model_id, AVG(latency_ms) as avg_latency_ms
       FROM (
         SELECT sm_model as model_id, sm_latency_ms as latency_ms
         FROM turns WHERE sm_model IS NOT NULL AND sm_latency_ms IS NOT NULL
         UNION ALL
         SELECT op_model as model_id, op_latency_ms as latency_ms
         FROM turns WHERE op_model IS NOT NULL AND op_latency_ms IS NOT NULL
       )
       GROUP BY model_id`
    )
    .all() as Record<string, unknown>[];

  const latencyMap = new Map(latencyStats.map((r) => [r.model_id as string, r]));

  // Assassin win/loss stats per model
  const assassinStats = db
    .prepare(
      `SELECT model_id,
              SUM(CASE WHEN assassin_win = 1 THEN 1 ELSE 0 END) as assassin_wins,
              SUM(CASE WHEN assassin_loss = 1 THEN 1 ELSE 0 END) as assassin_losses
       FROM (
         SELECT red_sm_model as model_id,
                CASE WHEN win_condition = 'assassin' AND winner = 'red' THEN 1 ELSE 0 END as assassin_win,
                CASE WHEN win_condition = 'assassin' AND winner = 'blue' THEN 1 ELSE 0 END as assassin_loss
         FROM games WHERE status = 'completed'
         UNION ALL
         SELECT blue_sm_model as model_id,
                CASE WHEN win_condition = 'assassin' AND winner = 'blue' THEN 1 ELSE 0 END as assassin_win,
                CASE WHEN win_condition = 'assassin' AND winner = 'red' THEN 1 ELSE 0 END as assassin_loss
         FROM games WHERE status = 'completed'
       )
       GROUP BY model_id`
    )
    .all() as Record<string, unknown>[];

  const assassinMap = new Map(assassinStats.map((r) => [r.model_id as string, r]));

  const visibleRows = rows.filter((row) => !HIDDEN_MODELS.includes(row.model_id as string));

  return visibleRows.map((row) => {
    const gs = statsMap.get(row.model_id as string);
    const ls = latencyMap.get(row.model_id as string);
    const as_ = assassinMap.get(row.model_id as string);
    // Prefer actual game counts from games table; fall back to models table
    const soloGames = (gs?.solo_games as number) ?? (row.solo_games_played as number) ?? 0;
    const spymasterGames = (gs?.spymaster_games as number) ?? (row.spymaster_games as number) ?? 0;
    const operativeGames = (gs?.operative_games as number) ?? (row.operative_games as number) ?? 0;
    const totalGames = soloGames + spymasterGames + operativeGames;
    const totalCost = (gs?.total_cost as number) ?? 0;

    return {
      model_id: row.model_id as string,
      display_name: deriveDisplayName(row as { display_name: string; model_id: string }),
      provider: deriveProvider(row.model_id as string),
      solo_rating: row.solo_rating as number,
      solo_games: soloGames,
      spymaster_rating: row.spymaster_rating as number,
      spymaster_games: spymasterGames,
      operative_rating: row.operative_rating as number,
      operative_games: operativeGames,
      solo_wins: (gs?.solo_wins as number) ?? 0,
      spymaster_wins: (gs?.spymaster_wins as number) ?? 0,
      operative_wins: (gs?.operative_wins as number) ?? 0,
      red_wins: (gs?.red_wins as number) ?? 0,
      red_games: (gs?.red_games as number) ?? 0,
      blue_wins: (gs?.blue_wins as number) ?? 0,
      blue_games: (gs?.blue_games as number) ?? 0,
      assassin_wins: (as_?.assassin_wins as number) ?? 0,
      assassin_losses: (as_?.assassin_losses as number) ?? 0,
      total_cost_usd: totalCost,
      avg_cost_per_game: totalGames > 0 ? totalCost / totalGames : 0,
      avg_tokens_per_game: (gs?.avg_tokens as number) ?? 0,
      avg_latency_ms: (ls?.avg_latency_ms as number) ?? 0,
    };
  });
}

// ─── Games ──────────────────────────────────────────────────────────────────

export function getGames(): Game[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT game_id, red_sm_model, red_op_model, blue_sm_model, blue_op_model,
              mode, winner, win_condition, total_turns, red_remaining, blue_remaining,
              total_input_tokens, total_output_tokens, total_cost_usd,
              COALESCE(completed_at, started_at, created_at) as completed_at
       FROM games
       WHERE status = 'completed'
       ORDER BY COALESCE(completed_at, started_at, created_at) DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    game_id: row.game_id as string,
    red_sm_model: row.red_sm_model as string,
    red_op_model: (row.red_op_model as string) ?? (row.red_sm_model as string),
    blue_sm_model: row.blue_sm_model as string,
    blue_op_model: (row.blue_op_model as string) ?? (row.blue_sm_model as string),
    mode: (row.mode as "solo" | "collab") ?? "solo",
    winner: row.winner as "red" | "blue" | null,
    win_condition: mapWinCondition(row.win_condition as string),
    total_turns: (row.total_turns as number) ?? 0,
    red_remaining: (row.red_remaining as number) ?? 0,
    blue_remaining: (row.blue_remaining as number) ?? 0,
    total_input_tokens: (row.total_input_tokens as number) ?? 0,
    total_output_tokens: (row.total_output_tokens as number) ?? 0,
    total_cost_usd: (row.total_cost_usd as number) ?? 0,
    completed_at: (row.completed_at as string) ?? "",
  }));
}

function mapWinCondition(wc: string): "all_words" | "assassin" | "turn_limit" {
  if (wc === "all_words_found") return "all_words";
  if (wc === "assassin") return "assassin";
  if (wc === "turn_limit") return "turn_limit";
  return "all_words";
}

// ─── Game Replay ────────────────────────────────────────────────────────────

export function getGameReplay(gameId: string): GameReplay | null {
  const db = getDb();
  if (!db) return null;

  const game = db
    .prepare(
      `SELECT g.*, b.words_json, b.key_card_json, b.starting_team
       FROM games g
       LEFT JOIN boards b ON g.board_id = b.board_id
       WHERE g.game_id = ?`
    )
    .get(gameId) as Record<string, unknown> | undefined;

  if (!game) return null;

  const turnRows = db
    .prepare(
      `SELECT turn_number, team, clue_word, clue_count, guesses_json
       FROM turns
       WHERE game_id = ?
       ORDER BY turn_number`
    )
    .all(gameId) as Record<string, unknown>[];

  const turns: Turn[] = turnRows.map((t) => ({
    turn_number: t.turn_number as number,
    team: t.team as "red" | "blue",
    clue_word: t.clue_word as string,
    clue_count: t.clue_count as number,
    guesses: parseGuesses(t.guesses_json as string),
  }));

  const wordsJson = game.words_json as string | null;
  const keyCardJson = game.key_card_json as string | null;

  if (!wordsJson || !keyCardJson) {
    return null;
  }

  const words = JSON.parse(wordsJson) as string[];
  const keyCard = JSON.parse(keyCardJson) as Record<string, CardType>;

  return {
    game_id: game.game_id as string,
    red_sm_model: game.red_sm_model as string,
    red_op_model: (game.red_op_model as string) ?? (game.red_sm_model as string),
    blue_sm_model: game.blue_sm_model as string,
    blue_op_model: (game.blue_op_model as string) ?? (game.blue_sm_model as string),
    winner: game.winner as "red" | "blue" | null,
    win_condition: mapWinCondition(game.win_condition as string),
    total_cost_usd: (game.total_cost_usd as number) ?? 0,
    board: {
      words,
      key_card: keyCard,
      starting_team: (game.starting_team as "RED" | "BLUE") ?? "RED",
    },
    turns,
  };
}

function parseGuesses(json: string | null): Guess[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((g: Record<string, unknown>) => ({
      word: (g.word as string) ?? "",
      result: mapGuessResult(g.result as string),
    }));
  } catch {
    return [];
  }
}

function mapGuessResult(r: string): Guess["result"] {
  const upper = (r ?? "").toUpperCase();
  if (upper === "CORRECT" || upper === "HIT") return "CORRECT";
  if (upper === "WRONG_TEAM" || upper === "OPPONENT") return "WRONG_TEAM";
  if (upper === "NEUTRAL" || upper === "MISS") return "NEUTRAL";
  if (upper === "ASSASSIN") return "ASSASSIN";
  return "NEUTRAL";
}

// ─── Rating History ─────────────────────────────────────────────────────────

export function getRatingHistory(): RatingHistory[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT model_id, rating_type, rating_after as rating,
              ROW_NUMBER() OVER (PARTITION BY model_id, rating_type ORDER BY recorded_at) as game_number
       FROM ratings_history
       ORDER BY model_id, rating_type, recorded_at`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => ({
    model_id: r.model_id as string,
    game_number: r.game_number as number,
    rating: r.rating as number,
    rating_type: r.rating_type as "solo" | "spymaster" | "operative",
  }));
}

// ─── Aggregate Stats ────────────────────────────────────────────────────────

const EMPTY_STATS = {
  totalGames: 0,
  totalModels: 0,
  avgTurns: 0,
  totalCost: 0,
  winByAllWords: 0,
  winByAssassin: 0,
  winByTurnLimit: 0,
  redWins: 0,
  blueWins: 0,
};

export function getOverallStats() {
  const db = getDb();
  if (!db) return EMPTY_STATS;

  const gameStats = db
    .prepare(
      `SELECT
         COUNT(*) as total_games,
         AVG(total_turns) as avg_turns,
         SUM(total_cost_usd) as total_cost,
         SUM(CASE WHEN win_condition = 'all_words_found' THEN 1 ELSE 0 END) as win_all_words,
         SUM(CASE WHEN win_condition = 'assassin' THEN 1 ELSE 0 END) as win_assassin,
         SUM(CASE WHEN win_condition = 'turn_limit' THEN 1 ELSE 0 END) as win_turn_limit,
         SUM(CASE WHEN winner = 'red' THEN 1 ELSE 0 END) as red_wins,
         SUM(CASE WHEN winner = 'blue' THEN 1 ELSE 0 END) as blue_wins
       FROM games
       WHERE status = 'completed'`
    )
    .get() as Record<string, unknown>;

  const modelCount = db
    .prepare("SELECT COUNT(*) as count FROM models")
    .get() as { count: number };

  return {
    totalGames: (gameStats.total_games as number) ?? 0,
    totalModels: modelCount.count,
    avgTurns: (gameStats.avg_turns as number) ?? 0,
    totalCost: (gameStats.total_cost as number) ?? 0,
    winByAllWords: (gameStats.win_all_words as number) ?? 0,
    winByAssassin: (gameStats.win_assassin as number) ?? 0,
    winByTurnLimit: (gameStats.win_turn_limit as number) ?? 0,
    redWins: (gameStats.red_wins as number) ?? 0,
    blueWins: (gameStats.blue_wins as number) ?? 0,
  };
}

// ─── Insights ────────────────────────────────────────────────────────────────

const EMPTY_INSIGHTS: InsightsData = {
  firstClueAmbition: [],
  turnsToWin: [],
  redBlueWinRate: [],
  assassinRate: [],
  clueSizeDistribution: [],
  guessAccuracy: [],
  comebackRate: [],
  operativeObedience: [],
};

export function getInsightsData(): InsightsData {
  const db = getDb();
  if (!db) return EMPTY_INSIGHTS;

  // Helper: model display info keyed by model_id
  const modelRows = db
    .prepare("SELECT model_id, display_name, solo_rating FROM models")
    .all() as { model_id: string; display_name: string; solo_rating: number }[];
  const modelMap = new Map(modelRows.map((m) => [m.model_id, m]));

  function modelInfo(id: string) {
    const m = modelMap.get(id);
    return {
      model_id: id,
      display_name: m ? deriveDisplayName(m) : id,
      solo_rating: m?.solo_rating ?? 1500,
    };
  }

  // 1. First Clue Ambition — avg clue_count on turn 1
  const firstClueRows = db
    .prepare(
      `SELECT sm_model as model_id, AVG(clue_count) as avg_cc, COUNT(*) as games
       FROM turns
       WHERE turn_number = 1 AND clue_count IS NOT NULL AND sm_model IS NOT NULL
       GROUP BY sm_model
       HAVING games >= 3`
    )
    .all() as { model_id: string; avg_cc: number; games: number }[];

  const firstClueAmbition: FirstClueAmbition[] = firstClueRows.map((r) => ({
    ...modelInfo(r.model_id),
    avg_first_clue_count: r.avg_cc,
    games: r.games,
  }));

  // 2. Turns to Win — avg total_turns for games won, per model (solo mode: sm = op)
  const turnsToWinRows = db
    .prepare(
      `SELECT model_id, AVG(total_turns) as avg_turns, COUNT(*) as wins
       FROM (
         SELECT red_sm_model as model_id, total_turns
         FROM games WHERE status = 'completed' AND winner = 'red'
         UNION ALL
         SELECT blue_sm_model as model_id, total_turns
         FROM games WHERE status = 'completed' AND winner = 'blue'
       )
       GROUP BY model_id
       HAVING wins >= 3`
    )
    .all() as { model_id: string; avg_turns: number; wins: number }[];

  const turnsToWin: TurnsToWin[] = turnsToWinRows.map((r) => ({
    ...modelInfo(r.model_id),
    avg_turns_to_win: r.avg_turns,
    wins: r.wins,
  }));

  // 3. Red vs Blue Win Rate
  const redBlueRows = db
    .prepare(
      `SELECT model_id,
              SUM(CASE WHEN team = 'red' THEN 1 ELSE 0 END) as red_games,
              SUM(CASE WHEN team = 'red' AND won = 1 THEN 1 ELSE 0 END) as red_wins,
              SUM(CASE WHEN team = 'blue' THEN 1 ELSE 0 END) as blue_games,
              SUM(CASE WHEN team = 'blue' AND won = 1 THEN 1 ELSE 0 END) as blue_wins
       FROM (
         SELECT red_sm_model as model_id, 'red' as team,
                CASE WHEN winner = 'red' THEN 1 ELSE 0 END as won
         FROM games WHERE status = 'completed'
         UNION ALL
         SELECT blue_sm_model as model_id, 'blue' as team,
                CASE WHEN winner = 'blue' THEN 1 ELSE 0 END as won
         FROM games WHERE status = 'completed'
       )
       GROUP BY model_id
       HAVING red_games >= 2 AND blue_games >= 2`
    )
    .all() as {
    model_id: string;
    red_games: number;
    red_wins: number;
    blue_games: number;
    blue_wins: number;
  }[];

  const redBlueWinRate: RedBlueWinRate[] = redBlueRows.map((r) => ({
    ...modelInfo(r.model_id),
    red_win_rate: r.red_games > 0 ? r.red_wins / r.red_games : 0,
    red_games: r.red_games,
    blue_win_rate: r.blue_games > 0 ? r.blue_wins / r.blue_games : 0,
    blue_games: r.blue_games,
  }));

  // 4. Assassin Discipline — rate of assassin deaths per model (as operative)
  const assassinRows = db
    .prepare(
      `SELECT model_id,
              SUM(CASE WHEN win_condition = 'assassin' THEN 1 ELSE 0 END) as assassin_deaths,
              COUNT(*) as total_games
       FROM (
         SELECT red_sm_model as model_id, win_condition
         FROM games WHERE status = 'completed' AND winner = 'blue'
         UNION ALL
         SELECT blue_sm_model as model_id, win_condition
         FROM games WHERE status = 'completed' AND winner = 'red'
       )
       GROUP BY model_id
       HAVING total_games >= 3`
    )
    .all() as { model_id: string; assassin_deaths: number; total_games: number }[];

  const assassinRate: AssassinRate[] = assassinRows.map((r) => ({
    ...modelInfo(r.model_id),
    assassin_deaths: r.assassin_deaths,
    total_games: r.total_games,
    assassin_rate: r.total_games > 0 ? r.assassin_deaths / r.total_games : 0,
  }));

  // 5. Clue Size Distribution — histogram of clue_count per model
  const clueSizeRows = db
    .prepare(
      `SELECT sm_model as model_id,
              MIN(clue_count, 5) as size,
              COUNT(*) as cnt
       FROM turns
       WHERE sm_model IS NOT NULL AND clue_count IS NOT NULL
       GROUP BY sm_model, size`
    )
    .all() as { model_id: string; size: number; cnt: number }[];

  // Group by model
  const clueSizeMap = new Map<string, { size: number; count: number }[]>();
  for (const r of clueSizeRows) {
    if (!clueSizeMap.has(r.model_id)) clueSizeMap.set(r.model_id, []);
    clueSizeMap.get(r.model_id)!.push({ size: r.size, count: r.cnt });
  }

  const clueSizeDistribution: ClueSizeDistribution[] = [];
  for (const [model_id, dist] of clueSizeMap) {
    const total = dist.reduce((sum, d) => sum + d.count, 0);
    if (total < 5) continue;
    clueSizeDistribution.push({
      ...modelInfo(model_id),
      distribution: dist
        .map((d) => ({ ...d, pct: d.count / total }))
        .sort((a, b) => a.size - b.size),
      total_clues: total,
    });
  }

  // 6. Guess Accuracy — % of correct guesses per model (as operative)
  const guessRows = db
    .prepare(
      `SELECT op_model as model_id, guesses_json
       FROM turns
       WHERE op_model IS NOT NULL AND guesses_json IS NOT NULL`
    )
    .all() as { model_id: string; guesses_json: string }[];

  const accMap = new Map<string, { correct: number; total: number }>();
  for (const r of guessRows) {
    if (!accMap.has(r.model_id)) accMap.set(r.model_id, { correct: 0, total: 0 });
    const acc = accMap.get(r.model_id)!;
    try {
      const guesses = JSON.parse(r.guesses_json) as { result: string }[];
      for (const g of guesses) {
        acc.total++;
        if (g.result === "CORRECT" || g.result === "HIT") acc.correct++;
      }
    } catch {
      // skip malformed
    }
  }

  const guessAccuracy: GuessAccuracy[] = [];
  for (const [model_id, acc] of accMap) {
    if (acc.total < 10) continue;
    guessAccuracy.push({
      ...modelInfo(model_id),
      correct_guesses: acc.correct,
      total_guesses: acc.total,
      accuracy: acc.correct / acc.total,
    });
  }

  // 7. Comeback Rate — when behind at any point mid-game, how often do they win?
  // "Behind" = playing as the non-starting team (started with 8 cards, going second)
  const comebackRows = db
    .prepare(
      `SELECT model_id,
              SUM(won) as comebacks,
              COUNT(*) as games_behind
       FROM (
         SELECT red_sm_model as model_id,
                CASE WHEN winner = 'red' THEN 1 ELSE 0 END as won
         FROM games g
         JOIN boards b ON g.board_id = b.board_id
         WHERE g.status = 'completed' AND b.starting_team = 'blue'
         UNION ALL
         SELECT blue_sm_model as model_id,
                CASE WHEN winner = 'blue' THEN 1 ELSE 0 END as won
         FROM games g
         JOIN boards b ON g.board_id = b.board_id
         WHERE g.status = 'completed' AND b.starting_team = 'red'
       )
       GROUP BY model_id
       HAVING games_behind >= 3`
    )
    .all() as { model_id: string; comebacks: number; games_behind: number }[];

  const comebackRate: ComebackRate[] = comebackRows.map((r) => ({
    ...modelInfo(r.model_id),
    comebacks: r.comebacks,
    games_behind: r.games_behind,
    comeback_rate: r.games_behind > 0 ? r.comebacks / r.games_behind : 0,
  }));

  // 8. Operative Obedience — avg guesses used vs max allowed (clue_count + 1)
  const obedienceRows = db
    .prepare(
      `SELECT op_model as model_id, guesses_json, clue_count
       FROM turns
       WHERE op_model IS NOT NULL AND guesses_json IS NOT NULL AND clue_count IS NOT NULL`
    )
    .all() as { model_id: string; guesses_json: string; clue_count: number }[];

  const obMap = new Map<string, { guesses_sum: number; max_sum: number; count: number }>();
  for (const r of obedienceRows) {
    if (!obMap.has(r.model_id)) obMap.set(r.model_id, { guesses_sum: 0, max_sum: 0, count: 0 });
    const ob = obMap.get(r.model_id)!;
    try {
      const guesses = JSON.parse(r.guesses_json) as unknown[];
      ob.guesses_sum += guesses.length;
      ob.max_sum += r.clue_count + 1;
      ob.count++;
    } catch {
      // skip
    }
  }

  const operativeObedience: OperativeObedience[] = [];
  for (const [model_id, ob] of obMap) {
    if (ob.count < 5) continue;
    const avgUsed = ob.guesses_sum / ob.count;
    const avgMax = ob.max_sum / ob.count;
    operativeObedience.push({
      ...modelInfo(model_id),
      avg_guesses_used: avgUsed,
      avg_max_guesses: avgMax,
      usage_ratio: avgMax > 0 ? avgUsed / avgMax : 0,
    });
  }

  const isVisible = (m: { model_id: string }) => !HIDDEN_MODELS.includes(m.model_id);

  return {
    firstClueAmbition: firstClueAmbition.filter(isVisible),
    turnsToWin: turnsToWin.filter(isVisible),
    redBlueWinRate: redBlueWinRate.filter(isVisible),
    assassinRate: assassinRate.filter(isVisible),
    clueSizeDistribution: clueSizeDistribution.filter(isVisible),
    guessAccuracy: guessAccuracy.filter(isVisible),
    comebackRate: comebackRate.filter(isVisible),
    operativeObedience: operativeObedience.filter(isVisible),
  };
}

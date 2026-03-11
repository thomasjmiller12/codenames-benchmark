import { getDb } from "./db";
import type { Row } from "@libsql/client";
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

function col(row: Row, key: string): unknown {
  return row[key];
}

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

export async function getModels(): Promise<Model[]> {
  const db = getDb();

  const [modelsRes, gameStatsRes, latencyRes, assassinRes, pairStatsRes] = await Promise.all([
    db.execute("SELECT * FROM models ORDER BY solo_rating DESC"),
    // All games: wins, games, red/blue, cost, tokens
    db.execute(
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
    ),
    db.execute(
      `SELECT model_id, AVG(latency_ms) as avg_latency_ms
       FROM (
         SELECT sm_model as model_id, sm_latency_ms as latency_ms
         FROM turns WHERE sm_model IS NOT NULL AND sm_latency_ms IS NOT NULL
         UNION ALL
         SELECT op_model as model_id, op_latency_ms as latency_ms
         FROM turns WHERE op_model IS NOT NULL AND op_latency_ms IS NOT NULL
       )
       GROUP BY model_id`
    ),
    db.execute(
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
    ),
    // Pair-level stats: sweeps (2-0), splits (1-1), losses (0-2) per model
    // pair_id resets per experiment, so the unique pair key is (experiment_id, pair_id)
    db.execute(
      `SELECT model_id,
              SUM(CASE WHEN wins = 2 THEN 1 ELSE 0 END) as pair_sweeps,
              SUM(CASE WHEN wins = 1 AND losses = 1 THEN 1 ELSE 0 END) as pair_splits,
              SUM(CASE WHEN losses = 2 THEN 1 ELSE 0 END) as pair_losses
       FROM (
         SELECT model_id, experiment_id, pair_id, SUM(won) as wins, SUM(1 - won) as losses
         FROM (
           SELECT red_sm_model as model_id, experiment_id, pair_id,
                  CASE WHEN winner = 'red' THEN 1 ELSE 0 END as won
           FROM games
           WHERE status = 'completed' AND pair_id IS NOT NULL
             AND (experiment_id, pair_id) IN (
               SELECT experiment_id, pair_id FROM games
               WHERE status = 'completed' AND pair_id IS NOT NULL
               GROUP BY experiment_id, pair_id HAVING COUNT(*) = 2
             )
           UNION ALL
           SELECT blue_sm_model as model_id, experiment_id, pair_id,
                  CASE WHEN winner = 'blue' THEN 1 ELSE 0 END as won
           FROM games
           WHERE status = 'completed' AND pair_id IS NOT NULL
             AND (experiment_id, pair_id) IN (
               SELECT experiment_id, pair_id FROM games
               WHERE status = 'completed' AND pair_id IS NOT NULL
               GROUP BY experiment_id, pair_id HAVING COUNT(*) = 2
             )
         )
         GROUP BY model_id, experiment_id, pair_id
       )
       GROUP BY model_id`
    ),
  ]);

  const rows = modelsRes.rows;
  const statsMap = new Map(gameStatsRes.rows.map((r) => [col(r, "model_id") as string, r]));
  const latencyMap = new Map(latencyRes.rows.map((r) => [col(r, "model_id") as string, r]));
  const assassinMap = new Map(assassinRes.rows.map((r) => [col(r, "model_id") as string, r]));
  const pairMap = new Map(pairStatsRes.rows.map((r) => [col(r, "model_id") as string, r]));

  const visibleRows = rows.filter((row) => !HIDDEN_MODELS.includes(col(row, "model_id") as string));

  return visibleRows.map((row) => {
    const gs = statsMap.get(col(row, "model_id") as string);
    const ls = latencyMap.get(col(row, "model_id") as string);
    const as_ = assassinMap.get(col(row, "model_id") as string);
    const pr = pairMap.get(col(row, "model_id") as string);
    const soloGames = (gs ? col(gs, "solo_games") as number : null) ?? (col(row, "solo_games_played") as number) ?? 0;
    const spymasterGames = (gs ? col(gs, "spymaster_games") as number : null) ?? (col(row, "spymaster_games") as number) ?? 0;
    const operativeGames = (gs ? col(gs, "operative_games") as number : null) ?? (col(row, "operative_games") as number) ?? 0;
    const totalGames = soloGames + spymasterGames + operativeGames;
    const totalCost = (gs ? col(gs, "total_cost") as number : null) ?? 0;

    return {
      model_id: col(row, "model_id") as string,
      display_name: deriveDisplayName({ display_name: col(row, "display_name") as string, model_id: col(row, "model_id") as string }),
      provider: deriveProvider(col(row, "model_id") as string),
      solo_rating: col(row, "solo_rating") as number,
      solo_games: soloGames,
      solo_ci_lower: (col(row, "solo_ci_lower") as number) ?? 1500,
      solo_ci_upper: (col(row, "solo_ci_upper") as number) ?? 1500,
      spymaster_rating: col(row, "spymaster_rating") as number,
      spymaster_games: spymasterGames,
      spymaster_ci_lower: (col(row, "spymaster_ci_lower") as number) ?? 1500,
      spymaster_ci_upper: (col(row, "spymaster_ci_upper") as number) ?? 1500,
      operative_rating: col(row, "operative_rating") as number,
      operative_games: operativeGames,
      operative_ci_lower: (col(row, "operative_ci_lower") as number) ?? 1500,
      operative_ci_upper: (col(row, "operative_ci_upper") as number) ?? 1500,
      solo_wins: (gs ? col(gs, "solo_wins") as number : null) ?? 0,
      spymaster_wins: (gs ? col(gs, "spymaster_wins") as number : null) ?? 0,
      operative_wins: (gs ? col(gs, "operative_wins") as number : null) ?? 0,
      red_wins: (gs ? col(gs, "red_wins") as number : null) ?? 0,
      red_games: (gs ? col(gs, "red_games") as number : null) ?? 0,
      blue_wins: (gs ? col(gs, "blue_wins") as number : null) ?? 0,
      blue_games: (gs ? col(gs, "blue_games") as number : null) ?? 0,
      assassin_wins: (as_ ? col(as_, "assassin_wins") as number : null) ?? 0,
      assassin_losses: (as_ ? col(as_, "assassin_losses") as number : null) ?? 0,
      pair_sweeps: (pr ? col(pr, "pair_sweeps") as number : null) ?? 0,
      pair_splits: (pr ? col(pr, "pair_splits") as number : null) ?? 0,
      pair_losses: (pr ? col(pr, "pair_losses") as number : null) ?? 0,
      total_cost_usd: totalCost,
      avg_cost_per_game: totalGames > 0 ? totalCost / totalGames : 0,
      avg_tokens_per_game: (gs ? col(gs, "avg_tokens") as number : null) ?? 0,
      avg_latency_ms: (ls ? col(ls, "avg_latency_ms") as number : null) ?? 0,
    };
  });
}

// ─── Games ──────────────────────────────────────────────────────────────────

export async function getGames(limit?: number): Promise<Game[]> {
  const db = getDb();

  const sql = `SELECT game_id, experiment_id, red_sm_model, red_op_model, blue_sm_model, blue_op_model,
            mode, winner, win_condition, total_turns, red_remaining, blue_remaining,
            total_input_tokens, total_output_tokens, total_cost_usd,
            board_id, pair_id,
            COALESCE(completed_at, started_at, created_at) as completed_at
     FROM games
     WHERE status = 'completed'
     ORDER BY COALESCE(completed_at, started_at, created_at) DESC
     ${limit ? `LIMIT ${limit}` : ""}`;

  const res = await db.execute(sql);

  return res.rows.map((row) => ({
    game_id: col(row, "game_id") as string,
    experiment_id: (col(row, "experiment_id") as string) ?? null,
    red_sm_model: col(row, "red_sm_model") as string,
    red_op_model: (col(row, "red_op_model") as string) ?? (col(row, "red_sm_model") as string),
    blue_sm_model: col(row, "blue_sm_model") as string,
    blue_op_model: (col(row, "blue_op_model") as string) ?? (col(row, "blue_sm_model") as string),
    mode: (col(row, "mode") as "solo" | "collab") ?? "solo",
    winner: col(row, "winner") as "red" | "blue" | null,
    win_condition: mapWinCondition(col(row, "win_condition") as string),
    total_turns: (col(row, "total_turns") as number) ?? 0,
    red_remaining: (col(row, "red_remaining") as number) ?? 0,
    blue_remaining: (col(row, "blue_remaining") as number) ?? 0,
    total_input_tokens: (col(row, "total_input_tokens") as number) ?? 0,
    total_output_tokens: (col(row, "total_output_tokens") as number) ?? 0,
    total_cost_usd: (col(row, "total_cost_usd") as number) ?? 0,
    completed_at: (col(row, "completed_at") as string) ?? "",
    board_id: (col(row, "board_id") as number) ?? null,
    pair_id: (col(row, "pair_id") as number) ?? null,
  }));
}

function mapWinCondition(wc: string): "all_words" | "assassin" | "turn_limit" {
  if (wc === "all_words_found") return "all_words";
  if (wc === "assassin") return "assassin";
  if (wc === "turn_limit") return "turn_limit";
  return "all_words";
}

// ─── Game Replay ────────────────────────────────────────────────────────────

export async function getGameReplay(gameId: string): Promise<GameReplay | null> {
  const db = getDb();

  const gameRes = await db.execute({
    sql: `SELECT g.*, b.words_json, b.key_card_json, b.starting_team
          FROM games g
          LEFT JOIN boards b ON g.board_id = b.board_id
          WHERE g.game_id = ?`,
    args: [gameId],
  });

  const game = gameRes.rows[0];
  if (!game) return null;

  // Find pair partner (pair_id is unique only within an experiment)
  const pairId = col(game, "pair_id") as number | null;
  const experimentId = col(game, "experiment_id") as string | null;
  let partnerGameId: string | null = null;
  if (pairId != null && experimentId != null) {
    const partnerRes = await db.execute({
      sql: `SELECT game_id FROM games WHERE experiment_id = ? AND pair_id = ? AND game_id != ? AND status = 'completed'`,
      args: [experimentId, pairId, gameId],
    });
    if (partnerRes.rows.length > 0) {
      partnerGameId = col(partnerRes.rows[0], "game_id") as string;
    }
  }

  const turnRes = await db.execute({
    sql: `SELECT turn_number, team, clue_word, clue_count, guesses_json
          FROM turns
          WHERE game_id = ?
          ORDER BY turn_number`,
    args: [gameId],
  });

  const turns: Turn[] = turnRes.rows.map((t) => ({
    turn_number: col(t, "turn_number") as number,
    team: col(t, "team") as "red" | "blue",
    clue_word: col(t, "clue_word") as string,
    clue_count: col(t, "clue_count") as number,
    guesses: parseGuesses(col(t, "guesses_json") as string),
  }));

  const wordsJson = col(game, "words_json") as string | null;
  const keyCardJson = col(game, "key_card_json") as string | null;

  if (!wordsJson || !keyCardJson) return null;

  const words = JSON.parse(wordsJson) as string[];
  const keyCard = JSON.parse(keyCardJson) as Record<string, CardType>;

  return {
    game_id: col(game, "game_id") as string,
    red_sm_model: col(game, "red_sm_model") as string,
    red_op_model: (col(game, "red_op_model") as string) ?? (col(game, "red_sm_model") as string),
    blue_sm_model: col(game, "blue_sm_model") as string,
    blue_op_model: (col(game, "blue_op_model") as string) ?? (col(game, "blue_sm_model") as string),
    winner: col(game, "winner") as "red" | "blue" | null,
    win_condition: mapWinCondition(col(game, "win_condition") as string),
    total_cost_usd: (col(game, "total_cost_usd") as number) ?? 0,
    total_turns: (col(game, "total_turns") as number) ?? 0,
    board: {
      words,
      key_card: keyCard,
      starting_team: (col(game, "starting_team") as "RED" | "BLUE") ?? "RED",
    },
    turns,
    pair_id: pairId,
    partner_game_id: partnerGameId,
  };
}

export async function getGamePair(pairId: number): Promise<GameReplay[]> {
  const db = getDb();

  const gamesRes = await db.execute({
    sql: `SELECT g.game_id FROM games g
          WHERE g.pair_id = ? AND g.status = 'completed'
          ORDER BY g.game_id`,
    args: [pairId],
  });

  const replays: GameReplay[] = [];
  for (const row of gamesRes.rows) {
    const replay = await getGameReplay(col(row, "game_id") as string);
    if (replay) replays.push(replay);
  }

  return replays;
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

export async function getRatingHistory(): Promise<RatingHistory[]> {
  const db = getDb();

  const res = await db.execute(
    `SELECT model_id, rating_type, rating_after as rating,
            ROW_NUMBER() OVER (PARTITION BY model_id, rating_type ORDER BY recorded_at) as game_number
     FROM ratings_history
     ORDER BY model_id, rating_type, recorded_at`
  );

  return res.rows.map((r) => ({
    model_id: col(r, "model_id") as string,
    game_number: col(r, "game_number") as number,
    rating: col(r, "rating") as number,
    rating_type: col(r, "rating_type") as "solo" | "spymaster" | "operative",
  }));
}

// ─── Aggregate Stats ────────────────────────────────────────────────────────

const EMPTY_STATS = {
  totalGames: 0,
  totalPairs: 0,
  totalModels: 0,
  avgTurns: 0,
  totalCost: 0,
  winByAllWords: 0,
  winByAssassin: 0,
  winByTurnLimit: 0,
  redWins: 0,
  blueWins: 0,
};

export async function getOverallStats() {
  const db = getDb();

  try {
    const [gameStatsRes, modelCountRes, pairCountRes] = await Promise.all([
      // All games for overview stats
      db.execute(
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
      ),
      db.execute("SELECT COUNT(*) as count FROM models"),
      db.execute(
        `SELECT COUNT(*) as count FROM (
           SELECT experiment_id, pair_id FROM games
           WHERE status = 'completed' AND pair_id IS NOT NULL
           GROUP BY experiment_id, pair_id HAVING COUNT(*) = 2
         )`
      ),
    ]);

    const gs = gameStatsRes.rows[0];
    const mc = modelCountRes.rows[0];
    const pc = pairCountRes.rows[0];

    return {
      totalGames: (col(gs, "total_games") as number) ?? 0,
      totalPairs: (col(pc, "count") as number) ?? 0,
      totalModels: (col(mc, "count") as number) ?? 0,
      avgTurns: (col(gs, "avg_turns") as number) ?? 0,
      totalCost: (col(gs, "total_cost") as number) ?? 0,
      winByAllWords: (col(gs, "win_all_words") as number) ?? 0,
      winByAssassin: (col(gs, "win_assassin") as number) ?? 0,
      winByTurnLimit: (col(gs, "win_turn_limit") as number) ?? 0,
      redWins: (col(gs, "red_wins") as number) ?? 0,
      blueWins: (col(gs, "blue_wins") as number) ?? 0,
    };
  } catch {
    return EMPTY_STATS;
  }
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

export async function getInsightsData(): Promise<InsightsData> {
  const db = getDb();

  try {
    // All insights use all games — behavioral analysis benefits from max data
    const [modelRowsRes, firstClueRes, turnsToWinRes, redBlueRes, assassinRes, clueSizeRes, guessRes, comebackRes, obedienceRes] = await Promise.all([
      db.execute("SELECT model_id, display_name, solo_rating FROM models"),
      db.execute(
        `SELECT sm_model as model_id, AVG(clue_count) as avg_cc, COUNT(*) as games
         FROM turns
         WHERE turn_number = 1 AND clue_count IS NOT NULL AND sm_model IS NOT NULL
         GROUP BY sm_model
         HAVING games >= 3`
      ),
      db.execute(
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
      ),
      db.execute(
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
      ),
      db.execute(
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
      ),
      db.execute(
        `SELECT sm_model as model_id,
                MIN(clue_count, 5) as size,
                COUNT(*) as cnt
         FROM turns
         WHERE sm_model IS NOT NULL AND clue_count IS NOT NULL
         GROUP BY sm_model, size`
      ),
      db.execute(
        `SELECT op_model as model_id, guesses_json
         FROM turns
         WHERE op_model IS NOT NULL AND guesses_json IS NOT NULL`
      ),
      db.execute(
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
      ),
      db.execute(
        `SELECT op_model as model_id, guesses_json, clue_count
         FROM turns
         WHERE op_model IS NOT NULL AND guesses_json IS NOT NULL AND clue_count IS NOT NULL`
      ),
    ]);

    const modelMap = new Map(modelRowsRes.rows.map((m) => [col(m, "model_id") as string, m]));

    function modelInfo(id: string) {
      const m = modelMap.get(id);
      return {
        model_id: id,
        display_name: m ? deriveDisplayName({ display_name: col(m, "display_name") as string, model_id: col(m, "model_id") as string }) : id,
        solo_rating: m ? (col(m, "solo_rating") as number) ?? 1500 : 1500,
      };
    }

    // 1. First Clue Ambition
    const firstClueAmbition: FirstClueAmbition[] = firstClueRes.rows.map((r) => ({
      ...modelInfo(col(r, "model_id") as string),
      avg_first_clue_count: col(r, "avg_cc") as number,
      games: col(r, "games") as number,
    }));

    // 2. Turns to Win
    const turnsToWin: TurnsToWin[] = turnsToWinRes.rows.map((r) => ({
      ...modelInfo(col(r, "model_id") as string),
      avg_turns_to_win: col(r, "avg_turns") as number,
      wins: col(r, "wins") as number,
    }));

    // 3. Red vs Blue Win Rate
    const redBlueWinRate: RedBlueWinRate[] = redBlueRes.rows.map((r) => {
      const rg = col(r, "red_games") as number;
      const bg = col(r, "blue_games") as number;
      return {
        ...modelInfo(col(r, "model_id") as string),
        red_win_rate: rg > 0 ? (col(r, "red_wins") as number) / rg : 0,
        red_games: rg,
        blue_win_rate: bg > 0 ? (col(r, "blue_wins") as number) / bg : 0,
        blue_games: bg,
      };
    });

    // 4. Assassin Discipline
    const assassinRate: AssassinRate[] = assassinRes.rows.map((r) => {
      const tg = col(r, "total_games") as number;
      return {
        ...modelInfo(col(r, "model_id") as string),
        assassin_deaths: col(r, "assassin_deaths") as number,
        total_games: tg,
        assassin_rate: tg > 0 ? (col(r, "assassin_deaths") as number) / tg : 0,
      };
    });

    // 5. Clue Size Distribution
    const clueSizeMap = new Map<string, { size: number; count: number }[]>();
    for (const r of clueSizeRes.rows) {
      const mid = col(r, "model_id") as string;
      if (!clueSizeMap.has(mid)) clueSizeMap.set(mid, []);
      clueSizeMap.get(mid)!.push({ size: col(r, "size") as number, count: col(r, "cnt") as number });
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

    // 6. Guess Accuracy
    const accMap = new Map<string, { correct: number; total: number }>();
    for (const r of guessRes.rows) {
      const mid = col(r, "model_id") as string;
      if (!accMap.has(mid)) accMap.set(mid, { correct: 0, total: 0 });
      const acc = accMap.get(mid)!;
      try {
        const guesses = JSON.parse(col(r, "guesses_json") as string) as { result: string }[];
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

    // 7. Comeback Rate
    const comebackRate: ComebackRate[] = comebackRes.rows.map((r) => {
      const gb = col(r, "games_behind") as number;
      return {
        ...modelInfo(col(r, "model_id") as string),
        comebacks: col(r, "comebacks") as number,
        games_behind: gb,
        comeback_rate: gb > 0 ? (col(r, "comebacks") as number) / gb : 0,
      };
    });

    // 8. Operative Obedience
    const obMap = new Map<string, { guesses_sum: number; max_sum: number; count: number }>();
    for (const r of obedienceRes.rows) {
      const mid = col(r, "model_id") as string;
      if (!obMap.has(mid)) obMap.set(mid, { guesses_sum: 0, max_sum: 0, count: 0 });
      const ob = obMap.get(mid)!;
      try {
        const guesses = JSON.parse(col(r, "guesses_json") as string) as unknown[];
        ob.guesses_sum += guesses.length;
        ob.max_sum += (col(r, "clue_count") as number) + 1;
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
  } catch {
    return EMPTY_INSIGHTS;
  }
}

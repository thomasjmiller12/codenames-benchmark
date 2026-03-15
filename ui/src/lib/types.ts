export interface Model {
  model_id: string;
  display_name: string;
  provider: string;
  solo_rating: number;
  solo_games: number;
  solo_ci_lower: number;
  solo_ci_upper: number;
  spymaster_rating: number;
  spymaster_games: number;
  spymaster_ci_lower: number;
  spymaster_ci_upper: number;
  operative_rating: number;
  operative_games: number;
  operative_ci_lower: number;
  operative_ci_upper: number;
  solo_wins: number;
  spymaster_wins: number;
  operative_wins: number;
  red_wins: number;
  red_games: number;
  blue_wins: number;
  blue_games: number;
  assassin_wins: number;
  assassin_losses: number;
  pair_sweeps: number;
  pair_splits: number;
  pair_losses: number;
  total_cost_usd: number;
  avg_cost_per_game: number;
  avg_tokens_per_game: number;
  avg_tokens_per_turn: number;
  avg_latency_ms: number;
}

export interface BTRating {
  model_id: string;
  rating: number;
  ci_lower: number;
  ci_upper: number;
}

export interface Game {
  game_id: string;
  experiment_id: string | null;
  red_sm_model: string;
  red_op_model: string;
  blue_sm_model: string;
  blue_op_model: string;
  mode: "solo" | "collab";
  winner: "red" | "blue" | null;
  win_condition: "all_words" | "assassin" | "turn_limit";
  total_turns: number;
  red_remaining: number;
  blue_remaining: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  completed_at: string;
  board_id: number | null;
  pair_id: number | null;
}

export interface Guess {
  word: string;
  result: "CORRECT" | "WRONG_TEAM" | "NEUTRAL" | "ASSASSIN";
}

export interface Turn {
  turn_number: number;
  team: "red" | "blue";
  clue_word: string;
  clue_count: number;
  guesses: Guess[];
}

export type CardType = "RED" | "BLUE" | "NEUTRAL" | "ASSASSIN";

export interface BoardState {
  words: string[];
  key_card: Record<string, CardType>;
  starting_team: "RED" | "BLUE";
}

export interface GameReplay {
  game_id: string;
  red_sm_model: string;
  red_op_model: string;
  blue_sm_model: string;
  blue_op_model: string;
  winner: "red" | "blue" | null;
  win_condition: "all_words" | "assassin" | "turn_limit";
  total_cost_usd: number;
  total_turns: number;
  board: BoardState;
  turns: Turn[];
  pair_id: number | null;
  partner_game_id: string | null;
}

export interface PairResult {
  pair_id: number;
  model_a: string;
  model_b: string;
  a_wins: number;
  b_wins: number;
  label: string; // "2-0", "1-1", "0-2"
}

export interface RatingHistory {
  model_id: string;
  game_number: number;
  rating: number;
  rating_type: "solo" | "spymaster" | "operative";
}

export type RatingType = "solo" | "spymaster" | "operative";

// ─── Insights ────────────────────────────────────────────────────────────────

export interface ModelInsight {
  model_id: string;
  display_name: string;
  solo_rating: number;
}

export interface FirstClueAmbition extends ModelInsight {
  avg_first_clue_count: number;
  games: number;
}

export interface TurnsToWin extends ModelInsight {
  avg_turns_to_win: number;
  wins: number;
}

export interface RedBlueWinRate extends ModelInsight {
  red_win_rate: number;
  red_games: number;
  blue_win_rate: number;
  blue_games: number;
}

export interface AssassinRate extends ModelInsight {
  assassin_deaths: number;
  total_games: number;
  assassin_rate: number;
}

export interface ClueSizeDistribution extends ModelInsight {
  distribution: { size: number; count: number; pct: number }[];
  total_clues: number;
}

export interface GuessAccuracy extends ModelInsight {
  correct_guesses: number;
  total_guesses: number;
  accuracy: number;
}

export interface ComebackRate extends ModelInsight {
  comebacks: number;
  games_behind: number;
  comeback_rate: number;
}

export interface OperativeObedience extends ModelInsight {
  avg_guesses_used: number;
  avg_max_guesses: number;
  usage_ratio: number;
}

export interface TokensPerTurn extends ModelInsight {
  avg_tokens_per_turn: number;
  total_turns: number;
}

export interface TokensPerGame extends ModelInsight {
  avg_tokens_per_game: number;
  total_games: number;
}

export interface InsightsData {
  firstClueAmbition: FirstClueAmbition[];
  turnsToWin: TurnsToWin[];
  redBlueWinRate: RedBlueWinRate[];
  assassinRate: AssassinRate[];
  clueSizeDistribution: ClueSizeDistribution[];
  guessAccuracy: GuessAccuracy[];
  comebackRate: ComebackRate[];
  operativeObedience: OperativeObedience[];
  tokensPerTurn: TokensPerTurn[];
  tokensPerGame: TokensPerGame[];
}

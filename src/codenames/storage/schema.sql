-- Codenames LLM Benchmark: SQLite Schema
-- All tables use IF NOT EXISTS for idempotent initialization.

CREATE TABLE IF NOT EXISTS models (
    model_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    openrouter_id TEXT NOT NULL,
    cost_per_m_input_tokens REAL,
    cost_per_m_output_tokens REAL,
    solo_rating REAL DEFAULT 1500.0,
    solo_games_played INTEGER DEFAULT 0,
    solo_ci_lower REAL DEFAULT 1500.0,
    solo_ci_upper REAL DEFAULT 1500.0,
    spymaster_rating REAL DEFAULT 1500.0,
    spymaster_games INTEGER DEFAULT 0,
    spymaster_ci_lower REAL DEFAULT 1500.0,
    spymaster_ci_upper REAL DEFAULT 1500.0,
    operative_rating REAL DEFAULT 1500.0,
    operative_games INTEGER DEFAULT 0,
    operative_ci_lower REAL DEFAULT 1500.0,
    operative_ci_upper REAL DEFAULT 1500.0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS experiments (
    experiment_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('solo', 'collab', 'mixed')),
    config_json TEXT NOT NULL,
    status TEXT DEFAULT 'created' CHECK(status IN ('created', 'running', 'paused', 'completed', 'failed')),
    total_games_planned INTEGER DEFAULT 0,
    total_games_completed INTEGER DEFAULT 0,
    total_games_errored INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0.0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
    board_id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed INTEGER NOT NULL UNIQUE,
    words_json TEXT NOT NULL,
    key_card_json TEXT NOT NULL,
    starting_team TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY,
    experiment_id TEXT REFERENCES experiments(experiment_id),
    board_id INTEGER REFERENCES boards(board_id),
    red_sm_model TEXT NOT NULL,
    red_op_model TEXT NOT NULL,
    blue_sm_model TEXT NOT NULL,
    blue_op_model TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('solo', 'collab')),
    winner TEXT CHECK(winner IN ('red', 'blue')),
    win_condition TEXT CHECK(win_condition IN ('all_words_found', 'assassin', 'turn_limit', 'error')),
    total_turns INTEGER,
    red_remaining INTEGER,
    blue_remaining INTEGER,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0.0,
    duration_ms INTEGER,
    board_seed INTEGER,
    pair_id INTEGER,
    game_log_json TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS turns (
    turn_id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(game_id),
    turn_number INTEGER NOT NULL,
    team TEXT NOT NULL CHECK(team IN ('red', 'blue')),
    clue_word TEXT,
    clue_count INTEGER,
    sm_model TEXT,
    sm_input_tokens INTEGER DEFAULT 0,
    sm_output_tokens INTEGER DEFAULT 0,
    sm_latency_ms INTEGER,
    guesses_json TEXT,
    op_model TEXT,
    op_input_tokens INTEGER DEFAULT 0,
    op_output_tokens INTEGER DEFAULT 0,
    op_latency_ms INTEGER,
    board_state_json TEXT,
    red_remaining INTEGER,
    blue_remaining INTEGER,
    clue_valid BOOLEAN DEFAULT 1,
    violation_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_games_experiment ON games(experiment_id);
CREATE INDEX IF NOT EXISTS idx_turns_game ON turns(game_id);

-- Indexes for UI query performance
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_red_sm ON games(red_sm_model);
CREATE INDEX IF NOT EXISTS idx_games_blue_sm ON games(blue_sm_model);
CREATE INDEX IF NOT EXISTS idx_games_board ON games(board_id);
CREATE INDEX IF NOT EXISTS idx_games_pair ON games(experiment_id, pair_id);
CREATE INDEX IF NOT EXISTS idx_turns_sm_model ON turns(sm_model);
CREATE INDEX IF NOT EXISTS idx_turns_op_model ON turns(op_model);

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM benchmark suite where AI agents compete in the board game Codenames. Models are evaluated by playing as spymaster (giving clues) and operative (guessing words), with Bradley-Terry (Davidson tie extension) ratings and bootstrap confidence intervals tracking performance across tournaments.

## Commands

### Python Setup
```bash
pip install -e ".[dev]"   # Install package + dev dependencies (editable)
```

### CLI (entry point: `codenames`)
```bash
codenames play --red-model <model> --blue-model <model>   # Single game
codenames benchmark --models "model-a,model-b" --games-per-matchup 2  # Tournament
codenames compute-ratings               # Recompute BT ratings from all games
codenames leaderboard --mode solo        # View ratings
codenames stats <model>                  # Model statistics
codenames replay <game_id>              # Replay a game turn-by-turn
codenames costs                          # Cost report
make ratings                             # Shortcut for compute-ratings
```

### Tests
```bash
pytest                        # Run all tests
pytest tests/test_engine.py   # Run a single test file
pytest -k "test_name"         # Run a specific test by name
```
pytest-asyncio is configured with `asyncio_mode = "auto"` — no `@pytest.mark.asyncio` needed.

### UI (Next.js in `ui/`)
```bash
cd ui && npm run dev          # Start dev server on localhost:3000
```

## Architecture

### Game Engine (`src/codenames/engine/`)
Strict state machine: `NOT_STARTED → GIVING_CLUE → GUESSING → TURN_ENDED → GAME_OVER`. The `Game` class enforces phase transitions — calling methods out of order raises errors. Board is a 5×5 grid (9/8/7/1 card distribution for starting/opponent/neutral/assassin). `ClueValidator` enforces Codenames rules (single word, not a board word, no morphological variants).

### Agent System (`src/codenames/agents/`)
- **Base classes** (`base.py`): `SpymasterAgent` and `OperativeAgent` are abstract with async methods
- **LLM agents** (`llm_agent.py`): Use OpenRouter via `LLMClient` with instructor for structured output. Spymasters get violation feedback for retry prompting
- **Random agents** (`random_agent.py`): Baseline agents for testing
- **Prompts** (`prompts.py`): `PromptBuilder` constructs message lists from game state, loads system prompts from `prompts/` directory. Shuffles operative word list to avoid position bias

### LLM Integration (`src/codenames/llm/`)
`LLMClient` wraps AsyncOpenAI (pointed at OpenRouter) + instructor for structured JSON output. Per-model semaphore rate limiting. Response schemas (`ClueResponse`, `GuessResponse`) are Pydantic models that normalize to uppercase.

### Benchmark System (`src/codenames/benchmark/`)
- **Scheduler**: Generates round-robin or Swiss pairings. Games come in mirrored pairs (same board, swapped sides) for fairness
- **Runner**: Drives a single game through the state machine, handles clue retries (max 3), guess errors, and fallback forfeits
- **Tournament**: Orchestrates full experiments — parallel game execution via semaphores, cost tracking with budget limits. Ratings are computed after the tournament (not live)
- **Rating**: Davidson-extended Bradley-Terry MLE with bootstrap confidence intervals. Ties (1-1 pairs) are modeled explicitly via the Davidson θ parameter. Ratings are batch-computed from all games and expressed on the Elo scale (center=1500). Collab mode has separate SM/OP ratings via decomposed fitting

### Storage (`src/codenames/storage/`)
SQLite with WAL mode. `Database` manages connections and schema initialization. `Repository` provides high-level CRUD (models, boards, games, turns, ratings, experiments). Tables: `models` (with rating + CI columns), `experiments`, `boards`, `games`, `turns`.

### UI (`ui/`)
Next.js + React + TypeScript + Tailwind + shadcn/ui. Reads directly from the SQLite database via better-sqlite3 for leaderboards, game replays, and experiment results.

## Key Patterns

- **Deterministic seeds everywhere**: Board generation, scheduling, random agents — all seeded for reproducibility
- **Pair-based scoring**: Two mirrored games on the same board count as one scoring unit (2-0 = win, 1-1 = tie, 0-2 = loss). Ties are modeled in BT via Davidson extension
- **Async throughout**: Agent decisions are async; games run in parallel bounded by semaphores
- **Cost tracking**: Per-move token/cost aggregation, tournament-level budget limits
- **Metadata patching**: Move records are enriched with tokens, latency, and cost after agent decisions

## Git & GitHub

This is a **personal project** hosted on the `thomasjmiller12` GitHub account (not the work account `TMiller0112`).

- **Remote URL**: `git@github-personal:thomasjmiller12/codenames-benchmark.git` — the `github-personal` SSH host alias routes to the correct SSH key automatically
- **Git identity**: Auto-configured via `includeIf` in `~/.gitconfig` — commits in this repo use `thomasjmiller12@gmail.com`
- **`gh` CLI**: Before running `gh` commands (create PR, create repo, etc.), switch to the personal account:
  ```bash
  gh auth switch --user thomasjmiller12
  ```
  Switch back to work after: `gh auth switch --user TMiller0112`
- **Repo**: https://github.com/thomasjmiller12/codenames-benchmark (public)

## Environment

- `OPENROUTER_API_KEY` — required for LLM calls (loaded via python-dotenv)
- Database defaults to `codenames.db` in project root

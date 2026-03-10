"""Tournament runner that orchestrates a full Codenames benchmark.

Generates a schedule, runs games in parallel through the MatchRunner,
and persists results to the database. Ratings are computed separately
via Bradley-Terry batch fitting after the tournament completes.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from tqdm import tqdm

from ..agents.llm_agent import LLMOperative, LLMSpymaster
from ..agents.prompts import PromptBuilder
from ..engine.board import Board, WordPool
from ..engine.game import GameResult, MoveRecord
from ..engine.types import GameOutcome, Team
from ..llm.client import LLMClient
from ..storage.database import Database
from ..storage.repository import Repository
from .runner import MatchConfig, MatchRunner, TeamSetup
from .scheduler import ScheduledMatch, Scheduler

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class TournamentConfig:
    """Configuration for a full benchmark tournament.

    Attributes
    ----------
    models:
        Model IDs for solo mode.
    mode:
        Either ``"solo"`` or ``"collab"``.
    games_per_matchup:
        Number of games between each pair (must be even for side swaps).
    seed:
        Base seed for deterministic scheduling and board generation.
    collab_pairs:
        For collab mode: list of ``(spymaster_model, operative_model)`` pairs.
    budget_usd:
        Optional cost limit. The tournament stops if cumulative cost exceeds
        this value.
    max_concurrent:
        Maximum number of games to run in parallel.
    """

    models: list[str]
    mode: str = "solo"
    games_per_matchup: int = 6
    seed: int = 42
    collab_pairs: list[tuple[str, str]] | None = None
    budget_usd: float | None = None
    max_concurrent: int = 4
    model_pricing: dict[str, dict[str, float]] | None = None
    move_timeout: float | None = 120.0  # per-move timeout in seconds; None to disable


# ---------------------------------------------------------------------------
# Outcome mapping helpers
# ---------------------------------------------------------------------------

_OUTCOME_TO_WIN_CONDITION: dict[GameOutcome, str] = {
    GameOutcome.RED_WINS_ALL_WORDS: "all_words_found",
    GameOutcome.BLUE_WINS_ALL_WORDS: "all_words_found",
    GameOutcome.RED_WINS_ASSASSIN: "assassin",
    GameOutcome.BLUE_WINS_ASSASSIN: "assassin",
    GameOutcome.TURN_LIMIT: "turn_limit",
}


def _serialize_move_log(move_log: list[MoveRecord]) -> list[dict]:
    """Convert a list of MoveRecord objects to serialisable dicts."""
    records: list[dict] = []
    for m in move_log:
        d: dict = {
            "turn_number": m.turn_number,
            "team": m.team.value,
            "action_type": m.action_type,
        }
        if m.clue_word is not None:
            d["clue_word"] = m.clue_word
        if m.clue_count is not None:
            d["clue_count"] = m.clue_count
        if m.guess_word is not None:
            d["guess_word"] = m.guess_word
        if m.guess_result is not None:
            d["guess_result"] = m.guess_result.value
        if m.model_id is not None:
            d["model_id"] = m.model_id
        if m.latency_ms is not None:
            d["latency_ms"] = m.latency_ms
        if m.input_tokens is not None:
            d["input_tokens"] = m.input_tokens
        if m.output_tokens is not None:
            d["output_tokens"] = m.output_tokens
        if m.cost_usd is not None:
            d["cost_usd"] = m.cost_usd
        if m.generation_id is not None:
            d["generation_id"] = m.generation_id
        records.append(d)
    return records


# ---------------------------------------------------------------------------
# TournamentRunner
# ---------------------------------------------------------------------------

class TournamentRunner:
    """Orchestrates a full benchmark tournament with parallel execution.

    Creates an experiment, generates the schedule, runs games concurrently
    (bounded by ``max_concurrent``), and persists results. Ratings are
    computed separately after the tournament via Bradley-Terry batch fitting.
    """

    def __init__(
        self,
        config: TournamentConfig,
        llm_client: LLMClient,
        db: Database,
        word_pool: WordPool,
    ) -> None:
        self._config = config
        self._llm_client = llm_client
        self._db = db
        self._repo = Repository(db)
        self._word_pool = word_pool
        self._prompt_builder = PromptBuilder()
        self._model_pricing = config.model_pricing or {}
        self._total_cost = 0.0

        # Concurrency state (initialised per run)
        self._budget_exceeded = False
        self._pair_results: dict[int, list[tuple[ScheduledMatch, GameResult | None, str]]] = {}
        self._pair_lock = asyncio.Lock()
        self._error_count = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run(self, experiment_name: str) -> str:
        """Run a full tournament and return the experiment ID.

        Games are executed in parallel (up to ``max_concurrent``).
        Ratings are NOT updated here — they are computed via
        Bradley-Terry batch fitting after the tournament.
        """
        experiment_id = str(uuid.uuid4())

        # 1. Create experiment record
        config_snapshot = {
            "models": self._config.models,
            "mode": self._config.mode,
            "games_per_matchup": self._config.games_per_matchup,
            "seed": self._config.seed,
            "collab_pairs": self._config.collab_pairs,
            "budget_usd": self._config.budget_usd,
            "max_concurrent": self._config.max_concurrent,
        }

        self._repo.save_experiment({
            "experiment_id": experiment_id,
            "name": experiment_name,
            "mode": self._config.mode,
            "config_json": config_snapshot,
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
        })

        # 2. Register all models in the database
        all_model_ids = self._collect_model_ids()
        for model_id in all_model_ids:
            pricing = self._model_pricing.get(model_id, {})
            self._repo.save_model(
                model_id=model_id,
                display_name=model_id,
                openrouter_id=model_id,
                cost_input=pricing.get("cost_per_m_input_tokens"),
                cost_output=pricing.get("cost_per_m_output_tokens"),
            )

        # 3. Generate the schedule
        if self._config.mode == "solo":
            schedule = Scheduler.round_robin_solo(
                self._config.models,
                self._config.games_per_matchup,
                self._config.seed,
            )
        elif self._config.mode == "collab":
            if self._config.collab_pairs is None:
                raise ValueError(
                    "collab_pairs must be provided for collab mode"
                )
            schedule = Scheduler.round_robin_collab(
                self._config.collab_pairs,
                self._config.games_per_matchup,
                self._config.seed,
            )
        else:
            raise ValueError(f"Unknown mode: {self._config.mode!r}")

        # Shuffle schedule (seeded for reproducibility)
        rng = random.Random(self._config.seed)
        rng.shuffle(schedule)

        total_games = len(schedule)

        # Update experiment with total planned games
        self._repo.update_experiment(
            experiment_id,
            total_games_planned=total_games,
        )

        logger.info(
            "Tournament '%s' started: %d games scheduled (mode=%s, "
            "max_concurrent=%d, experiment=%s)",
            experiment_name,
            total_games,
            self._config.mode,
            self._config.max_concurrent,
            experiment_id,
        )

        # 4. Run games in parallel with tqdm progress
        self._budget_exceeded = False
        self._pair_results = {}
        self._error_count = 0
        completed_count = 0
        model_records: dict[str, list[int]] = {}  # model_id -> [wins, losses]
        sem = asyncio.Semaphore(self._config.max_concurrent)
        pbar = tqdm(
            total=total_games, desc="Games", unit="game", smoothing=0,
        )

        def _short_name(model_id: str) -> str:
            """Extract a compact display name from a model ID."""
            return model_id.rsplit("/", 1)[-1]

        def _update_records_for_pair(
            pair: list[tuple[ScheduledMatch, GameResult | None, str]],
        ) -> None:
            """Update win/loss records once a mirrored pair completes."""
            for match, result, _gid in pair:
                if result is None or result.winner is None:
                    continue
                if result.winner is Team.RED:
                    winners = {match.red_sm_model, match.red_op_model}
                    losers = {match.blue_sm_model, match.blue_op_model}
                else:
                    winners = {match.blue_sm_model, match.blue_op_model}
                    losers = {match.red_sm_model, match.red_op_model}
                for m in winners:
                    model_records.setdefault(m, [0, 0])[0] += 1
                for m in losers:
                    model_records.setdefault(m, [0, 0])[1] += 1

        def _records_postfix() -> str:
            """Show highest and lowest win-rate models so far."""
            if not model_records:
                return ""

            rates: list[tuple[str, float, int, int]] = []
            for mid, (w, l) in model_records.items():
                total = w + l
                if total > 0:
                    rates.append((mid, w / total, w, l))

            if not rates:
                return ""

            rates.sort(key=lambda x: x[1])
            worst = rates[0]
            best = rates[-1]

            parts = [
                f"Best: {_short_name(best[0])} {best[2]}W-{best[3]}L ({best[1]:.0%})",
                f"Worst: {_short_name(worst[0])} {worst[2]}W-{worst[3]}L ({worst[1]:.0%})",
            ]
            if self._error_count > 0:
                parts.append(f"{self._error_count}err")
            return " | ".join(parts)

        async def run_game_task(match: ScheduledMatch) -> GameResult | None:
            nonlocal completed_count

            if self._budget_exceeded:
                return None

            async with sem:
                if self._budget_exceeded:
                    return None

                result, game_id = await self._run_single_game(
                    match, experiment_id
                )

                if result is None:
                    return None

                completed_count += 1

                is_error = result.outcome is GameOutcome.ERROR
                if is_error:
                    self._error_count += 1

                pbar.update(1)

                if is_error:
                    logger.warning(
                        "Game %s ended with error (pair %d).",
                        game_id,
                        match.pair_id,
                    )

                # Update experiment progress
                self._repo.update_experiment(
                    experiment_id,
                    total_games_completed=completed_count,
                    total_cost_usd=self._total_cost,
                )

                # Track pair completion for W-L scoreboard
                pair_completed = await self._track_pair_completion(
                    match, result if not is_error else None, game_id,
                )

                if pair_completed is not None:
                    _update_records_for_pair(pair_completed)
                    pbar.set_postfix_str(_records_postfix())

                return result

        tasks = [run_game_task(match) for match in schedule]
        await asyncio.gather(*tasks)

        pbar.close()

        # 5. Mark experiment as completed
        self._repo.update_experiment(
            experiment_id,
            status="completed",
            total_games_completed=completed_count,
            total_games_errored=self._error_count,
            total_cost_usd=self._total_cost,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

        if self._error_count > 0:
            logger.warning(
                "Tournament '%s' completed: %d/%d games (%d errors), "
                "total cost $%.4f",
                experiment_name,
                completed_count,
                total_games,
                self._error_count,
                self._total_cost,
            )
        else:
            logger.info(
                "Tournament '%s' completed: %d/%d games, total cost $%.4f",
                experiment_name,
                completed_count,
                total_games,
                self._total_cost,
            )

        return experiment_id

    # ------------------------------------------------------------------
    # Single game execution
    # ------------------------------------------------------------------

    async def _run_single_game(
        self, match: ScheduledMatch, experiment_id: str
    ) -> tuple[GameResult, str] | tuple[None, str]:
        """Run one game and persist results.

        Returns ``(GameResult, game_id)`` on success, or ``(None, game_id)``
        if the budget was exceeded.
        """
        game_id = str(uuid.uuid4())

        # Deterministic RNG for this game
        rng = random.Random(match.board_seed)

        # Generate board
        words = self._word_pool.sample(n=25, rng=rng)
        starting_team = Team.RED
        board = Board(words=words, starting_team=starting_team, rng=rng)

        # Save board to DB (idempotent — mirrored pair shares the seed)
        board_id = self._repo.save_board(
            seed=match.board_seed,
            words=words,
            key_card={w: ct.value for w, ct in board.key_card.items()},
            starting_team=starting_team.value,
        )

        # Create agents for each team
        red_sm = LLMSpymaster(
            model_id=match.red_sm_model,
            team=Team.RED,
            llm_client=self._llm_client,
            prompt_builder=self._prompt_builder,
        )
        red_op = LLMOperative(
            model_id=match.red_op_model,
            team=Team.RED,
            llm_client=self._llm_client,
            prompt_builder=self._prompt_builder,
        )
        blue_sm = LLMSpymaster(
            model_id=match.blue_sm_model,
            team=Team.BLUE,
            llm_client=self._llm_client,
            prompt_builder=self._prompt_builder,
        )
        blue_op = LLMOperative(
            model_id=match.blue_op_model,
            team=Team.BLUE,
            llm_client=self._llm_client,
            prompt_builder=self._prompt_builder,
        )

        # Build match config and runner
        match_config = MatchConfig(
            red_team=TeamSetup(spymaster=red_sm, operative=red_op),
            blue_team=TeamSetup(spymaster=blue_sm, operative=blue_op),
            board=board,
            starting_team=starting_team,
            move_timeout=self._config.move_timeout,
        )
        runner = MatchRunner(match_config)

        try:
            result = await runner.run()
        except Exception:
            logger.exception(
                "Unhandled exception in game %s (pair %d). "
                "Marking as error.",
                game_id,
                match.pair_id,
            )
            result = GameResult(
                winner=None,
                outcome=GameOutcome.ERROR,
                total_turns=0,
                red_remaining=board.remaining_for(Team.RED),
                blue_remaining=board.remaining_for(Team.BLUE),
                move_log=[],
            )

        # Calculate cost for this game
        game_cost = self._calculate_game_cost(result, match)
        self._total_cost += game_cost

        # Check budget
        if (
            self._config.budget_usd is not None
            and self._total_cost > self._config.budget_usd
        ):
            self._budget_exceeded = True
            logger.warning(
                "Budget limit reached ($%.4f). No new games will start.",
                self._total_cost,
            )

        # Compute token totals from move log
        total_input_tokens = sum(
            m.input_tokens for m in result.move_log if m.input_tokens
        )
        total_output_tokens = sum(
            m.output_tokens for m in result.move_log if m.output_tokens
        )

        # Serialise game log
        game_log = {
            "move_log": _serialize_move_log(result.move_log),
            "board": {
                "words": words,
                "key_card": {w: ct.value for w, ct in board.key_card.items()},
                "starting_team": starting_team.value,
            },
        }

        # Map winner to DB format
        winner_str: str | None = None
        if result.winner is Team.RED:
            winner_str = "red"
        elif result.winner is Team.BLUE:
            winner_str = "blue"

        is_error = result.outcome is GameOutcome.ERROR
        win_condition = _OUTCOME_TO_WIN_CONDITION.get(result.outcome, "error")

        # Persist game record
        game_data = {
            "game_id": game_id,
            "experiment_id": experiment_id,
            "board_id": board_id,
            "red_sm_model": match.red_sm_model,
            "red_op_model": match.red_op_model,
            "blue_sm_model": match.blue_sm_model,
            "blue_op_model": match.blue_op_model,
            "mode": self._config.mode,
            "winner": winner_str,
            "win_condition": win_condition,
            "total_turns": result.total_turns,
            "red_remaining": result.red_remaining,
            "blue_remaining": result.blue_remaining,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_cost_usd": game_cost,
            "board_seed": match.board_seed,
            "pair_id": match.pair_id,
            "game_log_json": game_log,
            "status": "failed" if is_error else "completed",
        }
        self._repo.save_game(game_data)

        # Populate turns table from move log
        self._save_turns_from_log(game_id, result.move_log)

        if self._budget_exceeded:
            return None, game_id

        return result, game_id

    # ------------------------------------------------------------------
    # Turn persistence
    # ------------------------------------------------------------------

    def _save_turns_from_log(
        self, game_id: str, move_log: list[MoveRecord]
    ) -> None:
        """Parse the move log into structured turn rows and persist them."""
        turns: dict[tuple[int, str], dict] = {}

        for m in move_log:
            team_str = m.team.value.lower()
            key = (m.turn_number, team_str)

            if key not in turns:
                turns[key] = {
                    "turn_id": str(uuid.uuid4()),
                    "game_id": game_id,
                    "turn_number": m.turn_number,
                    "team": team_str,
                    "clue_word": None,
                    "clue_count": None,
                    "sm_model": None,
                    "sm_input_tokens": 0,
                    "sm_output_tokens": 0,
                    "sm_latency_ms": None,
                    "guesses_json": [],
                    "op_model": None,
                    "op_input_tokens": 0,
                    "op_output_tokens": 0,
                    "op_latency_ms": 0,
                }

            turn = turns[key]

            if m.action_type == "clue":
                turn["clue_word"] = m.clue_word
                turn["clue_count"] = m.clue_count
                turn["sm_model"] = m.model_id
                turn["sm_input_tokens"] = m.input_tokens or 0
                turn["sm_output_tokens"] = m.output_tokens or 0
                turn["sm_latency_ms"] = int(m.latency_ms) if m.latency_ms else None
            elif m.action_type == "guess":
                turn["guesses_json"].append({
                    "word": m.guess_word,
                    "result": m.guess_result.value if m.guess_result else None,
                })
                turn["op_model"] = m.model_id
                turn["op_input_tokens"] += m.input_tokens or 0
                turn["op_output_tokens"] += m.output_tokens or 0
                turn["op_latency_ms"] += int(m.latency_ms) if m.latency_ms else 0

        for turn_data in turns.values():
            self._repo.save_turn(turn_data)

    # ------------------------------------------------------------------
    # Pair tracking (for progress display only — no rating updates)
    # ------------------------------------------------------------------

    async def _track_pair_completion(
        self,
        match: ScheduledMatch,
        result: GameResult | None,
        game_id: str,
    ) -> list[tuple[ScheduledMatch, GameResult | None, str]] | None:
        """Track pair completion for the progress display.

        Returns the full pair list when a pair completes, or ``None`` if
        the pair is still waiting for its second game.
        """
        async with self._pair_lock:
            pair_id = match.pair_id
            if pair_id not in self._pair_results:
                self._pair_results[pair_id] = []
            self._pair_results[pair_id].append((match, result, game_id))

            if len(self._pair_results[pair_id]) < 2:
                return None

            return self._pair_results[pair_id]

    # ------------------------------------------------------------------
    # Cost tracking
    # ------------------------------------------------------------------

    def _calculate_game_cost(
        self, result: GameResult, match: ScheduledMatch
    ) -> float:
        """Sum up costs from all moves in the game."""
        total = 0.0
        for move in result.move_log:
            if move.model_id is None:
                continue

            if move.cost_usd is not None:
                total += move.cost_usd
            else:
                model = self._repo.get_model(move.model_id)
                if model:
                    input_cost_per_m = model.get("cost_per_m_input_tokens") or 0.0
                    output_cost_per_m = model.get("cost_per_m_output_tokens") or 0.0
                else:
                    input_cost_per_m = 0.0
                    output_cost_per_m = 0.0
                input_tokens = move.input_tokens or 0
                output_tokens = move.output_tokens or 0
                total += (input_tokens / 1_000_000.0) * input_cost_per_m
                total += (output_tokens / 1_000_000.0) * output_cost_per_m

        return total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _collect_model_ids(self) -> set[str]:
        """Collect all unique model IDs from the configuration."""
        model_ids: set[str] = set()

        if self._config.models:
            model_ids.update(self._config.models)

        if self._config.collab_pairs:
            for sm_model, op_model in self._config.collab_pairs:
                model_ids.add(sm_model)
                model_ids.add(op_model)

        return model_ids

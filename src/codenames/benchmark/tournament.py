"""Tournament runner that orchestrates a full Codenames benchmark.

Generates a schedule, runs games in parallel through the MatchRunner,
persists results to the database, and maintains live Elo ratings using
pair-based scoring (mirrored games on the same board, swapped sides).
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
from .rating import EloCalculator, EloUpdate
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
    (bounded by ``max_concurrent``), persists results, and maintains live
    Elo ratings via pair-based scoring.

    Parameters
    ----------
    config:
        Tournament configuration.
    llm_client:
        Shared LLM client for all agent calls.
    db:
        Initialised database connection.
    word_pool:
        Word pool for board generation.
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
        self._elo = EloCalculator()
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

        Games are executed in parallel (up to ``max_concurrent``).  Elo
        ratings are updated per mirrored pair, not per individual game.

        Parameters
        ----------
        experiment_name:
            Human-readable name for this experiment run.

        Returns
        -------
        str
            The experiment ID (UUID).
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

        # Shuffle schedule to avoid Elo path-dependency bias
        # (seeded for reproducibility)
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
            # e.g. 'anthropic/claude-3.5-sonnet' -> 'claude-3.5-sonnet'
            return model_id.rsplit("/", 1)[-1]

        def _update_records_for_pair(
            pair: list[tuple[ScheduledMatch, GameResult | None, str]],
        ) -> None:
            """Update win/loss records once a mirrored pair completes.

            Only counts non-error games so the scoreboard reflects fair,
            side-balanced results.
            """
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

            # Compute win rates for models with at least one game
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
                    # Budget exceeded — game was saved but we stop
                    return None

                completed_count += 1

                # Check if the game ended due to an error
                is_error = result.outcome is GameOutcome.ERROR
                if is_error:
                    self._error_count += 1

                pbar.update(1)

                if is_error:
                    logger.warning(
                        "Game %s ended with error (pair %d). "
                        "It will NOT count toward ratings.",
                        game_id,
                        match.pair_id,
                    )

                # Update experiment progress
                self._repo.update_experiment(
                    experiment_id,
                    total_games_completed=completed_count,
                    total_cost_usd=self._total_cost,
                )

                # Process pair-based scoring (error games passed as None)
                pair_completed = await self._process_pair_result(
                    match, result if not is_error else None, game_id,
                )

                # Update W-L scoreboard only when a full mirrored pair completes
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
                "Tournament '%s' completed: %d/%d games (%d errors excluded "
                "from ratings), total cost $%.4f",
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
        """Run one game and persist results (without Elo update).

        Returns ``(GameResult, game_id)`` on success, or ``(None, game_id)``
        if the budget was exceeded.  Elo updates are deferred to
        :meth:`_process_pair_result`.
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

        # Run the game — catch any unhandled exceptions so a single
        # game failure doesn't crash the entire tournament.
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

        # Check budget (save the game that pushed us over, but flag to stop)
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

        # Serialise game log (move log + board state summary)
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

        # Map outcome to DB win_condition enum
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
    # Pair-based Elo scoring
    # ------------------------------------------------------------------

    async def _process_pair_result(
        self,
        match: ScheduledMatch,
        result: GameResult | None,
        game_id: str,
    ) -> list[tuple[ScheduledMatch, GameResult | None, str]] | None:
        """Accumulate a game result and update Elo when a pair completes.

        *result* is ``None`` for error-terminated games.  Such games are
        stored in the pair list but excluded from Elo scoring.

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

            completed_pair = self._pair_results[pair_id]

            if len(completed_pair) == 2:
                # Filter out error games (result is None)
                valid = [
                    (m, r, gid)
                    for m, r, gid in self._pair_results[pair_id]
                    if r is not None
                ]
                if len(valid) == 2:
                    self._update_pair_ratings(valid)
                elif len(valid) == 1:
                    # Only one game succeeded — fall back to single-game
                    # Elo update so we don't discard good data entirely.
                    m, r, gid = valid[0]
                    if self._config.mode == "solo":
                        self._update_single_game_rating_solo(m, r, gid)
                    logger.info(
                        "Pair %d: 1 of 2 games errored — using single-game "
                        "scoring for the successful game.",
                        pair_id,
                    )
                else:
                    # Both games errored — no ratings update at all
                    logger.warning(
                        "Pair %d: both games errored — skipping ratings.",
                        pair_id,
                    )

                return completed_pair

    def _update_pair_ratings(
        self,
        pair: list[tuple[ScheduledMatch, GameResult, str]],
    ) -> None:
        """Score a completed mirrored pair and apply Elo updates.

        Only called with pairs where both games completed successfully
        (no error games).
        """
        (match1, result1, gid1), (match2, result2, gid2) = pair

        if self._config.mode == "solo":
            self._update_pair_solo(pair)
        elif self._config.mode == "collab":
            self._update_pair_collab(pair)

    def _update_pair_solo(
        self,
        pair: list[tuple[ScheduledMatch, GameResult, str]],
    ) -> None:
        """Pair-based Elo update for solo mode."""
        # Identify the two models (canonical ordering for consistency)
        match0 = pair[0][0]
        models_in_pair = sorted({match0.red_sm_model, match0.blue_sm_model})
        model_a, model_b = models_in_pair

        a_wins = 0
        b_wins = 0
        margins: list[int] = []

        for match, result, _gid in pair:
            if result.winner is None:
                continue
            if result.winner is Team.RED:
                winner_model = match.red_sm_model
                margin = result.blue_remaining - result.red_remaining
            else:
                winner_model = match.blue_sm_model
                margin = result.red_remaining - result.blue_remaining

            if winner_model == model_a:
                a_wins += 1
                margins.append(margin)
            else:
                b_wins += 1
                margins.append(margin)

        # If nobody won either game (e.g. both hit turn limit), skip
        if a_wins + b_wins == 0:
            return

        # Handle case where only one game had a winner (shouldn't happen
        # normally, but be defensive)
        if a_wins + b_wins == 1:
            # Fall back to single-game update
            for match, result, gid in pair:
                if result.winner is not None:
                    self._update_single_game_rating_solo(match, result, gid)
            return

        # Both games had winners — use pair-based scoring
        avg_margin = int(sum(margins) / len(margins)) if margins else 0

        model_a_data = self._repo.get_model(model_a) or {}
        model_b_data = self._repo.get_model(model_b) or {}

        a_update, b_update = self._elo.update_pair(
            model_a_id=model_a,
            model_b_id=model_b,
            model_a_rating=model_a_data.get("solo_rating", 1500.0),
            model_b_rating=model_b_data.get("solo_rating", 1500.0),
            model_a_games=model_a_data.get("solo_games_played", 0),
            model_b_games=model_b_data.get("solo_games_played", 0),
            a_wins=a_wins,
            b_wins=b_wins,
            rating_type="solo",
            margin=max(avg_margin, 0),
        )

        # Use the last game_id as the reference for the rating history
        ref_game_id = pair[-1][2]

        self._repo.update_rating(
            model_id=a_update.model_id,
            rating_type="solo",
            new_rating=a_update.new_rating,
            game_id=ref_game_id,
            old_rating=a_update.old_rating,
            result=a_update.game_result,
        )
        self._repo.update_rating(
            model_id=b_update.model_id,
            rating_type="solo",
            new_rating=b_update.new_rating,
            game_id=ref_game_id,
            old_rating=b_update.old_rating,
            result=b_update.game_result,
        )

        logger.debug(
            "Pair Elo update (solo): %s %.1f->%.1f, %s %.1f->%.1f "
            "(a_wins=%d, b_wins=%d)",
            model_a, a_update.old_rating, a_update.new_rating,
            model_b, b_update.old_rating, b_update.new_rating,
            a_wins, b_wins,
        )

    def _update_single_game_rating_solo(
        self,
        match: ScheduledMatch,
        result: GameResult,
        game_id: str,
    ) -> None:
        """Fallback: single-game Elo update for solo mode."""
        if result.winner is None:
            return

        if result.winner is Team.RED:
            winner_id = match.red_sm_model
            loser_id = match.blue_sm_model
            margin = result.blue_remaining - result.red_remaining
        else:
            winner_id = match.blue_sm_model
            loser_id = match.red_sm_model
            margin = result.red_remaining - result.blue_remaining

        winner_model = self._repo.get_model(winner_id) or {}
        loser_model = self._repo.get_model(loser_id) or {}

        winner_update, loser_update = self._elo.update(
            winner_id=winner_id,
            loser_id=loser_id,
            winner_rating=winner_model.get("solo_rating", 1500.0),
            loser_rating=loser_model.get("solo_rating", 1500.0),
            winner_games=winner_model.get("solo_games_played", 0),
            loser_games=loser_model.get("solo_games_played", 0),
            rating_type="solo",
            margin=margin,
        )

        self._repo.update_rating(
            model_id=winner_update.model_id,
            rating_type="solo",
            new_rating=winner_update.new_rating,
            game_id=game_id,
            old_rating=winner_update.old_rating,
            result=winner_update.game_result,
        )
        self._repo.update_rating(
            model_id=loser_update.model_id,
            rating_type="solo",
            new_rating=loser_update.new_rating,
            game_id=game_id,
            old_rating=loser_update.old_rating,
            result=loser_update.game_result,
        )

    def _update_pair_collab(
        self,
        pair: list[tuple[ScheduledMatch, GameResult, str]],
    ) -> None:
        """Pair-based Elo update for collab mode (spymaster + operative)."""
        match0 = pair[0][0]

        # Identify the two teams — each team is (sm_model, op_model)
        team_a = (match0.red_sm_model, match0.red_op_model)
        team_b = (match0.blue_sm_model, match0.blue_op_model)

        # Collect SM and OP models across both teams
        sm_models = sorted({team_a[0], team_b[0]})
        op_models = sorted({team_a[1], team_b[1]})

        # Count wins for spymaster role
        for role, models, rating_type, rating_col, games_col in [
            ("sm", sm_models, "spymaster", "spymaster_rating", "spymaster_games"),
            ("op", op_models, "operative", "operative_rating", "operative_games"),
        ]:
            model_a, model_b = models
            a_wins = 0
            b_wins = 0
            margins: list[int] = []

            for match, result, _gid in pair:
                if result.winner is None:
                    continue

                if role == "sm":
                    red_model = match.red_sm_model
                    blue_model = match.blue_sm_model
                else:
                    red_model = match.red_op_model
                    blue_model = match.blue_op_model

                if result.winner is Team.RED:
                    winner = red_model
                    margin = result.blue_remaining - result.red_remaining
                else:
                    winner = blue_model
                    margin = result.red_remaining - result.blue_remaining

                if winner == model_a:
                    a_wins += 1
                    margins.append(margin)
                else:
                    b_wins += 1
                    margins.append(margin)

            if a_wins + b_wins != 2:
                continue

            avg_margin = int(sum(margins) / len(margins)) if margins else 0

            model_a_data = self._repo.get_model(model_a) or {}
            model_b_data = self._repo.get_model(model_b) or {}

            a_update, b_update = self._elo.update_pair(
                model_a_id=model_a,
                model_b_id=model_b,
                model_a_rating=model_a_data.get(rating_col, 1500.0),
                model_b_rating=model_b_data.get(rating_col, 1500.0),
                model_a_games=model_a_data.get(games_col, 0),
                model_b_games=model_b_data.get(games_col, 0),
                a_wins=a_wins,
                b_wins=b_wins,
                rating_type=rating_type,
                margin=max(avg_margin, 0),
            )

            ref_game_id = pair[-1][2]

            self._repo.update_rating(
                model_id=a_update.model_id,
                rating_type=rating_type,
                new_rating=a_update.new_rating,
                game_id=ref_game_id,
                old_rating=a_update.old_rating,
                result=a_update.game_result,
            )
            self._repo.update_rating(
                model_id=b_update.model_id,
                rating_type=rating_type,
                new_rating=b_update.new_rating,
                game_id=ref_game_id,
                old_rating=b_update.old_rating,
                result=b_update.game_result,
            )

            logger.debug(
                "Pair Elo update (%s): %s %.1f->%.1f, %s %.1f->%.1f",
                rating_type,
                model_a, a_update.old_rating, a_update.new_rating,
                model_b, b_update.old_rating, b_update.new_rating,
            )

    # ------------------------------------------------------------------
    # Cost tracking
    # ------------------------------------------------------------------

    def _calculate_game_cost(
        self, result: GameResult, match: ScheduledMatch
    ) -> float:
        """Sum up costs from all moves in the game.

        Uses ``cost_usd`` on move records if available, otherwise falls
        back to per-million-token rates from the models table.

        In practice, real costs are backfilled after the experiment by
        ``backfill_costs.py`` using OpenRouter's generation stats endpoint.
        """
        total = 0.0
        for move in result.move_log:
            if move.model_id is None:
                continue

            # Prefer the direct cost from OpenRouter when available
            if move.cost_usd is not None:
                total += move.cost_usd
            else:
                # Fallback: compute from token counts + stored pricing
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

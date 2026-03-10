"""Match runner that plays a single Codenames game to completion.

Orchestrates the game loop between spymaster and operative agents,
handling clue validation retries, guess errors, and LLM failures
gracefully.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Callable, Protocol

from ..agents.base import ClueAction, GuessAction, OperativeAgent, SpymasterAgent
from ..agents.llm_agent import LLMSpymaster
from ..engine.board import Board
from ..engine.clue import Clue
from ..engine.game import Game, GameResult, MoveRecord
from ..engine.types import GameOutcome, GamePhase, GuessResult, Team


class LiveCallback(Protocol):
    """Callback for live game updates."""

    def on_clue(self, turn: int, team: Team, word: str, count: int, model: str, latency_ms: float) -> None: ...
    def on_guess(self, turn: int, team: Team, word: str, result: GuessResult, model: str, latency_ms: float) -> None: ...
    def on_stop(self, turn: int, team: Team) -> None: ...

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class TeamSetup:
    """A team's spymaster/operative agent pairing."""

    spymaster: SpymasterAgent
    operative: OperativeAgent


@dataclass
class MatchConfig:
    """Configuration for a single match."""

    red_team: TeamSetup
    blue_team: TeamSetup
    board: Board
    starting_team: Team = Team.RED
    max_turns: int = 50
    max_clue_retries: int = 3
    max_guess_retries: int = 3
    move_timeout: float | None = 120.0  # seconds; None to disable


# ---------------------------------------------------------------------------
# MatchRunner
# ---------------------------------------------------------------------------

class MatchRunner:
    """Plays a single Codenames game to completion.

    Drives the :class:`Game` state machine by alternating between
    spymaster clue-giving and operative guessing phases, delegating
    decisions to the configured agents.

    Parameters
    ----------
    config:
        The match configuration containing agents, board, and limits.
    """

    def __init__(self, config: MatchConfig, live: LiveCallback | None = None) -> None:
        self._config = config
        self._live = live
        self._teams: dict[Team, TeamSetup] = {
            Team.RED: config.red_team,
            Team.BLUE: config.blue_team,
        }

    async def run(self) -> GameResult:
        """Execute the full game loop and return the result.

        The loop proceeds as follows:

        1. Create a :class:`Game` from the configured board and starting
           team, then call ``game.start()``.
        2. While the game is not over:
           a. **GIVING_CLUE** -- ask the current team's spymaster for a
              clue, validate it, and retry on violations up to
              ``max_clue_retries``.  If all retries fail, forfeit the turn
              with a minimal fallback clue.
           b. **GUESSING** -- repeatedly ask the operative for a guess
              until the phase changes.  Handle voluntary stops and
              invalid-word errors with re-prompts.
           c. **TURN_ENDED** -- advance to the next turn.
        3. Return ``game.result``.

        LLM exceptions are caught at each phase boundary so that a single
        API failure forfeits the turn rather than crashing the entire
        match.
        """
        game = Game(
            board=self._config.board,
            starting_team=self._config.starting_team,
            max_turns=self._config.max_turns,
        )
        game.start()
        t0 = time.monotonic()

        while not game.is_over:
            try:
                if game.phase is GamePhase.GIVING_CLUE:
                    await self._handle_clue_phase(game)
                elif game.phase is GamePhase.GUESSING:
                    await self._handle_guess_phase(game)
                elif game.phase is GamePhase.TURN_ENDED:
                    game.next_turn()
                else:
                    # Should never reach here during a running game
                    logger.error(
                        "Unexpected game phase: %s", game.phase.value
                    )
                    break
            except Exception:
                # Catastrophic failure (e.g. network error) -- end the game
                logger.exception(
                    "Fatal error during turn %d (%s phase). Ending game.",
                    game.turn_number,
                    game.phase.value,
                )
                # Force a game-over with the current team losing
                self._force_game_over(game)
                break

        total_ms = (time.monotonic() - t0) * 1000
        result = game.result
        if result is not None:
            logger.info(
                "Game completed in %.1f ms: %s (turns=%d)",
                total_ms,
                result.outcome.value,
                result.total_turns,
            )
        return result  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Clue phase
    # ------------------------------------------------------------------

    async def _handle_clue_phase(self, game: Game) -> None:
        """Ask the spymaster for a valid clue, retrying on violations."""
        team = game.current_team
        setup = self._teams[team]
        spymaster = setup.spymaster

        violations: list[str] | None = None

        for attempt in range(1, self._config.max_clue_retries + 1):
            try:
                # LLMSpymaster supports a violations kwarg for re-prompting
                if isinstance(spymaster, LLMSpymaster):
                    coro = spymaster.give_clue(
                        game.get_spymaster_view(team),
                        violations=violations,
                    )
                else:
                    coro = spymaster.give_clue(
                        game.get_spymaster_view(team)
                    )
                timeout = self._config.move_timeout
                if timeout is not None:
                    clue_action: ClueAction = await asyncio.wait_for(coro, timeout=timeout)
                else:
                    clue_action = await coro
            except asyncio.TimeoutError:
                logger.warning(
                    "Spymaster move timed out after %.0fs (team=%s, model=%s). "
                    "Discarding game.",
                    self._config.move_timeout,
                    team.value,
                    spymaster.identity.model_id,
                )
                raise
            except Exception:
                logger.exception(
                    "Spymaster LLM call failed (attempt %d/%d, team=%s)",
                    attempt,
                    self._config.max_clue_retries,
                    team.value,
                )
                violations = ["The LLM call failed. Please try a different clue."]
                continue

            # Submit the clue to the game engine for validation
            violations = game.submit_clue(clue_action.clue)

            if not violations:
                # Clue accepted -- patch metadata onto the most recent
                # move record (the clue just recorded by the engine).
                self._patch_move_metadata(
                    game,
                    model_id=spymaster.identity.model_id,
                    latency_ms=clue_action.latency_ms,
                    input_tokens=clue_action.input_tokens,
                    output_tokens=clue_action.output_tokens,
                    generation_id=clue_action.generation_id,
                )
                logger.debug(
                    "Turn %d: %s spymaster gave clue '%s %d'",
                    game.turn_number,
                    team.value,
                    clue_action.clue.word,
                    clue_action.clue.count,
                )
                if self._live:
                    self._live.on_clue(
                        game.turn_number, team,
                        clue_action.clue.word, clue_action.clue.count,
                        spymaster.identity.model_id, clue_action.latency_ms,
                    )
                return

            logger.warning(
                "Clue violations on attempt %d/%d (team=%s, model=%s): %s",
                attempt,
                self._config.max_clue_retries,
                team.value,
                spymaster.identity.model_id,
                violations,
            )

        # All retries exhausted -- forfeit with a safe fallback clue.
        logger.warning(
            "All %d clue attempts failed for %s. Forfeiting turn.",
            self._config.max_clue_retries,
            team.value,
        )
        self._submit_fallback_clue(game)

    def _submit_fallback_clue(self, game: Game) -> None:
        """Submit a safe fallback clue that forfeits the turn.

        We use the word "FORFEIT" with count 1.  If by some chance
        "FORFEIT" is on the board, we try "CONCEDE" and then "YIELD".
        One of these should work since the board only has 25 words.
        """
        board_words_upper = {w.upper() for w in game.board.unrevealed_words}
        fallback_words = ["FORFEIT", "CONCEDE", "YIELD", "ABSTAIN", "RESIGN"]

        for word in fallback_words:
            if word not in board_words_upper:
                violations = game.submit_clue(Clue(word=word, count=1))
                if not violations:
                    return

        # Extremely unlikely: all fallback words are on the board.
        # Use a nonsense but valid alphabetic word.
        game.submit_clue(Clue(word="ZZFORFEIT", count=1))

    # ------------------------------------------------------------------
    # Guess phase
    # ------------------------------------------------------------------

    async def _handle_guess_phase(self, game: Game) -> None:
        """Let the operative guess until the phase changes."""
        team = game.current_team
        setup = self._teams[team]
        operative = setup.operative
        guesses_made = 0
        consecutive_errors = 0

        while game.phase is GamePhase.GUESSING:
            try:
                timeout = self._config.move_timeout
                coro = operative.guess(game.get_operative_view(team))
                if timeout is not None:
                    guess_action: GuessAction = await asyncio.wait_for(coro, timeout=timeout)
                else:
                    guess_action = await coro
            except asyncio.TimeoutError:
                logger.warning(
                    "Operative move timed out after %.0fs (team=%s, model=%s). "
                    "Discarding game.",
                    self._config.move_timeout,
                    team.value,
                    operative.identity.model_id,
                )
                raise
            except Exception:
                logger.exception(
                    "Operative LLM call failed (team=%s, turn=%d)",
                    team.value,
                    game.turn_number,
                )
                # If we have made at least one guess, just end guessing.
                # Otherwise forfeit the guessing phase entirely.
                if guesses_made > 0:
                    game.end_guessing()
                else:
                    game.end_guessing()
                return

            # Handle voluntary stop
            if guess_action.should_stop and guesses_made > 0:
                logger.debug(
                    "Turn %d: %s operative elected to stop guessing.",
                    game.turn_number,
                    team.value,
                )
                if self._live:
                    self._live.on_stop(game.turn_number, team)
                game.end_guessing()
                return

            # If should_stop is True but no guesses have been made yet,
            # the operative must make at least one guess.  Ignore the
            # stop flag and use the word provided.

            # Submit the guess
            try:
                result = game.submit_guess(guess_action.word)
                consecutive_errors = 0
            except ValueError as exc:
                # Word not on board or already revealed -- re-prompt
                consecutive_errors += 1
                logger.warning(
                    "Invalid guess '%s' from %s operative (model=%s): %s",
                    guess_action.word,
                    team.value,
                    operative.identity.model_id,
                    exc,
                )
                if consecutive_errors >= self._config.max_guess_retries:
                    logger.warning(
                        "Too many invalid guesses (%d). Ending guessing phase.",
                        consecutive_errors,
                    )
                    if guesses_made > 0:
                        game.end_guessing()
                    else:
                        game.end_guessing()
                    return
                continue

            guesses_made += 1

            # Patch metadata onto the move record for this guess
            self._patch_move_metadata(
                game,
                model_id=operative.identity.model_id,
                latency_ms=guess_action.latency_ms,
                input_tokens=guess_action.input_tokens,
                output_tokens=guess_action.output_tokens,
                generation_id=guess_action.generation_id,
            )

            logger.debug(
                "Turn %d: %s operative guessed '%s' -> %s",
                game.turn_number,
                team.value,
                guess_action.word,
                result.value,
            )
            if self._live:
                self._live.on_guess(
                    game.turn_number, team,
                    guess_action.word, result,
                    operative.identity.model_id, guess_action.latency_ms,
                )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _patch_move_metadata(
        game: Game,
        model_id: str,
        latency_ms: float,
        input_tokens: int,
        output_tokens: int,
        generation_id: str | None = None,
    ) -> None:
        """Patch LLM metadata onto the most recent move record."""
        if game.move_log:
            # game.move_log returns a copy, so we need to access the
            # internal list via _move_log directly.
            last_record: MoveRecord = game._move_log[-1]
            last_record.model_id = model_id
            last_record.latency_ms = latency_ms
            last_record.input_tokens = input_tokens
            last_record.output_tokens = output_tokens
            last_record.generation_id = generation_id

    @staticmethod
    def _force_game_over(game: Game) -> None:
        """Force the game to end when an unrecoverable error occurs.

        The game is marked with ``GameOutcome.ERROR`` and ``winner=None``
        so that downstream code can identify error-terminated games and
        exclude them from scoring.
        """
        from ..engine.game import GameResult

        game._phase = GamePhase.GAME_OVER
        game._result = GameResult(
            winner=None,
            outcome=GameOutcome.ERROR,
            total_turns=game.turn_number,
            red_remaining=game.board.remaining_for(Team.RED),
            blue_remaining=game.board.remaining_for(Team.BLUE),
            move_log=list(game._move_log),
        )

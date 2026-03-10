"""Game state machine for the Codenames game engine.

This module implements the complete turn-based flow of a Codenames game,
enforcing strict phase transitions and recording every move for later
analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .board import Board
from .clue import Clue, ClueValidator
from .types import CardType, GameOutcome, GamePhase, GuessResult, Team


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class MoveRecord:
    """A single recorded action in the game log."""

    turn_number: int
    team: Team
    action_type: str  # "clue" or "guess"
    clue_word: str | None = None
    clue_count: int | None = None
    guess_word: str | None = None
    guess_result: GuessResult | None = None
    model_id: str | None = None
    latency_ms: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    generation_id: str | None = None


@dataclass
class TurnState:
    """Tracks the state within a single turn."""

    team: Team
    clue: Clue
    guesses: list[tuple[str, GuessResult]] = field(default_factory=list)
    max_guesses: int = 0


@dataclass
class GameResult:
    """Final result of a completed game."""

    winner: Team | None
    outcome: GameOutcome
    total_turns: int
    red_remaining: int
    blue_remaining: int
    move_log: list[MoveRecord]


# ---------------------------------------------------------------------------
# Game class
# ---------------------------------------------------------------------------

class Game:
    """The Codenames game state machine.

    Enforces the following phase transitions::

        NOT_STARTED -> GIVING_CLUE -> GUESSING -> TURN_ENDED -> GIVING_CLUE ...
                                                              -> GAME_OVER
                                       GUESSING -> GAME_OVER

    All word comparisons are case-insensitive; words are normalised to
    uppercase internally.

    Parameters
    ----------
    board:
        A fully initialised :class:`Board`.
    starting_team:
        The team that takes the first turn.
    max_turns:
        Safety limit on the total number of turns (default 50).
    """

    def __init__(
        self,
        board: Board,
        starting_team: Team,
        max_turns: int = 50,
    ) -> None:
        self._board = board
        self._starting_team = starting_team
        self._max_turns = max_turns

        self._phase = GamePhase.NOT_STARTED
        self._current_team = starting_team
        self._turn_number = 0
        self._current_turn: TurnState | None = None
        self._move_log: list[MoveRecord] = []
        self._result: GameResult | None = None

    # ------------------------------------------------------------------
    # Read-only properties
    # ------------------------------------------------------------------

    @property
    def phase(self) -> GamePhase:
        return self._phase

    @property
    def current_team(self) -> Team:
        return self._current_team

    @property
    def is_over(self) -> bool:
        return self._phase is GamePhase.GAME_OVER

    @property
    def board(self) -> Board:
        return self._board

    @property
    def current_turn(self) -> TurnState | None:
        return self._current_turn

    @property
    def move_log(self) -> list[MoveRecord]:
        return list(self._move_log)

    @property
    def result(self) -> GameResult | None:
        return self._result

    @property
    def turn_number(self) -> int:
        return self._turn_number

    # ------------------------------------------------------------------
    # Phase transitions
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Begin the game.

        Transitions: NOT_STARTED -> GIVING_CLUE
        """
        self._require_phase(GamePhase.NOT_STARTED, "start")
        self._phase = GamePhase.GIVING_CLUE
        self._current_team = self._starting_team
        self._turn_number = 1

    def submit_clue(self, clue: Clue) -> list[str]:
        """Submit a spymaster's clue.

        Transitions (on success): GIVING_CLUE -> GUESSING

        Returns
        -------
        list[str]
            Validation violations.  Empty list means the clue was accepted.
        """
        self._require_phase(GamePhase.GIVING_CLUE, "submit_clue")

        violations = ClueValidator.validate(clue, self._board.unrevealed_words)
        if violations:
            return violations

        # Set up the turn state
        self._current_turn = TurnState(
            team=self._current_team,
            clue=clue,
            max_guesses=clue.count + 1,
        )
        self._phase = GamePhase.GUESSING

        # Record the clue
        self._move_log.append(
            MoveRecord(
                turn_number=self._turn_number,
                team=self._current_team,
                action_type="clue",
                clue_word=clue.word,
                clue_count=clue.count,
            )
        )

        return []

    def submit_guess(self, word: str) -> GuessResult:
        """Submit an operative's guess.

        Transitions:
        - CORRECT and guesses remain -> stay in GUESSING
        - CORRECT and max guesses reached -> TURN_ENDED
        - CORRECT and all team's words found -> GAME_OVER
        - WRONG_TEAM -> TURN_ENDED (or GAME_OVER if opponent completed)
        - NEUTRAL -> TURN_ENDED
        - ASSASSIN -> GAME_OVER

        Raises
        ------
        ValueError
            If the game is not in the GUESSING phase, or the word is invalid.
        """
        self._require_phase(GamePhase.GUESSING, "submit_guess")
        assert self._current_turn is not None  # guaranteed by phase

        # Reveal the card (Board.reveal validates word existence / already revealed)
        card_type = self._board.reveal(word.upper())

        # Determine the guess result
        team_card_type = CardType(self._current_team.value)
        opponent_card_type = CardType(self._current_team.opponent.value)

        if card_type is CardType.ASSASSIN:
            result = GuessResult.ASSASSIN
        elif card_type is team_card_type:
            result = GuessResult.CORRECT
        elif card_type is opponent_card_type:
            result = GuessResult.WRONG_TEAM
        else:
            result = GuessResult.NEUTRAL

        # Record the guess
        self._current_turn.guesses.append((word.upper(), result))
        self._move_log.append(
            MoveRecord(
                turn_number=self._turn_number,
                team=self._current_team,
                action_type="guess",
                clue_word=self._current_turn.clue.word,
                clue_count=self._current_turn.clue.count,
                guess_word=word.upper(),
                guess_result=result,
            )
        )

        # --- Resolve the outcome ---

        if result is GuessResult.ASSASSIN:
            winner = self._current_team.opponent
            outcome = (
                GameOutcome.RED_WINS_ASSASSIN
                if winner is Team.RED
                else GameOutcome.BLUE_WINS_ASSASSIN
            )
            self._end_game(winner, outcome)
            return result

        # Check if either team has all words revealed (could happen on WRONG_TEAM too)
        if self._board.remaining_for(Team.RED) == 0:
            self._end_game(Team.RED, GameOutcome.RED_WINS_ALL_WORDS)
            return result

        if self._board.remaining_for(Team.BLUE) == 0:
            self._end_game(Team.BLUE, GameOutcome.BLUE_WINS_ALL_WORDS)
            return result

        # If the guess was wrong, end the turn
        if result is not GuessResult.CORRECT:
            self._phase = GamePhase.TURN_ENDED
            return result

        # Correct guess -- check whether max guesses exhausted
        if len(self._current_turn.guesses) >= self._current_turn.max_guesses:
            self._phase = GamePhase.TURN_ENDED
            return result

        # Still in GUESSING phase -- operative may guess again
        return result

    def end_guessing(self) -> None:
        """Operative voluntarily ends the guessing phase early.

        Transitions: GUESSING -> TURN_ENDED
        """
        self._require_phase(GamePhase.GUESSING, "end_guessing")
        self._phase = GamePhase.TURN_ENDED

    def next_turn(self) -> None:
        """Advance to the next turn, swapping teams.

        Transitions: TURN_ENDED -> GIVING_CLUE (or GAME_OVER on turn limit)
        """
        self._require_phase(GamePhase.TURN_ENDED, "next_turn")

        self._current_team = self._current_team.opponent
        self._turn_number += 1
        self._current_turn = None

        if self._turn_number > self._max_turns:
            # Determine winner by fewer remaining words
            red_rem = self._board.remaining_for(Team.RED)
            blue_rem = self._board.remaining_for(Team.BLUE)
            if red_rem <= blue_rem:
                winner = Team.RED
            else:
                winner = Team.BLUE
            self._end_game(winner, GameOutcome.TURN_LIMIT)
            return

        self._phase = GamePhase.GIVING_CLUE

    # ------------------------------------------------------------------
    # Views
    # ------------------------------------------------------------------

    def get_spymaster_view(self, team: Team) -> dict:
        """Build the information dict visible to a spymaster.

        Includes the full key-card mapping so the spymaster knows all
        card types.
        """
        revealed_words: dict[str, str] = {}
        for bc in self._board.all_cards:
            if bc.revealed:
                revealed_words[bc.word] = bc.card_type.value

        return {
            "team": team.value,
            "key_card": {w: ct.value for w, ct in self._board.key_card.items()},
            "unrevealed_words": self._board.unrevealed_words,
            "revealed_words": revealed_words,
            "red_remaining": self._board.remaining_for(Team.RED),
            "blue_remaining": self._board.remaining_for(Team.BLUE),
            "move_history": [self._move_to_dict(m) for m in self._move_log],
            "turn_number": self._turn_number,
        }

    def get_operative_view(self, team: Team) -> dict:
        """Build the information dict visible to an operative.

        Does **not** include the key card -- only revealed card types.
        """
        revealed_words: dict[str, str] = {}
        for bc in self._board.all_cards:
            if bc.revealed:
                revealed_words[bc.word] = bc.card_type.value

        current_clue: dict | None = None
        guesses_this_turn: list[dict] = []
        guesses_remaining: int = 0

        if self._current_turn is not None:
            current_clue = {
                "word": self._current_turn.clue.word,
                "count": self._current_turn.clue.count,
            }
            guesses_this_turn = [
                {"word": w, "result": r.value}
                for w, r in self._current_turn.guesses
            ]
            guesses_remaining = (
                self._current_turn.max_guesses
                - len(self._current_turn.guesses)
            )

        return {
            "team": team.value,
            "unrevealed_words": self._board.unrevealed_words,
            "revealed_words": revealed_words,
            "red_remaining": self._board.remaining_for(Team.RED),
            "blue_remaining": self._board.remaining_for(Team.BLUE),
            "current_clue": current_clue,
            "guesses_this_turn": guesses_this_turn,
            "guesses_remaining": guesses_remaining,
            "move_history": [self._move_to_dict(m) for m in self._move_log],
            "turn_number": self._turn_number,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _require_phase(self, expected: GamePhase, method: str) -> None:
        """Raise ``ValueError`` if the game is not in the expected phase."""
        if self._phase is not expected:
            raise ValueError(
                f"Cannot call {method}() during {self._phase.value} phase "
                f"(expected {expected.value})"
            )

    def _end_game(self, winner: Team | None, outcome: GameOutcome) -> None:
        """Transition to GAME_OVER and build the result."""
        self._phase = GamePhase.GAME_OVER
        self._result = GameResult(
            winner=winner,
            outcome=outcome,
            total_turns=self._turn_number,
            red_remaining=self._board.remaining_for(Team.RED),
            blue_remaining=self._board.remaining_for(Team.BLUE),
            move_log=list(self._move_log),
        )

    @staticmethod
    def _move_to_dict(record: MoveRecord) -> dict:
        """Serialise a :class:`MoveRecord` to a plain dict."""
        d: dict = {
            "turn_number": record.turn_number,
            "team": record.team.value,
            "action_type": record.action_type,
        }
        if record.clue_word is not None:
            d["clue_word"] = record.clue_word
        if record.clue_count is not None:
            d["clue_count"] = record.clue_count
        if record.guess_word is not None:
            d["guess_word"] = record.guess_word
        if record.guess_result is not None:
            d["guess_result"] = record.guess_result.value
        if record.model_id is not None:
            d["model_id"] = record.model_id
        if record.latency_ms is not None:
            d["latency_ms"] = record.latency_ms
        if record.input_tokens is not None:
            d["input_tokens"] = record.input_tokens
        if record.output_tokens is not None:
            d["output_tokens"] = record.output_tokens
        if record.cost_usd is not None:
            d["cost_usd"] = record.cost_usd
        if record.generation_id is not None:
            d["generation_id"] = record.generation_id
        return d

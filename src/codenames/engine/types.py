"""Enums and shared types for the Codenames game engine."""

from enum import Enum


class Team(Enum):
    """The two competing teams in Codenames."""

    RED = "RED"
    BLUE = "BLUE"

    @property
    def opponent(self) -> "Team":
        """Return the opposing team."""
        return Team.BLUE if self is Team.RED else Team.RED


class CardType(Enum):
    """The type assigned to each card on the board."""

    RED = "RED"
    BLUE = "BLUE"
    NEUTRAL = "NEUTRAL"
    ASSASSIN = "ASSASSIN"


class GamePhase(Enum):
    """Phases of a Codenames game."""

    NOT_STARTED = "NOT_STARTED"
    GIVING_CLUE = "GIVING_CLUE"
    GUESSING = "GUESSING"
    TURN_ENDED = "TURN_ENDED"
    GAME_OVER = "GAME_OVER"


class GameOutcome(Enum):
    """How a game can end."""

    RED_WINS_ALL_WORDS = "RED_WINS_ALL_WORDS"
    BLUE_WINS_ALL_WORDS = "BLUE_WINS_ALL_WORDS"
    RED_WINS_ASSASSIN = "RED_WINS_ASSASSIN"
    BLUE_WINS_ASSASSIN = "BLUE_WINS_ASSASSIN"
    TURN_LIMIT = "TURN_LIMIT"
    ERROR = "ERROR"


class GuessResult(Enum):
    """The result of a single guess."""

    CORRECT = "CORRECT"
    WRONG_TEAM = "WRONG_TEAM"
    NEUTRAL = "NEUTRAL"
    ASSASSIN = "ASSASSIN"

"""Codenames game engine -- pure game logic with zero external dependencies."""

from .board import Board, BoardCard, Card, WordPool
from .clue import Clue, ClueValidator
from .game import Game, GameResult, MoveRecord, TurnState
from .types import CardType, GameOutcome, GamePhase, GuessResult, Team

__all__ = [
    # types
    "Team",
    "CardType",
    "GamePhase",
    "GameOutcome",
    "GuessResult",
    # board
    "WordPool",
    "Card",
    "BoardCard",
    "Board",
    # clue
    "Clue",
    "ClueValidator",
    # game
    "MoveRecord",
    "TurnState",
    "GameResult",
    "Game",
]

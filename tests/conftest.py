"""Shared fixtures for the Codenames benchmark test suite."""

import random
import sys
from pathlib import Path

import pytest

# Ensure the src directory is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from codenames.engine.board import Board, WordPool
from codenames.engine.clue import Clue
from codenames.engine.game import Game
from codenames.engine.types import CardType, Team
from codenames.storage.database import Database
from codenames.storage.repository import Repository


# ---------------------------------------------------------------------------
# Deterministic word list (25 words) for tests that need a known board
# ---------------------------------------------------------------------------
FIXED_WORDS = [
    "AFRICA", "AGENT", "AIR", "ALIEN", "ALPS",
    "AMAZON", "AMBULANCE", "AMERICA", "ANGEL", "ANTARCTICA",
    "APPLE", "ARM", "ATLANTIS", "AUSTRALIA", "AZTEC",
    "BACK", "BALL", "BAND", "BANK", "BAR",
    "BAT", "BATTERY", "BEACH", "BEAR", "BEAT",
]

SEED = 42


# ---------------------------------------------------------------------------
# Board fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fixed_rng():
    """A seeded random.Random for deterministic tests."""
    return random.Random(SEED)


@pytest.fixture
def board(fixed_rng):
    """A deterministic board with known words and RED starting."""
    return Board(words=list(FIXED_WORDS), starting_team=Team.RED, rng=fixed_rng)


@pytest.fixture
def board_blue_start(fixed_rng):
    """A deterministic board with BLUE starting."""
    return Board(words=list(FIXED_WORDS), starting_team=Team.BLUE, rng=random.Random(SEED))


# ---------------------------------------------------------------------------
# Game fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def game(board):
    """A game in NOT_STARTED phase."""
    return Game(board=board, starting_team=Team.RED)


@pytest.fixture
def game_started(game):
    """A game in GIVING_CLUE phase (after start())."""
    game.start()
    return game


# ---------------------------------------------------------------------------
# Database / Repository fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db(tmp_path):
    """A temporary SQLite database, fully initialized."""
    db_path = str(tmp_path / "test_codenames.db")
    database = Database(db_path)
    database.initialize()
    yield database
    database.close()


@pytest.fixture
def repo(db):
    """A Repository backed by the temporary database."""
    return Repository(db)

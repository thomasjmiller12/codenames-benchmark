"""Tests for the random baseline agents.

Tests cover RandomSpymaster and RandomOperative, verifying that they produce
valid actions and are deterministic when seeded.
"""

from __future__ import annotations

import random

import pytest

from codenames.agents.base import AgentIdentity, ClueAction, GuessAction
from codenames.agents.random_agent import RandomSpymaster, RandomOperative
from codenames.engine.board import Board
from codenames.engine.clue import Clue, ClueValidator
from codenames.engine.game import Game
from codenames.engine.types import CardType, Team

# Constants also defined in conftest.py -- repeated here because conftest
# cannot be imported as a regular module by pytest.
FIXED_WORDS = [
    "AFRICA", "AGENT", "AIR", "ALIEN", "ALPS",
    "AMAZON", "AMBULANCE", "AMERICA", "ANGEL", "ANTARCTICA",
    "APPLE", "ARM", "ATLANTIS", "AUSTRALIA", "AZTEC",
    "BACK", "BALL", "BAND", "BANK", "BAR",
    "BAT", "BATTERY", "BEACH", "BEAR", "BEAT",
]
SEED = 42


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def spymaster_game_view():
    """A spymaster game view dict from a fresh game."""
    rng = random.Random(SEED)
    board = Board(words=list(FIXED_WORDS), starting_team=Team.RED, rng=rng)
    game = Game(board=board, starting_team=Team.RED)
    game.start()
    return game.get_spymaster_view(Team.RED)


@pytest.fixture
def operative_game_view():
    """An operative game view dict from a game in GUESSING phase."""
    rng = random.Random(SEED)
    board = Board(words=list(FIXED_WORDS), starting_team=Team.RED, rng=rng)
    game = Game(board=board, starting_team=Team.RED)
    game.start()
    game.submit_clue(Clue(word="OCEAN", count=2))
    return game.get_operative_view(Team.RED)


# ===========================================================================
# RandomSpymaster tests
# ===========================================================================


class TestRandomSpymaster:
    """Tests for the RandomSpymaster agent."""

    @pytest.mark.asyncio
    async def test_produces_valid_clue_action(self, spymaster_game_view):
        """give_clue() should return a ClueAction."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        action = await sm.give_clue(spymaster_game_view)
        assert isinstance(action, ClueAction)
        assert isinstance(action.clue, Clue)

    @pytest.mark.asyncio
    async def test_clue_word_not_on_board(self, spymaster_game_view):
        """The clue word should not match any word on the board."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        action = await sm.give_clue(spymaster_game_view)
        board_words_upper = {w.upper() for w in spymaster_game_view["unrevealed_words"]}
        assert action.clue.word.upper() not in board_words_upper

    @pytest.mark.asyncio
    async def test_clue_count_is_one(self, spymaster_game_view):
        """RandomSpymaster always gives count=1."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        action = await sm.give_clue(spymaster_game_view)
        assert action.clue.count == 1

    @pytest.mark.asyncio
    async def test_clue_validates_successfully(self, spymaster_game_view):
        """The produced clue should pass ClueValidator."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        action = await sm.give_clue(spymaster_game_view)
        violations = ClueValidator.validate(
            action.clue,
            spymaster_game_view["unrevealed_words"],
        )
        assert violations == []

    @pytest.mark.asyncio
    async def test_identity_correct(self):
        """Identity should have model_id='random', agent_type='spymaster'."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        identity = sm.identity
        assert isinstance(identity, AgentIdentity)
        assert identity.model_id == "random"
        assert identity.agent_type == "spymaster"
        assert identity.team is Team.RED

    @pytest.mark.asyncio
    async def test_seeded_is_deterministic(self, spymaster_game_view):
        """Two agents with the same seed should produce the same clue."""
        sm1 = RandomSpymaster(team=Team.RED, seed=99)
        sm2 = RandomSpymaster(team=Team.RED, seed=99)

        action1 = await sm1.give_clue(spymaster_game_view)
        action2 = await sm2.give_clue(spymaster_game_view)

        assert action1.clue.word == action2.clue.word
        assert action1.clue.count == action2.clue.count

    @pytest.mark.asyncio
    async def test_different_seeds_may_differ(self, spymaster_game_view):
        """Agents with different seeds should typically produce different clues (not guaranteed but very likely over many runs)."""
        results = set()
        for seed in range(20):
            sm = RandomSpymaster(team=Team.RED, seed=seed)
            action = await sm.give_clue(spymaster_game_view)
            results.add(action.clue.word)
        # With 20 different seeds and 50 possible words, we expect some variety
        assert len(results) > 1

    @pytest.mark.asyncio
    async def test_reasoning_is_random_baseline(self, spymaster_game_view):
        """The reasoning should be 'random baseline'."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        action = await sm.give_clue(spymaster_game_view)
        assert action.reasoning == "random baseline"

    @pytest.mark.asyncio
    async def test_token_counts_are_zero(self, spymaster_game_view):
        """Random agents don't use tokens."""
        sm = RandomSpymaster(team=Team.RED, seed=42)
        action = await sm.give_clue(spymaster_game_view)
        assert action.input_tokens == 0
        assert action.output_tokens == 0


# ===========================================================================
# RandomOperative tests
# ===========================================================================


class TestRandomOperative:
    """Tests for the RandomOperative agent."""

    @pytest.mark.asyncio
    async def test_produces_valid_guess_action(self, operative_game_view):
        """guess() should return a GuessAction."""
        op = RandomOperative(team=Team.RED, seed=42)
        action = await op.guess(operative_game_view)
        assert isinstance(action, GuessAction)

    @pytest.mark.asyncio
    async def test_guess_word_from_unrevealed_board(self, operative_game_view):
        """The guessed word should be one of the unrevealed words."""
        op = RandomOperative(team=Team.RED, seed=42)
        action = await op.guess(operative_game_view)
        assert action.word in operative_game_view["unrevealed_words"]

    @pytest.mark.asyncio
    async def test_should_stop_is_false(self, operative_game_view):
        """RandomOperative never elects to stop."""
        op = RandomOperative(team=Team.RED, seed=42)
        action = await op.guess(operative_game_view)
        assert action.should_stop is False

    @pytest.mark.asyncio
    async def test_confidence_in_range(self, operative_game_view):
        """Confidence should be between 0.0 and 1.0."""
        op = RandomOperative(team=Team.RED, seed=42)
        action = await op.guess(operative_game_view)
        assert 0.0 <= action.confidence <= 1.0

    @pytest.mark.asyncio
    async def test_identity_correct(self):
        """Identity should have model_id='random', agent_type='operative'."""
        op = RandomOperative(team=Team.BLUE, seed=42)
        identity = op.identity
        assert isinstance(identity, AgentIdentity)
        assert identity.model_id == "random"
        assert identity.agent_type == "operative"
        assert identity.team is Team.BLUE

    @pytest.mark.asyncio
    async def test_seeded_is_deterministic(self, operative_game_view):
        """Two agents with the same seed should produce the same guess."""
        op1 = RandomOperative(team=Team.RED, seed=99)
        op2 = RandomOperative(team=Team.RED, seed=99)

        action1 = await op1.guess(operative_game_view)
        action2 = await op2.guess(operative_game_view)

        assert action1.word == action2.word
        assert action1.confidence == action2.confidence

    @pytest.mark.asyncio
    async def test_different_seeds_may_differ(self, operative_game_view):
        """Agents with different seeds should typically produce different guesses."""
        results = set()
        for seed in range(20):
            op = RandomOperative(team=Team.RED, seed=seed)
            action = await op.guess(operative_game_view)
            results.add(action.word)
        assert len(results) > 1

    @pytest.mark.asyncio
    async def test_reasoning_is_random_baseline(self, operative_game_view):
        """The reasoning should be 'random baseline'."""
        op = RandomOperative(team=Team.RED, seed=42)
        action = await op.guess(operative_game_view)
        assert action.reasoning == "random baseline"

    @pytest.mark.asyncio
    async def test_token_counts_are_zero(self, operative_game_view):
        """Random agents don't use tokens."""
        op = RandomOperative(team=Team.RED, seed=42)
        action = await op.guess(operative_game_view)
        assert action.input_tokens == 0
        assert action.output_tokens == 0

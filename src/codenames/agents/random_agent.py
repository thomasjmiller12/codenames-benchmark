"""Random baseline agents for testing and benchmarking.

These agents make uniformly random decisions and require no API calls.
They are useful as a lower-bound baseline when evaluating LLM agents.
"""

from __future__ import annotations

import random

from ..engine.clue import Clue
from ..engine.types import CardType, Team
from .base import AgentIdentity, ClueAction, GuessAction, OperativeAgent, SpymasterAgent

# A small built-in vocabulary of common English words for random clue generation.
_RANDOM_CLUE_WORDS: list[str] = [
    "thing", "place", "time", "world", "story",
    "house", "water", "night", "light", "point",
    "group", "power", "money", "music", "river",
    "table", "woman", "party", "field", "earth",
    "sound", "color", "paper", "space", "plant",
    "stone", "track", "board", "shape", "cloud",
    "metal", "wheel", "glass", "sugar", "bread",
    "dream", "flame", "dance", "feast", "grain",
    "novel", "ocean", "storm", "tower", "magic",
    "fable", "arrow", "pearl", "crown", "ghost",
]


class RandomSpymaster(SpymasterAgent):
    """A spymaster that picks a random clue word and targets one team word.

    Parameters
    ----------
    team:
        The team this agent plays for.
    seed:
        Optional seed for reproducibility.
    """

    def __init__(self, team: Team, seed: int | None = None) -> None:
        self._team = team
        self._rng = random.Random(seed)
        self._identity = AgentIdentity(
            model_id="random",
            agent_type="spymaster",
            team=team,
        )

    @property
    def identity(self) -> AgentIdentity:
        return self._identity

    async def give_clue(self, game_view: dict) -> ClueAction:
        """Pick a random single-word clue with count=1.

        The clue word is drawn from a small built-in vocabulary, filtered
        to exclude any words currently on the board (case-insensitive).
        """
        board_words_upper = {w.upper() for w in game_view["unrevealed_words"]}

        # Also include revealed words to be safe
        for w in game_view.get("revealed_words", {}):
            board_words_upper.add(w.upper())

        # Filter the vocabulary to avoid board words
        eligible_clue_words = [
            w for w in _RANDOM_CLUE_WORDS
            if w.upper() not in board_words_upper
        ]

        # Fallback in case all built-in words happen to be on the board
        if not eligible_clue_words:
            eligible_clue_words = ["hint"]

        clue_word = self._rng.choice(eligible_clue_words).upper()

        return ClueAction(
            clue=Clue(word=clue_word, count=1),
            reasoning="random baseline",
        )


class RandomOperative(OperativeAgent):
    """An operative that guesses a random unrevealed word.

    Parameters
    ----------
    team:
        The team this agent plays for.
    seed:
        Optional seed for reproducibility.
    """

    def __init__(self, team: Team, seed: int | None = None) -> None:
        self._team = team
        self._rng = random.Random(seed)
        self._identity = AgentIdentity(
            model_id="random",
            agent_type="operative",
            team=team,
        )

    @property
    def identity(self) -> AgentIdentity:
        return self._identity

    async def guess(self, game_view: dict) -> GuessAction:
        """Pick a random unrevealed word from the board."""
        unrevealed = game_view["unrevealed_words"]

        word = self._rng.choice(unrevealed)
        confidence = self._rng.random()

        return GuessAction(
            word=word,
            confidence=confidence,
            reasoning="random baseline",
            should_stop=False,
        )

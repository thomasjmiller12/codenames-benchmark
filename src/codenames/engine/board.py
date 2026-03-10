"""Board generation and state for the Codenames game engine."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

from .types import CardType, Team


# Default word list path: <project_root>/wordlists/standard.txt
_DEFAULT_WORDLIST_PATH = Path(__file__).resolve().parents[3] / "wordlists" / "standard.txt"


class WordPool:
    """Loads and samples words from a word list file.

    Each line in the file is treated as one word (may contain spaces,
    e.g. "ICE CREAM"). Blank lines are ignored.
    """

    def __init__(self, path: str | Path | None = None) -> None:
        self._path = Path(path) if path is not None else _DEFAULT_WORDLIST_PATH
        self._words: list[str] = []
        self._load()

    def _load(self) -> None:
        with open(self._path, encoding="utf-8") as f:
            self._words = [
                line.strip().upper()
                for line in f
                if line.strip()
            ]
        if not self._words:
            raise ValueError(f"Word list at {self._path} is empty")

    @property
    def words(self) -> list[str]:
        """All words available in the pool."""
        return list(self._words)

    def sample(self, n: int = 25, rng: random.Random | None = None) -> list[str]:
        """Return *n* unique words sampled from the pool.

        Parameters
        ----------
        n:
            Number of words to sample (default 25).
        rng:
            Optional ``random.Random`` instance for reproducibility.
            Falls back to the module-level ``random.sample`` when *None*.
        """
        if n > len(self._words):
            raise ValueError(
                f"Cannot sample {n} words from a pool of {len(self._words)}"
            )
        if rng is not None:
            return rng.sample(self._words, n)
        return random.sample(self._words, n)


@dataclass(frozen=True)
class Card:
    """An immutable card with a word and its secret type."""

    word: str
    card_type: CardType


@dataclass
class BoardCard:
    """A card on the board that can be revealed during play."""

    card: Card
    revealed: bool = False

    @property
    def word(self) -> str:
        return self.card.word

    @property
    def card_type(self) -> CardType:
        return self.card.card_type


class Board:
    """The 5x5 Codenames board.

    Parameters
    ----------
    words:
        Exactly 25 unique words.
    starting_team:
        The team that goes first (gets 9 cards; the other gets 8).
    rng:
        Optional ``random.Random`` for deterministic card-type assignment.
    """

    def __init__(
        self,
        words: list[str],
        starting_team: Team,
        rng: random.Random | None = None,
    ) -> None:
        if len(words) != 25:
            raise ValueError(f"Board requires exactly 25 words, got {len(words)}")

        # Normalize all words to uppercase
        normalized = [w.upper() for w in words]

        if len(set(normalized)) != 25:
            raise ValueError("All 25 words must be unique (case-insensitive)")

        self._starting_team = starting_team

        # Build the type assignments: 9 starting, 8 other, 7 neutral, 1 assassin
        other_team = starting_team.opponent
        types: list[CardType] = (
            [CardType(starting_team.value)] * 9
            + [CardType(other_team.value)] * 8
            + [CardType.NEUTRAL] * 7
            + [CardType.ASSASSIN] * 1
        )

        if rng is not None:
            rng.shuffle(types)
        else:
            random.shuffle(types)

        # Map uppercase word -> BoardCard for O(1) lookups
        self._cards: dict[str, BoardCard] = {}
        self._ordered: list[BoardCard] = []
        for word, card_type in zip(normalized, types):
            bc = BoardCard(card=Card(word=word, card_type=card_type))
            self._cards[word] = bc
            self._ordered.append(bc)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def starting_team(self) -> Team:
        """The team that goes first."""
        return self._starting_team

    @property
    def all_cards(self) -> list[BoardCard]:
        """All 25 board cards in their original order."""
        return list(self._ordered)

    @property
    def unrevealed_words(self) -> list[str]:
        """Words that have not yet been revealed."""
        return [bc.word for bc in self._ordered if not bc.revealed]

    @property
    def key_card(self) -> dict[str, CardType]:
        """Full mapping of word -> CardType (the spymaster's view)."""
        return {bc.word: bc.card_type for bc in self._ordered}

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def get_card(self, word: str) -> BoardCard | None:
        """Look up a board card by word (case-insensitive)."""
        return self._cards.get(word.upper())

    def remaining_for(self, team: Team) -> int:
        """Count of unrevealed cards belonging to *team*."""
        target = CardType(team.value)
        return sum(
            1
            for bc in self._ordered
            if bc.card_type is target and not bc.revealed
        )

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def reveal(self, word: str) -> CardType:
        """Reveal a card on the board.

        Parameters
        ----------
        word:
            The word to reveal (case-insensitive).

        Returns
        -------
        CardType
            The type of the revealed card.

        Raises
        ------
        ValueError
            If the word is not on the board or has already been revealed.
        """
        key = word.upper()
        bc = self._cards.get(key)
        if bc is None:
            raise ValueError(f"Word '{word}' is not on the board")
        if bc.revealed:
            raise ValueError(f"Word '{word}' has already been revealed")
        bc.revealed = True
        return bc.card_type

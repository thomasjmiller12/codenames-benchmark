"""Clue model and validation for the Codenames game engine."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Clue:
    """A spymaster's clue: a single word and a count."""

    word: str
    count: int


class ClueValidator:
    """Validates clues against the Codenames rules.

    Validation rules
    ----------------
    1. The clue word must be a single token (no spaces).
    2. The clue word must be alphabetic (hyphens allowed, e.g. "well-known").
    3. The clue word must NOT match any word currently on the board
       (comparison is case-insensitive).
    4. The count must be between 1 and 9 inclusive.
    """

    # Matches: one or more letters, optionally separated by single hyphens.
    # Does not allow leading/trailing hyphens or consecutive hyphens.
    _WORD_PATTERN = re.compile(r"^[A-Za-z]+(?:-[A-Za-z]+)*$")

    @classmethod
    def validate(cls, clue: Clue, board_words: list[str]) -> list[str]:
        """Return a list of violation descriptions.

        An empty list means the clue is valid.

        Parameters
        ----------
        clue:
            The clue to validate.
        board_words:
            The current (unrevealed) words on the board.
        """
        violations: list[str] = []

        # Rule 1 & 2: single word, alphabetic (hyphens allowed)
        if " " in clue.word:
            violations.append("Clue must be a single word (no spaces)")
        elif not cls._WORD_PATTERN.match(clue.word):
            violations.append(
                "Clue must contain only alphabetic characters "
                "(hyphens between words are allowed)"
            )

        # Rule 3: not a board word
        clue_upper = clue.word.upper()
        board_upper = {w.upper() for w in board_words}
        if clue_upper in board_upper:
            violations.append(
                f"Clue '{clue.word}' matches a word currently on the board"
            )

        # Rule 4: count range
        if not (1 <= clue.count <= 9):
            violations.append("Clue count must be between 1 and 9 inclusive")

        return violations

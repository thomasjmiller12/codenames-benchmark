"""Prompt construction for LLM-backed Codenames agents.

Converts game state dicts (as produced by ``Game.get_spymaster_view`` and
``Game.get_operative_view``) into structured message lists suitable for
chat-based LLM APIs.
"""

from __future__ import annotations

import random
from pathlib import Path

from ..engine.types import CardType, Team

# Default prompts directory: <project_root>/prompts/
_DEFAULT_PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"


class PromptBuilder:
    """Builds LLM message lists from game state dicts.

    Parameters
    ----------
    prompts_dir:
        Directory containing ``spymaster_system.txt`` and
        ``operative_system.txt``.  Defaults to ``<project_root>/prompts/``.
    """

    def __init__(self, prompts_dir: str | Path | None = None) -> None:
        prompts_path = Path(prompts_dir) if prompts_dir is not None else _DEFAULT_PROMPTS_DIR

        spymaster_path = prompts_path / "spymaster_system.txt"
        operative_path = prompts_path / "operative_system.txt"

        self._spymaster_system = spymaster_path.read_text(encoding="utf-8").strip()
        self._operative_system = operative_path.read_text(encoding="utf-8").strip()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def build_spymaster_messages(
        self,
        game_view: dict,
        violations: list[str] | None = None,
    ) -> list[dict]:
        """Build the message list for a spymaster LLM call.

        Parameters
        ----------
        game_view:
            The dict returned by ``Game.get_spymaster_view(team)``.
        violations:
            If provided, the previous clue attempt was invalid.  The list
            contains human-readable violation descriptions.  The message
            list will include the bad response and a follow-up asking the
            LLM to try again.

        Returns
        -------
        list[dict]
            A list of ``{"role": ..., "content": ...}`` message dicts.
        """
        team = game_view["team"]
        opponent = Team.RED.value if team == Team.BLUE.value else Team.BLUE.value

        messages: list[dict] = [
            {"role": "system", "content": self._spymaster_system},
            {"role": "user", "content": self._format_spymaster_state(game_view, team, opponent)},
        ]

        if violations:
            # Reconstruct the bad clue from the most recent clue in move history
            bad_clue_text = self._find_last_bad_clue(game_view)
            if bad_clue_text:
                messages.append({"role": "assistant", "content": bad_clue_text})

            violation_lines = "\n".join(f"- {v}" for v in violations)
            messages.append({
                "role": "user",
                "content": (
                    f"Your previous clue was **invalid** for the following reasons:\n\n"
                    f"{violation_lines}\n\n"
                    f"Please provide a new, valid clue. Remember the rules and "
                    f"respond with the same JSON format."
                ),
            })

        return messages

    def build_operative_messages(self, game_view: dict) -> list[dict]:
        """Build the message list for an operative LLM call.

        Parameters
        ----------
        game_view:
            The dict returned by ``Game.get_operative_view(team)``.

        Returns
        -------
        list[dict]
            A list of ``{"role": ..., "content": ...}`` message dicts.
        """
        team = game_view["team"]
        opponent = Team.RED.value if team == Team.BLUE.value else Team.BLUE.value

        messages: list[dict] = [
            {"role": "system", "content": self._operative_system},
            {"role": "user", "content": self._format_operative_state(game_view, team, opponent)},
        ]

        return messages

    # ------------------------------------------------------------------
    # Spymaster formatting
    # ------------------------------------------------------------------

    def _format_spymaster_state(self, view: dict, team: str, opponent: str) -> str:
        """Format the full spymaster game state as a user message."""
        key_card: dict[str, str] = view["key_card"]
        unrevealed: list[str] = view["unrevealed_words"]
        revealed: dict[str, str] = view["revealed_words"]
        red_remaining: int = view["red_remaining"]
        blue_remaining: int = view["blue_remaining"]
        move_history: list[dict] = view["move_history"]
        turn_number: int = view["turn_number"]

        # Map card types to display labels relative to this team
        def label_for(card_type: str) -> str:
            if card_type == team:
                return "YOUR TEAM"
            elif card_type == opponent:
                return "OPPONENT"
            elif card_type == CardType.NEUTRAL.value:
                return "NEUTRAL"
            else:
                return "ASSASSIN"

        # --- Unrevealed words grouped by type ---
        your_words = [w for w in unrevealed if key_card.get(w) == team]
        opponent_words = [w for w in unrevealed if key_card.get(w) == opponent]
        neutral_words = [w for w in unrevealed if key_card.get(w) == CardType.NEUTRAL.value]
        assassin_words = [w for w in unrevealed if key_card.get(w) == CardType.ASSASSIN.value]

        # --- Revealed words ---
        revealed_lines: list[str] = []
        for word, card_type in revealed.items():
            revealed_lines.append(f"  {word}: {label_for(card_type)}")

        # --- Move history ---
        history_text = self._format_move_history(move_history)

        # --- Remaining counts ---
        if team == Team.RED.value:
            your_remaining = red_remaining
            opp_remaining = blue_remaining
        else:
            your_remaining = blue_remaining
            opp_remaining = red_remaining

        # --- Assemble the message ---
        sections: list[str] = [
            f"## Game State -- Turn {turn_number}\n",
            f"**Your team:** {team}\n",
            f"### Unrevealed Words by Category\n\n"
            f"**Your team's words** ({len(your_words)} remaining):\n"
            + ", ".join(your_words) + "\n\n"
            f"**Opponent's words** ({len(opponent_words)} remaining):\n"
            + ", ".join(opponent_words) + "\n\n"
            f"**Neutral words** ({len(neutral_words)}):\n"
            + ", ".join(neutral_words) + "\n\n"
            f"**Assassin:**\n"
            + ", ".join(assassin_words) + "\n",
        ]

        if revealed_lines:
            sections.append(
                f"### Already Revealed\n\n"
                + "\n".join(revealed_lines) + "\n"
            )

        sections.append(
            f"### Remaining Counts\n\n"
            f"- Your team ({team}): **{your_remaining}**\n"
            f"- Opponent ({opponent}): **{opp_remaining}**\n"
        )

        if history_text:
            sections.append(f"### Move History\n\n{history_text}\n")

        return "\n".join(sections)

    # ------------------------------------------------------------------
    # Operative formatting
    # ------------------------------------------------------------------

    def _format_operative_state(self, view: dict, team: str, opponent: str) -> str:
        """Format the full operative game state as a user message."""
        unrevealed: list[str] = list(view["unrevealed_words"])
        revealed: dict[str, str] = view["revealed_words"]
        red_remaining: int = view["red_remaining"]
        blue_remaining: int = view["blue_remaining"]
        current_clue: dict | None = view["current_clue"]
        guesses_this_turn: list[dict] = view["guesses_this_turn"]
        guesses_remaining: int = view["guesses_remaining"]
        move_history: list[dict] = view["move_history"]
        turn_number: int = view["turn_number"]

        # Shuffle unrevealed words to avoid position bias
        shuffled = unrevealed[:]
        random.shuffle(shuffled)

        # Map card types to display labels relative to this team
        def label_for(card_type: str) -> str:
            if card_type == team:
                return "YOUR TEAM"
            elif card_type == opponent:
                return "OPPONENT"
            elif card_type == CardType.NEUTRAL.value:
                return "NEUTRAL"
            else:
                return "ASSASSIN"

        # --- Revealed words ---
        revealed_lines: list[str] = []
        for word, card_type in revealed.items():
            revealed_lines.append(f"  {word}: {label_for(card_type)}")

        # --- Guesses this turn ---
        guess_lines: list[str] = []
        for g in guesses_this_turn:
            guess_lines.append(f"  {g['word']}: {g['result']}")

        # --- Remaining counts ---
        if team == Team.RED.value:
            your_remaining = red_remaining
            opp_remaining = blue_remaining
        else:
            your_remaining = blue_remaining
            opp_remaining = red_remaining

        # --- Current clue ---
        clue_text = "None"
        if current_clue is not None:
            clue_text = f"**{current_clue['word']}** (count: {current_clue['count']})"

        # --- Move history ---
        history_text = self._format_move_history(move_history)

        # --- Assemble the message ---
        sections: list[str] = [
            f"## Game State -- Turn {turn_number}\n",
            f"**Your team:** {team}\n",
            f"### Unrevealed Words on the Board\n\n"
            + ", ".join(shuffled) + "\n",
        ]

        if revealed_lines:
            sections.append(
                f"### Already Revealed\n\n"
                + "\n".join(revealed_lines) + "\n"
            )

        sections.append(
            f"### Current Clue\n\n"
            f"{clue_text}\n"
        )

        if guess_lines:
            sections.append(
                f"### Guesses Made This Turn\n\n"
                + "\n".join(guess_lines) + "\n"
            )

        sections.append(
            f"### Guesses Remaining: **{guesses_remaining}**\n"
        )

        sections.append(
            f"### Remaining Counts\n\n"
            f"- Your team ({team}): **{your_remaining}**\n"
            f"- Opponent ({opponent}): **{opp_remaining}**\n"
        )

        if history_text:
            sections.append(f"### Move History\n\n{history_text}\n")

        return "\n".join(sections)

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_move_history(move_history: list[dict]) -> str:
        """Format the move history into a concise summary.

        Groups moves by turn and presents clues with their resulting
        guesses.
        """
        if not move_history:
            return ""

        lines: list[str] = []
        current_turn: int | None = None
        current_team: str | None = None

        for move in move_history:
            turn_num = move["turn_number"]
            team = move["team"]

            if turn_num != current_turn or team != current_team:
                current_turn = turn_num
                current_team = team
                if move["action_type"] == "clue":
                    lines.append(
                        f"**Turn {turn_num} ({team}):** "
                        f"Clue = {move['clue_word']} ({move['clue_count']})"
                    )
            elif move["action_type"] == "clue":
                lines.append(
                    f"**Turn {turn_num} ({team}):** "
                    f"Clue = {move['clue_word']} ({move['clue_count']})"
                )

            if move["action_type"] == "guess":
                result = move.get("guess_result", "?")
                lines.append(f"  - Guess: {move['guess_word']} -> {result}")

        return "\n".join(lines)

    @staticmethod
    def _find_last_bad_clue(game_view: dict) -> str | None:
        """Extract the most recent clue from move history for violation feedback.

        Returns a plausible JSON-like assistant response string, or *None*
        if no clue is found.
        """
        move_history = game_view.get("move_history", [])
        for move in reversed(move_history):
            if move["action_type"] == "clue":
                return (
                    f'{{"reasoning": "...", '
                    f'"clue_word": "{move["clue_word"]}", '
                    f'"clue_count": {move["clue_count"]}}}'
                )
        return None

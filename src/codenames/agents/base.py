"""Abstract base classes for Codenames agents.

This module defines the protocols that all agents (LLM-backed or otherwise)
must implement, along with the data classes that represent agent actions.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..engine.clue import Clue
from ..engine.types import Team


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

@dataclass
class AgentIdentity:
    """Identifies an agent instance.

    Attributes
    ----------
    model_id:
        The model or strategy identifier, e.g. ``"anthropic/claude-sonnet-4"``
        or ``"random"``.
    agent_type:
        Either ``"spymaster"`` or ``"operative"``.
    team:
        The team the agent is playing for.
    """

    model_id: str
    agent_type: str
    team: Team


# ---------------------------------------------------------------------------
# Action data classes
# ---------------------------------------------------------------------------

@dataclass
class ClueAction:
    """The result of a spymaster deciding on a clue.

    Attributes
    ----------
    clue:
        The clue to give (word + count).
    reasoning:
        Free-text explanation of why this clue was chosen.
    raw_response:
        The raw LLM response text, if applicable.
    input_tokens:
        Number of input tokens consumed (0 for non-LLM agents).
    output_tokens:
        Number of output tokens produced (0 for non-LLM agents).
    latency_ms:
        Wall-clock time in milliseconds for the action.
    """

    clue: Clue
    reasoning: str
    raw_response: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    cost_usd: float | None = None
    generation_id: str | None = None


@dataclass
class GuessAction:
    """The result of an operative deciding on a guess.

    Attributes
    ----------
    word:
        The board word to guess (uppercase).
    confidence:
        A float in ``[0.0, 1.0]`` indicating the agent's confidence.
    reasoning:
        Free-text explanation of why this guess was chosen.
    should_stop:
        If ``True``, the operative elects to stop guessing this turn
        instead of submitting ``word``.
    raw_response:
        The raw LLM response text, if applicable.
    input_tokens:
        Number of input tokens consumed (0 for non-LLM agents).
    output_tokens:
        Number of output tokens produced (0 for non-LLM agents).
    latency_ms:
        Wall-clock time in milliseconds for the action.
    """

    word: str
    confidence: float
    reasoning: str
    should_stop: bool = False
    raw_response: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    cost_usd: float | None = None
    generation_id: str | None = None


# ---------------------------------------------------------------------------
# Abstract agent classes
# ---------------------------------------------------------------------------

class SpymasterAgent(ABC):
    """Abstract base class for spymaster agents.

    Implementations must provide :meth:`give_clue` and the :attr:`identity`
    property.
    """

    @abstractmethod
    async def give_clue(self, game_view: dict) -> ClueAction:
        """Decide on a clue to give based on the current game state.

        Parameters
        ----------
        game_view:
            The spymaster-perspective game state dict, as returned by
            ``Game.get_spymaster_view()``.

        Returns
        -------
        ClueAction
            The chosen clue along with metadata.
        """

    @property
    @abstractmethod
    def identity(self) -> AgentIdentity:
        """Return the identity descriptor for this agent."""


class OperativeAgent(ABC):
    """Abstract base class for operative agents.

    Implementations must provide :meth:`guess` and the :attr:`identity`
    property.
    """

    @abstractmethod
    async def guess(self, game_view: dict) -> GuessAction:
        """Decide on a guess (or stop) based on the current game state.

        Parameters
        ----------
        game_view:
            The operative-perspective game state dict, as returned by
            ``Game.get_operative_view()``.

        Returns
        -------
        GuessAction
            The chosen guess along with metadata.
        """

    @property
    @abstractmethod
    def identity(self) -> AgentIdentity:
        """Return the identity descriptor for this agent."""

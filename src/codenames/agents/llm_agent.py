"""LLM-backed agent implementations for the Codenames benchmark.

Wires :class:`LLMClient` and :class:`PromptBuilder` to the abstract
:class:`SpymasterAgent` and :class:`OperativeAgent` interfaces, converting
structured LLM responses into the engine's action data classes.
"""

from __future__ import annotations

from ..engine.clue import Clue
from ..engine.types import Team
from ..llm.client import LLMClient, LLMResponse
from ..llm.schemas import ClueResponse, GuessResponse
from .base import AgentIdentity, ClueAction, GuessAction, OperativeAgent, SpymasterAgent
from .prompts import PromptBuilder


class LLMSpymaster(SpymasterAgent):
    """Spymaster agent backed by a chat-based LLM.

    Uses :class:`PromptBuilder` to construct the message list and
    :class:`LLMClient` to obtain a structured :class:`ClueResponse`, which
    is then converted into a :class:`ClueAction` for the game engine.

    Parameters
    ----------
    model_id:
        The OpenRouter model identifier, e.g. ``"anthropic/claude-sonnet-4"``.
    team:
        The team this spymaster is playing for.
    llm_client:
        The shared LLM client instance.
    prompt_builder:
        The shared prompt builder instance.
    """

    def __init__(
        self,
        model_id: str,
        team: Team,
        llm_client: LLMClient,
        prompt_builder: PromptBuilder,
    ) -> None:
        self._model_id = model_id
        self._team = team
        self._llm_client = llm_client
        self._prompt_builder = prompt_builder

    async def give_clue(
        self,
        game_view: dict,
        violations: list[str] | None = None,
    ) -> ClueAction:
        """Decide on a clue by querying the LLM.

        Parameters
        ----------
        game_view:
            The spymaster-perspective game state dict, as returned by
            ``Game.get_spymaster_view()``.
        violations:
            If provided, the previous clue attempt was invalid.  These
            violation descriptions are forwarded to the prompt builder so
            the LLM can be re-prompted with corrective context.

        Returns
        -------
        ClueAction
            The chosen clue along with token usage and latency metadata.
        """
        messages = self._prompt_builder.build_spymaster_messages(
            game_view, violations=violations
        )

        llm_response: LLMResponse = await self._llm_client.get_clue(
            messages, model=self._model_id
        )

        clue_data: ClueResponse = llm_response.data  # type: ignore[assignment]

        return ClueAction(
            clue=Clue(word=clue_data.clue_word, count=clue_data.clue_count),
            reasoning="",
            raw_response=llm_response.raw_response,
            input_tokens=llm_response.input_tokens,
            output_tokens=llm_response.output_tokens,
            latency_ms=llm_response.latency_ms,
            generation_id=llm_response.generation_id,
        )

    @property
    def identity(self) -> AgentIdentity:
        return AgentIdentity(
            model_id=self._model_id,
            agent_type="spymaster",
            team=self._team,
        )


class LLMOperative(OperativeAgent):
    """Operative agent backed by a chat-based LLM.

    Uses :class:`PromptBuilder` to construct the message list and
    :class:`LLMClient` to obtain a structured :class:`GuessResponse`, which
    is then converted into a :class:`GuessAction` for the game engine.

    Parameters
    ----------
    model_id:
        The OpenRouter model identifier, e.g. ``"anthropic/claude-sonnet-4"``.
    team:
        The team this operative is playing for.
    llm_client:
        The shared LLM client instance.
    prompt_builder:
        The shared prompt builder instance.
    """

    def __init__(
        self,
        model_id: str,
        team: Team,
        llm_client: LLMClient,
        prompt_builder: PromptBuilder,
    ) -> None:
        self._model_id = model_id
        self._team = team
        self._llm_client = llm_client
        self._prompt_builder = prompt_builder

    async def guess(self, game_view: dict) -> GuessAction:
        """Decide on a guess by querying the LLM.

        Parameters
        ----------
        game_view:
            The operative-perspective game state dict, as returned by
            ``Game.get_operative_view()``.

        Returns
        -------
        GuessAction
            The chosen guess along with confidence, token usage, and
            latency metadata.
        """
        messages = self._prompt_builder.build_operative_messages(game_view)

        llm_response: LLMResponse = await self._llm_client.get_guess(
            messages, model=self._model_id
        )

        guess_data: GuessResponse = llm_response.data  # type: ignore[assignment]

        return GuessAction(
            word=guess_data.guess_word,
            confidence=guess_data.confidence,
            reasoning="",
            should_stop=guess_data.should_stop,
            raw_response=llm_response.raw_response,
            input_tokens=llm_response.input_tokens,
            output_tokens=llm_response.output_tokens,
            latency_ms=llm_response.latency_ms,
            generation_id=llm_response.generation_id,
        )

    @property
    def identity(self) -> AgentIdentity:
        return AgentIdentity(
            model_id=self._model_id,
            agent_type="operative",
            team=self._team,
        )

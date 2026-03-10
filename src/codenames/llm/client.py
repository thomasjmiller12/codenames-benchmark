"""LLM client wrapping OpenRouter via the instructor library."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx
import instructor
from openai import AsyncOpenAI, RateLimitError
from openai.types.chat import ChatCompletion
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


def _patch_reasoning_to_content(response: ChatCompletion) -> None:
    """Copy reasoning field to content when content is empty.

    Some models (e.g. z-ai/glm-5) return their JSON output in the
    ``reasoning`` field instead of ``content``.  Instructor expects content,
    so we normalise the response in-place before it reaches the parser.
    """
    for choice in response.choices:
        msg = choice.message
        if not msg.content and getattr(msg, "reasoning", None):
            msg.content = msg.reasoning
            logger.debug(
                "Copied reasoning field to content for model response %s",
                response.id,
            )


@dataclass
class LLMResponse:
    """Wraps a parsed response with metadata."""

    data: BaseModel  # The parsed ClueResponse or GuessResponse
    raw_response: str  # Raw text from the LLM
    input_tokens: int
    output_tokens: int
    latency_ms: float
    generation_id: str | None = None  # OpenRouter generation ID for cost lookup
    cost_usd: float | None = None  # Populated later via generation stats


class LLMClient:
    """OpenRouter client with structured output via instructor."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "openai/gpt-4o-mini",
        max_retries: int = 3,
        temperature: float = 0.7,
        max_concurrent_per_model: int = 5,
        timeout: float = 120.0,
    ):
        self._api_key = api_key
        # Use instructor to patch the AsyncOpenAI client for structured output
        self._openai_client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=httpx.Timeout(timeout, connect=10.0),
        )
        self._client = instructor.from_openai(
            self._openai_client,
            mode=instructor.Mode.JSON,
        )
        self._client.on("completion:response", _patch_reasoning_to_content)
        self._default_model = default_model
        self._max_retries = max_retries
        self._temperature = temperature
        # Rate limiting: semaphore per model
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._max_concurrent = max_concurrent_per_model

    async def close(self) -> None:
        """Close the underlying HTTP client to avoid asyncio teardown hangs."""
        await self._openai_client.close()

    def _get_semaphore(self, model: str) -> asyncio.Semaphore:
        if model not in self._semaphores:
            self._semaphores[model] = asyncio.Semaphore(self._max_concurrent)
        return self._semaphores[model]

    # Maximum raw response length (in characters) before we treat it as
    # degenerate (e.g. repetition loop) and refuse to retry.  A valid
    # clue or guess response should never exceed a few hundred tokens.
    MAX_RESPONSE_CHARS = 10_000

    # Rate-limit retries are handled separately from validation retries
    # since 429s are transient and may need more patience.
    MAX_RATE_LIMIT_RETRIES = 5

    @staticmethod
    def _rate_limit_wait_seconds(exc: RateLimitError) -> float:
        """Extract wait time from a 429 response, with a sensible fallback."""
        try:
            reset_ms = int(
                exc.response.headers.get("X-RateLimit-Reset", 0)  # type: ignore[union-attr]
            )
            if reset_ms > 0:
                wait = max(reset_ms / 1000 - time.time(), 1.0)
                return min(wait, 120.0)  # cap at 2 minutes
        except (AttributeError, ValueError, TypeError):
            pass
        # Fallback: use exponential backoff
        return 0  # caller will apply its own backoff

    async def query(
        self,
        messages: list[dict],
        response_model: type[BaseModel],
        model: str | None = None,
    ) -> LLMResponse:
        """Make a structured LLM call.

        We handle retries ourselves (rather than delegating to instructor)
        so we can detect degenerate responses (e.g. repetition loops) and
        bail out early instead of appending 60k+ tokens of garbage to the
        conversation context on each retry.

        Returns an ``LLMResponse`` with parsed data and metadata.
        """
        model = model or self._default_model
        semaphore = self._get_semaphore(model)

        async with semaphore:
            t0 = time.monotonic()
            rate_limit_retries = 0

            last_exc: Exception | None = None
            for attempt in range(self._max_retries):
                try:
                    # No instructor retries — we handle retries in this loop
                    result, completion = (
                        await self._client.chat.completions.create_with_completion(
                            model=model,
                            messages=messages,
                            response_model=response_model,
                            max_retries=0,
                            temperature=self._temperature,
                        )
                    )
                    break
                except RateLimitError as e:
                    rate_limit_retries += 1
                    if rate_limit_retries > self.MAX_RATE_LIMIT_RETRIES:
                        raise
                    wait = self._rate_limit_wait_seconds(e)
                    if wait < 1:
                        wait = min(2 ** rate_limit_retries, 60)
                    logger.warning(
                        "Rate limited on %s (retry %d/%d), "
                        "waiting %.0fs...",
                        model,
                        rate_limit_retries,
                        self.MAX_RATE_LIMIT_RETRIES,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                except (ValidationError, instructor.core.exceptions.InstructorRetryException) as e:
                    last_exc = e

                    # Check for degenerate response (repetition loop, garbage)
                    raw_content = self._extract_raw_from_exception(e)
                    if raw_content and len(raw_content) > self.MAX_RESPONSE_CHARS:
                        logger.warning(
                            "Degenerate response from %s (%d chars) — "
                            "aborting retries to avoid context bloat",
                            model,
                            len(raw_content),
                        )
                        raise

                    # Check for server errors with backoff
                    err_str = str(e)
                    if "Internal Server Error" in err_str or "code': 500" in err_str:
                        wait = 2 ** attempt
                        logger.warning(
                            "OpenRouter server error (attempt %d/%d), "
                            "retrying in %ds...",
                            attempt + 1,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue

                    # Validation failure — retry (instructor will append
                    # the error context to messages automatically)
                    logger.debug(
                        "Validation error from %s (attempt %d/%d): %s",
                        model,
                        attempt + 1,
                        self._max_retries,
                        e,
                    )
                    continue
                except Exception as e:
                    last_exc = e
                    err_str = str(e)
                    if "Internal Server Error" in err_str or "code': 500" in err_str:
                        wait = 2 ** attempt
                        logger.warning(
                            "OpenRouter server error (attempt %d/%d), "
                            "retrying in %ds...",
                            attempt + 1,
                            self._max_retries,
                            wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    raise
            else:
                # All retries exhausted
                raise last_exc  # type: ignore[misc]

            latency_ms = (time.monotonic() - t0) * 1000
            logger.info(
                "LLM call to %s completed in %.0fms",
                model,
                latency_ms,
            )

            # Extract token usage from completion
            usage = completion.usage
            input_tokens = usage.prompt_tokens if usage else 0
            output_tokens = usage.completion_tokens if usage else 0

            # Get raw response text
            raw = ""
            if completion.choices:
                raw = completion.choices[0].message.content or ""

            return LLMResponse(
                data=result,
                raw_response=raw,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                generation_id=completion.id,
            )

    @staticmethod
    def _extract_raw_from_exception(exc: Exception) -> str | None:
        """Best-effort extraction of raw LLM content from a retry exception."""
        # instructor wraps the last completion in the exception args
        for arg in exc.args:
            if isinstance(arg, str) and len(arg) > 200:
                return arg
        # Check for nested exception context
        if exc.__cause__:
            for arg in exc.__cause__.args:
                if isinstance(arg, str) and len(arg) > 200:
                    return arg
        return None

    async def get_clue(
        self, messages: list[dict], model: str | None = None
    ) -> LLMResponse:
        """Convenience: query with ClueResponse schema."""
        from codenames.llm.schemas import ClueResponse

        return await self.query(messages, ClueResponse, model)

    async def get_guess(
        self, messages: list[dict], model: str | None = None
    ) -> LLMResponse:
        """Convenience: query with GuessResponse schema."""
        from codenames.llm.schemas import GuessResponse

        return await self.query(messages, GuessResponse, model)

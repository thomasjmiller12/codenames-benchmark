"""Pydantic v2 response models for structured LLM output."""

from pydantic import BaseModel, Field, field_validator


class ClueResponse(BaseModel):
    """Schema for spymaster clue-giving responses."""

    clue_word: str = Field(
        description=(
            "A single English word as the clue. Must not be a word on the board."
        )
    )
    clue_count: int = Field(
        ge=1,
        le=9,
        description="Number of board words this clue relates to",
    )

    @field_validator("clue_word")
    @classmethod
    def normalize_clue(cls, v: str) -> str:
        return v.strip().upper()


class GuessResponse(BaseModel):
    """Schema for operative guessing responses."""

    guess_word: str = Field(
        description="An unrevealed word from the board to guess"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence this word matches the clue (0.0-1.0)",
    )
    should_stop: bool = Field(
        default=False,
        description="Set to true to stop guessing and end the turn",
    )

    @field_validator("guess_word")
    @classmethod
    def normalize_guess(cls, v: str) -> str:
        return v.strip().upper()

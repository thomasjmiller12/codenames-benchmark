"""Agent interface layer for the Codenames benchmark suite.

Exports abstract base classes, action data classes, and concrete
implementations (random baseline).
"""

from .base import AgentIdentity, ClueAction, GuessAction, OperativeAgent, SpymasterAgent
from .prompts import PromptBuilder
from .random_agent import RandomOperative, RandomSpymaster

__all__ = [
    # Abstract base classes
    "SpymasterAgent",
    "OperativeAgent",
    # Data classes
    "AgentIdentity",
    "ClueAction",
    "GuessAction",
    # Prompt construction
    "PromptBuilder",
    # Random baseline
    "RandomSpymaster",
    "RandomOperative",
]

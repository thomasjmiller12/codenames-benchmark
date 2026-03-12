"""YAML-based experiment configuration for Codenames benchmarks.

Loads and validates experiment config files, mapping them to the
``TournamentConfig`` used by the tournament runner.

Example YAML::

    name: my-experiment
    games_per_matchup: 6
    seed: 42
    max_concurrent: 4
    move_timeout: 120

    models:
      - openai/gpt-4o
      - anthropic/claude-3.5-sonnet

    matchups:
      - [google/gemini-pro, openai/gpt-4o]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .tournament import TournamentConfig


@dataclass
class ExperimentConfig:
    """Parsed representation of a YAML experiment file.

    At least one of ``models`` or ``matchups`` must be non-empty.
    """

    name: str | None = None
    mode: str = "solo"
    games_per_matchup: int = 6
    seed: int = 42
    max_concurrent: int = 4
    max_concurrent_per_model: int = 5
    move_timeout: float | None = 120.0
    models: list[str] = field(default_factory=list)
    matchups: list[tuple[str, str]] = field(default_factory=list)


def load_experiment_config(path: str | Path) -> ExperimentConfig:
    """Load and validate an experiment config from a YAML file.

    Raises ``ValueError`` on invalid configuration.
    """
    path = Path(path)
    with open(path) as f:
        raw = yaml.safe_load(f)

    if not isinstance(raw, dict):
        raise ValueError(f"Expected a YAML mapping, got {type(raw).__name__}")

    known_keys = {
        "name", "mode", "games_per_matchup", "seed",
        "max_concurrent", "max_concurrent_per_model", "move_timeout",
        "models", "matchups",
    }
    unknown = set(raw.keys()) - known_keys
    if unknown:
        raise ValueError(f"Unknown config keys: {', '.join(sorted(unknown))}")

    models = raw.get("models") or []
    if not isinstance(models, list):
        raise ValueError("'models' must be a list of model ID strings")
    for m in models:
        if not isinstance(m, str):
            raise ValueError(f"Each model must be a string, got {type(m).__name__}: {m!r}")

    matchups: list[tuple[str, str]] = []
    raw_matchups = raw.get("matchups") or []
    if not isinstance(raw_matchups, list):
        raise ValueError("'matchups' must be a list of [model_a, model_b] pairs")
    for i, pair in enumerate(raw_matchups):
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError(
                f"matchups[{i}]: expected a [model_a, model_b] pair, got {pair!r}"
            )
        if not isinstance(pair[0], str) or not isinstance(pair[1], str):
            raise ValueError(
                f"matchups[{i}]: both elements must be strings, got {pair!r}"
            )
        if pair[0] == pair[1]:
            raise ValueError(
                f"matchups[{i}]: a model cannot play against itself ({pair[0]!r})"
            )
        matchups.append((pair[0], pair[1]))

    if not models and not matchups:
        raise ValueError(
            "At least one of 'models' or 'matchups' must be provided"
        )

    if models and len(models) < 2 and not matchups:
        raise ValueError(
            "Need at least 2 models for round-robin, or provide 'matchups'"
        )

    games_per_matchup = raw.get("games_per_matchup", 6)
    if not isinstance(games_per_matchup, int) or games_per_matchup < 2:
        raise ValueError(f"'games_per_matchup' must be an integer >= 2, got {games_per_matchup!r}")
    if games_per_matchup % 2 != 0:
        raise ValueError(
            f"'games_per_matchup' must be even for fair side swaps, got {games_per_matchup}"
        )

    move_timeout = raw.get("move_timeout", 120.0)
    if move_timeout is not None:
        move_timeout = float(move_timeout)
        if move_timeout <= 0:
            move_timeout = None

    return ExperimentConfig(
        name=raw.get("name"),
        mode=raw.get("mode", "solo"),
        games_per_matchup=games_per_matchup,
        seed=raw.get("seed", 42),
        max_concurrent=raw.get("max_concurrent", 4),
        max_concurrent_per_model=raw.get("max_concurrent_per_model", 5),
        move_timeout=move_timeout,
        models=models,
        matchups=matchups,
    )


def config_to_tournament(config: ExperimentConfig) -> TournamentConfig:
    """Convert an ``ExperimentConfig`` to a ``TournamentConfig``."""
    # Collect all unique model IDs for DB registration
    all_models: set[str] = set(config.models)
    for a, b in config.matchups:
        all_models.add(a)
        all_models.add(b)

    return TournamentConfig(
        models=sorted(all_models),
        mode=config.mode,
        games_per_matchup=config.games_per_matchup,
        seed=config.seed,
        matchups=config.matchups if config.matchups else None,
        max_concurrent=config.max_concurrent,
        move_timeout=config.move_timeout,
    )

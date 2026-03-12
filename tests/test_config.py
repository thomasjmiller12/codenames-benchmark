"""Tests for YAML experiment configuration loading and validation."""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from codenames.benchmark.config import (
    ExperimentConfig,
    config_to_tournament,
    load_experiment_config,
)
from codenames.benchmark.scheduler import Scheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_yaml(tmp_path: Path, content: str) -> Path:
    """Write YAML content to a temp file and return the path."""
    p = tmp_path / "experiment.yaml"
    p.write_text(textwrap.dedent(content))
    return p


# ---------------------------------------------------------------------------
# load_experiment_config
# ---------------------------------------------------------------------------


class TestLoadExperimentConfig:
    def test_round_robin_only(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            name: rr-test
            games_per_matchup: 4
            seed: 99
            models:
              - model-a
              - model-b
              - model-c
        """)
        cfg = load_experiment_config(p)
        assert cfg.name == "rr-test"
        assert cfg.games_per_matchup == 4
        assert cfg.seed == 99
        assert cfg.models == ["model-a", "model-b", "model-c"]
        assert cfg.matchups == []

    def test_matchups_only(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            matchups:
              - [model-a, model-b]
              - [model-c, model-d]
        """)
        cfg = load_experiment_config(p)
        assert cfg.models == []
        assert cfg.matchups == [("model-a", "model-b"), ("model-c", "model-d")]

    def test_mixed(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            models:
              - model-a
              - model-b
            matchups:
              - [model-c, model-a]
        """)
        cfg = load_experiment_config(p)
        assert cfg.models == ["model-a", "model-b"]
        assert cfg.matchups == [("model-c", "model-a")]

    def test_defaults(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            models:
              - a
              - b
        """)
        cfg = load_experiment_config(p)
        assert cfg.mode == "solo"
        assert cfg.games_per_matchup == 6
        assert cfg.seed == 42
        assert cfg.max_concurrent == 4
        assert cfg.move_timeout == 120.0

    def test_move_timeout_zero_disables(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            move_timeout: 0
            models: [a, b]
        """)
        cfg = load_experiment_config(p)
        assert cfg.move_timeout is None

    def test_error_no_models_or_matchups(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            name: empty
            seed: 1
        """)
        with pytest.raises(ValueError, match="At least one of"):
            load_experiment_config(p)

    def test_error_single_model_no_matchups(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            models:
              - only-one
        """)
        with pytest.raises(ValueError, match="at least 2 models"):
            load_experiment_config(p)

    def test_error_odd_games_per_matchup(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            games_per_matchup: 3
            models: [a, b]
        """)
        with pytest.raises(ValueError, match="even"):
            load_experiment_config(p)

    def test_error_unknown_keys(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            models: [a, b]
            budget: 100
        """)
        with pytest.raises(ValueError, match="Unknown config keys"):
            load_experiment_config(p)

    def test_error_matchup_not_pair(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            matchups:
              - [a, b, c]
        """)
        with pytest.raises(ValueError, match="matchups\\[0\\]"):
            load_experiment_config(p)

    def test_error_self_matchup(self, tmp_path: Path) -> None:
        p = _write_yaml(tmp_path, """\
            matchups:
              - [a, a]
        """)
        with pytest.raises(ValueError, match="cannot play against itself"):
            load_experiment_config(p)


# ---------------------------------------------------------------------------
# config_to_tournament
# ---------------------------------------------------------------------------


class TestConfigToTournament:
    def test_round_robin_config(self) -> None:
        cfg = ExperimentConfig(
            models=["a", "b", "c"],
            games_per_matchup=4,
            seed=10,
        )
        tc = config_to_tournament(cfg)
        assert sorted(tc.models) == ["a", "b", "c"]
        assert tc.matchups is None
        assert tc.games_per_matchup == 4
        assert tc.seed == 10

    def test_matchups_config(self) -> None:
        cfg = ExperimentConfig(
            matchups=[("x", "y"), ("y", "z")],
        )
        tc = config_to_tournament(cfg)
        assert sorted(tc.models) == ["x", "y", "z"]
        assert tc.matchups == [("x", "y"), ("y", "z")]

    def test_mixed_collects_all_models(self) -> None:
        cfg = ExperimentConfig(
            models=["a", "b"],
            matchups=[("c", "a")],
        )
        tc = config_to_tournament(cfg)
        assert sorted(tc.models) == ["a", "b", "c"]
        assert tc.matchups == [("c", "a")]


# ---------------------------------------------------------------------------
# Scheduler.build_solo_schedule
# ---------------------------------------------------------------------------


class TestBuildSoloSchedule:
    def test_round_robin_only(self) -> None:
        schedule = Scheduler.build_solo_schedule(
            models=["a", "b", "c"],
            games_per_matchup=2,
            base_seed=0,
        )
        # 3 pairs, 2 games each = 6
        assert len(schedule) == 6

    def test_matchups_only(self) -> None:
        schedule = Scheduler.build_solo_schedule(
            matchups=[("a", "b"), ("c", "d")],
            games_per_matchup=2,
            base_seed=0,
        )
        # 2 pairs, 2 games each = 4
        assert len(schedule) == 4

    def test_mixed_deduplicates(self) -> None:
        # round-robin of [a,b] generates pair (a,b)
        # explicit matchup (b,a) is the same pair — should be deduped
        schedule = Scheduler.build_solo_schedule(
            models=["a", "b"],
            matchups=[("b", "a")],
            games_per_matchup=2,
            base_seed=0,
        )
        # Only 1 unique pair, 2 games = 2
        assert len(schedule) == 2

    def test_mixed_adds_new_pairs(self) -> None:
        schedule = Scheduler.build_solo_schedule(
            models=["a", "b"],
            matchups=[("c", "a")],
            games_per_matchup=2,
            base_seed=0,
        )
        # (a,b) from round-robin + (c,a) from matchups = 2 pairs, 4 games
        assert len(schedule) == 4

    def test_mirrored_pairs(self) -> None:
        schedule = Scheduler.build_solo_schedule(
            matchups=[("a", "b")],
            games_per_matchup=2,
            base_seed=0,
        )
        assert len(schedule) == 2
        g1, g2 = schedule
        # Same board seed (mirrored)
        assert g1.board_seed == g2.board_seed
        # Sides swapped
        assert g1.red_sm_model == g2.blue_sm_model
        assert g1.blue_sm_model == g2.red_sm_model
        # Same pair_id
        assert g1.pair_id == g2.pair_id

    def test_unique_pair_ids(self) -> None:
        schedule = Scheduler.build_solo_schedule(
            models=["a", "b", "c"],
            games_per_matchup=2,
            base_seed=0,
        )
        pair_ids = {m.pair_id for m in schedule}
        assert len(pair_ids) == 3  # 3 unique pairs

    def test_error_odd_games(self) -> None:
        with pytest.raises(ValueError, match="even"):
            Scheduler.build_solo_schedule(
                models=["a", "b"],
                games_per_matchup=3,
            )

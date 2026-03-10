"""Tests for the storage layer: Database and Repository.

Uses the ``db`` and ``repo`` fixtures from conftest.py, which provide a
temporary SQLite database that is cleaned up after each test.
"""

from __future__ import annotations

import json
import sqlite3

import pytest

from codenames.storage.database import Database
from codenames.storage.repository import Repository


# ===========================================================================
# Database tests
# ===========================================================================


class TestDatabase:
    """Tests for the Database connection manager."""

    def test_initialize_creates_tables(self, db):
        """initialize() should create all schema tables."""
        cursor = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        table_names = {row["name"] for row in cursor.fetchall()}
        expected_tables = {"models", "experiments", "boards", "games", "turns", "ratings_history"}
        assert expected_tables.issubset(table_names)

    def test_initialize_idempotent(self, tmp_path):
        """Calling initialize() twice should not fail."""
        db_path = str(tmp_path / "test_idempotent.db")
        database = Database(db_path)
        database.initialize()
        database.initialize()  # Should not raise
        database.close()

    def test_connection_property_before_init_raises(self, tmp_path):
        """Accessing connection before initialize() should raise RuntimeError."""
        db_path = str(tmp_path / "test_uninit.db")
        database = Database(db_path)
        with pytest.raises(RuntimeError, match="not initialized"):
            _ = database.connection
        database.close()

    def test_context_manager(self, tmp_path):
        """Database should work as a context manager."""
        db_path = str(tmp_path / "test_context.db")
        with Database(db_path) as database:
            cursor = database.execute("SELECT 1 AS val")
            row = cursor.fetchone()
            assert row["val"] == 1

    def test_execute_returns_cursor(self, db):
        """execute() should return a sqlite3.Cursor."""
        cursor = db.execute("SELECT 1 AS val")
        assert isinstance(cursor, sqlite3.Cursor)

    def test_close_can_be_called_multiple_times(self, tmp_path):
        """close() should not fail when called multiple times."""
        db_path = str(tmp_path / "test_close.db")
        database = Database(db_path)
        database.initialize()
        database.close()
        database.close()  # Should not raise

    def test_foreign_keys_enabled(self, db):
        """Foreign key enforcement should be enabled."""
        cursor = db.execute("PRAGMA foreign_keys")
        row = cursor.fetchone()
        assert row[0] == 1

    def test_tables_have_expected_columns(self, db):
        """Verify key columns exist on important tables."""
        # Check models table
        cursor = db.execute("PRAGMA table_info(models)")
        columns = {row["name"] for row in cursor.fetchall()}
        assert "model_id" in columns
        assert "display_name" in columns
        assert "solo_rating" in columns

        # Check games table
        cursor = db.execute("PRAGMA table_info(games)")
        columns = {row["name"] for row in cursor.fetchall()}
        assert "game_id" in columns
        assert "red_sm_model" in columns
        assert "blue_sm_model" in columns
        assert "winner" in columns


# ===========================================================================
# Repository: Models
# ===========================================================================


class TestRepositoryModels:
    """Tests for Repository model CRUD operations."""

    def test_save_and_get_model_round_trip(self, repo):
        """save_model then get_model should return the same data."""
        repo.save_model(
            model_id="test-model",
            display_name="Test Model",
            openrouter_id="provider/test-model",
            cost_input=1.0,
            cost_output=2.0,
        )

        model = repo.get_model("test-model")
        assert model is not None
        assert model["model_id"] == "test-model"
        assert model["display_name"] == "Test Model"
        assert model["openrouter_id"] == "provider/test-model"
        assert model["cost_per_m_input_tokens"] == 1.0
        assert model["cost_per_m_output_tokens"] == 2.0

    def test_get_model_returns_none_for_missing(self, repo):
        """get_model should return None for a non-existent model."""
        model = repo.get_model("nonexistent")
        assert model is None

    def test_list_models_empty_initially(self, repo):
        """list_models should return empty list when no models exist."""
        models = repo.list_models()
        assert models == []

    def test_list_models_returns_all(self, repo):
        """list_models should return all saved models."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")

        models = repo.list_models()
        assert len(models) == 2
        model_ids = {m["model_id"] for m in models}
        assert model_ids == {"model-a", "model-b"}

    def test_upsert_updates_existing_model(self, repo):
        """save_model should update an existing model on conflict."""
        repo.save_model("model-a", "Old Name", "provider/a")
        repo.save_model("model-a", "New Name", "provider/a-v2")

        model = repo.get_model("model-a")
        assert model is not None
        assert model["display_name"] == "New Name"
        assert model["openrouter_id"] == "provider/a-v2"

    def test_model_default_ratings(self, repo):
        """New models should have default rating of 1500."""
        repo.save_model("model-a", "Model A", "provider/a")
        model = repo.get_model("model-a")
        assert model is not None
        assert model["solo_rating"] == 1500.0
        assert model["solo_games_played"] == 0


# ===========================================================================
# Repository: Boards
# ===========================================================================


class TestRepositoryBoards:
    """Tests for Repository board operations."""

    def test_save_and_get_board_round_trip(self, repo):
        """save_board then get_board should preserve all data."""
        words = ["WORD" + str(i) for i in range(25)]
        key_card = {f"WORD{i}": "RED" if i < 9 else "BLUE" for i in range(25)}

        board_id = repo.save_board(
            seed=42,
            words=words,
            key_card=key_card,
            starting_team="RED",
        )

        board = repo.get_board(board_id)
        assert board is not None
        assert board["seed"] == 42
        assert board["starting_team"] == "RED"
        # JSON fields should be deserialized
        assert board["words"] == words
        assert board["key_card"] == key_card

    def test_board_id_is_integer(self, repo):
        """save_board should return an integer board_id."""
        board_id = repo.save_board(
            seed=1,
            words=["W" + str(i) for i in range(25)],
            key_card={},
            starting_team="RED",
        )
        assert isinstance(board_id, int)

    def test_get_board_returns_none_for_missing(self, repo):
        """get_board should return None for a non-existent board_id."""
        board = repo.get_board(99999)
        assert board is None

    def test_board_words_are_json_deserialized(self, repo):
        """Board words should be deserialized from JSON to a Python list."""
        words = ["ALPHA", "BETA", "GAMMA"]
        board_id = repo.save_board(
            seed=100,
            words=words,
            key_card={"ALPHA": "RED"},
            starting_team="BLUE",
        )
        board = repo.get_board(board_id)
        assert board is not None
        assert isinstance(board["words"], list)
        assert board["words"] == words

    def test_board_key_card_is_json_deserialized(self, repo):
        """Board key_card should be deserialized from JSON to a Python dict."""
        key_card = {"ALPHA": "RED", "BETA": "BLUE"}
        board_id = repo.save_board(
            seed=200,
            words=["ALPHA", "BETA"],
            key_card=key_card,
            starting_team="RED",
        )
        board = repo.get_board(board_id)
        assert board is not None
        assert isinstance(board["key_card"], dict)
        assert board["key_card"] == key_card


# ===========================================================================
# Repository: Games
# ===========================================================================


class TestRepositoryGames:
    """Tests for Repository game operations."""

    def _make_game_data(self, game_id="game-001", experiment_id=None, **overrides):
        """Helper to create minimal valid game data."""
        data = {
            "game_id": game_id,
            "red_sm_model": "model-a",
            "red_op_model": "model-a",
            "blue_sm_model": "model-b",
            "blue_op_model": "model-b",
            "mode": "solo",
            "status": "completed",
        }
        if experiment_id:
            data["experiment_id"] = experiment_id
        data.update(overrides)
        return data

    def test_save_and_get_game(self, repo):
        """save_game then get_games should return the game."""
        game_data = self._make_game_data()
        repo.save_game(game_data)

        games = repo.get_games(limit=10)
        assert len(games) == 1
        assert games[0]["game_id"] == "game-001"
        assert games[0]["red_sm_model"] == "model-a"
        assert games[0]["blue_sm_model"] == "model-b"

    def test_save_game_returns_game_id(self, repo):
        """save_game should return the game_id."""
        game_data = self._make_game_data(game_id="game-xyz")
        result = repo.save_game(game_data)
        assert result == "game-xyz"

    def test_get_games_with_experiment_filter(self, repo):
        """get_games should filter by experiment_id."""
        # Create an experiment first
        repo.save_experiment({
            "experiment_id": "exp-001",
            "name": "Test Experiment",
            "mode": "solo",
            "config_json": {"models": []},
        })

        repo.save_game(self._make_game_data("game-1", experiment_id="exp-001"))
        repo.save_game(self._make_game_data("game-2", experiment_id=None))

        filtered = repo.get_games(experiment_id="exp-001", limit=10)
        assert len(filtered) == 1
        assert filtered[0]["game_id"] == "game-1"

    def test_get_games_with_model_filter(self, repo):
        """get_games should filter by model_id in any slot."""
        repo.save_game(self._make_game_data(
            "game-1",
            red_sm_model="model-x",
            red_op_model="model-x",
            blue_sm_model="model-b",
            blue_op_model="model-b",
        ))
        repo.save_game(self._make_game_data(
            "game-2",
            red_sm_model="model-c",
            red_op_model="model-c",
            blue_sm_model="model-d",
            blue_op_model="model-d",
        ))

        filtered = repo.get_games(model_id="model-x", limit=10)
        assert len(filtered) == 1
        assert filtered[0]["game_id"] == "game-1"

    def test_get_games_limit(self, repo):
        """get_games should respect the limit parameter."""
        for i in range(5):
            repo.save_game(self._make_game_data(f"game-{i}"))

        games = repo.get_games(limit=3)
        assert len(games) == 3

    def test_save_game_with_json_fields(self, repo):
        """save_game should handle dict/list values as JSON."""
        game_data = self._make_game_data(
            game_id="game-json",
            game_log_json=[{"turn": 1, "action": "clue"}],
        )
        repo.save_game(game_data)

        games = repo.get_games(limit=10)
        assert len(games) == 1
        # The game_log_json should have been stored as JSON and decoded
        game = games[0]
        assert game.get("game_log") is not None or game.get("game_log_json") is not None


# ===========================================================================
# Repository: Ratings
# ===========================================================================


class TestRepositoryRatings:
    """Tests for Repository rating operations."""

    def _create_game(self, repo, game_id="game-001"):
        """Helper to create a minimal game record for FK references."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")
        repo.save_game({
            "game_id": game_id,
            "red_sm_model": "model-a",
            "red_op_model": "model-a",
            "blue_sm_model": "model-b",
            "blue_op_model": "model-b",
            "mode": "solo",
            "status": "completed",
        })

    def test_update_rating_changes_model(self, repo):
        """update_rating should update the model's rating and game count."""
        self._create_game(repo, "game-001")

        repo.update_rating(
            model_id="model-a",
            rating_type="solo",
            new_rating=1520.0,
            game_id="game-001",
            old_rating=1500.0,
            result=1.0,
        )

        model = repo.get_model("model-a")
        assert model is not None
        assert model["solo_rating"] == 1520.0
        assert model["solo_games_played"] == 1

    def test_update_rating_increments_games(self, repo):
        """Multiple update_rating calls should increment the games count."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")

        for i in range(3):
            game_id = f"game-{i}"
            repo.save_game({
                "game_id": game_id,
                "red_sm_model": "model-a",
                "red_op_model": "model-a",
                "blue_sm_model": "model-b",
                "blue_op_model": "model-b",
                "mode": "solo",
                "status": "completed",
            })
            repo.update_rating(
                model_id="model-a",
                rating_type="solo",
                new_rating=1500.0 + (i + 1) * 10,
                game_id=game_id,
                old_rating=1500.0 + i * 10,
                result=1.0,
            )

        model = repo.get_model("model-a")
        assert model is not None
        assert model["solo_games_played"] == 3

    def test_update_rating_for_spymaster(self, repo):
        """update_rating should work for spymaster rating type."""
        self._create_game(repo, "game-001")

        repo.update_rating(
            model_id="model-a",
            rating_type="spymaster",
            new_rating=1550.0,
            game_id="game-001",
            old_rating=1500.0,
            result=1.0,
        )

        model = repo.get_model("model-a")
        assert model is not None
        assert model["spymaster_rating"] == 1550.0
        assert model["spymaster_games"] == 1

    def test_update_rating_for_operative(self, repo):
        """update_rating should work for operative rating type."""
        self._create_game(repo, "game-001")

        repo.update_rating(
            model_id="model-a",
            rating_type="operative",
            new_rating=1480.0,
            game_id="game-001",
            old_rating=1500.0,
            result=0.0,
        )

        model = repo.get_model("model-a")
        assert model is not None
        assert model["operative_rating"] == 1480.0
        assert model["operative_games"] == 1


# ===========================================================================
# Repository: Leaderboard
# ===========================================================================


class TestRepositoryLeaderboard:
    """Tests for Repository leaderboard queries."""

    def _create_game(self, repo, game_id):
        """Helper to create a minimal game record for FK references."""
        repo.save_game({
            "game_id": game_id,
            "red_sm_model": "model-a",
            "red_op_model": "model-a",
            "blue_sm_model": "model-b",
            "blue_op_model": "model-b",
            "mode": "solo",
            "status": "completed",
        })

    def test_get_leaderboard_sorted_by_rating(self, repo):
        """get_leaderboard should return models sorted by rating descending."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")
        repo.save_model("model-c", "Model C", "provider/c")

        # Create game records for FK references
        for gid in ["g1", "g2", "g3"]:
            repo.save_game({
                "game_id": gid,
                "red_sm_model": "model-a",
                "red_op_model": "model-a",
                "blue_sm_model": "model-b",
                "blue_op_model": "model-b",
                "mode": "solo",
                "status": "completed",
            })

        # Update ratings so we have a clear ordering
        repo.update_rating("model-a", "solo", 1600.0, "g1", 1500.0, 1.0)
        repo.update_rating("model-b", "solo", 1400.0, "g2", 1500.0, 0.0)
        repo.update_rating("model-c", "solo", 1550.0, "g3", 1500.0, 1.0)

        leaderboard = repo.get_leaderboard(rating_type="solo", limit=10)
        assert len(leaderboard) == 3
        assert leaderboard[0]["model_id"] == "model-a"
        assert leaderboard[1]["model_id"] == "model-c"
        assert leaderboard[2]["model_id"] == "model-b"

    def test_get_leaderboard_respects_limit(self, repo):
        """get_leaderboard should respect the limit parameter."""
        for i in range(5):
            repo.save_model(f"model-{i}", f"Model {i}", f"provider/{i}")

        leaderboard = repo.get_leaderboard(limit=3)
        assert len(leaderboard) == 3

    def test_get_leaderboard_empty(self, repo):
        """get_leaderboard should return empty list when no models exist."""
        leaderboard = repo.get_leaderboard()
        assert leaderboard == []

    def test_get_leaderboard_includes_games_played(self, repo):
        """Leaderboard entries should include games_played."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")

        for gid in ["g1", "g2"]:
            repo.save_game({
                "game_id": gid,
                "red_sm_model": "model-a",
                "red_op_model": "model-a",
                "blue_sm_model": "model-b",
                "blue_op_model": "model-b",
                "mode": "solo",
                "status": "completed",
            })

        repo.update_rating("model-a", "solo", 1520.0, "g1", 1500.0, 1.0)
        repo.update_rating("model-a", "solo", 1540.0, "g2", 1520.0, 1.0)

        leaderboard = repo.get_leaderboard(rating_type="solo", limit=10)
        assert len(leaderboard) == 2
        # model-a should be first (higher rating)
        assert leaderboard[0]["model_id"] == "model-a"
        assert leaderboard[0]["games_played"] == 2


# ===========================================================================
# Repository: Experiments
# ===========================================================================


class TestRepositoryExperiments:
    """Tests for Repository experiment operations."""

    def test_save_experiment_returns_id(self, repo):
        """save_experiment should return the experiment_id."""
        result = repo.save_experiment({
            "experiment_id": "exp-001",
            "name": "Test Experiment",
            "mode": "solo",
            "config_json": {"models": ["a", "b"]},
        })
        assert result == "exp-001"

    def test_update_experiment_modifies_fields(self, repo):
        """update_experiment should modify the specified fields."""
        repo.save_experiment({
            "experiment_id": "exp-001",
            "name": "Test Experiment",
            "mode": "solo",
            "config_json": {"models": []},
            "status": "created",
        })

        repo.update_experiment(
            "exp-001",
            status="running",
            total_games_completed=10,
        )

        # Verify by querying directly
        cursor = repo._db.execute(
            "SELECT status, total_games_completed FROM experiments WHERE experiment_id = ?",
            ("exp-001",),
        )
        row = cursor.fetchone()
        assert row is not None
        assert row["status"] == "running"
        assert row["total_games_completed"] == 10

    def test_update_experiment_no_kwargs(self, repo):
        """update_experiment with no kwargs should be a no-op."""
        repo.save_experiment({
            "experiment_id": "exp-001",
            "name": "Test Experiment",
            "mode": "solo",
            "config_json": {},
        })
        # Should not raise
        repo.update_experiment("exp-001")

    def test_save_experiment_with_json_config(self, repo):
        """save_experiment should serialize dict config to JSON."""
        config = {"models": ["a", "b"], "seed": 42, "games": 6}
        repo.save_experiment({
            "experiment_id": "exp-json",
            "name": "JSON Config Test",
            "mode": "solo",
            "config_json": config,
        })

        cursor = repo._db.execute(
            "SELECT config_json FROM experiments WHERE experiment_id = ?",
            ("exp-json",),
        )
        row = cursor.fetchone()
        assert row is not None
        parsed = json.loads(row["config_json"])
        assert parsed == config


# ===========================================================================
# Repository: Model Stats
# ===========================================================================


class TestRepositoryModelStats:
    """Tests for Repository.get_model_stats()."""

    def test_model_stats_empty_for_missing_model(self, repo):
        """get_model_stats should return empty dict for missing model."""
        stats = repo.get_model_stats("nonexistent")
        assert stats == {}

    def test_model_stats_basic_structure(self, repo):
        """get_model_stats should return a dict with expected keys."""
        repo.save_model("model-a", "Model A", "provider/a")
        stats = repo.get_model_stats("model-a")

        assert stats["model_id"] == "model-a"
        assert stats["display_name"] == "Model A"
        assert "total_games" in stats
        assert "wins" in stats
        assert "win_rate" in stats
        assert "solo_rating" in stats

    def test_model_stats_with_games(self, repo):
        """get_model_stats should count games correctly."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")

        # Save a completed game where model-a wins as red
        repo.save_game({
            "game_id": "g1",
            "red_sm_model": "model-a",
            "red_op_model": "model-a",
            "blue_sm_model": "model-b",
            "blue_op_model": "model-b",
            "mode": "solo",
            "winner": "red",
            "status": "completed",
            "total_turns": 10,
        })

        stats = repo.get_model_stats("model-a")
        assert stats["total_games"] == 1
        assert stats["wins"] == 1

    def test_model_stats_win_rate(self, repo):
        """Win rate should be calculated correctly."""
        repo.save_model("model-a", "Model A", "provider/a")
        repo.save_model("model-b", "Model B", "provider/b")

        # 2 wins for model-a
        repo.save_game({
            "game_id": "g1",
            "red_sm_model": "model-a",
            "red_op_model": "model-a",
            "blue_sm_model": "model-b",
            "blue_op_model": "model-b",
            "mode": "solo",
            "winner": "red",
            "status": "completed",
        })
        repo.save_game({
            "game_id": "g2",
            "red_sm_model": "model-b",
            "red_op_model": "model-b",
            "blue_sm_model": "model-a",
            "blue_op_model": "model-a",
            "mode": "solo",
            "winner": "blue",
            "status": "completed",
        })
        # 1 loss for model-a
        repo.save_game({
            "game_id": "g3",
            "red_sm_model": "model-a",
            "red_op_model": "model-a",
            "blue_sm_model": "model-b",
            "blue_op_model": "model-b",
            "mode": "solo",
            "winner": "blue",
            "status": "completed",
        })

        stats = repo.get_model_stats("model-a")
        assert stats["total_games"] == 3
        assert stats["wins"] == 2
        assert stats["win_rate"] == pytest.approx(2 / 3, abs=0.001)

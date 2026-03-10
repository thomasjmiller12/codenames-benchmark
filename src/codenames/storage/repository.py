"""Repository providing CRUD operations for the Codenames benchmark."""

from __future__ import annotations

import json
from typing import Any

from .database import Database


def _row_to_dict(row: Any) -> dict[str, Any]:
    """Convert a :class:`sqlite3.Row` to a plain ``dict``."""
    if row is None:
        return None  # type: ignore[return-value]
    return dict(row)


def _rows_to_dicts(rows: list[Any]) -> list[dict[str, Any]]:
    """Convert a list of :class:`sqlite3.Row` objects to a list of dicts."""
    return [dict(r) for r in rows]


class Repository:
    """High-level data-access layer over the benchmark database.

    All methods handle the conversion between Python dicts / lists and
    the underlying SQLite rows and JSON columns.
    """

    def __init__(self, db: Database) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Models
    # ------------------------------------------------------------------

    def save_model(
        self,
        model_id: str,
        display_name: str,
        openrouter_id: str,
        cost_input: float | None = None,
        cost_output: float | None = None,
    ) -> None:
        """Insert or update a model record (upsert)."""
        self._db.execute(
            """
            INSERT INTO models (
                model_id, display_name, openrouter_id,
                cost_per_m_input_tokens, cost_per_m_output_tokens
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(model_id) DO UPDATE SET
                display_name = excluded.display_name,
                openrouter_id = excluded.openrouter_id,
                cost_per_m_input_tokens = excluded.cost_per_m_input_tokens,
                cost_per_m_output_tokens = excluded.cost_per_m_output_tokens
            """,
            (model_id, display_name, openrouter_id, cost_input, cost_output),
        )
        self._db.connection.commit()

    def get_model(self, model_id: str) -> dict[str, Any] | None:
        """Return a single model by its id, or ``None``."""
        cur = self._db.execute(
            "SELECT * FROM models WHERE model_id = ?", (model_id,)
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None

    def list_models(self) -> list[dict[str, Any]]:
        """Return every registered model."""
        cur = self._db.execute("SELECT * FROM models ORDER BY display_name")
        return _rows_to_dicts(cur.fetchall())

    # ------------------------------------------------------------------
    # Boards
    # ------------------------------------------------------------------

    def save_board(
        self,
        seed: int,
        words: list[str],
        key_card: dict[str, str],
        starting_team: str,
    ) -> int:
        """Persist a board and return its ``board_id``.

        *words* and *key_card* are serialised to JSON for storage.
        Uses INSERT OR IGNORE so mirrored pairs sharing a seed are safe.
        """
        self._db.execute(
            """
            INSERT OR IGNORE INTO boards (seed, words_json, key_card_json, starting_team)
            VALUES (?, ?, ?, ?)
            """,
            (seed, json.dumps(words), json.dumps(key_card), starting_team),
        )
        self._db.connection.commit()
        cur = self._db.execute(
            "SELECT board_id FROM boards WHERE seed = ?", (seed,)
        )
        return cur.fetchone()["board_id"]

    def get_board(self, board_id: int) -> dict[str, Any] | None:
        """Fetch a board by its id, deserialising JSON columns."""
        cur = self._db.execute(
            "SELECT * FROM boards WHERE board_id = ?", (board_id,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        d = dict(row)
        d["words"] = json.loads(d.pop("words_json"))
        d["key_card"] = json.loads(d.pop("key_card_json"))
        return d

    # ------------------------------------------------------------------
    # Games
    # ------------------------------------------------------------------

    def save_game(self, game_data: dict[str, Any]) -> str:
        """Insert a new game record and return its ``game_id``.

        *game_data* must include at least ``game_id``, ``red_sm_model``,
        ``red_op_model``, ``blue_sm_model``, ``blue_op_model``, and ``mode``.
        Any key whose value is a ``dict`` or ``list`` is automatically
        serialised to JSON.
        """
        data = self._encode_json_fields(game_data)
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        self._db.execute(
            f"INSERT INTO games ({columns}) VALUES ({placeholders})",
            tuple(data.values()),
        )
        self._db.connection.commit()
        return game_data["game_id"]

    def get_games(
        self,
        experiment_id: str | None = None,
        model_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Query games with optional filters.

        When *model_id* is given the result includes games where the model
        appears in any of the four player slots.
        """
        clauses: list[str] = []
        params: list[Any] = []

        if experiment_id is not None:
            clauses.append("experiment_id = ?")
            params.append(experiment_id)

        if model_id is not None:
            clauses.append(
                "(red_sm_model = ? OR red_op_model = ? "
                "OR blue_sm_model = ? OR blue_op_model = ?)"
            )
            params.extend([model_id] * 4)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT * FROM games
            {where}
            ORDER BY created_at DESC
            LIMIT ?
        """
        params.append(limit)
        cur = self._db.execute(sql, tuple(params))
        return [self._decode_game_row(r) for r in cur.fetchall()]

    # ------------------------------------------------------------------
    # Turns
    # ------------------------------------------------------------------

    def save_turn(self, turn_data: dict[str, Any]) -> None:
        """Insert a single turn record.

        *turn_data* must include ``turn_id``, ``game_id``, ``turn_number``,
        and ``team``.  JSON-serialisable fields (``guesses_json``,
        ``board_state_json``) are handled automatically.
        """
        data = self._encode_json_fields(turn_data)
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        self._db.execute(
            f"INSERT INTO turns ({columns}) VALUES ({placeholders})",
            tuple(data.values()),
        )
        self._db.connection.commit()

    # ------------------------------------------------------------------
    # Ratings
    # ------------------------------------------------------------------

    def update_rating(
        self,
        model_id: str,
        rating_type: str,
        new_rating: float,
        game_id: str,
        old_rating: float,
        result: float,
    ) -> None:
        """Update the denormalised rating on *models* and append a history record.

        *rating_type* must be one of ``'solo'``, ``'spymaster'``, or
        ``'operative'``.
        *result* should follow Elo convention (1.0 = win, 0.5 = draw, 0.0 = loss).
        """
        # Map rating_type to the column names on the models table.
        rating_col, games_col = {
            "solo": ("solo_rating", "solo_games_played"),
            "spymaster": ("spymaster_rating", "spymaster_games"),
            "operative": ("operative_rating", "operative_games"),
        }[rating_type]

        self._db.execute(
            f"""
            UPDATE models
            SET {rating_col} = ?, {games_col} = {games_col} + 1
            WHERE model_id = ?
            """,
            (new_rating, model_id),
        )

        self._db.execute(
            """
            INSERT INTO ratings_history
                (model_id, game_id, rating_type, rating_before, rating_after, result)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (model_id, game_id, rating_type, old_rating, new_rating, result),
        )
        self._db.connection.commit()

    def get_leaderboard(
        self,
        rating_type: str = "solo",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return models sorted by *rating_type* rating descending."""
        rating_col, games_col = {
            "solo": ("solo_rating", "solo_games_played"),
            "spymaster": ("spymaster_rating", "spymaster_games"),
            "operative": ("operative_rating", "operative_games"),
        }[rating_type]

        cur = self._db.execute(
            f"""
            SELECT model_id, display_name, openrouter_id,
                   {rating_col} AS rating, {games_col} AS games_played
            FROM models
            ORDER BY {rating_col} DESC
            LIMIT ?
            """,
            (limit,),
        )
        return _rows_to_dicts(cur.fetchall())

    # ------------------------------------------------------------------
    # Model stats
    # ------------------------------------------------------------------

    def get_model_stats(self, model_id: str) -> dict[str, Any]:
        """Return aggregated statistics for a single model.

        Includes total games, win counts, average turns, and per-role
        breakdowns.
        """
        model = self.get_model(model_id)
        if model is None:
            return {}

        # Total games where the model participated in any slot.
        # Exclude error games from stats (win counts, averages, etc.)
        cur = self._db.execute(
            """
            SELECT
                COUNT(*) AS total_games,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_games,
                SUM(CASE WHEN status IN ('error', 'failed') THEN 1 ELSE 0 END) AS errored_games,
                SUM(CASE WHEN status = 'completed' AND (
                    (winner = 'red' AND (red_sm_model = ? OR red_op_model = ?))
                    OR
                    (winner = 'blue' AND (blue_sm_model = ? OR blue_op_model = ?))
                ) THEN 1 ELSE 0 END) AS wins,
                AVG(CASE WHEN status = 'completed' THEN total_turns END) AS avg_turns,
                SUM(total_cost_usd) AS total_cost,
                SUM(total_input_tokens) AS total_input_tokens,
                SUM(total_output_tokens) AS total_output_tokens
            FROM games
            WHERE red_sm_model = ? OR red_op_model = ?
               OR blue_sm_model = ? OR blue_op_model = ?
            """,
            (model_id,) * 8,
        )
        stats_row = cur.fetchone()
        stats = _row_to_dict(stats_row) if stats_row else {}

        total = stats.get("total_games") or 0
        completed = stats.get("completed_games") or 0
        wins = stats.get("wins") or 0

        return {
            "model_id": model_id,
            "display_name": model.get("display_name"),
            "total_games": total,
            "completed_games": completed,
            "errored_games": stats.get("errored_games", 0),
            "wins": wins,
            "win_rate": round(wins / completed, 4) if completed > 0 else 0.0,
            "avg_turns": round(stats.get("avg_turns") or 0, 2),
            "total_cost_usd": stats.get("total_cost", 0.0),
            "total_input_tokens": stats.get("total_input_tokens", 0),
            "total_output_tokens": stats.get("total_output_tokens", 0),
            "solo_rating": model.get("solo_rating"),
            "solo_games_played": model.get("solo_games_played"),
            "spymaster_rating": model.get("spymaster_rating"),
            "spymaster_games": model.get("spymaster_games"),
            "operative_rating": model.get("operative_rating"),
            "operative_games": model.get("operative_games"),
        }

    # ------------------------------------------------------------------
    # Experiments
    # ------------------------------------------------------------------

    def save_experiment(self, experiment_data: dict[str, Any]) -> str:
        """Insert a new experiment and return its ``experiment_id``."""
        data = self._encode_json_fields(experiment_data)
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        self._db.execute(
            f"INSERT INTO experiments ({columns}) VALUES ({placeholders})",
            tuple(data.values()),
        )
        self._db.connection.commit()
        return experiment_data["experiment_id"]

    def update_experiment(self, experiment_id: str, **kwargs: Any) -> None:
        """Update selected columns on an experiment row.

        Example::

            repo.update_experiment(
                "exp-001",
                status="running",
                total_games_completed=42,
            )
        """
        if not kwargs:
            return
        data = self._encode_json_fields(kwargs)
        set_clause = ", ".join(f"{k} = ?" for k in data)
        params = list(data.values()) + [experiment_id]
        self._db.execute(
            f"UPDATE experiments SET {set_clause} WHERE experiment_id = ?",
            tuple(params),
        )
        self._db.connection.commit()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _encode_json_fields(data: dict[str, Any]) -> dict[str, Any]:
        """Return a copy of *data* with any ``list`` / ``dict`` values
        serialised to JSON strings."""
        out: dict[str, Any] = {}
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                out[k] = json.dumps(v)
            else:
                out[k] = v
        return out

    @staticmethod
    def _decode_game_row(row: Any) -> dict[str, Any]:
        """Convert a game row to a dict, deserialising known JSON columns."""
        d = dict(row)
        if d.get("game_log_json"):
            try:
                d["game_log"] = json.loads(d["game_log_json"])
            except (json.JSONDecodeError, TypeError):
                d["game_log"] = None
        return d

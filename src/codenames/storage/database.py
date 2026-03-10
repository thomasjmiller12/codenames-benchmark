"""Database connection management for the Codenames benchmark."""

import sqlite3
from pathlib import Path
from typing import Any


_SCHEMA_PATH = Path(__file__).parent / "schema.sql"


class Database:
    """Manages a SQLite connection for the Codenames benchmark.

    Usage::

        db = Database("codenames.db")
        db.initialize()

        # Or as a context manager:
        with Database("codenames.db") as db:
            db.execute("SELECT 1")
    """

    def __init__(self, db_path: str = "codenames.db") -> None:
        self._db_path = db_path
        self._conn: sqlite3.Connection | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def initialize(self) -> None:
        """Create the connection and ensure all schema tables exist.

        Reads ``schema.sql`` (co-located with this module) and executes it.
        Every statement uses ``IF NOT EXISTS`` so calling this multiple times
        is safe.
        """
        self._conn = sqlite3.connect(self._db_path)
        self._conn.row_factory = sqlite3.Row
        # Enable foreign-key enforcement (off by default in SQLite).
        self._conn.execute("PRAGMA foreign_keys = ON")
        # WAL mode for better concurrent read performance.
        self._conn.execute("PRAGMA journal_mode = WAL")

        schema_sql = _SCHEMA_PATH.read_text()
        self._conn.executescript(schema_sql)

        # Migrate existing databases: add new columns if missing.
        migrations = [
            "ALTER TABLE games ADD COLUMN pair_id INTEGER",
            "ALTER TABLE experiments ADD COLUMN total_games_errored INTEGER DEFAULT 0",
            "ALTER TABLE models ADD COLUMN solo_ci_lower REAL DEFAULT 1500.0",
            "ALTER TABLE models ADD COLUMN solo_ci_upper REAL DEFAULT 1500.0",
            "ALTER TABLE models ADD COLUMN spymaster_ci_lower REAL DEFAULT 1500.0",
            "ALTER TABLE models ADD COLUMN spymaster_ci_upper REAL DEFAULT 1500.0",
            "ALTER TABLE models ADD COLUMN operative_ci_lower REAL DEFAULT 1500.0",
            "ALTER TABLE models ADD COLUMN operative_ci_upper REAL DEFAULT 1500.0",
        ]
        for migration in migrations:
            try:
                self._conn.execute(migration)
            except sqlite3.OperationalError:
                pass  # Column already exists

        self._conn.commit()

    @property
    def connection(self) -> sqlite3.Connection:
        """Return the underlying :class:`sqlite3.Connection`.

        Raises :class:`RuntimeError` if :meth:`initialize` has not been
        called yet.
        """
        if self._conn is None:
            raise RuntimeError(
                "Database not initialized. Call initialize() first."
            )
        return self._conn

    def close(self) -> None:
        """Close the database connection if it is open."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def execute(
        self,
        sql: str,
        params: tuple[Any, ...] | dict[str, Any] | None = None,
    ) -> sqlite3.Cursor:
        """Execute a single SQL statement and return the cursor.

        Parameters are optional and forwarded to
        :meth:`sqlite3.Connection.execute`.
        """
        if params is None:
            return self.connection.execute(sql)
        return self.connection.execute(sql, params)

    def executemany(
        self,
        sql: str,
        params_list: list[tuple[Any, ...] | dict[str, Any]],
    ) -> sqlite3.Cursor:
        """Execute a SQL statement against every parameter set in *params_list*."""
        return self.connection.executemany(sql, params_list)

    # ------------------------------------------------------------------
    # Context-manager protocol
    # ------------------------------------------------------------------

    def __enter__(self) -> "Database":
        self.initialize()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

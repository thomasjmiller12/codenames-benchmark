#!/usr/bin/env python3
"""Backfill missing data in the codenames benchmark database.

Fixes:
1. Model pricing (cost_per_m_input_tokens / cost_per_m_output_tokens)
2. Board data (boards table + games.board_id)
3. Token counts & costs (games.total_input_tokens, total_output_tokens, total_cost_usd)
4. Turn data (turns table)
5. Model game counters (models.solo_games_played etc.)
"""

import json
import random
import sqlite3
import sys
import uuid
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from codenames.engine.board import Board, WordPool
from codenames.engine.types import Team

DB_PATH = PROJECT_ROOT / "codenames.db"

# Model pricing from OpenRouter (March 2026)
MODEL_PRICING = {
    "anthropic/claude-sonnet-4.6": {
        "cost_per_m_input_tokens": 3.0,
        "cost_per_m_output_tokens": 15.0,
    },
    "openai/gpt-5.4": {
        "cost_per_m_input_tokens": 2.5,
        "cost_per_m_output_tokens": 15.0,
    },
}


def backfill(db_path: Path = DB_PATH) -> None:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ── 1. Model pricing ──────────────────────────────────────────────
    print("1. Updating model pricing...")
    for model_id, pricing in MODEL_PRICING.items():
        cur.execute(
            """UPDATE models
               SET cost_per_m_input_tokens = ?,
                   cost_per_m_output_tokens = ?
             WHERE model_id = ?""",
            (pricing["cost_per_m_input_tokens"], pricing["cost_per_m_output_tokens"], model_id),
        )
        print(f"   {model_id}: ${pricing['cost_per_m_input_tokens']}/M in, ${pricing['cost_per_m_output_tokens']}/M out")
    conn.commit()

    # ── 2. Board data ─────────────────────────────────────────────────
    print("\n2. Generating board from seed...")
    word_pool = WordPool()

    games = cur.execute(
        "SELECT game_id, board_seed, board_id, game_log_json FROM games WHERE status = 'completed'"
    ).fetchall()

    for game in games:
        game_id = game["game_id"]
        seed = game["board_seed"]
        existing_board_id = game["board_id"]
        log_raw = game["game_log_json"]

        # Parse game log — handle both flat array (old) and dict (new) formats
        log_data = json.loads(log_raw)
        if isinstance(log_data, list):
            move_log = log_data
            board_from_log = None
        else:
            move_log = log_data.get("move_log", [])
            board_from_log = log_data.get("board")

        # Generate board from seed if not already in boards table
        if existing_board_id is None:
            if board_from_log:
                # Use board data from log if available
                words = board_from_log["words"]
                key_card = board_from_log["key_card"]
                starting_team = board_from_log["starting_team"]
            else:
                # Regenerate from seed
                rng = random.Random(seed)
                words = word_pool.sample(n=25, rng=rng)
                starting_team_enum = Team.RED
                board = Board(words=words, starting_team=starting_team_enum, rng=rng)
                key_card = {w: ct.value for w, ct in board.key_card.items()}
                starting_team = starting_team_enum.value

            # Insert board (idempotent via INSERT OR IGNORE on seed)
            cur.execute(
                """INSERT OR IGNORE INTO boards (seed, words_json, key_card_json, starting_team)
                   VALUES (?, ?, ?, ?)""",
                (seed, json.dumps(words), json.dumps(key_card), starting_team),
            )
            conn.commit()

            # Get the board_id
            board_id = cur.execute(
                "SELECT board_id FROM boards WHERE seed = ?", (seed,)
            ).fetchone()["board_id"]

            # Link game to board
            cur.execute(
                "UPDATE games SET board_id = ? WHERE game_id = ?",
                (board_id, game_id),
            )
            conn.commit()
            print(f"   Game {game_id[:8]}...: board_id={board_id} (seed={seed})")
        else:
            board_id = existing_board_id
            print(f"   Game {game_id[:8]}...: board_id={board_id} already set")

        # ── 3. Token counts & cost ────────────────────────────────────
        total_input = sum(m.get("input_tokens", 0) or 0 for m in move_log)
        total_output = sum(m.get("output_tokens", 0) or 0 for m in move_log)

        # Calculate cost per-move using the correct model's pricing
        total_cost = 0.0
        for m in move_log:
            mid = m.get("model_id")
            if mid and mid in MODEL_PRICING:
                inp = m.get("input_tokens", 0) or 0
                out = m.get("output_tokens", 0) or 0
                pricing = MODEL_PRICING[mid]
                total_cost += (inp / 1_000_000) * pricing["cost_per_m_input_tokens"]
                total_cost += (out / 1_000_000) * pricing["cost_per_m_output_tokens"]

        cur.execute(
            """UPDATE games
               SET total_input_tokens = ?,
                   total_output_tokens = ?,
                   total_cost_usd = ?
             WHERE game_id = ?""",
            (total_input, total_output, total_cost, game_id),
        )
        conn.commit()
        print(f"   Game {game_id[:8]}...: {total_input} in / {total_output} out, ${total_cost:.4f}")

        # ── 4. Turn data ──────────────────────────────────────────────
        # Group moves by (turn_number, team) to build turn rows
        turns: dict[tuple[int, str], dict] = {}
        for m in move_log:
            tn = m["turn_number"]
            team = m["team"].lower()
            key = (tn, team)

            if key not in turns:
                turns[key] = {
                    "turn_id": str(uuid.uuid4()),
                    "game_id": game_id,
                    "turn_number": tn,
                    "team": team,
                    "clue_word": None,
                    "clue_count": None,
                    "sm_model": None,
                    "sm_input_tokens": 0,
                    "sm_output_tokens": 0,
                    "sm_latency_ms": None,
                    "guesses": [],
                    "op_model": None,
                    "op_input_tokens": 0,
                    "op_output_tokens": 0,
                    "op_latency_ms": 0,
                }

            turn = turns[key]
            action = m.get("action_type")

            if action == "clue":
                turn["clue_word"] = m.get("clue_word")
                turn["clue_count"] = m.get("clue_count")
                turn["sm_model"] = m.get("model_id")
                turn["sm_input_tokens"] = m.get("input_tokens", 0) or 0
                turn["sm_output_tokens"] = m.get("output_tokens", 0) or 0
                turn["sm_latency_ms"] = int(m.get("latency_ms", 0) or 0)
            elif action == "guess":
                turn["guesses"].append({
                    "word": m.get("guess_word"),
                    "result": m.get("guess_result"),
                })
                turn["op_model"] = m.get("model_id")
                turn["op_input_tokens"] += m.get("input_tokens", 0) or 0
                turn["op_output_tokens"] += m.get("output_tokens", 0) or 0
                turn["op_latency_ms"] += int(m.get("latency_ms", 0) or 0)

        # Insert turn rows
        for (tn, team), turn in sorted(turns.items()):
            cur.execute(
                """INSERT OR IGNORE INTO turns (
                       turn_id, game_id, turn_number, team,
                       clue_word, clue_count,
                       sm_model, sm_input_tokens, sm_output_tokens, sm_latency_ms,
                       guesses_json,
                       op_model, op_input_tokens, op_output_tokens, op_latency_ms
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    turn["turn_id"],
                    turn["game_id"],
                    turn["turn_number"],
                    turn["team"],
                    turn["clue_word"],
                    turn["clue_count"],
                    turn["sm_model"],
                    turn["sm_input_tokens"],
                    turn["sm_output_tokens"],
                    turn["sm_latency_ms"],
                    json.dumps(turn["guesses"]),
                    turn["op_model"],
                    turn["op_input_tokens"],
                    turn["op_output_tokens"],
                    turn["op_latency_ms"],
                ),
            )
        conn.commit()
        print(f"   Game {game_id[:8]}...: {len(turns)} turns inserted")

        # ── Upgrade game_log_json to new format if needed ─────────────
        if isinstance(log_data, list):
            # Fetch the board we just created
            board_row = cur.execute(
                "SELECT words_json, key_card_json, starting_team FROM boards WHERE board_id = ?",
                (board_id,),
            ).fetchone()
            new_log = {
                "move_log": log_data,
                "board": {
                    "words": json.loads(board_row["words_json"]),
                    "key_card": json.loads(board_row["key_card_json"]),
                    "starting_team": board_row["starting_team"],
                },
            }
            cur.execute(
                "UPDATE games SET game_log_json = ? WHERE game_id = ?",
                (json.dumps(new_log), game_id),
            )
            conn.commit()
            print(f"   Game {game_id[:8]}...: upgraded game_log_json to dict format")

    # ── 5. Model game counters ────────────────────────────────────────
    print("\n5. Updating model game counters...")
    models = cur.execute("SELECT model_id FROM models").fetchall()
    for model in models:
        mid = model["model_id"]

        # Solo games: model appears in all 4 slots (sm + op for same model)
        solo_count = cur.execute(
            """SELECT COUNT(*) as cnt FROM games
             WHERE status = 'completed'
               AND (red_sm_model = ? OR blue_sm_model = ?)""",
            (mid, mid),
        ).fetchone()["cnt"]

        sm_count = cur.execute(
            """SELECT COUNT(*) as cnt FROM games
             WHERE status = 'completed'
               AND (red_sm_model = ? OR blue_sm_model = ?)""",
            (mid, mid),
        ).fetchone()["cnt"]

        op_count = cur.execute(
            """SELECT COUNT(*) as cnt FROM games
             WHERE status = 'completed'
               AND (red_op_model = ? OR blue_op_model = ?)""",
            (mid, mid),
        ).fetchone()["cnt"]

        cur.execute(
            """UPDATE models
               SET solo_games_played = ?,
                   spymaster_games = ?,
                   operative_games = ?
             WHERE model_id = ?""",
            (solo_count, sm_count, op_count, mid),
        )
        print(f"   {mid}: solo={solo_count}, sm={sm_count}, op={op_count}")

    conn.commit()
    conn.close()
    print("\nBackfill complete!")


if __name__ == "__main__":
    backfill()

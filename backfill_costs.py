#!/usr/bin/env python3
"""Backfill costs for completed games.

Two strategies, in order of preference:

1. **Generation IDs** (exact): If game_log_json contains ``generation_id``
   fields, queries OpenRouter's ``/api/v1/generation?id=`` endpoint for the
   real ``total_cost`` (accounts for provider, caching discounts, etc.).
   Requires ``OPENROUTER_API_KEY`` env var.

2. **Token pricing** (estimate): Falls back to computing cost from token
   counts × current model pricing from ``/api/v1/models``.

Usage:
    python backfill_costs.py [--db PATH] [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import sys
import urllib.request

import httpx
from dotenv import load_dotenv
from tqdm import tqdm


# ------------------------------------------------------------------
# OpenRouter helpers
# ------------------------------------------------------------------

def fetch_model_pricing() -> dict[str, tuple[float, float]]:
    """Fetch per-token pricing from OpenRouter.

    Returns model_id -> (prompt_cost_per_token, completion_cost_per_token).
    """
    url = "https://openrouter.ai/api/v1/models"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    pricing: dict[str, tuple[float, float]] = {}
    for model in data.get("data", []):
        model_id = model["id"]
        p = model.get("pricing", {})
        prompt_cost = float(p.get("prompt") or 0)
        completion_cost = float(p.get("completion") or 0)
        pricing[model_id] = (prompt_cost, completion_cost)

    return pricing


async def fetch_generation_costs(
    generation_ids: list[str],
    api_key: str,
    max_concurrent: int = 20,
) -> dict[str, float]:
    """Fetch real costs from OpenRouter's generation stats endpoint.

    Returns generation_id -> total_cost mapping for successful lookups.
    """
    results: dict[str, float] = {}
    semaphore = asyncio.Semaphore(max_concurrent)

    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=httpx.Timeout(15.0),
    ) as client:
        async def fetch_one(gen_id: str) -> None:
            async with semaphore:
                try:
                    resp = await client.get(
                        f"https://openrouter.ai/api/v1/generation?id={gen_id}",
                    )
                    if resp.status_code == 200:
                        data = resp.json().get("data", {})
                        cost = data.get("total_cost")
                        if cost is not None:
                            results[gen_id] = float(cost)
                except Exception:
                    pass  # best-effort

        pbar = tqdm(total=len(generation_ids), desc="Fetching generation costs", unit="gen")

        async def fetch_one_tracked(gen_id: str) -> None:
            await fetch_one(gen_id)
            pbar.update(1)

        tasks = [fetch_one_tracked(gid) for gid in generation_ids]
        await asyncio.gather(*tasks)
        pbar.close()

    return results


# ------------------------------------------------------------------
# Game cost computation
# ------------------------------------------------------------------

def extract_generation_ids(game_log_json: str) -> list[str]:
    """Extract all generation_id values from a game log."""
    try:
        log = json.loads(game_log_json)
    except (json.JSONDecodeError, TypeError):
        return []

    if isinstance(log, list):
        move_log = log
    elif isinstance(log, dict):
        move_log = log.get("move_log", [])
    else:
        return []

    return [
        m["generation_id"]
        for m in move_log
        if m.get("generation_id")
    ]


def compute_game_cost_from_pricing(
    game_log_json: str,
    pricing: dict[str, tuple[float, float]],
) -> float:
    """Estimate cost from token counts × model pricing (fallback)."""
    try:
        log = json.loads(game_log_json)
    except (json.JSONDecodeError, TypeError):
        return 0.0

    if isinstance(log, list):
        move_log = log
    elif isinstance(log, dict):
        move_log = log.get("move_log", [])
    else:
        return 0.0

    total = 0.0
    for move in move_log:
        model_id = move.get("model_id")
        if not model_id:
            continue
        prompt_rate, completion_rate = pricing.get(model_id, (0.0, 0.0))
        input_tokens = move.get("input_tokens") or 0
        output_tokens = move.get("output_tokens") or 0
        total += input_tokens * prompt_rate
        total += output_tokens * completion_rate

    return total


def compute_game_cost_from_generations(
    game_log_json: str,
    gen_costs: dict[str, float],
) -> float | None:
    """Compute cost using real generation costs.

    Returns None if any move with a generation_id is missing from
    gen_costs (incomplete data).
    """
    try:
        log = json.loads(game_log_json)
    except (json.JSONDecodeError, TypeError):
        return None

    if isinstance(log, list):
        move_log = log
    elif isinstance(log, dict):
        move_log = log.get("move_log", [])
    else:
        return None

    total = 0.0
    has_any_gen_id = False
    for move in move_log:
        gen_id = move.get("generation_id")
        if gen_id:
            has_any_gen_id = True
            cost = gen_costs.get(gen_id)
            if cost is None:
                return None  # incomplete — can't trust partial sum
            total += cost

    return total if has_any_gen_id else None


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db", default="codenames.db",
        help="Path to the SQLite database (default: codenames.db)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be updated without writing",
    )
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    # 1. Find games needing cost backfill
    cur = conn.execute("""
        SELECT game_id, experiment_id, game_log_json, total_cost_usd
        FROM games
        WHERE status = 'completed'
          AND game_log_json IS NOT NULL
          AND (total_cost_usd IS NULL OR total_cost_usd = 0.0)
    """)
    games = cur.fetchall()

    if not games:
        print("No games with zero cost found. Nothing to backfill.")
        return

    print(f"Found {len(games)} games to backfill.\n")

    # 2. Collect all generation IDs across all games
    all_gen_ids: list[str] = []
    for game in games:
        all_gen_ids.extend(extract_generation_ids(game["game_log_json"]))

    # 3. Fetch real costs from generation endpoint (if we have IDs + API key)
    gen_costs: dict[str, float] = {}
    if all_gen_ids and api_key:
        unique_ids = list(set(all_gen_ids))
        print(f"Fetching real costs for {len(unique_ids)} generations from OpenRouter...")
        gen_costs = asyncio.run(fetch_generation_costs(unique_ids, api_key))
        print(f"  Got costs for {len(gen_costs)}/{len(unique_ids)} generations.\n")
    elif all_gen_ids:
        print("Generation IDs found but OPENROUTER_API_KEY not set — skipping real costs.\n")
    else:
        print("No generation IDs in game logs — using pricing estimates.\n")

    # 4. Fetch model pricing as fallback
    print("Fetching model pricing from OpenRouter...")
    pricing = fetch_model_pricing()

    # Show pricing for models used
    cur = conn.execute("""
        SELECT DISTINCT red_sm_model AS m FROM games
        UNION SELECT DISTINCT red_op_model FROM games
        UNION SELECT DISTINCT blue_sm_model FROM games
        UNION SELECT DISTINCT blue_op_model FROM games
    """)
    used_models = {row["m"] for row in cur.fetchall()}
    for model_id in sorted(used_models):
        prompt_rate, completion_rate = pricing.get(model_id, (0.0, 0.0))
        prompt_per_m = prompt_rate * 1_000_000
        completion_per_m = completion_rate * 1_000_000
        status = "found" if model_id in pricing else "NOT FOUND"
        print(f"  [{status}] {model_id}: ${prompt_per_m:.2f} / ${completion_per_m:.2f} per M tokens")

    # 5. Compute and update costs
    total_backfilled = 0.0
    updated_count = 0
    real_count = 0
    estimate_count = 0
    experiment_costs: dict[str, float] = {}

    for game in tqdm(games, desc="Backfilling games", unit="game"):
        game_id = game["game_id"]
        experiment_id = game["experiment_id"]
        log_json = game["game_log_json"]

        # Try real costs first
        cost = compute_game_cost_from_generations(log_json, gen_costs)
        if cost is not None:
            real_count += 1
        else:
            # Fall back to pricing estimate
            cost = compute_game_cost_from_pricing(log_json, pricing)
            if cost > 0:
                estimate_count += 1

        if cost and cost > 0:
            total_backfilled += cost
            updated_count += 1

            if experiment_id:
                experiment_costs[experiment_id] = (
                    experiment_costs.get(experiment_id, 0.0) + cost
                )

            if not args.dry_run:
                conn.execute(
                    "UPDATE games SET total_cost_usd = ? WHERE game_id = ?",
                    (cost, game_id),
                )

    # Update experiment totals
    if not args.dry_run and experiment_costs:
        for exp_id, exp_cost in experiment_costs.items():
            conn.execute(
                "UPDATE experiments SET total_cost_usd = total_cost_usd + ? WHERE experiment_id = ?",
                (exp_cost, exp_id),
            )
        conn.commit()

    # Summary
    prefix = "DRY RUN — " if args.dry_run else ""
    print(f"\n{prefix}Summary:")
    print(f"  Games updated:         {updated_count}/{len(games)}")
    print(f"    Real costs (gen ID): {real_count}")
    print(f"    Estimates (pricing): {estimate_count}")
    print(f"  Total cost backfilled: ${total_backfilled:.6f}")
    for exp_id, exp_cost in sorted(experiment_costs.items()):
        print(f"  Experiment {exp_id[:12]}...: +${exp_cost:.6f}")

    if args.dry_run:
        print("\nNo changes written. Run without --dry-run to apply.")

    conn.close()


if __name__ == "__main__":
    main()

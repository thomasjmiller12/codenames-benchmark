"""CLI for the Codenames LLM Benchmark Suite.

Provides commands to play single games, run tournaments, view leaderboards,
inspect model statistics, replay games, compute ratings, and report costs.

Usage::

    codenames play --red-model "model-a" --blue-model "model-b"
    codenames benchmark --models "model-a,model-b,model-c"
    codenames compute-ratings
    codenames leaderboard
    codenames stats MODEL_ID
    codenames replay GAME_ID
    codenames costs
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import uuid
from datetime import datetime
from typing import Optional

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from codenames.agents.llm_agent import LLMSpymaster, LLMOperative
from codenames.agents.prompts import PromptBuilder
from codenames.benchmark.runner import MatchConfig, MatchRunner, TeamSetup
from codenames.engine.board import Board, WordPool
from codenames.engine.game import GameResult, MoveRecord
from codenames.engine.types import CardType, GameOutcome, GamePhase, GuessResult, Team
from codenames.llm.client import LLMClient
from codenames.storage.database import Database
from codenames.storage.repository import Repository

load_dotenv()

app = typer.Typer(name="codenames", help="Codenames LLM Benchmark Suite")
console = Console()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_api_key() -> str:
    """Retrieve the OpenRouter API key from the environment."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        console.print(
            "[bold red]Error:[/bold red] OPENROUTER_API_KEY environment variable "
            "is not set. Please set it or add it to a .env file."
        )
        raise typer.Exit(code=1)
    return key


def _init_db(db_path: str) -> tuple[Database, Repository]:
    """Open (and initialise if necessary) the SQLite database."""
    db = Database(db_path)
    db.initialize()
    return db, Repository(db)


def _display_board(board: Board) -> None:
    """Render the board as a Rich table."""
    table = Table(title="Codenames Board", show_lines=True)
    for col_idx in range(5):
        table.add_column(f"Col {col_idx + 1}", justify="center", width=14)

    cards = board.all_cards
    for row_idx in range(5):
        row_cells: list[str] = []
        for col_idx in range(5):
            bc = cards[row_idx * 5 + col_idx]
            word = bc.word
            card_type = bc.card_type.value
            if bc.revealed:
                style_map = {
                    "RED": "[bold red]",
                    "BLUE": "[bold blue]",
                    "NEUTRAL": "[dim]",
                    "ASSASSIN": "[bold white on black]",
                }
                style = style_map.get(card_type, "")
                end_style = "[/]" if style else ""
                row_cells.append(f"{style}[strikethrough]{word}[/strikethrough]{end_style}")
            else:
                row_cells.append(word)
        table.add_row(*row_cells)

    console.print(table)


def _display_game_result(result: GameResult) -> None:
    """Render the game result as a Rich panel."""
    winner_str = result.winner.value if result.winner else "None"
    outcome_str = result.outcome.value

    lines = [
        f"[bold]Winner:[/bold] {winner_str}",
        f"[bold]Outcome:[/bold] {outcome_str}",
        f"[bold]Total Turns:[/bold] {result.total_turns}",
        f"[bold]Red Remaining:[/bold] {result.red_remaining}",
        f"[bold]Blue Remaining:[/bold] {result.blue_remaining}",
    ]

    console.print(Panel("\n".join(lines), title="Game Result", border_style="green"))


def _display_move_log(move_log: list[MoveRecord]) -> None:
    """Render the move log as a Rich table."""
    table = Table(title="Move Log")
    table.add_column("Turn", justify="center", width=5)
    table.add_column("Team", justify="center", width=6)
    table.add_column("Action", justify="center", width=8)
    table.add_column("Clue", justify="left", width=16)
    table.add_column("Guess", justify="left", width=14)
    table.add_column("Result", justify="center", width=12)
    table.add_column("Model", justify="left", width=30)

    for move in move_log:
        team_style = "[red]" if move.team is Team.RED else "[blue]"
        team_str = f"{team_style}{move.team.value}[/]"

        clue_str = ""
        if move.clue_word is not None:
            clue_str = f"{move.clue_word} ({move.clue_count})"

        guess_str = move.guess_word or ""

        result_str = ""
        if move.guess_result is not None:
            result_map = {
                GuessResult.CORRECT: "[green]CORRECT[/green]",
                GuessResult.WRONG_TEAM: "[yellow]WRONG_TEAM[/yellow]",
                GuessResult.NEUTRAL: "[dim]NEUTRAL[/dim]",
                GuessResult.ASSASSIN: "[bold red]ASSASSIN[/bold red]",
            }
            result_str = result_map.get(move.guess_result, move.guess_result.value)

        model_str = move.model_id or ""

        table.add_row(
            str(move.turn_number),
            team_str,
            move.action_type,
            clue_str,
            guess_str,
            result_str,
            model_str,
        )

    console.print(table)


# ---------------------------------------------------------------------------
# Live verbose output
# ---------------------------------------------------------------------------


class _LivePrinter:
    """Prints clues and guesses to the console as they happen."""

    def __init__(self, con: Console) -> None:
        self._con = con
        self._current_turn: int | None = None

    def on_clue(
        self, turn: int, team: Team, word: str, count: int, model: str, latency_ms: float
    ) -> None:
        color = "red" if team is Team.RED else "blue"
        if turn != self._current_turn:
            self._current_turn = turn
            self._con.print(f"\n[bold]--- Turn {turn} ---[/bold]")
        self._con.print(
            f"  [{color}]{team.value}[/{color}] spymaster: "
            f"[bold]{word} {count}[/bold]  [dim]({latency_ms:.0f}ms · {model})[/dim]"
        )

    def on_guess(
        self, turn: int, team: Team, word: str, result: GuessResult, model: str, latency_ms: float
    ) -> None:
        color = "red" if team is Team.RED else "blue"
        result_styles = {
            GuessResult.CORRECT: "[green]CORRECT[/green]",
            GuessResult.WRONG_TEAM: "[yellow]WRONG_TEAM[/yellow]",
            GuessResult.NEUTRAL: "[dim]NEUTRAL[/dim]",
            GuessResult.ASSASSIN: "[bold red]ASSASSIN[/bold red]",
        }
        result_str = result_styles.get(result, result.value)
        self._con.print(
            f"  [{color}]{team.value}[/{color}] operative: "
            f"{word} -> {result_str}  [dim]({latency_ms:.0f}ms)[/dim]"
        )

    def on_stop(self, turn: int, team: Team) -> None:
        color = "red" if team is Team.RED else "blue"
        self._con.print(f"  [{color}]{team.value}[/{color}] operative: [dim]stopped guessing[/dim]")


# ---------------------------------------------------------------------------
# Rating computation
# ---------------------------------------------------------------------------


def compute_ratings_from_db(
    repo: Repository,
    db: Database,
    n_bootstrap: int = 1000,
) -> None:
    """Compute Bradley-Terry ratings from all completed games and save them.

    Reads all completed games, builds pair-based results (win/loss/tie),
    fits the Davidson-extended Bradley-Terry model with bootstrap CIs,
    and writes ratings back to the models table.
    """
    from codenames.benchmark.rating import BradleyTerry, GameResult as GameResultTuple

    # Fetch all completed games grouped by pair_id
    cur = db.execute(
        """
        SELECT game_id, red_sm_model, red_op_model, blue_sm_model, blue_op_model,
               mode, winner, pair_id, status
        FROM games
        WHERE status = 'completed'
        ORDER BY pair_id, created_at
        """
    )
    rows = [dict(r) for r in cur.fetchall()]

    if not rows:
        console.print("[yellow]No completed games found.[/yellow]")
        return

    # Get all model IDs
    model_rows = repo.list_models()
    model_ids = [m["model_id"] for m in model_rows]

    # Group games by (pair_id, matchup) for pair-based scoring.
    # pair_id is a round number — multiple matchups share the same pair_id,
    # so we sub-group by the sorted model pair within each pair_id.
    MatchupKey = tuple[int | None, tuple[str, str]]  # (pair_id, (model_a, model_b))
    matchups: dict[MatchupKey, list[dict]] = {}
    for row in rows:
        if row["mode"] != "solo":
            continue
        pid = row.get("pair_id")
        models_key = tuple(sorted([row["red_sm_model"], row["blue_sm_model"]]))
        key = (pid, models_key)
        matchups.setdefault(key, []).append(row)

    # Build game results for each mode
    solo_results: list[GameResultTuple] = []
    games_per_model: dict[str, dict[str, int]] = {}  # model_id -> {rating_type -> count}

    def _count_game(model_id: str, rating_type: str) -> None:
        games_per_model.setdefault(model_id, {}).setdefault(rating_type, 0)
        games_per_model[model_id][rating_type] += 1

    for (pid, models_key), matchup_games in matchups.items():
        model_a, model_b = models_key

        if pid is None:
            # Unpaired games — treat each as a standalone result
            for g in matchup_games:
                _count_game(model_a, "solo")
                _count_game(model_b, "solo")
                if g["winner"] == "red":
                    solo_results.append((g["red_sm_model"], g["blue_sm_model"], 1.0))
                elif g["winner"] == "blue":
                    solo_results.append((g["red_sm_model"], g["blue_sm_model"], 0.0))
            continue

        # Paired games — determine pair outcome
        valid_games = [g for g in matchup_games if g["status"] == "completed"]

        if len(valid_games) == 2:
            a_wins = 0
            b_wins = 0
            for g in valid_games:
                if g["winner"] == "red":
                    winner = g["red_sm_model"]
                elif g["winner"] == "blue":
                    winner = g["blue_sm_model"]
                else:
                    continue
                if winner == model_a:
                    a_wins += 1
                else:
                    b_wins += 1

            _count_game(model_a, "solo")
            _count_game(model_b, "solo")

            if a_wins == 2:
                solo_results.append((model_a, model_b, 1.0))
            elif b_wins == 2:
                solo_results.append((model_a, model_b, 0.0))
            elif a_wins == 1 and b_wins == 1:
                solo_results.append((model_a, model_b, 0.5))

        elif len(valid_games) == 1:
            # Single valid game in pair — treat as standalone
            g = valid_games[0]
            _count_game(model_a, "solo")
            _count_game(model_b, "solo")
            if g["winner"] == "red":
                solo_results.append((g["red_sm_model"], g["blue_sm_model"], 1.0))
            elif g["winner"] == "blue":
                solo_results.append((g["red_sm_model"], g["blue_sm_model"], 0.0))

    # Compute BT ratings for solo mode
    if solo_results:
        console.print(f"Computing Bradley-Terry ratings from {len(solo_results)} pair results...")
        bt_ratings = BradleyTerry.fit_with_ci(solo_results, model_ids, n_bootstrap=n_bootstrap)
        repo.save_bt_ratings(
            [{"model_id": r.model_id, "rating": r.rating, "ci_lower": r.ci_lower, "ci_upper": r.ci_upper}
             for r in bt_ratings],
            "solo",
        )
        repo.save_bt_games_played(games_per_model)
        console.print(f"[green]Saved {len(bt_ratings)} solo ratings.[/green]")
    else:
        console.print("[yellow]No solo game results to compute ratings from.[/yellow]")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


@app.command()
def play(
    red_model: str = typer.Option(..., "--red-model", help="Model ID for the red team"),
    blue_model: str = typer.Option(..., "--blue-model", help="Model ID for the blue team"),
    mode: str = typer.Option("solo", "--mode", help="Game mode: solo or collab"),
    seed: Optional[int] = typer.Option(None, "--seed", help="Random seed for reproducibility"),
    verbose: bool = typer.Option(False, "--verbose", help="Show detailed output"),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Play a single Codenames game between two models."""
    api_key = _get_api_key()

    rng = random.Random(seed) if seed is not None else random.Random()
    board_seed = seed if seed is not None else rng.randint(0, 2**31)

    console.print(f"[bold]Setting up game:[/bold] {red_model} (RED) vs {blue_model} (BLUE)")
    console.print(f"[dim]Mode: {mode} | Seed: {board_seed}[/dim]")

    # Set up the board
    word_pool = WordPool()
    board_rng = random.Random(board_seed)
    words = word_pool.sample(25, rng=board_rng)
    board = Board(words=words, starting_team=Team.RED, rng=random.Random(board_seed + 1))

    if verbose:
        _display_board(board)

    # Create LLM client and agents
    llm_client = LLMClient(api_key=api_key)
    prompt_builder = PromptBuilder()

    red_sm = LLMSpymaster(red_model, Team.RED, llm_client, prompt_builder)
    red_op = LLMOperative(red_model, Team.RED, llm_client, prompt_builder)
    blue_sm = LLMSpymaster(blue_model, Team.BLUE, llm_client, prompt_builder)
    blue_op = LLMOperative(blue_model, Team.BLUE, llm_client, prompt_builder)

    config = MatchConfig(
        red_team=TeamSetup(spymaster=red_sm, operative=red_op),
        blue_team=TeamSetup(spymaster=blue_sm, operative=blue_op),
        board=board,
        starting_team=Team.RED,
    )

    live = _LivePrinter(console) if verbose else None
    runner = MatchRunner(config, live=live)

    # Run the game
    console.print("\n[bold]Running game...[/bold]\n")

    async def _run_and_close() -> GameResult:
        try:
            return await runner.run()
        finally:
            await llm_client.close()

    import time as _time
    _t0 = _time.monotonic()
    result = asyncio.run(_run_and_close())
    _elapsed = _time.monotonic() - _t0
    console.print(f"[dim]Game finished in {_elapsed:.1f}s[/dim]")

    # Display results
    _display_game_result(result)

    if verbose:
        _display_move_log(result.move_log)
        _display_board(board)

    # Save to DB
    db, repo = _init_db(db_path)
    try:
        game_id = str(uuid.uuid4())

        # Ensure models exist
        for model_id in [red_model, blue_model]:
            if repo.get_model(model_id) is None:
                repo.save_model(model_id, model_id, model_id)

        # Save game
        winner_str = result.winner.value.lower() if result.winner else None
        move_dicts = [
            {
                "turn_number": m.turn_number,
                "team": m.team.value,
                "action_type": m.action_type,
                "clue_word": m.clue_word,
                "clue_count": m.clue_count,
                "guess_word": m.guess_word,
                "guess_result": m.guess_result.value if m.guess_result else None,
                "model_id": m.model_id,
                "latency_ms": m.latency_ms,
                "input_tokens": m.input_tokens,
                "output_tokens": m.output_tokens,
            }
            for m in result.move_log
        ]

        repo.save_game({
            "game_id": game_id,
            "red_sm_model": red_model,
            "red_op_model": red_model,
            "blue_sm_model": blue_model,
            "blue_op_model": blue_model,
            "mode": mode,
            "winner": winner_str,
            "win_condition": _outcome_to_win_condition(result.outcome),
            "total_turns": result.total_turns,
            "red_remaining": result.red_remaining,
            "blue_remaining": result.blue_remaining,
            "board_seed": board_seed,
            "game_log_json": move_dicts,
            "status": "completed",
        })
        console.print(f"\n[dim]Game saved: {game_id}[/dim]")
    finally:
        db.close()


@app.command()
def benchmark(
    models: str = typer.Option(..., "--models", help="Comma-separated list of model IDs"),
    mode: str = typer.Option("solo", "--mode", help="Game mode: solo or collab"),
    games_per_matchup: int = typer.Option(6, "--games-per-matchup", help="Games per model pair"),
    seed: int = typer.Option(42, "--seed", help="Base random seed"),
    name: Optional[str] = typer.Option(None, "--name", help="Experiment name"),
    budget: Optional[float] = typer.Option(None, "--budget", help="Max budget in USD"),
    max_concurrent: int = typer.Option(4, "--max-concurrent", help="Max parallel games"),
    max_concurrent_per_model: int = typer.Option(5, "--max-concurrent-per-model", help="Max parallel LLM requests per model"),
    move_timeout: Optional[float] = typer.Option(120.0, "--move-timeout", help="Per-move timeout in seconds (game discarded on timeout). Use 0 to disable."),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Run a full benchmark tournament between multiple models.

    Games are run in parallel (up to --max-concurrent) and scored using
    mirrored pairs: each pair of models plays the same board from both
    sides. Ratings are computed via Bradley-Terry after the tournament.
    """
    from codenames.benchmark.tournament import TournamentConfig, TournamentRunner

    api_key = _get_api_key()
    model_list = [m.strip() for m in models.split(",") if m.strip()]

    if len(model_list) < 2:
        console.print("[bold red]Error:[/bold red] At least 2 models required for a benchmark.")
        raise typer.Exit(code=1)

    experiment_name = name or f"benchmark-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    console.print(f"[bold]Benchmark:[/bold] {experiment_name}")
    console.print(f"[bold]Models:[/bold] {', '.join(model_list)}")
    console.print(f"[bold]Games per matchup:[/bold] {games_per_matchup}")
    console.print(f"[bold]Max concurrent:[/bold] {max_concurrent}")

    db, repo = _init_db(db_path)
    try:
        llm_client = LLMClient(
            api_key=api_key,
            max_concurrent_per_model=max_concurrent_per_model,
        )
        word_pool = WordPool()

        effective_timeout = move_timeout if move_timeout and move_timeout > 0 else None
        config = TournamentConfig(
            models=model_list,
            mode=mode,
            games_per_matchup=games_per_matchup,
            seed=seed,
            budget_usd=budget,
            max_concurrent=max_concurrent,
            move_timeout=effective_timeout,
        )

        runner = TournamentRunner(config, llm_client, db, word_pool)

        async def _run_tournament() -> str:
            try:
                return await runner.run(experiment_name)
            finally:
                await llm_client.close()

        experiment_id = asyncio.run(_run_tournament())

        console.print(f"\n[dim]Experiment completed: {experiment_id}[/dim]")

        # Compute Bradley-Terry ratings from all games
        console.print("\n[bold]Computing ratings...[/bold]")
        compute_ratings_from_db(repo, db)

        _display_leaderboard_table(repo, mode)

    finally:
        db.close()


@app.command(name="compute-ratings")
def compute_ratings_cmd(
    n_bootstrap: int = typer.Option(1000, "--bootstrap", help="Number of bootstrap resamples for CIs"),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Recompute Bradley-Terry ratings from all completed games.

    Fits the Davidson-extended Bradley-Terry model with bootstrap
    confidence intervals and updates the models table.
    """
    db, repo = _init_db(db_path)
    try:
        compute_ratings_from_db(repo, db, n_bootstrap=n_bootstrap)
        _display_leaderboard_table(repo, "solo")
    finally:
        db.close()


@app.command()
def leaderboard(
    mode: str = typer.Option("solo", "--mode", help="Rating type: solo, spymaster, or operative"),
    top: int = typer.Option(20, "--top", help="Number of models to show"),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Show the current leaderboard."""
    db, repo = _init_db(db_path)
    try:
        _display_leaderboard_table(repo, mode, top)
    finally:
        db.close()


@app.command()
def stats(
    model_id: str = typer.Argument(..., help="Model ID to show stats for"),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Show detailed statistics for a model."""
    db, repo = _init_db(db_path)
    try:
        model_stats = repo.get_model_stats(model_id)
        if not model_stats:
            console.print(f"[bold red]Model '{model_id}' not found.[/bold red]")
            raise typer.Exit(code=1)

        solo_ci = ""
        ci_lo = model_stats.get("solo_ci_lower")
        ci_hi = model_stats.get("solo_ci_upper")
        if ci_lo and ci_hi and ci_lo != ci_hi:
            solo_ci = f" [{ci_lo:.0f} - {ci_hi:.0f}]"

        lines = [
            f"[bold]Model:[/bold] {model_stats.get('display_name', model_id)}",
            f"[bold]Model ID:[/bold] {model_stats['model_id']}",
            "",
            f"[bold]Total Games:[/bold] {model_stats.get('total_games', 0)}",
            f"[bold]Completed:[/bold] {model_stats.get('completed_games', 0)}",
            f"[bold]Wins:[/bold] {model_stats.get('wins', 0)}",
            f"[bold]Win Rate:[/bold] {model_stats.get('win_rate', 0.0):.1%}",
            f"[bold]Avg Turns:[/bold] {model_stats.get('avg_turns', 0)}",
            "",
            f"[bold]Solo Rating:[/bold] {model_stats.get('solo_rating', 1500.0):.0f}{solo_ci} ({model_stats.get('solo_games_played', 0)} games)",
            f"[bold]Spymaster Rating:[/bold] {model_stats.get('spymaster_rating', 1500.0):.0f} ({model_stats.get('spymaster_games', 0)} games)",
            f"[bold]Operative Rating:[/bold] {model_stats.get('operative_rating', 1500.0):.0f} ({model_stats.get('operative_games', 0)} games)",
            "",
            f"[bold]Total Cost:[/bold] ${model_stats.get('total_cost_usd', 0.0):.4f}",
            f"[bold]Total Input Tokens:[/bold] {model_stats.get('total_input_tokens', 0):,}",
            f"[bold]Total Output Tokens:[/bold] {model_stats.get('total_output_tokens', 0):,}",
        ]

        console.print(Panel("\n".join(lines), title=f"Model Stats: {model_id}", border_style="cyan"))
    finally:
        db.close()


@app.command()
def replay(
    game_id: str = typer.Argument(..., help="Game ID to replay"),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Replay a game turn by turn."""
    db, repo = _init_db(db_path)
    try:
        games = repo.get_games(limit=1)
        # Find the specific game
        all_games = repo.get_games(limit=10000)
        game_data = None
        for g in all_games:
            if g["game_id"] == game_id:
                game_data = g
                break

        if game_data is None:
            console.print(f"[bold red]Game '{game_id}' not found.[/bold red]")
            raise typer.Exit(code=1)

        console.print(Panel(
            f"[bold]Game ID:[/bold] {game_id}\n"
            f"[bold]Red:[/bold] {game_data.get('red_sm_model', '?')} vs "
            f"[bold]Blue:[/bold] {game_data.get('blue_sm_model', '?')}\n"
            f"[bold]Winner:[/bold] {game_data.get('winner', '?')}\n"
            f"[bold]Condition:[/bold] {game_data.get('win_condition', '?')}\n"
            f"[bold]Turns:[/bold] {game_data.get('total_turns', '?')}",
            title="Game Info",
            border_style="cyan",
        ))

        # Parse game log
        game_log = game_data.get("game_log")
        if game_log is None:
            raw = game_data.get("game_log_json")
            if raw and isinstance(raw, str):
                game_log = json.loads(raw)
            elif isinstance(raw, list):
                game_log = raw

        if not game_log:
            console.print("[yellow]No game log available for this game.[/yellow]")
            raise typer.Exit(code=0)

        # Display turn by turn
        current_turn: int | None = None
        for move in game_log:
            turn_num = move.get("turn_number", 0)
            team = move.get("team", "?")
            action_type = move.get("action_type", "?")

            if turn_num != current_turn:
                current_turn = turn_num
                console.print(f"\n[bold]--- Turn {turn_num} ({team}) ---[/bold]")

            if action_type == "clue":
                clue_word = move.get("clue_word", "?")
                clue_count = move.get("clue_count", "?")
                console.print(f"  Spymaster clue: [bold]{clue_word}[/bold] ({clue_count})")
            elif action_type == "guess":
                guess_word = move.get("guess_word", "?")
                guess_result = move.get("guess_result", "?")
                result_colors = {
                    "CORRECT": "green",
                    "WRONG_TEAM": "yellow",
                    "NEUTRAL": "dim",
                    "ASSASSIN": "bold red",
                }
                color = result_colors.get(guess_result, "white")
                console.print(f"  Guess: {guess_word} -> [{color}]{guess_result}[/{color}]")

    finally:
        db.close()


@app.command()
def costs(
    experiment: Optional[str] = typer.Option(None, "--experiment", help="Filter by experiment ID"),
    db_path: str = typer.Option("codenames.db", "--db", help="Path to the SQLite database"),
) -> None:
    """Show a cost report for games."""
    db, repo = _init_db(db_path)
    try:
        games = repo.get_games(experiment_id=experiment, limit=10000)

        if not games:
            console.print("[yellow]No games found.[/yellow]")
            raise typer.Exit(code=0)

        # Aggregate by model
        model_costs: dict[str, dict] = {}

        for game in games:
            for role_key in ["red_sm_model", "red_op_model", "blue_sm_model", "blue_op_model"]:
                model_id = game.get(role_key)
                if model_id and model_id not in model_costs:
                    model_costs[model_id] = {
                        "games": 0,
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "cost_usd": 0.0,
                    }

            # Count each game once per unique model involved
            involved_models = set()
            for role_key in ["red_sm_model", "red_op_model", "blue_sm_model", "blue_op_model"]:
                m = game.get(role_key)
                if m:
                    involved_models.add(m)

            per_model_input = (game.get("total_input_tokens") or 0) // max(len(involved_models), 1)
            per_model_output = (game.get("total_output_tokens") or 0) // max(len(involved_models), 1)
            per_model_cost = (game.get("total_cost_usd") or 0.0) / max(len(involved_models), 1)

            for m in involved_models:
                model_costs[m]["games"] += 1
                model_costs[m]["input_tokens"] += per_model_input
                model_costs[m]["output_tokens"] += per_model_output
                model_costs[m]["cost_usd"] += per_model_cost

        # Display table
        table = Table(title="Cost Report")
        table.add_column("Model", justify="left")
        table.add_column("Games", justify="right")
        table.add_column("Input Tokens", justify="right")
        table.add_column("Output Tokens", justify="right")
        table.add_column("Cost (USD)", justify="right")

        total_cost = 0.0
        total_input = 0
        total_output = 0

        for model_id, data in sorted(model_costs.items()):
            table.add_row(
                model_id,
                str(data["games"]),
                f"{data['input_tokens']:,}",
                f"{data['output_tokens']:,}",
                f"${data['cost_usd']:.4f}",
            )
            total_cost += data["cost_usd"]
            total_input += data["input_tokens"]
            total_output += data["output_tokens"]

        table.add_section()
        table.add_row(
            "[bold]TOTAL[/bold]",
            str(len(games)),
            f"{total_input:,}",
            f"{total_output:,}",
            f"[bold]${total_cost:.4f}[/bold]",
        )

        console.print(table)

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _display_leaderboard_table(
    repo: Repository,
    mode: str = "solo",
    top: int = 20,
) -> None:
    """Query the leaderboard and render it as a Rich table."""
    entries = repo.get_leaderboard(rating_type=mode, limit=top)

    table = Table(title=f"Leaderboard ({mode.capitalize()})")
    table.add_column("Rank", justify="center", width=5)
    table.add_column("Model", justify="left")
    table.add_column("Rating", justify="right", width=8)
    table.add_column("95% CI", justify="right", width=16)
    table.add_column("Games", justify="right", width=7)

    for rank, entry in enumerate(entries, start=1):
        games_played = entry.get("games_played", 0)
        rating = entry.get("rating", 1500.0)
        ci_lower = entry.get("ci_lower", 1500.0)
        ci_upper = entry.get("ci_upper", 1500.0)
        display = entry.get("display_name", entry.get("model_id", "?"))

        ci_str = ""
        if ci_lower != ci_upper:
            ci_str = f"[{ci_lower:.0f} - {ci_upper:.0f}]"

        table.add_row(
            str(rank),
            display,
            f"{rating:.0f}",
            ci_str,
            str(games_played),
        )

    console.print(table)


def _outcome_to_win_condition(outcome: GameOutcome) -> str:
    """Map a GameOutcome enum to the database win_condition string."""
    mapping = {
        GameOutcome.RED_WINS_ALL_WORDS: "all_words_found",
        GameOutcome.BLUE_WINS_ALL_WORDS: "all_words_found",
        GameOutcome.RED_WINS_ASSASSIN: "assassin",
        GameOutcome.BLUE_WINS_ASSASSIN: "assassin",
        GameOutcome.TURN_LIMIT: "turn_limit",
    }
    return mapping.get(outcome, "error")


if __name__ == "__main__":
    app()

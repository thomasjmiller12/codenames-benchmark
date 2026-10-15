# Codenames Benchmark

An evaluation suite where language models play Codenames against one another. It combines a Python game engine and tournament runner with statistical ratings, game replays, and a Next.js dashboard.

**[Live dashboard](https://codenames-benchmark.vercel.app/)** · **[Methodology](https://codenames-benchmark.vercel.app/methodology)** · **[Leaderboard](https://codenames-benchmark.vercel.app/leaderboard)**

## What it measures

A spymaster gives a one-word clue linking several of its team's words while avoiding the opponent's words and the assassin. An operative interprets the clue without seeing the hidden card colors and decides when to stop guessing.

The benchmark makes those decisions observable: clues, guesses, rule violations, latency, and token usage are recorded for replay and analysis. In the default **solo** mode, the same model plays both roles on a team.

## Methodology

- **Mirrored pairs.** Each pair consists of two games on the same board, with the models switching teams. A sweep is a win; a 1–1 split is a tie. This balances which model plays each side, reducing the influence of board assignment and starting position.
- **Pair-based ratings.** Complete solo pairs feed a Bradley–Terry model with the Davidson tie extension. Ratings are fit in a batch and expressed on an Elo scale centered at 1500. Standalone games and incomplete pairs are excluded.
- **Uncertainty.** Bootstrap resampling of pair outcomes produces percentile 95% confidence intervals. Small rating differences should be interpreted alongside uncertainty and matchup coverage.
- **Controlled game setup.** Seeded board generation makes the game setup repeatable. The game engine validates actions, and LLM agents use structured responses with feedback for invalid clues.

The [rating implementation](src/codenames/benchmark/rating.py), [pair aggregation](src/codenames/cli.py), and [prompts](prompts/) are available to inspect.

## Results and limits

The [public dashboard](https://codenames-benchmark.vercel.app/) showed **3,053 games across 33 models** on October 15, 2026. Of those games, **1,215 ended with an assassin guess**—about 40%. Risky guesses are a useful failure mode to investigate in the replays; this aggregate count is not a controlled comparison between models.

Rankings describe performance in this game under these prompts, model versions, and opponents. They do not establish general intelligence or real-world task performance. Mirroring does not remove all sampling noise, and bootstrap intervals do not capture every source of uncertainty. LLM responses and the unseeded bootstrap can vary between runs even when the board seed is fixed.

## Run locally

Requires **Python 3.11+**. Run the CLI from the repository root so it can find the prompts and word lists.

```bash
git clone https://github.com/thomasjmiller12/codenames-benchmark.git
cd codenames-benchmark
python3 -m venv ~/.venvs/codenames-benchmark
source ~/.venvs/codenames-benchmark/bin/activate
python -m pip install -e ".[dev]" httpx
```

`httpx` is installed explicitly because the LLM client imports it but the package metadata does not yet declare it.

Set `OPENROUTER_API_KEY` in your environment or a local `.env` file, using [.env.example](.env.example) as a reference. Games make paid API calls through OpenRouter.

Edit [experiments/example.yaml](experiments/example.yaml) to select currently available OpenRouter model IDs. Keep `games_per_matchup` even; start with two models and two games per matchup for a small setup check.

```bash
codenames benchmark --config experiments/example.yaml
codenames leaderboard
codenames costs
```

The benchmark command computes ratings after the tournament. Results are stored in `codenames.db`; the published dashboard database is not bundled with the repository. Ratings pool completed pairs across experiments in that file. Use `--db another-run.db` consistently across commands when you want a separate dataset.

Additional commands (replace the placeholders with your model or game IDs):

```bash
codenames play --red-model MODEL_A --blue-model MODEL_B --seed 42
codenames replay GAME_ID
codenames stats MODEL_ID
codenames compute-ratings --bootstrap 1000
```

## Local dashboard

Requires **Node.js 20.9+**. From the repository root, initialize a local database, then start the UI:

```bash
codenames leaderboard
cd ui
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The UI uses `@libsql/client` to read `../codenames.db` by default; run a benchmark to populate it. For a remote Turso database, configure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `ui/.env.local`.

## Code and tests

| Path | Purpose |
| --- | --- |
| `src/codenames/engine/` | Board generation, game state, and clue validation |
| `src/codenames/agents/` | LLM and random agents, prompts |
| `src/codenames/benchmark/` | Scheduling, concurrent execution, statistical ratings |
| `src/codenames/storage/` | SQLite schema and result storage |
| `ui/` | Leaderboards, comparisons, and game replays |

Run the Python test suite from the repository root; it does not require an API key:

```bash
python -m pytest
```

"""Match scheduling for Codenames benchmark tournaments.

Provides deterministic schedule generation for round-robin and
Swiss-system tournament formats, supporting both solo mode (same model
plays spymaster + operative) and collab mode (different models fill
each role).
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations


@dataclass
class ScheduledMatch:
    """A planned match between two model configurations.

    Attributes
    ----------
    red_sm_model:
        Model ID for the red team's spymaster.
    red_op_model:
        Model ID for the red team's operative.
    blue_sm_model:
        Model ID for the blue team's spymaster.
    blue_op_model:
        Model ID for the blue team's operative.
    board_seed:
        Deterministic seed for board generation.  Both games in a mirrored
        pair share the same seed so the board is identical.
    game_number:
        The ordinal within its series (e.g. 1 or 2 for a side-swap pair).
    pair_id:
        Groups two mirrored games that share the same board with swapped
        sides.  Both games in a pair have the same ``pair_id``.
    """

    red_sm_model: str
    red_op_model: str
    blue_sm_model: str
    blue_op_model: str
    board_seed: int
    game_number: int
    pair_id: int


class Scheduler:
    """Static methods for generating tournament match schedules."""

    @staticmethod
    def round_robin_solo(
        model_ids: list[str],
        games_per_matchup: int = 6,
        base_seed: int = 42,
    ) -> list[ScheduledMatch]:
        """Generate a round-robin schedule for solo mode.

        In solo mode each model plays both spymaster and operative for
        its team.  Every unique pair of models plays ``games_per_matchup``
        games.  Games alternate which model is red vs. blue to ensure
        fairness (``games_per_matchup`` must be even).

        Parameters
        ----------
        model_ids:
            The list of model identifiers to schedule.
        games_per_matchup:
            Total games between each pair (must be even for side swaps).
        base_seed:
            Starting seed for deterministic board generation.

        Returns
        -------
        list[ScheduledMatch]
            The complete schedule.
        """
        if games_per_matchup % 2 != 0:
            raise ValueError(
                f"games_per_matchup must be even for fair side swaps, "
                f"got {games_per_matchup}"
            )

        schedule: list[ScheduledMatch] = []
        seed_counter = base_seed
        pair_counter = 0

        for model_a, model_b in combinations(model_ids, 2):
            num_pairs = games_per_matchup // 2
            for pair_idx in range(num_pairs):
                pair_counter += 1
                # Game 1: A is red, B is blue
                schedule.append(
                    ScheduledMatch(
                        red_sm_model=model_a,
                        red_op_model=model_a,
                        blue_sm_model=model_b,
                        blue_op_model=model_b,
                        board_seed=seed_counter,
                        game_number=pair_idx * 2 + 1,
                        pair_id=pair_counter,
                    )
                )
                # Game 2: B is red, A is blue (same board)
                schedule.append(
                    ScheduledMatch(
                        red_sm_model=model_b,
                        red_op_model=model_b,
                        blue_sm_model=model_a,
                        blue_op_model=model_a,
                        board_seed=seed_counter,
                        game_number=pair_idx * 2 + 2,
                        pair_id=pair_counter,
                    )
                )
                seed_counter += 1

        return schedule

    @staticmethod
    def build_solo_schedule(
        models: list[str] | None = None,
        matchups: list[tuple[str, str]] | None = None,
        games_per_matchup: int = 6,
        base_seed: int = 42,
    ) -> list[ScheduledMatch]:
        """Build a combined solo schedule from round-robin models and/or explicit matchups.

        Collects unique pairs from both sources (deduplicating by sorted
        model pair), then generates mirrored game pairs for each.

        Parameters
        ----------
        models:
            Model IDs for round-robin pairing. All unique pairs are generated.
        matchups:
            Explicit ``(model_a, model_b)`` pairs to schedule.
        games_per_matchup:
            Total games between each pair (must be even for side swaps).
        base_seed:
            Starting seed for deterministic board generation.
        """
        if games_per_matchup % 2 != 0:
            raise ValueError(
                f"games_per_matchup must be even for fair side swaps, "
                f"got {games_per_matchup}"
            )

        # Collect all unique pairs (deduplicated by sorted tuple)
        seen: set[tuple[str, str]] = set()
        all_pairs: list[tuple[str, str]] = []

        if models and len(models) >= 2:
            for model_a, model_b in combinations(models, 2):
                key = (min(model_a, model_b), max(model_a, model_b))
                if key not in seen:
                    seen.add(key)
                    all_pairs.append((model_a, model_b))

        if matchups:
            for model_a, model_b in matchups:
                key = (min(model_a, model_b), max(model_a, model_b))
                if key not in seen:
                    seen.add(key)
                    all_pairs.append((model_a, model_b))

        schedule: list[ScheduledMatch] = []
        seed_counter = base_seed
        pair_counter = 0

        for model_a, model_b in all_pairs:
            num_pairs = games_per_matchup // 2
            for pair_idx in range(num_pairs):
                pair_counter += 1
                schedule.append(
                    ScheduledMatch(
                        red_sm_model=model_a,
                        red_op_model=model_a,
                        blue_sm_model=model_b,
                        blue_op_model=model_b,
                        board_seed=seed_counter,
                        game_number=pair_idx * 2 + 1,
                        pair_id=pair_counter,
                    )
                )
                schedule.append(
                    ScheduledMatch(
                        red_sm_model=model_b,
                        red_op_model=model_b,
                        blue_sm_model=model_a,
                        blue_op_model=model_a,
                        board_seed=seed_counter,
                        game_number=pair_idx * 2 + 2,
                        pair_id=pair_counter,
                    )
                )
                seed_counter += 1

        return schedule

    @staticmethod
    def round_robin_collab(
        pairs: list[tuple[str, str]],
        games_per_matchup: int = 6,
        base_seed: int = 42,
    ) -> list[ScheduledMatch]:
        """Generate a round-robin schedule for collaborative mode.

        Each element of *pairs* is ``(spymaster_model, operative_model)``
        -- i.e. a fixed team composition.  Every unique pair of teams
        plays ``games_per_matchup`` games with alternating sides.

        Parameters
        ----------
        pairs:
            List of ``(spymaster_model, operative_model)`` team
            configurations.
        games_per_matchup:
            Total games between each pair of teams (must be even).
        base_seed:
            Starting seed for deterministic board generation.

        Returns
        -------
        list[ScheduledMatch]
        """
        if games_per_matchup % 2 != 0:
            raise ValueError(
                f"games_per_matchup must be even for fair side swaps, "
                f"got {games_per_matchup}"
            )

        schedule: list[ScheduledMatch] = []
        seed_counter = base_seed
        pair_counter = 0

        for team_a, team_b in combinations(pairs, 2):
            sm_a, op_a = team_a
            sm_b, op_b = team_b

            num_pairs = games_per_matchup // 2
            for pair_idx in range(num_pairs):
                pair_counter += 1
                # Game 1: team_a is red, team_b is blue
                schedule.append(
                    ScheduledMatch(
                        red_sm_model=sm_a,
                        red_op_model=op_a,
                        blue_sm_model=sm_b,
                        blue_op_model=op_b,
                        board_seed=seed_counter,
                        game_number=pair_idx * 2 + 1,
                        pair_id=pair_counter,
                    )
                )
                # Game 2: team_b is red, team_a is blue (same board)
                schedule.append(
                    ScheduledMatch(
                        red_sm_model=sm_b,
                        red_op_model=op_b,
                        blue_sm_model=sm_a,
                        blue_op_model=op_a,
                        board_seed=seed_counter,
                        game_number=pair_idx * 2 + 2,
                        pair_id=pair_counter,
                    )
                )
                seed_counter += 1

        return schedule

    @staticmethod
    def swiss_round(
        model_ids: list[str],
        current_ratings: dict[str, float],
        games_per_round: int = 2,
        base_seed: int = 42,
        already_played: dict[tuple[str, str], int] | None = None,
        max_games_per_pair: int = 10,
    ) -> list[ScheduledMatch]:
        """Generate one round of Swiss-system pairings for solo mode.

        Models are sorted by rating (descending) and paired adjacently.
        Pairs that have already met ``max_games_per_pair`` times are
        skipped in favour of the next eligible opponent.

        Each paired matchup generates ``games_per_round`` games (must be
        even for side-swap fairness).

        Parameters
        ----------
        model_ids:
            Model identifiers participating in the round.
        current_ratings:
            Mapping of model_id -> current Elo rating for sorting.
        games_per_round:
            Games between each paired matchup this round (must be even).
        base_seed:
            Starting seed for board generation.
        already_played:
            Optional mapping of ``(model_a, model_b)`` -> number of games
            already played (order-insensitive: the scheduler normalises
            the key).
        max_games_per_pair:
            Maximum games any two models are allowed to play in total.

        Returns
        -------
        list[ScheduledMatch]
        """
        if games_per_round % 2 != 0:
            raise ValueError(
                f"games_per_round must be even for fair side swaps, "
                f"got {games_per_round}"
            )

        played = already_played or {}

        def _pair_key(a: str, b: str) -> tuple[str, str]:
            """Canonical (sorted) key for an unordered pair."""
            return (min(a, b), max(a, b))

        def _games_between(a: str, b: str) -> int:
            key = _pair_key(a, b)
            return played.get(key, 0)

        # Sort models by rating descending (ties broken alphabetically
        # for determinism).
        sorted_models = sorted(
            model_ids,
            key=lambda m: (-current_ratings.get(m, 1500.0), m),
        )

        schedule: list[ScheduledMatch] = []
        seed_counter = base_seed
        pair_counter = 0
        paired: set[str] = set()

        for i, model_a in enumerate(sorted_models):
            if model_a in paired:
                continue

            # Find the best available partner (next in sorted order that
            # has not been paired yet and has not exceeded the max games).
            for j in range(i + 1, len(sorted_models)):
                model_b = sorted_models[j]
                if model_b in paired:
                    continue
                if _games_between(model_a, model_b) >= max_games_per_pair:
                    continue

                # Found a valid partner
                paired.add(model_a)
                paired.add(model_b)

                num_pairs = games_per_round // 2
                for pair_idx in range(num_pairs):
                    pair_counter += 1
                    # Game 1: A is red, B is blue
                    schedule.append(
                        ScheduledMatch(
                            red_sm_model=model_a,
                            red_op_model=model_a,
                            blue_sm_model=model_b,
                            blue_op_model=model_b,
                            board_seed=seed_counter,
                            game_number=pair_idx * 2 + 1,
                            pair_id=pair_counter,
                        )
                    )
                    # Game 2: B is red, A is blue (same board)
                    schedule.append(
                        ScheduledMatch(
                            red_sm_model=model_b,
                            red_op_model=model_b,
                            blue_sm_model=model_a,
                            blue_op_model=model_a,
                            board_seed=seed_counter,
                            game_number=pair_idx * 2 + 2,
                            pair_id=pair_counter,
                        )
                    )
                    seed_counter += 1
                break

        return schedule

"""Rating systems for the Codenames LLM benchmark suite.

Provides two complementary rating approaches:
  - EloCalculator: incremental Elo updates for live/streaming leaderboards
  - BradleyTerry: MLE-fitted Bradley-Terry model with bootstrap confidence intervals
    for final, statistically rigorous rankings

Both use the standard chess Elo scale (center=1500, scale factor=400).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ELO_CENTER = 1500.0
ELO_SCALE = 400.0
REGULARIZATION_STRENGTH = 0.001

# ---------------------------------------------------------------------------
# Elo data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EloUpdate:
    """The result of an Elo rating update for a single player."""

    model_id: str
    rating_type: str  # "solo", "spymaster", "operative"
    old_rating: float
    new_rating: float
    game_result: float  # 1.0 = win, 0.0 = loss


# ---------------------------------------------------------------------------
# EloCalculator – incremental / live updates
# ---------------------------------------------------------------------------


class EloCalculator:
    """Standard Elo calculator with provisional K-factor and optional
    margin-of-victory scaling.

    Parameters
    ----------
    k_factor:
        Base K-factor for established players.
    provisional_k:
        K-factor used when a player has fewer than *provisional_threshold*
        games on record.
    provisional_threshold:
        Number of games below which a player is considered provisional.
    """

    def __init__(
        self,
        k_factor: int = 32,
        provisional_k: int = 40,
        provisional_threshold: int = 30,
    ) -> None:
        self.k_factor = k_factor
        self.provisional_k = provisional_k
        self.provisional_threshold = provisional_threshold

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def expected_score(rating_a: float, rating_b: float) -> float:
        """Return P(A wins) under the logistic Elo model.

        P(A wins) = 1 / (1 + 10^((R_B - R_A) / 400))
        """
        exponent = (rating_b - rating_a) / ELO_SCALE
        return 1.0 / (1.0 + math.pow(10.0, exponent))

    def _effective_k(self, games_played: int) -> float:
        """Return the K-factor to use based on experience."""
        if games_played < self.provisional_threshold:
            return float(self.provisional_k)
        return float(self.k_factor)

    @staticmethod
    def _mov_multiplier(margin: int) -> float:
        """Margin-of-victory multiplier.

        Scales the K-factor based on how decisive the win was.
        ``margin`` = loser_remaining - winner_remaining (higher = more decisive).

        MOV multiplier = 1.0 + 0.5 * (1 - exp(-0.3 * max(margin, 0)))

        A perfectly close game (margin <= 0) gives multiplier 1.0.
        Large margins asymptote towards 1.5.
        """
        return 1.0 + 0.5 * (1.0 - math.exp(-0.3 * max(margin, 0)))

    # -- public API ---------------------------------------------------------

    def update(
        self,
        winner_id: str,
        loser_id: str,
        winner_rating: float,
        loser_rating: float,
        winner_games: int,
        loser_games: int,
        rating_type: str = "solo",
        margin: int = 0,
    ) -> tuple[EloUpdate, EloUpdate]:
        """Compute new ratings after a game.

        Parameters
        ----------
        winner_id / loser_id:
            Unique identifiers for the two models.
        winner_rating / loser_rating:
            Current ratings before this game.
        winner_games / loser_games:
            Number of games each model has played (used for provisional K).
        rating_type:
            One of ``"solo"``, ``"spymaster"``, ``"operative"``.
        margin:
            Remaining-words differential (loser_remaining - winner_remaining).
            Used for optional margin-of-victory scaling.  Pass 0 to disable.

        Returns
        -------
        (winner_update, loser_update) : tuple[EloUpdate, EloUpdate]
        """
        expected_w = self.expected_score(winner_rating, loser_rating)
        expected_l = 1.0 - expected_w

        k_w = self._effective_k(winner_games)
        k_l = self._effective_k(loser_games)

        mov = self._mov_multiplier(margin)

        new_winner = winner_rating + k_w * mov * (1.0 - expected_w)
        new_loser = loser_rating + k_l * mov * (0.0 - expected_l)

        winner_update = EloUpdate(
            model_id=winner_id,
            rating_type=rating_type,
            old_rating=winner_rating,
            new_rating=new_winner,
            game_result=1.0,
        )
        loser_update = EloUpdate(
            model_id=loser_id,
            rating_type=rating_type,
            old_rating=loser_rating,
            new_rating=new_loser,
            game_result=0.0,
        )
        return winner_update, loser_update

    def update_pair(
        self,
        model_a_id: str,
        model_b_id: str,
        model_a_rating: float,
        model_b_rating: float,
        model_a_games: int,
        model_b_games: int,
        a_wins: int,
        b_wins: int,
        rating_type: str = "solo",
        margin: int = 0,
    ) -> tuple[EloUpdate, EloUpdate]:
        """Compute Elo updates from a mirrored-pair result.

        A mirrored pair consists of two games on the same board with
        swapped sides.  The pair outcome determines the score:

        - ``a_wins=2, b_wins=0``: A decisively wins (score 1.0 vs 0.0)
        - ``a_wins=1, b_wins=1``: Draw (score 0.5 vs 0.5)
        - ``a_wins=0, b_wins=2``: B decisively wins (score 0.0 vs 1.0)

        Parameters
        ----------
        model_a_id / model_b_id:
            Unique identifiers for the two models.
        model_a_rating / model_b_rating:
            Current ratings before this pair.
        model_a_games / model_b_games:
            Number of *pair-updates* each model has received (for provisional K).
        a_wins / b_wins:
            Number of games each model won in the pair (must sum to 2).
        rating_type:
            One of ``"solo"``, ``"spymaster"``, ``"operative"``.
        margin:
            Average remaining-words differential for decisive results.
            Ignored for draws.
        """
        if a_wins + b_wins != 2:
            raise ValueError(
                f"Pair must have exactly 2 games, got a_wins={a_wins}, b_wins={b_wins}"
            )

        score_a = a_wins / 2.0  # 0.0, 0.5, or 1.0
        score_b = b_wins / 2.0

        expected_a = self.expected_score(model_a_rating, model_b_rating)
        expected_b = 1.0 - expected_a

        k_a = self._effective_k(model_a_games)
        k_b = self._effective_k(model_b_games)

        # No margin-of-victory scaling on draws
        mov = self._mov_multiplier(margin) if score_a != 0.5 else 1.0

        new_a = model_a_rating + k_a * mov * (score_a - expected_a)
        new_b = model_b_rating + k_b * mov * (score_b - expected_b)

        return (
            EloUpdate(
                model_id=model_a_id,
                rating_type=rating_type,
                old_rating=model_a_rating,
                new_rating=new_a,
                game_result=score_a,
            ),
            EloUpdate(
                model_id=model_b_id,
                rating_type=rating_type,
                old_rating=model_b_rating,
                new_rating=new_b,
                game_result=score_b,
            ),
        )


# ---------------------------------------------------------------------------
# Bradley-Terry data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BTRating:
    """A single model's Bradley-Terry rating with confidence interval."""

    model_id: str
    rating: float
    ci_lower: float  # 95% CI lower bound
    ci_upper: float  # 95% CI upper bound


# ---------------------------------------------------------------------------
# BradleyTerry – MLE fitting with bootstrap CIs
# ---------------------------------------------------------------------------


class BradleyTerry:
    """Bradley-Terry model fitting via MLE, with bootstrap confidence intervals.

    All public methods are static — the class carries no mutable state and
    serves purely as a namespace.
    """

    # -- internal helpers ---------------------------------------------------

    @staticmethod
    def _log_strengths_to_elo(log_strengths: np.ndarray) -> np.ndarray:
        """Convert raw log-strengths to the Elo scale centred at 1500.

        Elo_i = 1500 + 400 * (log_strength_i - mean(log_strengths)) / ln(10)
        """
        centered = log_strengths - np.mean(log_strengths)
        return ELO_CENTER + ELO_SCALE * centered / np.log(10.0)

    # -- public API ---------------------------------------------------------

    @staticmethod
    def fit(
        game_results: list[tuple[str, str]],
        model_ids: list[str],
    ) -> dict[str, float]:
        """Fit a Bradley-Terry model via maximum likelihood estimation.

        Parameters
        ----------
        game_results:
            List of ``(winner_id, loser_id)`` pairs.
        model_ids:
            Exhaustive list of model identifiers to include. Models that
            never appear in *game_results* receive the centre rating (1500).

        Returns
        -------
        dict mapping *model_id* -> Elo-scale rating.

        Notes
        -----
        Optimises the log-likelihood:

            L = sum_games [ log_s[winner] - log(exp(log_s[winner]) + exp(log_s[loser])) ]

        with light L2 regularisation (``0.001 * sum(params^2)``) to anchor
        the scale.  Uses ``scipy.optimize.minimize`` with L-BFGS-B.
        """
        n = len(model_ids)

        # Edge cases
        if n == 0:
            return {}
        if n == 1:
            return {model_ids[0]: ELO_CENTER}
        if len(game_results) == 0:
            return {mid: ELO_CENTER for mid in model_ids}

        id_to_idx: dict[str, int] = {mid: i for i, mid in enumerate(model_ids)}

        # Pre-compute game index arrays (only include games whose models are
        # both in *model_ids*)
        winner_idxs: list[int] = []
        loser_idxs: list[int] = []
        for w, l in game_results:
            wi = id_to_idx.get(w)
            li = id_to_idx.get(l)
            if wi is not None and li is not None:
                winner_idxs.append(wi)
                loser_idxs.append(li)

        if len(winner_idxs) == 0:
            return {mid: ELO_CENTER for mid in model_ids}

        w_arr = np.array(winner_idxs, dtype=np.intp)
        l_arr = np.array(loser_idxs, dtype=np.intp)

        def neg_log_likelihood(params: np.ndarray) -> float:
            log_s_w = params[w_arr]
            log_s_l = params[l_arr]
            # log P(w beats l) = log_s_w - log(exp(log_s_w) + exp(log_s_l))
            # Use logsumexp trick: log(exp(a)+exp(b)) = max(a,b) + log(1+exp(-|a-b|))
            max_sl = np.maximum(log_s_w, log_s_l)
            log_sum = max_sl + np.log1p(np.exp(-np.abs(log_s_w - log_s_l)))
            ll = np.sum(log_s_w - log_sum)
            reg = REGULARIZATION_STRENGTH * np.sum(params ** 2)
            return -(ll - reg)

        def neg_log_likelihood_grad(params: np.ndarray) -> np.ndarray:
            log_s_w = params[w_arr]
            log_s_l = params[l_arr]
            max_sl = np.maximum(log_s_w, log_s_l)
            log_sum = max_sl + np.log1p(np.exp(-np.abs(log_s_w - log_s_l)))
            # P(w | w,l) = exp(log_s_w) / (exp(log_s_w) + exp(log_s_l))
            p_w = np.exp(log_s_w - log_sum)

            grad = np.zeros(n)
            # d/d(log_s_w) = 1 - p_w   for each game where model is winner
            # d/d(log_s_l) = -p_l = -(1 - p_w)  ... where model is loser
            # but we want the negative, so flip signs
            np.add.at(grad, w_arr, -(1.0 - p_w))
            np.add.at(grad, l_arr, (1.0 - p_w))
            grad += 2.0 * REGULARIZATION_STRENGTH * params
            return grad

        x0 = np.zeros(n)
        result = minimize(
            neg_log_likelihood,
            x0,
            jac=neg_log_likelihood_grad,
            method="L-BFGS-B",
            options={"maxiter": 1000, "ftol": 1e-12},
        )

        elo_ratings = BradleyTerry._log_strengths_to_elo(result.x)
        return {mid: float(elo_ratings[i]) for i, mid in enumerate(model_ids)}

    @staticmethod
    def fit_with_ci(
        game_results: list[tuple[str, str]],
        model_ids: list[str],
        n_bootstrap: int = 1000,
    ) -> list[BTRating]:
        """Fit a Bradley-Terry model with bootstrap confidence intervals.

        1. Fit the full dataset for point estimates.
        2. For each bootstrap iteration resample *game_results* with
           replacement and refit.
        3. Compute 2.5th and 97.5th percentiles for 95% CIs.

        Parameters
        ----------
        game_results:
            List of ``(winner_id, loser_id)`` pairs.
        model_ids:
            Exhaustive list of model identifiers.
        n_bootstrap:
            Number of bootstrap resamples (default 1000).

        Returns
        -------
        List of :class:`BTRating` sorted by rating descending.
        """
        n = len(model_ids)

        # Edge cases
        if n == 0:
            return []
        if n == 1:
            return [BTRating(model_id=model_ids[0], rating=ELO_CENTER, ci_lower=ELO_CENTER, ci_upper=ELO_CENTER)]
        if len(game_results) == 0:
            return [
                BTRating(model_id=mid, rating=ELO_CENTER, ci_lower=ELO_CENTER, ci_upper=ELO_CENTER)
                for mid in model_ids
            ]

        # Point estimates from full dataset
        point_ratings = BradleyTerry.fit(game_results, model_ids)

        # Bootstrap
        rng = np.random.default_rng()
        game_arr = np.array(game_results, dtype=object)
        n_games = len(game_arr)
        bootstrap_matrix = np.empty((n_bootstrap, n))  # rows=bootstrap, cols=models

        for b in range(n_bootstrap):
            idxs = rng.integers(0, n_games, size=n_games)
            resampled = [game_results[i] for i in idxs]
            boot_ratings = BradleyTerry.fit(resampled, model_ids)
            for j, mid in enumerate(model_ids):
                bootstrap_matrix[b, j] = boot_ratings[mid]

        # 95% CI from percentiles
        ci_lower = np.percentile(bootstrap_matrix, 2.5, axis=0)
        ci_upper = np.percentile(bootstrap_matrix, 97.5, axis=0)

        results = [
            BTRating(
                model_id=mid,
                rating=point_ratings[mid],
                ci_lower=float(ci_lower[j]),
                ci_upper=float(ci_upper[j]),
            )
            for j, mid in enumerate(model_ids)
        ]

        results.sort(key=lambda r: r.rating, reverse=True)
        return results

    @staticmethod
    def fit_decomposed(
        game_results: list[tuple[tuple[str, str], tuple[str, str]]],
        model_ids: list[str],
    ) -> tuple[dict[str, float], dict[str, float]]:
        """Fit a decomposed Bradley-Terry model for collaborative mode.

        In collaborative Codenames each team consists of a spymaster (SM)
        and an operative (OP).  A team's strength is the *sum* of its
        SM and OP log-strengths:

            P(team1 wins) = 1 / (1 + 10^(((SM2+OP2) - (SM1+OP1)) / 400))

        The optimiser recovers separate SM and OP ratings for every model.

        Parameters
        ----------
        game_results:
            List of ``((winner_sm, winner_op), (loser_sm, loser_op))``.
        model_ids:
            Exhaustive list of model identifiers.

        Returns
        -------
        (spymaster_ratings, operative_ratings) — each a dict of
        *model_id* -> Elo-scale rating.
        """
        n = len(model_ids)

        # Edge cases
        if n == 0:
            return {}, {}
        if len(game_results) == 0:
            default = {mid: ELO_CENTER for mid in model_ids}
            return dict(default), dict(default)

        id_to_idx: dict[str, int] = {mid: i for i, mid in enumerate(model_ids)}

        # Pre-compute index arrays
        w_sm_idxs: list[int] = []
        w_op_idxs: list[int] = []
        l_sm_idxs: list[int] = []
        l_op_idxs: list[int] = []

        for (wsm, wop), (lsm, lop) in game_results:
            wsm_i = id_to_idx.get(wsm)
            wop_i = id_to_idx.get(wop)
            lsm_i = id_to_idx.get(lsm)
            lop_i = id_to_idx.get(lop)
            if all(x is not None for x in (wsm_i, wop_i, lsm_i, lop_i)):
                w_sm_idxs.append(wsm_i)  # type: ignore[arg-type]
                w_op_idxs.append(wop_i)  # type: ignore[arg-type]
                l_sm_idxs.append(lsm_i)  # type: ignore[arg-type]
                l_op_idxs.append(lop_i)  # type: ignore[arg-type]

        if len(w_sm_idxs) == 0:
            default = {mid: ELO_CENTER for mid in model_ids}
            return dict(default), dict(default)

        w_sm = np.array(w_sm_idxs, dtype=np.intp)
        w_op = np.array(w_op_idxs, dtype=np.intp)
        l_sm = np.array(l_sm_idxs, dtype=np.intp)
        l_op = np.array(l_op_idxs, dtype=np.intp)

        # Parameter layout: [sm_0, sm_1, ..., sm_{n-1}, op_0, ..., op_{n-1}]
        def neg_log_likelihood(params: np.ndarray) -> float:
            sm = params[:n]
            op = params[n:]

            team_w = sm[w_sm] + op[w_op]
            team_l = sm[l_sm] + op[l_op]

            max_t = np.maximum(team_w, team_l)
            log_sum = max_t + np.log1p(np.exp(-np.abs(team_w - team_l)))
            ll = np.sum(team_w - log_sum)
            reg = REGULARIZATION_STRENGTH * np.sum(params ** 2)
            return -(ll - reg)

        def neg_log_likelihood_grad(params: np.ndarray) -> np.ndarray:
            sm = params[:n]
            op = params[n:]

            team_w = sm[w_sm] + op[w_op]
            team_l = sm[l_sm] + op[l_op]

            max_t = np.maximum(team_w, team_l)
            log_sum = max_t + np.log1p(np.exp(-np.abs(team_w - team_l)))
            p_w = np.exp(team_w - log_sum)

            residual = 1.0 - p_w  # winner's "surprise"

            grad = np.zeros(2 * n)
            # SM gradients (first n params)
            np.add.at(grad[:n], w_sm, -residual)
            np.add.at(grad[:n], l_sm, residual)
            # OP gradients (last n params)
            np.add.at(grad[n:], w_op, -residual)
            np.add.at(grad[n:], l_op, residual)

            grad += 2.0 * REGULARIZATION_STRENGTH * params
            return grad

        x0 = np.zeros(2 * n)
        result = minimize(
            neg_log_likelihood,
            x0,
            jac=neg_log_likelihood_grad,
            method="L-BFGS-B",
            options={"maxiter": 1000, "ftol": 1e-12},
        )

        sm_log = result.x[:n]
        op_log = result.x[n:]

        sm_elo = BradleyTerry._log_strengths_to_elo(sm_log)
        op_elo = BradleyTerry._log_strengths_to_elo(op_log)

        sm_ratings = {mid: float(sm_elo[i]) for i, mid in enumerate(model_ids)}
        op_ratings = {mid: float(op_elo[i]) for i, mid in enumerate(model_ids)}

        return sm_ratings, op_ratings

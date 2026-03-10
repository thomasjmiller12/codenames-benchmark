"""Rating system for the Codenames LLM benchmark suite.

Uses Bradley-Terry MLE with the Davidson (1970) tie extension and
bootstrap confidence intervals. All ratings are expressed on the
standard chess Elo scale (center=1500, scale factor=400).

Game results are represented as (model_a, model_b, outcome) triples
where outcome is 1.0 (a wins), 0.0 (b wins), or 0.5 (tie/draw).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ELO_CENTER = 1500.0
ELO_SCALE = 400.0
REGULARIZATION_STRENGTH = 0.001

# Type alias for a game result: (model_a_id, model_b_id, outcome)
# outcome: 1.0 = a wins, 0.0 = b wins, 0.5 = tie
GameResult = tuple[str, str, float]

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BTRating:
    """A single model's Bradley-Terry rating with confidence interval."""

    model_id: str
    rating: float
    ci_lower: float  # 95% CI lower bound
    ci_upper: float  # 95% CI upper bound


# ---------------------------------------------------------------------------
# BradleyTerry – MLE fitting with Davidson tie extension + bootstrap CIs
# ---------------------------------------------------------------------------


class BradleyTerry:
    """Bradley-Terry model with Davidson (1970) tie extension.

    The Davidson model extends standard Bradley-Terry to handle draws:

        P(i beats j) = γ_i / (γ_i + γ_j + θ * √(γ_i * γ_j))
        P(tie i,j)   = θ * √(γ_i * γ_j) / (γ_i + γ_j + θ * √(γ_i * γ_j))

    where γ_i = exp(log_strength_i) and θ ≥ 0 is a global tie-propensity
    parameter. When θ = 0 this reduces to standard Bradley-Terry.

    All public methods are static — the class carries no mutable state.
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
        game_results: list[GameResult],
        model_ids: list[str],
    ) -> dict[str, float]:
        """Fit a Davidson-extended Bradley-Terry model via MLE.

        Parameters
        ----------
        game_results:
            List of ``(model_a, model_b, outcome)`` triples where outcome
            is 1.0 (a wins), 0.0 (b wins), or 0.5 (tie).
        model_ids:
            Exhaustive list of model identifiers to include.

        Returns
        -------
        dict mapping model_id -> Elo-scale rating.
        """
        n = len(model_ids)

        if n == 0:
            return {}
        if n == 1:
            return {model_ids[0]: ELO_CENTER}
        if len(game_results) == 0:
            return {mid: ELO_CENTER for mid in model_ids}

        id_to_idx: dict[str, int] = {mid: i for i, mid in enumerate(model_ids)}

        # Separate games into wins and ties
        a_win_a: list[int] = []
        a_win_b: list[int] = []
        b_win_a: list[int] = []
        b_win_b: list[int] = []
        tie_a: list[int] = []
        tie_b: list[int] = []

        for a_id, b_id, outcome in game_results:
            ai = id_to_idx.get(a_id)
            bi = id_to_idx.get(b_id)
            if ai is None or bi is None:
                continue

            if outcome == 1.0:
                a_win_a.append(ai)
                a_win_b.append(bi)
            elif outcome == 0.0:
                b_win_a.append(ai)
                b_win_b.append(bi)
            else:  # tie (0.5)
                tie_a.append(ai)
                tie_b.append(bi)

        has_ties = len(tie_a) > 0

        # Convert to numpy
        aw_a = np.array(a_win_a, dtype=np.intp)
        aw_b = np.array(a_win_b, dtype=np.intp)
        bw_a = np.array(b_win_a, dtype=np.intp)
        bw_b = np.array(b_win_b, dtype=np.intp)
        t_a = np.array(tie_a, dtype=np.intp)
        t_b = np.array(tie_b, dtype=np.intp)

        if len(aw_a) == 0 and len(bw_a) == 0 and len(t_a) == 0:
            return {mid: ELO_CENTER for mid in model_ids}

        # Parameter layout: [log_s_0, ..., log_s_{n-1}, log_theta]
        # log_theta is only included if there are ties
        n_params = n + (1 if has_ties else 0)

        def neg_log_likelihood(params: np.ndarray) -> float:
            log_s = params[:n]
            log_theta = params[n] if has_ties else -np.inf
            theta = np.exp(log_theta)

            nll = 0.0

            # A-wins: log P(a beats b) = log_s[a] - log(exp(log_s[a]) + exp(log_s[b]) + θ√(γa·γb))
            # θ√(γa·γb) = θ·exp((log_s[a]+log_s[b])/2) = exp(log_theta + (log_s[a]+log_s[b])/2)
            if len(aw_a) > 0:
                ls_a = log_s[aw_a]
                ls_b = log_s[aw_b]
                if has_ties:
                    tie_term = np.exp(log_theta + 0.5 * (ls_a + ls_b))
                    denom = np.exp(ls_a) + np.exp(ls_b) + tie_term
                else:
                    denom = np.exp(ls_a) + np.exp(ls_b)
                nll -= np.sum(ls_a - np.log(denom))

            # B-wins: symmetric
            if len(bw_a) > 0:
                ls_a = log_s[bw_a]
                ls_b = log_s[bw_b]
                if has_ties:
                    tie_term = np.exp(log_theta + 0.5 * (ls_a + ls_b))
                    denom = np.exp(ls_a) + np.exp(ls_b) + tie_term
                else:
                    denom = np.exp(ls_a) + np.exp(ls_b)
                nll -= np.sum(ls_b - np.log(denom))

            # Ties: log P(tie) = log(θ) + 0.5*(log_s[a]+log_s[b]) - log(denom)
            if has_ties and len(t_a) > 0:
                ls_a = log_s[t_a]
                ls_b = log_s[t_b]
                tie_term = np.exp(log_theta + 0.5 * (ls_a + ls_b))
                denom = np.exp(ls_a) + np.exp(ls_b) + tie_term
                nll -= np.sum(log_theta + 0.5 * (ls_a + ls_b) - np.log(denom))

            # L2 regularisation on strengths only
            nll += REGULARIZATION_STRENGTH * np.sum(log_s ** 2)

            return nll

        x0 = np.zeros(n_params)
        if has_ties:
            # Initialise log_theta to a reasonable starting value
            x0[n] = 0.0  # theta = 1.0

        result = minimize(
            neg_log_likelihood,
            x0,
            method="L-BFGS-B",
            options={"maxiter": 1000, "ftol": 1e-12},
        )

        elo_ratings = BradleyTerry._log_strengths_to_elo(result.x[:n])
        return {mid: float(elo_ratings[i]) for i, mid in enumerate(model_ids)}

    @staticmethod
    def fit_with_ci(
        game_results: list[GameResult],
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
            List of ``(model_a, model_b, outcome)`` triples.
        model_ids:
            Exhaustive list of model identifiers.
        n_bootstrap:
            Number of bootstrap resamples (default 1000).

        Returns
        -------
        List of :class:`BTRating` sorted by rating descending.
        """
        n = len(model_ids)

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
        n_games = len(game_results)
        bootstrap_matrix = np.empty((n_bootstrap, n))

        for b in range(n_bootstrap):
            idxs = rng.integers(0, n_games, size=n_games)
            resampled = [game_results[i] for i in idxs]
            boot_ratings = BradleyTerry.fit(resampled, model_ids)
            for j, mid in enumerate(model_ids):
                bootstrap_matrix[b, j] = boot_ratings[mid]

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
        game_results: list[tuple[tuple[str, str], tuple[str, str], float]],
        model_ids: list[str],
    ) -> tuple[dict[str, float], dict[str, float]]:
        """Fit a decomposed Bradley-Terry model for collaborative mode.

        Each team consists of a spymaster (SM) and an operative (OP).
        A team's strength is the sum of its SM and OP log-strengths:

            P(team1 wins) = 1 / (1 + 10^(((SM2+OP2) - (SM1+OP1)) / 400))

        Parameters
        ----------
        game_results:
            List of ``((winner_sm, winner_op), (loser_sm, loser_op), outcome)``
            where outcome is 1.0 (first team wins), 0.0 (second team wins),
            or 0.5 (tie).
        model_ids:
            Exhaustive list of model identifiers.

        Returns
        -------
        (spymaster_ratings, operative_ratings) — each a dict of
        model_id -> Elo-scale rating.
        """
        n = len(model_ids)

        if n == 0:
            return {}, {}
        if len(game_results) == 0:
            default = {mid: ELO_CENTER for mid in model_ids}
            return dict(default), dict(default)

        id_to_idx: dict[str, int] = {mid: i for i, mid in enumerate(model_ids)}

        # Separate into wins for team a, wins for team b, and ties
        a_win_sm_a: list[int] = []
        a_win_op_a: list[int] = []
        a_win_sm_b: list[int] = []
        a_win_op_b: list[int] = []
        b_win_sm_a: list[int] = []
        b_win_op_a: list[int] = []
        b_win_sm_b: list[int] = []
        b_win_op_b: list[int] = []
        tie_sm_a: list[int] = []
        tie_op_a: list[int] = []
        tie_sm_b: list[int] = []
        tie_op_b: list[int] = []

        for (t1_sm, t1_op), (t2_sm, t2_op), outcome in game_results:
            idxs = [id_to_idx.get(x) for x in (t1_sm, t1_op, t2_sm, t2_op)]
            if any(x is None for x in idxs):
                continue
            sm1, op1, sm2, op2 = idxs  # type: ignore[misc]
            if outcome == 1.0:
                a_win_sm_a.append(sm1)
                a_win_op_a.append(op1)
                a_win_sm_b.append(sm2)
                a_win_op_b.append(op2)
            elif outcome == 0.0:
                b_win_sm_a.append(sm1)
                b_win_op_a.append(op1)
                b_win_sm_b.append(sm2)
                b_win_op_b.append(op2)
            else:
                tie_sm_a.append(sm1)
                tie_op_a.append(op1)
                tie_sm_b.append(sm2)
                tie_op_b.append(op2)

        has_ties = len(tie_sm_a) > 0

        aw_sm_a = np.array(a_win_sm_a, dtype=np.intp)
        aw_op_a = np.array(a_win_op_a, dtype=np.intp)
        aw_sm_b = np.array(a_win_sm_b, dtype=np.intp)
        aw_op_b = np.array(a_win_op_b, dtype=np.intp)
        bw_sm_a = np.array(b_win_sm_a, dtype=np.intp)
        bw_op_a = np.array(b_win_op_a, dtype=np.intp)
        bw_sm_b = np.array(b_win_sm_b, dtype=np.intp)
        bw_op_b = np.array(b_win_op_b, dtype=np.intp)
        t_sm_a = np.array(tie_sm_a, dtype=np.intp)
        t_op_a = np.array(tie_op_a, dtype=np.intp)
        t_sm_b = np.array(tie_sm_b, dtype=np.intp)
        t_op_b = np.array(tie_op_b, dtype=np.intp)

        if len(aw_sm_a) == 0 and len(bw_sm_a) == 0 and len(t_sm_a) == 0:
            default = {mid: ELO_CENTER for mid in model_ids}
            return dict(default), dict(default)

        # Parameter layout: [sm_0..sm_{n-1}, op_0..op_{n-1}, log_theta?]
        n_params = 2 * n + (1 if has_ties else 0)

        def neg_log_likelihood(params: np.ndarray) -> float:
            sm = params[:n]
            op = params[n:2*n]
            log_theta = params[2*n] if has_ties else -np.inf

            nll = 0.0

            # Team a wins
            if len(aw_sm_a) > 0:
                team_a = sm[aw_sm_a] + op[aw_op_a]
                team_b = sm[aw_sm_b] + op[aw_op_b]
                if has_ties:
                    tie_term = np.exp(log_theta + 0.5 * (team_a + team_b))
                    denom = np.exp(team_a) + np.exp(team_b) + tie_term
                else:
                    denom = np.exp(team_a) + np.exp(team_b)
                nll -= np.sum(team_a - np.log(denom))

            # Team b wins
            if len(bw_sm_a) > 0:
                team_a = sm[bw_sm_a] + op[bw_op_a]
                team_b = sm[bw_sm_b] + op[bw_op_b]
                if has_ties:
                    tie_term = np.exp(log_theta + 0.5 * (team_a + team_b))
                    denom = np.exp(team_a) + np.exp(team_b) + tie_term
                else:
                    denom = np.exp(team_a) + np.exp(team_b)
                nll -= np.sum(team_b - np.log(denom))

            # Ties
            if has_ties and len(t_sm_a) > 0:
                team_a = sm[t_sm_a] + op[t_op_a]
                team_b = sm[t_sm_b] + op[t_op_b]
                tie_term = np.exp(log_theta + 0.5 * (team_a + team_b))
                denom = np.exp(team_a) + np.exp(team_b) + tie_term
                nll -= np.sum(log_theta + 0.5 * (team_a + team_b) - np.log(denom))

            # L2 regularisation on strengths
            nll += REGULARIZATION_STRENGTH * np.sum(params[:2*n] ** 2)

            return nll

        x0 = np.zeros(n_params)
        result = minimize(
            neg_log_likelihood,
            x0,
            method="L-BFGS-B",
            options={"maxiter": 1000, "ftol": 1e-12},
        )

        sm_log = result.x[:n]
        op_log = result.x[n:2*n]

        sm_elo = BradleyTerry._log_strengths_to_elo(sm_log)
        op_elo = BradleyTerry._log_strengths_to_elo(op_log)

        sm_ratings = {mid: float(sm_elo[i]) for i, mid in enumerate(model_ids)}
        op_ratings = {mid: float(op_elo[i]) for i, mid in enumerate(model_ids)}

        return sm_ratings, op_ratings

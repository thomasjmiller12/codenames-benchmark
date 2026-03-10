"""Tests for the Bradley-Terry rating system with Davidson tie extension.

Covers the BradleyTerry class from codenames.benchmark.rating, including
standard fit, fit_with_ci, and fit_decomposed.
"""

from __future__ import annotations

import math

import pytest

from codenames.benchmark.rating import (
    BTRating,
    BradleyTerry,
    ELO_CENTER,
    ELO_SCALE,
)


# ===========================================================================
# BradleyTerry.fit() tests
# ===========================================================================


class TestBradleyTerryFit:
    """Tests for BradleyTerry.fit()."""

    def test_dominant_model_rated_higher(self):
        """A model that always wins should be rated higher."""
        game_results = [("model_a", "model_b", 1.0)] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        assert ratings["model_a"] > ratings["model_b"]

    def test_equal_models_similar_rating(self):
        """Models with 50-50 records should have similar ratings."""
        game_results = (
            [("model_a", "model_b", 1.0)] * 50
            + [("model_a", "model_b", 0.0)] * 50
        )
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        diff = abs(ratings["model_a"] - ratings["model_b"])
        assert diff < 50  # Should be very close

    def test_centered_at_1500(self):
        """Ratings should be centered around 1500."""
        game_results = [("model_a", "model_b", 1.0)] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        mean_rating = sum(ratings.values()) / len(ratings)
        assert mean_rating == pytest.approx(ELO_CENTER, abs=50)

    def test_empty_game_results(self):
        """With no games, all models should be at the center rating."""
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit([], model_ids)
        for mid in model_ids:
            assert ratings[mid] == pytest.approx(ELO_CENTER, abs=1e-6)

    def test_single_model(self):
        """A single model should be at the center rating."""
        ratings = BradleyTerry.fit([], ["model_a"])
        assert ratings["model_a"] == pytest.approx(ELO_CENTER, abs=1e-6)

    def test_no_models(self):
        """No models should return an empty dict."""
        ratings = BradleyTerry.fit([], [])
        assert ratings == {}

    def test_three_models_ordering(self):
        """Three models with a clear hierarchy should be ordered correctly."""
        game_results = (
            [("model_a", "model_b", 1.0)] * 30
            + [("model_a", "model_c", 1.0)] * 30
            + [("model_b", "model_c", 1.0)] * 30
        )
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        assert ratings["model_a"] > ratings["model_b"]
        assert ratings["model_b"] > ratings["model_c"]

    def test_all_models_returned(self):
        """All model_ids should appear in the returned dict."""
        game_results = [("model_a", "model_b", 1.0)] * 10
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit(game_results, model_ids)
        assert set(ratings.keys()) == set(model_ids)


# ===========================================================================
# Davidson tie extension tests
# ===========================================================================


class TestDavidsonTies:
    """Tests for tie handling in the Davidson-extended Bradley-Terry model."""

    def test_ties_produce_close_ratings(self):
        """Two models that always tie should have very similar ratings."""
        game_results = [("model_a", "model_b", 0.5)] * 30
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        diff = abs(ratings["model_a"] - ratings["model_b"])
        assert diff < 30  # Should be nearly identical

    def test_tie_is_between_win_and_loss(self):
        """A model with some wins and some ties should rate higher than tie-only."""
        # model_a beats model_c and ties model_b
        # model_b only ties model_a but beats model_c less often
        game_results = (
            [("model_a", "model_c", 1.0)] * 30
            + [("model_a", "model_b", 0.5)] * 20
            + [("model_b", "model_c", 1.0)] * 10
        )
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        # a > b > c (a has more decisive wins overall)
        assert ratings["model_a"] > ratings["model_b"]
        assert ratings["model_b"] > ratings["model_c"]

    def test_mixed_wins_and_ties(self):
        """Mix of wins and ties should work correctly."""
        game_results = (
            [("model_a", "model_b", 1.0)] * 15  # a wins 15
            + [("model_a", "model_b", 0.5)] * 10  # tie 10
            + [("model_a", "model_b", 0.0)] * 5   # b wins 5
        )
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        # model_a should be rated higher (more wins)
        assert ratings["model_a"] > ratings["model_b"]

    def test_only_ties_centered(self):
        """If all games are ties, ratings should be near center."""
        game_results = [("model_a", "model_b", 0.5)] * 50
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        mean_rating = sum(ratings.values()) / len(ratings)
        assert mean_rating == pytest.approx(ELO_CENTER, abs=50)

    def test_no_ties_same_as_standard_bt(self):
        """Without ties, Davidson should produce same results as standard BT."""
        game_results = (
            [("model_a", "model_b", 1.0)] * 20
            + [("model_a", "model_b", 0.0)] * 10
        )
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        # model_a should be higher (2:1 win ratio)
        assert ratings["model_a"] > ratings["model_b"]
        # Both should be reasonable Elo values
        assert 1300 < ratings["model_a"] < 1700
        assert 1300 < ratings["model_b"] < 1700


# ===========================================================================
# BradleyTerry.fit_with_ci() tests
# ===========================================================================


class TestBradleyTerryFitWithCI:
    """Tests for BradleyTerry.fit_with_ci()."""

    def test_returns_bt_rating_objects(self):
        """fit_with_ci should return BTRating objects."""
        game_results = [("model_a", "model_b", 1.0)] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        assert len(ratings) == 2
        for r in ratings:
            assert isinstance(r, BTRating)

    def test_sorted_descending(self):
        """Results should be sorted by rating descending."""
        game_results = (
            [("model_a", "model_b", 1.0)] * 30
            + [("model_a", "model_c", 1.0)] * 30
            + [("model_b", "model_c", 1.0)] * 30
        )
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        for i in range(len(ratings) - 1):
            assert ratings[i].rating >= ratings[i + 1].rating

    def test_ci_lower_less_than_rating(self):
        """CI lower bound should be <= the point estimate."""
        game_results = [("model_a", "model_b", 1.0)] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        for r in ratings:
            assert r.ci_lower <= r.rating

    def test_ci_upper_greater_than_rating(self):
        """CI upper bound should be >= the point estimate."""
        game_results = [("model_a", "model_b", 1.0)] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        for r in ratings:
            assert r.ci_upper >= r.rating

    def test_empty_results(self):
        """With no games, all models should be at center with equal CIs."""
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci([], model_ids, n_bootstrap=10)
        for r in ratings:
            assert r.rating == pytest.approx(ELO_CENTER, abs=1e-6)
            assert r.ci_lower == pytest.approx(ELO_CENTER, abs=1e-6)
            assert r.ci_upper == pytest.approx(ELO_CENTER, abs=1e-6)

    def test_single_model_returns_center(self):
        """A single model should get center rating."""
        ratings = BradleyTerry.fit_with_ci([], ["model_a"], n_bootstrap=10)
        assert len(ratings) == 1
        assert ratings[0].rating == pytest.approx(ELO_CENTER, abs=1e-6)

    def test_no_models_returns_empty(self):
        """No models should return empty list."""
        ratings = BradleyTerry.fit_with_ci([], [], n_bootstrap=10)
        assert ratings == []

    def test_ties_in_bootstrap(self):
        """Bootstrap should handle ties correctly."""
        game_results = (
            [("model_a", "model_b", 1.0)] * 10
            + [("model_a", "model_b", 0.5)] * 10
            + [("model_a", "model_b", 0.0)] * 5
        )
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        assert len(ratings) == 2
        for r in ratings:
            assert r.ci_lower <= r.rating <= r.ci_upper


# ===========================================================================
# BradleyTerry.fit_decomposed() tests
# ===========================================================================


class TestBradleyTerryFitDecomposed:
    """Tests for BradleyTerry.fit_decomposed() (collaborative mode)."""

    def test_returns_two_dicts(self):
        """fit_decomposed should return (sm_ratings, op_ratings)."""
        game_results = [
            (("model_a", "model_a"), ("model_b", "model_b"), 1.0),
        ] * 20
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        assert isinstance(sm_ratings, dict)
        assert isinstance(op_ratings, dict)
        assert set(sm_ratings.keys()) == set(model_ids)
        assert set(op_ratings.keys()) == set(model_ids)

    def test_decomposed_produces_sm_and_op_ratings(self):
        """Decomposed fitting should produce separate SM and OP ratings."""
        game_results = [
            (("model_a", "model_b"), ("model_b", "model_a"), 1.0),
        ] * 30
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        assert sm_ratings["model_a"] > sm_ratings["model_b"]
        assert op_ratings["model_b"] > op_ratings["model_a"]

    def test_empty_results_gives_center(self):
        """With no games, all ratings should be at center."""
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed([], model_ids)

        for mid in model_ids:
            assert sm_ratings[mid] == pytest.approx(ELO_CENTER, abs=1e-6)
            assert op_ratings[mid] == pytest.approx(ELO_CENTER, abs=1e-6)

    def test_no_models_returns_empty_dicts(self):
        """No models should return two empty dicts."""
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed([], [])
        assert sm_ratings == {}
        assert op_ratings == {}

    def test_solo_equivalent_when_same_sm_op(self):
        """When SM == OP for all teams, decomposed should still work."""
        game_results = [
            (("model_a", "model_a"), ("model_b", "model_b"), 1.0),
        ] * 30
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        assert sm_ratings["model_a"] > sm_ratings["model_b"]
        assert op_ratings["model_a"] > op_ratings["model_b"]

    def test_decomposed_with_ties(self):
        """Decomposed fitting should handle ties."""
        game_results = (
            [(("model_a", "model_a"), ("model_b", "model_b"), 1.0)] * 10
            + [(("model_a", "model_a"), ("model_b", "model_b"), 0.5)] * 10
        )
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        # model_a should still be higher (more wins than ties)
        assert sm_ratings["model_a"] > sm_ratings["model_b"]

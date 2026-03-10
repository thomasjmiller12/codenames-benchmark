"""Tests for the Elo and Bradley-Terry rating systems.

Covers the EloCalculator (incremental updates) and BradleyTerry (MLE fitting)
classes from codenames.benchmark.rating.
"""

from __future__ import annotations

import math

import pytest

from codenames.benchmark.rating import (
    BTRating,
    BradleyTerry,
    ELO_CENTER,
    ELO_SCALE,
    EloCalculator,
    EloUpdate,
)


# ===========================================================================
# EloCalculator tests
# ===========================================================================


class TestEloExpectedScore:
    """Tests for EloCalculator.expected_score()."""

    def test_equal_ratings_give_half(self):
        """Two players with equal ratings should have expected score ~0.5."""
        score = EloCalculator.expected_score(1500.0, 1500.0)
        assert score == pytest.approx(0.5, abs=1e-9)

    def test_higher_rated_favored(self):
        """A higher-rated player should have expected score > 0.5."""
        score = EloCalculator.expected_score(1600.0, 1400.0)
        assert score > 0.5

    def test_lower_rated_disadvantaged(self):
        """A lower-rated player should have expected score < 0.5."""
        score = EloCalculator.expected_score(1400.0, 1600.0)
        assert score < 0.5

    def test_symmetry(self):
        """P(A beats B) + P(B beats A) should equal 1.0."""
        score_a = EloCalculator.expected_score(1600.0, 1400.0)
        score_b = EloCalculator.expected_score(1400.0, 1600.0)
        assert score_a + score_b == pytest.approx(1.0, abs=1e-9)

    def test_large_rating_gap(self):
        """A very large rating gap should produce expected scores near 0 and 1."""
        score = EloCalculator.expected_score(2000.0, 1000.0)
        assert score > 0.99

    def test_exact_400_gap(self):
        """With a 400-point gap, expected score should be ~0.909."""
        # P(A) = 1 / (1 + 10^(-400/400)) = 1 / (1 + 0.1) = 10/11
        score = EloCalculator.expected_score(1900.0, 1500.0)
        assert score == pytest.approx(10.0 / 11.0, abs=1e-6)


class TestEloUpdate:
    """Tests for EloCalculator.update()."""

    def test_winner_gains_rating(self):
        """The winner's new rating should be higher than their old rating."""
        calc = EloCalculator()
        winner_update, _ = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
        )
        assert winner_update.new_rating > winner_update.old_rating

    def test_loser_loses_rating(self):
        """The loser's new rating should be lower than their old rating."""
        calc = EloCalculator()
        _, loser_update = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
        )
        assert loser_update.new_rating < loser_update.old_rating

    def test_update_symmetry_at_equal_ratings(self):
        """At equal ratings and games, winner gain should equal loser loss in magnitude."""
        calc = EloCalculator()
        winner_update, loser_update = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
        )
        gain = winner_update.new_rating - winner_update.old_rating
        loss = loser_update.old_rating - loser_update.new_rating
        assert gain == pytest.approx(loss, abs=1e-9)

    def test_update_returns_elo_update_objects(self):
        """update() should return EloUpdate dataclass instances."""
        calc = EloCalculator()
        winner_update, loser_update = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
        )
        assert isinstance(winner_update, EloUpdate)
        assert isinstance(loser_update, EloUpdate)
        assert winner_update.model_id == "a"
        assert loser_update.model_id == "b"
        assert winner_update.game_result == 1.0
        assert loser_update.game_result == 0.0

    def test_provisional_k_higher(self):
        """Provisional players (few games) should have larger rating changes."""
        calc = EloCalculator(k_factor=32, provisional_k=40, provisional_threshold=30)

        # Provisional player (5 games)
        w_prov, l_prov = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=5, loser_games=5,
        )
        prov_gain = w_prov.new_rating - w_prov.old_rating

        # Established player (50 games)
        w_est, l_est = calc.update(
            winner_id="c", loser_id="d",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
        )
        est_gain = w_est.new_rating - w_est.old_rating

        assert prov_gain > est_gain

    def test_margin_increases_change(self):
        """A larger margin of victory should increase the rating change."""
        calc = EloCalculator()

        # No margin
        w0, _ = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
            margin=0,
        )
        gain_0 = w0.new_rating - w0.old_rating

        # Large margin
        w5, _ = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
            margin=5,
        )
        gain_5 = w5.new_rating - w5.old_rating

        assert gain_5 > gain_0

    def test_upset_bonus(self):
        """An upset (lower-rated wins) should produce a larger rating change than expected."""
        calc = EloCalculator()

        # Upset: 1400 beats 1600
        w_upset, _ = calc.update(
            winner_id="underdog", loser_id="favorite",
            winner_rating=1400.0, loser_rating=1600.0,
            winner_games=50, loser_games=50,
        )
        upset_gain = w_upset.new_rating - w_upset.old_rating

        # Expected: 1600 beats 1400
        w_expected, _ = calc.update(
            winner_id="favorite", loser_id="underdog",
            winner_rating=1600.0, loser_rating=1400.0,
            winner_games=50, loser_games=50,
        )
        expected_gain = w_expected.new_rating - w_expected.old_rating

        # The upset should give a bigger gain than the expected result
        assert upset_gain > expected_gain

    def test_rating_type_preserved(self):
        """The rating_type should be passed through to the EloUpdate."""
        calc = EloCalculator()
        w, l = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
            rating_type="spymaster",
        )
        assert w.rating_type == "spymaster"
        assert l.rating_type == "spymaster"

    def test_default_rating_type_is_solo(self):
        """Default rating_type should be 'solo'."""
        calc = EloCalculator()
        w, l = calc.update(
            winner_id="a", loser_id="b",
            winner_rating=1500.0, loser_rating=1500.0,
            winner_games=50, loser_games=50,
        )
        assert w.rating_type == "solo"
        assert l.rating_type == "solo"


class TestEloMOVMultiplier:
    """Tests for the margin-of-victory multiplier."""

    def test_zero_margin_gives_one(self):
        """Zero margin should give multiplier 1.0."""
        mult = EloCalculator._mov_multiplier(0)
        assert mult == pytest.approx(1.0, abs=1e-9)

    def test_negative_margin_gives_one(self):
        """Negative margin should give multiplier 1.0."""
        mult = EloCalculator._mov_multiplier(-5)
        assert mult == pytest.approx(1.0, abs=1e-9)

    def test_positive_margin_greater_than_one(self):
        """Positive margin should give multiplier > 1.0."""
        mult = EloCalculator._mov_multiplier(3)
        assert mult > 1.0

    def test_multiplier_asymptotes_at_1_5(self):
        """Very large margin should approach but not exceed 1.5."""
        mult = EloCalculator._mov_multiplier(100)
        assert mult < 1.5
        assert mult > 1.49  # Should be very close to 1.5


# ===========================================================================
# BradleyTerry tests
# ===========================================================================


class TestBradleyTerryFit:
    """Tests for BradleyTerry.fit()."""

    def test_dominant_model_rated_higher(self):
        """A model that always wins should be rated higher."""
        game_results = [("model_a", "model_b")] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        assert ratings["model_a"] > ratings["model_b"]

    def test_equal_models_similar_rating(self):
        """Models with 50-50 records should have similar ratings."""
        game_results = (
            [("model_a", "model_b")] * 50
            + [("model_b", "model_a")] * 50
        )
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        diff = abs(ratings["model_a"] - ratings["model_b"])
        assert diff < 50  # Should be very close

    def test_centered_at_1500(self):
        """Ratings should be centered around 1500."""
        game_results = [("model_a", "model_b")] * 20
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
            [("model_a", "model_b")] * 30
            + [("model_a", "model_c")] * 30
            + [("model_b", "model_c")] * 30
        )
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit(game_results, model_ids)

        assert ratings["model_a"] > ratings["model_b"]
        assert ratings["model_b"] > ratings["model_c"]

    def test_all_models_returned(self):
        """All model_ids should appear in the returned dict."""
        game_results = [("model_a", "model_b")] * 10
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit(game_results, model_ids)
        assert set(ratings.keys()) == set(model_ids)


class TestBradleyTerryFitWithCI:
    """Tests for BradleyTerry.fit_with_ci()."""

    def test_returns_bt_rating_objects(self):
        """fit_with_ci should return BTRating objects."""
        game_results = [("model_a", "model_b")] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        assert len(ratings) == 2
        for r in ratings:
            assert isinstance(r, BTRating)

    def test_sorted_descending(self):
        """Results should be sorted by rating descending."""
        game_results = (
            [("model_a", "model_b")] * 30
            + [("model_a", "model_c")] * 30
            + [("model_b", "model_c")] * 30
        )
        model_ids = ["model_a", "model_b", "model_c"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        for i in range(len(ratings) - 1):
            assert ratings[i].rating >= ratings[i + 1].rating

    def test_ci_lower_less_than_rating(self):
        """CI lower bound should be <= the point estimate."""
        game_results = [("model_a", "model_b")] * 20
        model_ids = ["model_a", "model_b"]
        ratings = BradleyTerry.fit_with_ci(game_results, model_ids, n_bootstrap=50)

        for r in ratings:
            assert r.ci_lower <= r.rating

    def test_ci_upper_greater_than_rating(self):
        """CI upper bound should be >= the point estimate."""
        game_results = [("model_a", "model_b")] * 20
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


class TestBradleyTerryFitDecomposed:
    """Tests for BradleyTerry.fit_decomposed() (collaborative mode)."""

    def test_returns_two_dicts(self):
        """fit_decomposed should return (sm_ratings, op_ratings)."""
        game_results = [
            (("model_a", "model_a"), ("model_b", "model_b")),
        ] * 20
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        assert isinstance(sm_ratings, dict)
        assert isinstance(op_ratings, dict)
        assert set(sm_ratings.keys()) == set(model_ids)
        assert set(op_ratings.keys()) == set(model_ids)

    def test_decomposed_produces_sm_and_op_ratings(self):
        """Decomposed fitting should produce separate SM and OP ratings."""
        # model_a always wins when it plays sm, model_b always wins when it plays op
        # Use consistent team compositions for cleaner signal
        game_results = [
            (("model_a", "model_b"), ("model_b", "model_a")),
        ] * 30
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        # model_a should have higher SM rating (it was SM for the winning team)
        assert sm_ratings["model_a"] > sm_ratings["model_b"]
        # model_b should have higher OP rating (it was OP for the winning team)
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
            (("model_a", "model_a"), ("model_b", "model_b")),
        ] * 30
        model_ids = ["model_a", "model_b"]
        sm_ratings, op_ratings = BradleyTerry.fit_decomposed(game_results, model_ids)

        # model_a should be higher in both roles (it always wins)
        assert sm_ratings["model_a"] > sm_ratings["model_b"]
        assert op_ratings["model_a"] > op_ratings["model_b"]

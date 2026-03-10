"""Comprehensive tests for the Codenames game engine.

Covers Board, Clue validation, and the Game state machine.
"""

import random

import pytest

from codenames.engine.board import Board, WordPool, Card, BoardCard
from codenames.engine.clue import Clue, ClueValidator
from codenames.engine.game import Game, GameResult, MoveRecord, TurnState
from codenames.engine.types import CardType, GameOutcome, GamePhase, GuessResult, Team

# Constants also defined in conftest.py -- repeated here because conftest
# cannot be imported as a regular module by pytest.
FIXED_WORDS = [
    "AFRICA", "AGENT", "AIR", "ALIEN", "ALPS",
    "AMAZON", "AMBULANCE", "AMERICA", "ANGEL", "ANTARCTICA",
    "APPLE", "ARM", "ATLANTIS", "AUSTRALIA", "AZTEC",
    "BACK", "BALL", "BAND", "BANK", "BAR",
    "BAT", "BATTERY", "BEACH", "BEAR", "BEAT",
]
SEED = 42


# ===========================================================================
# Board tests
# ===========================================================================


class TestBoard:
    """Tests for the Board class."""

    def test_board_has_25_cards(self, board):
        """Board should contain exactly 25 cards."""
        assert len(board.all_cards) == 25

    def test_board_correct_type_distribution_red_start(self, board):
        """RED starting: 9 RED, 8 BLUE, 7 NEUTRAL, 1 ASSASSIN."""
        cards = board.all_cards
        type_counts = {}
        for bc in cards:
            ct = bc.card_type
            type_counts[ct] = type_counts.get(ct, 0) + 1

        assert type_counts[CardType.RED] == 9
        assert type_counts[CardType.BLUE] == 8
        assert type_counts[CardType.NEUTRAL] == 7
        assert type_counts[CardType.ASSASSIN] == 1

    def test_board_correct_type_distribution_blue_start(self, board_blue_start):
        """BLUE starting: 9 BLUE, 8 RED, 7 NEUTRAL, 1 ASSASSIN."""
        cards = board_blue_start.all_cards
        type_counts = {}
        for bc in cards:
            ct = bc.card_type
            type_counts[ct] = type_counts.get(ct, 0) + 1

        assert type_counts[CardType.BLUE] == 9
        assert type_counts[CardType.RED] == 8
        assert type_counts[CardType.NEUTRAL] == 7
        assert type_counts[CardType.ASSASSIN] == 1

    def test_board_deterministic_with_seed(self):
        """Two boards with the same seed should produce identical layouts."""
        rng1 = random.Random(SEED)
        rng2 = random.Random(SEED)

        board1 = Board(words=list(FIXED_WORDS), starting_team=Team.RED, rng=rng1)
        board2 = Board(words=list(FIXED_WORDS), starting_team=Team.RED, rng=rng2)

        for bc1, bc2 in zip(board1.all_cards, board2.all_cards):
            assert bc1.word == bc2.word
            assert bc1.card_type == bc2.card_type

    def test_board_reveal_returns_card_type(self, board):
        """reveal() should return the correct CardType."""
        word = board.all_cards[0].word
        expected_type = board.all_cards[0].card_type
        actual = board.reveal(word)
        assert actual == expected_type

    def test_board_reveal_marks_card_revealed(self, board):
        """After reveal(), the card's revealed flag is True."""
        word = board.all_cards[0].word
        board.reveal(word)
        bc = board.get_card(word)
        assert bc is not None
        assert bc.revealed is True

    def test_board_unrevealed_words_updates_after_reveal(self, board):
        """unrevealed_words should shrink by one after a reveal."""
        initial_count = len(board.unrevealed_words)
        word = board.all_cards[0].word
        board.reveal(word)
        assert len(board.unrevealed_words) == initial_count - 1
        assert word not in board.unrevealed_words

    def test_board_remaining_for_accuracy(self, board):
        """remaining_for should match the count of unrevealed team cards."""
        red_count = sum(
            1 for bc in board.all_cards
            if bc.card_type is CardType.RED and not bc.revealed
        )
        assert board.remaining_for(Team.RED) == red_count

        blue_count = sum(
            1 for bc in board.all_cards
            if bc.card_type is CardType.BLUE and not bc.revealed
        )
        assert board.remaining_for(Team.BLUE) == blue_count

    def test_board_remaining_for_decreases_on_reveal(self, board):
        """remaining_for should decrease when a team card is revealed."""
        # Find a RED card
        red_card = next(bc for bc in board.all_cards if bc.card_type is CardType.RED)
        before = board.remaining_for(Team.RED)
        board.reveal(red_card.word)
        assert board.remaining_for(Team.RED) == before - 1

    def test_board_case_insensitive_get_card(self, board):
        """get_card should be case-insensitive."""
        word = board.all_cards[0].word  # Already uppercase
        assert board.get_card(word.lower()) is not None
        assert board.get_card(word) is not None
        assert board.get_card(word.lower()) == board.get_card(word)

    def test_board_case_insensitive_reveal(self, board):
        """reveal() should be case-insensitive."""
        word = board.all_cards[0].word
        card_type = board.reveal(word.lower())
        assert card_type == board.all_cards[0].card_type

    def test_board_reveal_invalid_word_raises(self, board):
        """reveal() should raise ValueError for a word not on the board."""
        with pytest.raises(ValueError, match="not on the board"):
            board.reveal("XYZNOTAWORD")

    def test_board_reveal_already_revealed_raises(self, board):
        """reveal() should raise ValueError for already-revealed words."""
        word = board.all_cards[0].word
        board.reveal(word)
        with pytest.raises(ValueError, match="already been revealed"):
            board.reveal(word)

    def test_board_requires_25_words(self):
        """Board constructor should raise ValueError if not exactly 25 words."""
        with pytest.raises(ValueError, match="exactly 25 words"):
            Board(words=["WORD"] * 10, starting_team=Team.RED)

    def test_board_requires_unique_words(self):
        """Board constructor should raise ValueError for duplicate words."""
        words = ["WORD"] * 25
        with pytest.raises(ValueError, match="unique"):
            Board(words=words, starting_team=Team.RED)

    def test_board_starting_team(self, board):
        """Board should record the starting team correctly."""
        assert board.starting_team is Team.RED

    def test_board_key_card_has_all_words(self, board):
        """key_card should map all 25 words to their CardType."""
        key_card = board.key_card
        assert len(key_card) == 25
        for bc in board.all_cards:
            assert bc.word in key_card
            assert key_card[bc.word] == bc.card_type

    def test_board_get_card_returns_none_for_missing(self, board):
        """get_card should return None for words not on the board."""
        assert board.get_card("XYZNOTAWORD") is None


# ===========================================================================
# Clue validation tests
# ===========================================================================


class TestClueValidator:
    """Tests for the ClueValidator."""

    def test_valid_clue_passes(self):
        """A valid clue should produce no violations."""
        clue = Clue(word="OCEAN", count=2)
        board_words = ["APPLE", "BANANA", "CHERRY"]
        violations = ClueValidator.validate(clue, board_words)
        assert violations == []

    def test_board_word_fails(self):
        """A clue matching a board word should produce a violation."""
        clue = Clue(word="APPLE", count=1)
        board_words = ["APPLE", "BANANA", "CHERRY"]
        violations = ClueValidator.validate(clue, board_words)
        assert len(violations) == 1
        assert "matches a word currently on the board" in violations[0]

    def test_board_word_case_insensitive(self):
        """Board word matching should be case-insensitive."""
        clue = Clue(word="apple", count=1)
        board_words = ["APPLE", "BANANA"]
        violations = ClueValidator.validate(clue, board_words)
        assert len(violations) == 1
        assert "matches a word currently on the board" in violations[0]

    def test_multi_word_fails(self):
        """A clue with spaces should produce a violation."""
        clue = Clue(word="ICE CREAM", count=1)
        board_words = ["APPLE", "BANANA"]
        violations = ClueValidator.validate(clue, board_words)
        assert any("single word" in v for v in violations)

    def test_non_alphabetic_fails(self):
        """A clue with non-alphabetic characters should produce a violation."""
        clue = Clue(word="H3LLO", count=1)
        board_words = ["APPLE", "BANANA"]
        violations = ClueValidator.validate(clue, board_words)
        assert any("alphabetic" in v for v in violations)

    def test_count_below_range_fails(self):
        """A clue with count < 1 should produce a violation."""
        clue = Clue(word="OCEAN", count=0)
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert any("between 1 and 9" in v for v in violations)

    def test_count_above_range_fails(self):
        """A clue with count > 9 should produce a violation."""
        clue = Clue(word="OCEAN", count=10)
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert any("between 1 and 9" in v for v in violations)

    def test_count_at_boundaries_passes(self):
        """count=1 and count=9 should both be valid."""
        for count in [1, 9]:
            clue = Clue(word="OCEAN", count=count)
            violations = ClueValidator.validate(clue, ["APPLE"])
            count_violations = [v for v in violations if "between 1 and 9" in v]
            assert count_violations == []

    def test_hyphen_allowed(self):
        """Hyphenated clue words should be valid."""
        clue = Clue(word="well-known", count=1)
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert violations == []

    def test_multiple_hyphens_allowed(self):
        """Multiple hyphens in a clue word should be valid."""
        clue = Clue(word="out-of-bounds", count=1)
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert violations == []

    def test_leading_hyphen_fails(self):
        """Leading hyphen should fail validation."""
        clue = Clue(word="-test", count=1)
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert any("alphabetic" in v for v in violations)

    def test_trailing_hyphen_fails(self):
        """Trailing hyphen should fail validation."""
        clue = Clue(word="test-", count=1)
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert any("alphabetic" in v for v in violations)

    def test_multiple_violations(self):
        """A clue with multiple issues should return multiple violations."""
        clue = Clue(word="APPLE", count=0)  # Board word AND bad count
        board_words = ["APPLE"]
        violations = ClueValidator.validate(clue, board_words)
        assert len(violations) == 2


# ===========================================================================
# Game state machine tests
# ===========================================================================


class TestGamePhaseTransitions:
    """Tests for phase transitions in the Game state machine."""

    def test_initial_phase_is_not_started(self, game):
        """New game should be in NOT_STARTED phase."""
        assert game.phase is GamePhase.NOT_STARTED

    def test_start_transitions_to_giving_clue(self, game):
        """start() should transition NOT_STARTED -> GIVING_CLUE."""
        game.start()
        assert game.phase is GamePhase.GIVING_CLUE

    def test_start_sets_current_team(self, game):
        """start() should set current_team to the starting team."""
        game.start()
        assert game.current_team is Team.RED

    def test_start_sets_turn_number(self, game):
        """start() should set turn_number to 1."""
        game.start()
        assert game.turn_number == 1

    def test_submit_clue_transitions_to_guessing(self, game_started):
        """submit_clue() should transition GIVING_CLUE -> GUESSING."""
        violations = game_started.submit_clue(Clue(word="OCEAN", count=1))
        assert violations == []
        assert game_started.phase is GamePhase.GUESSING

    def test_submit_clue_in_wrong_phase_raises(self, game):
        """submit_clue() should raise ValueError in NOT_STARTED phase."""
        with pytest.raises(ValueError, match="Cannot call submit_clue"):
            game.submit_clue(Clue(word="OCEAN", count=1))

    def test_submit_guess_in_wrong_phase_raises(self, game_started):
        """submit_guess() should raise ValueError in GIVING_CLUE phase."""
        with pytest.raises(ValueError, match="Cannot call submit_guess"):
            game_started.submit_guess("AFRICA")

    def test_end_guessing_transitions_to_turn_ended(self, game_started):
        """end_guessing() should transition GUESSING -> TURN_ENDED."""
        game_started.submit_clue(Clue(word="OCEAN", count=2))
        # Make at least one guess first so we can test end_guessing
        # Just directly test the transition
        game_started.end_guessing()
        assert game_started.phase is GamePhase.TURN_ENDED

    def test_next_turn_transitions_to_giving_clue(self, game_started):
        """next_turn() should transition TURN_ENDED -> GIVING_CLUE."""
        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.end_guessing()
        game_started.next_turn()
        assert game_started.phase is GamePhase.GIVING_CLUE

    def test_next_turn_swaps_team(self, game_started):
        """next_turn() should swap the current team."""
        assert game_started.current_team is Team.RED
        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.end_guessing()
        game_started.next_turn()
        assert game_started.current_team is Team.BLUE

    def test_next_turn_increments_turn_number(self, game_started):
        """next_turn() should increment turn_number."""
        assert game_started.turn_number == 1
        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.end_guessing()
        game_started.next_turn()
        assert game_started.turn_number == 2

    def test_start_in_wrong_phase_raises(self, game_started):
        """start() when already started should raise ValueError."""
        with pytest.raises(ValueError, match="Cannot call start"):
            game_started.start()


class TestGameGuessOutcomes:
    """Tests for guess outcomes."""

    def _find_card_of_type(self, board, card_type):
        """Helper to find an unrevealed card of a given type."""
        for bc in board.all_cards:
            if bc.card_type is card_type and not bc.revealed:
                return bc.word
        return None

    def test_correct_guess(self, game_started):
        """Guessing a team word should return CORRECT."""
        board = game_started.board
        red_word = self._find_card_of_type(board, CardType.RED)

        game_started.submit_clue(Clue(word="OCEAN", count=2))
        result = game_started.submit_guess(red_word)
        assert result is GuessResult.CORRECT

    def test_correct_guess_stays_in_guessing(self, game_started):
        """A correct guess with guesses remaining should stay in GUESSING."""
        board = game_started.board
        red_word = self._find_card_of_type(board, CardType.RED)

        game_started.submit_clue(Clue(word="OCEAN", count=2))
        game_started.submit_guess(red_word)
        assert game_started.phase is GamePhase.GUESSING

    def test_wrong_team_guess(self, game_started):
        """Guessing an opponent's word should return WRONG_TEAM and end turn."""
        board = game_started.board
        blue_word = self._find_card_of_type(board, CardType.BLUE)

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        result = game_started.submit_guess(blue_word)
        assert result is GuessResult.WRONG_TEAM
        assert game_started.phase is GamePhase.TURN_ENDED

    def test_neutral_guess(self, game_started):
        """Guessing a neutral word should return NEUTRAL and end turn."""
        board = game_started.board
        neutral_word = self._find_card_of_type(board, CardType.NEUTRAL)

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        result = game_started.submit_guess(neutral_word)
        assert result is GuessResult.NEUTRAL
        assert game_started.phase is GamePhase.TURN_ENDED

    def test_assassin_guess(self, game_started):
        """Guessing the assassin should return ASSASSIN and end game."""
        board = game_started.board
        assassin_word = self._find_card_of_type(board, CardType.ASSASSIN)

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        result = game_started.submit_guess(assassin_word)
        assert result is GuessResult.ASSASSIN
        assert game_started.phase is GamePhase.GAME_OVER
        assert game_started.is_over is True

    def test_assassin_opponent_wins(self, game_started):
        """When RED guesses assassin, BLUE should win."""
        board = game_started.board
        assassin_word = self._find_card_of_type(board, CardType.ASSASSIN)

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.submit_guess(assassin_word)

        result = game_started.result
        assert result is not None
        assert result.winner is Team.BLUE
        assert result.outcome in (GameOutcome.BLUE_WINS_ASSASSIN,)

    def test_max_guesses_ends_turn(self, game_started):
        """After count+1 correct guesses, the turn should end."""
        board = game_started.board
        # Use count=1, so max guesses = 2
        game_started.submit_clue(Clue(word="OCEAN", count=1))

        # Find two RED cards
        red_words = [
            bc.word for bc in board.all_cards
            if bc.card_type is CardType.RED and not bc.revealed
        ]
        assert len(red_words) >= 2

        # First guess (1 of 2)
        result1 = game_started.submit_guess(red_words[0])
        assert result1 is GuessResult.CORRECT
        assert game_started.phase is GamePhase.GUESSING

        # Second guess (2 of 2 = max reached)
        result2 = game_started.submit_guess(red_words[1])
        assert result2 is GuessResult.CORRECT
        assert game_started.phase is GamePhase.TURN_ENDED


class TestGameWinConditions:
    """Tests for game win conditions."""

    def _find_card_of_type(self, board, card_type):
        """Helper to find an unrevealed card of a given type."""
        for bc in board.all_cards:
            if bc.card_type is card_type and not bc.revealed:
                return bc.word
        return None

    def test_win_by_all_words_found(self, board):
        """When all of a team's words are found, that team wins."""
        game = Game(board=board, starting_team=Team.RED)
        game.start()

        # We'll manually reveal all RED cards across multiple turns
        red_cards = [bc for bc in board.all_cards if bc.card_type is CardType.RED]

        for i, bc in enumerate(red_cards):
            if game.is_over:
                break
            if game.phase is GamePhase.GIVING_CLUE:
                game.submit_clue(Clue(word="OCEAN", count=9))
            if game.phase is GamePhase.GUESSING:
                result = game.submit_guess(bc.word)
                if result is GuessResult.CORRECT and game.phase is GamePhase.TURN_ENDED:
                    if not game.is_over:
                        game.next_turn()

        # Game should be over with RED winning
        assert game.is_over is True
        assert game.result is not None
        assert game.result.winner is Team.RED
        assert game.result.outcome is GameOutcome.RED_WINS_ALL_WORDS

    def test_win_by_assassin(self, game_started):
        """Guessing the assassin should end the game with opponent winning."""
        board = game_started.board
        assassin_word = self._find_card_of_type(board, CardType.ASSASSIN)

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.submit_guess(assassin_word)

        assert game_started.is_over is True
        assert game_started.result is not None
        assert game_started.result.winner is Team.BLUE

    def test_turn_limit_ends_game(self):
        """Exceeding max_turns should end the game."""
        rng = random.Random(SEED)
        board = Board(words=list(FIXED_WORDS), starting_team=Team.RED, rng=rng)
        game = Game(board=board, starting_team=Team.RED, max_turns=2)
        game.start()

        # Turn 1 (RED)
        game.submit_clue(Clue(word="OCEAN", count=1))
        game.end_guessing()
        game.next_turn()

        # Turn 2 (BLUE)
        game.submit_clue(Clue(word="FLAME", count=1))
        game.end_guessing()

        # next_turn should trigger turn limit (turn_number would become 3 > 2)
        game.next_turn()

        assert game.is_over is True
        assert game.result is not None
        assert game.result.outcome is GameOutcome.TURN_LIMIT


class TestGameViews:
    """Tests for the game's spymaster and operative views."""

    def test_spymaster_view_has_key_card(self, game_started):
        """Spymaster view should include the full key_card."""
        view = game_started.get_spymaster_view(Team.RED)
        assert "key_card" in view
        assert len(view["key_card"]) == 25

    def test_operative_view_lacks_card_types(self, game_started):
        """Operative view should NOT include key_card."""
        view = game_started.get_operative_view(Team.RED)
        assert "key_card" not in view

    def test_spymaster_view_has_unrevealed_words(self, game_started):
        """Spymaster view should list unrevealed words."""
        view = game_started.get_spymaster_view(Team.RED)
        assert "unrevealed_words" in view
        assert len(view["unrevealed_words"]) == 25

    def test_operative_view_has_unrevealed_words(self, game_started):
        """Operative view should list unrevealed words."""
        view = game_started.get_operative_view(Team.RED)
        assert "unrevealed_words" in view
        assert len(view["unrevealed_words"]) == 25

    def test_spymaster_view_has_team(self, game_started):
        """Spymaster view should include the team."""
        view = game_started.get_spymaster_view(Team.RED)
        assert view["team"] == "RED"

    def test_operative_view_has_team(self, game_started):
        """Operative view should include the team."""
        view = game_started.get_operative_view(Team.BLUE)
        assert view["team"] == "BLUE"

    def test_spymaster_view_has_remaining_counts(self, game_started):
        """Spymaster view should include remaining card counts."""
        view = game_started.get_spymaster_view(Team.RED)
        assert "red_remaining" in view
        assert "blue_remaining" in view
        assert view["red_remaining"] == 9
        assert view["blue_remaining"] == 8

    def test_operative_view_has_current_clue(self, game_started):
        """After submitting a clue, operative view should include it."""
        game_started.submit_clue(Clue(word="OCEAN", count=2))
        view = game_started.get_operative_view(Team.RED)
        assert view["current_clue"] is not None
        assert view["current_clue"]["word"] == "OCEAN"
        assert view["current_clue"]["count"] == 2

    def test_operative_view_guesses_remaining(self, game_started):
        """Operative view should track guesses_remaining."""
        game_started.submit_clue(Clue(word="OCEAN", count=2))
        view = game_started.get_operative_view(Team.RED)
        assert view["guesses_remaining"] == 3  # count + 1

    def test_views_update_after_reveal(self, game_started):
        """After a guess, revealed_words should appear in views."""
        board = game_started.board
        red_word = next(
            bc.word for bc in board.all_cards if bc.card_type is CardType.RED
        )

        game_started.submit_clue(Clue(word="OCEAN", count=2))
        game_started.submit_guess(red_word)

        sm_view = game_started.get_spymaster_view(Team.RED)
        op_view = game_started.get_operative_view(Team.RED)

        assert red_word in sm_view["revealed_words"]
        assert red_word in op_view["revealed_words"]
        assert red_word not in sm_view["unrevealed_words"]
        assert red_word not in op_view["unrevealed_words"]


class TestGameMoveLog:
    """Tests for the game's move recording."""

    def test_clue_recorded_in_move_log(self, game_started):
        """Submitting a clue should add a record to move_log."""
        game_started.submit_clue(Clue(word="OCEAN", count=2))
        log = game_started.move_log
        assert len(log) == 1
        assert log[0].action_type == "clue"
        assert log[0].clue_word == "OCEAN"
        assert log[0].clue_count == 2
        assert log[0].team is Team.RED

    def test_guess_recorded_in_move_log(self, game_started):
        """Submitting a guess should add a record to move_log."""
        board = game_started.board
        red_word = next(
            bc.word for bc in board.all_cards if bc.card_type is CardType.RED
        )

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.submit_guess(red_word)

        log = game_started.move_log
        assert len(log) == 2  # clue + guess
        assert log[1].action_type == "guess"
        assert log[1].guess_word == red_word.upper()
        assert log[1].guess_result is GuessResult.CORRECT

    def test_move_log_returns_copy(self, game_started):
        """move_log should return a copy, not the internal list."""
        game_started.submit_clue(Clue(word="OCEAN", count=1))
        log1 = game_started.move_log
        log2 = game_started.move_log
        assert log1 is not log2
        assert len(log1) == len(log2)


class TestGameResultObject:
    """Tests for the GameResult data class."""

    def test_result_is_none_before_game_over(self, game_started):
        """result should be None while game is still in progress."""
        assert game_started.result is None

    def test_result_populated_on_game_over(self, game_started):
        """result should be populated after the game ends."""
        board = game_started.board
        assassin_word = next(
            bc.word for bc in board.all_cards if bc.card_type is CardType.ASSASSIN
        )

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.submit_guess(assassin_word)

        result = game_started.result
        assert result is not None
        assert isinstance(result, GameResult)
        assert result.winner is Team.BLUE
        assert result.total_turns >= 1
        assert len(result.move_log) >= 2

    def test_result_has_remaining_counts(self, game_started):
        """GameResult should include remaining card counts."""
        board = game_started.board
        assassin_word = next(
            bc.word for bc in board.all_cards if bc.card_type is CardType.ASSASSIN
        )

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.submit_guess(assassin_word)

        result = game_started.result
        assert result is not None
        assert result.red_remaining >= 0
        assert result.blue_remaining >= 0


class TestGameIsOver:
    """Tests for the is_over property."""

    def test_not_over_initially(self, game):
        """Game should not be over before starting."""
        assert game.is_over is False

    def test_not_over_after_start(self, game_started):
        """Game should not be over right after starting."""
        assert game_started.is_over is False

    def test_over_after_assassin(self, game_started):
        """Game should be over after assassin is guessed."""
        board = game_started.board
        assassin_word = next(
            bc.word for bc in board.all_cards if bc.card_type is CardType.ASSASSIN
        )

        game_started.submit_clue(Clue(word="OCEAN", count=1))
        game_started.submit_guess(assassin_word)
        assert game_started.is_over is True


class TestWordPool:
    """Tests for the WordPool class."""

    def test_wordpool_loads_words(self):
        """WordPool should load words from the default word list."""
        pool = WordPool()
        assert len(pool.words) > 0

    def test_wordpool_sample_correct_count(self):
        """sample() should return the requested number of words."""
        pool = WordPool()
        words = pool.sample(25)
        assert len(words) == 25

    def test_wordpool_sample_unique(self):
        """sample() should return unique words."""
        pool = WordPool()
        words = pool.sample(25)
        assert len(set(words)) == 25

    def test_wordpool_sample_deterministic_with_rng(self):
        """sample() with the same rng should produce the same words."""
        pool = WordPool()
        rng1 = random.Random(42)
        rng2 = random.Random(42)
        words1 = pool.sample(25, rng=rng1)
        words2 = pool.sample(25, rng=rng2)
        assert words1 == words2

    def test_wordpool_sample_too_many_raises(self):
        """sample() should raise if requesting more words than available."""
        pool = WordPool()
        total = len(pool.words)
        with pytest.raises(ValueError, match="Cannot sample"):
            pool.sample(total + 1)

"""
Unit tests for pure functions in services/ollama.py.

format_pace and build_voice_modifier are tested directly here because they
affect every AI response and have known edge cases that aren't hit by
the SSE streaming integration tests.
"""

import pytest

from services.context import build_voice_modifier, format_pace


class TestFormatPace:
    def test_typical_pace(self):
        assert format_pace(5.714) == "5:43"

    def test_whole_minute(self):
        assert format_pace(6.0) == "6:00"

    def test_half_minute(self):
        assert format_pace(5.5) == "5:30"

    def test_slow_pace(self):
        assert format_pace(8.25) == "8:15"

    def test_fast_pace(self):
        assert format_pace(3.0) == "3:00"

    def test_seconds_rollover_edge_case(self):
        # When rounding pushes seconds to 60, minutes must increment and seconds reset to 0.
        # 5.999... rounds to 6:00, not 5:60.
        result = format_pace(5.999)
        minutes, seconds = result.split(":")
        assert int(seconds) < 60, f"Seconds rolled over: got {result}"
        assert int(minutes) >= 5

    def test_output_format(self):
        result = format_pace(7.333)
        parts = result.split(":")
        assert len(parts) == 2
        assert len(parts[1]) == 2  # zero-padded seconds


class TestBuildVoiceModifier:
    def test_standard_returns_empty_string(self):
        assert build_voice_modifier("standard") == ""

    def test_unknown_value_returns_empty_string(self):
        assert build_voice_modifier("yelling") == ""
        assert build_voice_modifier("") == ""

    def test_gentle_returns_non_empty(self):
        result = build_voice_modifier("gentle")
        assert result != ""
        assert "Gentle" in result

    def test_unfiltered_returns_non_empty(self):
        result = build_voice_modifier("unfiltered")
        assert result != ""
        assert "Unfiltered" in result

    def test_gentle_does_not_contain_unfiltered_keywords(self):
        gentle = build_voice_modifier("gentle")
        assert "No diplomatic opener" not in gentle
        assert "shorter responses" not in gentle.lower()

    def test_unfiltered_does_not_contain_gentle_keywords(self):
        unfiltered = build_voice_modifier("unfiltered")
        assert "acknowledge it in one sentence" not in unfiltered

    def test_gentle_still_honest(self):
        gentle = build_voice_modifier("gentle")
        assert "honest" in gentle.lower() or "dishonesty" in gentle.lower()

    def test_unfiltered_still_not_cruel(self):
        unfiltered = build_voice_modifier("unfiltered")
        assert "not cruel" in unfiltered.lower()

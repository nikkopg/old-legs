"""
Pak Har voice tests — live Ollama integration.

Calls Ollama directly with ANALYSIS_PROMPT and SYSTEM_PROMPT for synthetic
scenarios. Tests pass/fail based on structural and vocabulary checks — not
exact wording, since LLM output is non-deterministic.

Run with:
    cd apps/api && python -m pytest tests/test_pak_har_voice.py -v -s

Requires Ollama running at localhost:11434 with gemma4:31b-cloud available.
Skips automatically if Ollama is unreachable.
"""

import os
import sys
import json
import urllib.request
import urllib.error

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from prompts.pak_har import ANALYSIS_PROMPT, SYSTEM_PROMPT

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:31b-cloud")

FORBIDDEN_WORDS = [
    "amazing", "superstar", "rockstar", "you got this", "believe in yourself",
    "your journey", "legend", "great job", "well done", "keep it up",
    "every run counts", "stay consistent", "trust the process", "just run more",
]


def ollama_available() -> bool:
    try:
        urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=3)
        return True
    except Exception:
        return False


def call_ollama(prompt: str, system: str = "", timeout: int = 120) -> str:
    payload = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 400},
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())["response"].strip()


def check_forbidden(response: str) -> list[str]:
    lower = response.lower()
    return [w for w in FORBIDDEN_WORDS if w in lower]


def count_exclamation_points(response: str) -> int:
    return response.count("!")


pytestmark = pytest.mark.skipif(
    not ollama_available(),
    reason="Ollama not reachable at localhost:11434 — skipping live voice tests",
)

# ---------------------------------------------------------------------------
# Synthetic context helpers
# ---------------------------------------------------------------------------

_PLAN_EASY_40 = """Planned session for this day:
  Type: easy
  Target: 40 min easy, HR ≤ 145 bpm
  Description: 40 min easy run, no watch-checking, keep HR in zone 2
  Duration: 40 min"""

_PLAN_TEMPO_40 = """Planned session for this day:
  Type: tempo
  Target: 40 min tempo, HR 155–170 bpm
  Description: 40 min tempo run, steady effort, no surges
  Duration: 40 min"""

_NO_PLAN = "(no training plan active for this week)"

_HR_Z2 = "Average HR 138 bpm — Zone 2 (aerobic base). Effort matches easy session type."
_HR_Z4 = "Average HR 168 bpm — Zone 4 (threshold/hard). MISMATCH: this was classified as an easy run."
_NO_HR = "(no heart rate data for this run)"

_PREFS = "Goal: general fitness. Days available: 4. Biggest struggle: consistency."


def _make_analysis_prompt(
    run_context: str,
    hr_zone_context: str,
    planned_session_context: str,
    splits_context: str = "(no split data available)",
    historical_context: str = "(no previous run assessments)",
    weekly_review_context: str = "(not available)",
    user_preferences: str = _PREFS,
    voice_modifier: str = "",
) -> str:
    return ANALYSIS_PROMPT.format(
        run_context=run_context,
        hr_zone_context=hr_zone_context,
        planned_session_context=planned_session_context,
        splits_context=splits_context,
        historical_context=historical_context,
        weekly_review_context=weekly_review_context,
        user_preferences=user_preferences,
        voice_modifier=voice_modifier,
    )


# ---------------------------------------------------------------------------
# Scenario 15 — EXECUTED: 42 min easy at Z2, plan was 40 min easy
# ---------------------------------------------------------------------------

class TestScenario15_Executed:
    """Runner matched the plan. Pak Har should acknowledge, not criticize."""

    @pytest.fixture(scope="class")
    def response(self):
        run_ctx = (
            "Date: 2026-05-29\n"
            "Distance: 7.1 km\n"
            "Moving time: 42 min\n"
            "Average pace: 5:55/km\n"
            "Elevation gain: 18 m\n"
            "Average HR: 138 bpm\n"
            "Time in zones: Z1 4:00 | Z2 36:00 | Z3 2:00 | Z4 0:00 | Z5 0:00"
        )
        prompt = _make_analysis_prompt(
            run_context=run_ctx,
            hr_zone_context=_HR_Z2,
            planned_session_context=_PLAN_EASY_40,
        )
        return call_ollama(prompt)

    def test_no_forbidden_words(self, response):
        hits = check_forbidden(response)
        assert not hits, f"Forbidden words found: {hits}\n\nResponse:\n{response}"

    def test_no_excessive_exclamation(self, response):
        count = count_exclamation_points(response)
        assert count <= 1, f"Too many exclamation points ({count})\n\nResponse:\n{response}"

    def test_does_not_flag_effort_as_wrong(self, response):
        lower = response.lower()
        bad_phrases = ["too hard", "zone 4", "ran hard", "not easy", "wasn't easy"]
        hits = [p for p in bad_phrases if p in lower]
        assert not hits, (
            f"Incorrectly flagged effort as wrong ({hits}) on an EXECUTED easy run\n\nResponse:\n{response}"
        )

    def test_acknowledges_execution(self, response):
        lower = response.lower()
        # Should contain some form of plan acknowledgment
        acknowledgment_signals = [
            "that was the session", "matched the plan", "executed", "followed the plan",
            "as planned", "hit the target", "on target", "within", "plan was"
        ]
        found = any(s in lower for s in acknowledgment_signals)
        assert found, (
            f"No acknowledgment of correct execution found\n\nResponse:\n{response}"
        )

    def test_gives_forward_looking_observation(self, response):
        lower = response.lower()
        # Should point to something to build on — not just stop after acknowledging
        forward_signals = [
            "next", "extend", "watch", "maintain", "add", "build", "continue",
            "next time", "next run", "next week", "upcoming"
        ]
        found = any(s in lower for s in forward_signals)
        assert found, (
            f"No forward-looking observation after acknowledging execution\n\nResponse:\n{response}"
        )

    def test_print_response(self, response, capsys):
        print(f"\n--- Scenario 15 (EXECUTED easy run) ---\n{response}\n")


# ---------------------------------------------------------------------------
# Scenario 16 — DEVIATED (too hard): 40 min "easy" at Z4, plan was Z2
# ---------------------------------------------------------------------------

class TestScenario16_DeviatedTooHard:
    """Runner ran hard on an easy day. Pak Har must flag the mismatch."""

    @pytest.fixture(scope="class")
    def response(self):
        run_ctx = (
            "Date: 2026-05-29\n"
            "Distance: 7.4 km\n"
            "Moving time: 40 min\n"
            "Average pace: 5:24/km\n"
            "Elevation gain: 22 m\n"
            "Average HR: 168 bpm\n"
            "Time in zones: Z1 1:00 | Z2 5:00 | Z3 8:00 | Z4 22:00 | Z5 4:00"
        )
        prompt = _make_analysis_prompt(
            run_context=run_ctx,
            hr_zone_context=_HR_Z4,
            planned_session_context=_PLAN_EASY_40,
        )
        return call_ollama(prompt)

    def test_no_forbidden_words(self, response):
        hits = check_forbidden(response)
        assert not hits, f"Forbidden words found: {hits}\n\nResponse:\n{response}"

    def test_flags_hr_mismatch(self, response):
        lower = response.lower()
        mismatch_signals = [
            "zone 4", "z4", "168", "too hard", "not easy", "wasn't easy",
            "mismatch", "deviated", "hard effort", "threshold"
        ]
        found = any(s in lower for s in mismatch_signals)
        assert found, (
            f"Did not flag HR zone mismatch on easy day\n\nResponse:\n{response}"
        )

    def test_names_the_plan_deviation(self, response):
        lower = response.lower()
        plan_signals = [
            "planned", "easy", "zone 2", "z2", "was supposed", "called this easy",
            "easy run", "deviated", "not what was planned"
        ]
        found = any(s in lower for s in plan_signals)
        assert found, (
            f"Did not reference the plan when flagging deviation\n\nResponse:\n{response}"
        )

    def test_does_not_treat_as_executed(self, response):
        lower = response.lower()
        false_positive = ["that was the session", "matched the plan", "executed correctly"]
        hits = [p for p in false_positive if p in lower]
        assert not hits, (
            f"Incorrectly treated a DEVIATED run as EXECUTED\n\nResponse:\n{response}"
        )

    def test_print_response(self, response, capsys):
        print(f"\n--- Scenario 16 (DEVIATED — too hard) ---\n{response}\n")


# ---------------------------------------------------------------------------
# Scenario 17 — DEVIATED (cut short): 28 min tempo, plan was 40 min tempo
# ---------------------------------------------------------------------------

class TestScenario17_DeviatedCutShort:
    """Runner cut a tempo run short. Pak Har must name the duration gap."""

    @pytest.fixture(scope="class")
    def response(self):
        run_ctx = (
            "Date: 2026-05-28\n"
            "Distance: 4.9 km\n"
            "Moving time: 28 min\n"
            "Average pace: 5:42/km\n"
            "Elevation gain: 10 m\n"
            "Average HR: 161 bpm\n"
            "Time in zones: Z1 1:00 | Z2 4:00 | Z3 12:00 | Z4 11:00 | Z5 0:00"
        )
        hr_ctx = "Average HR 161 bpm — Zone 3-4 (tempo effort). Matches session type."
        planned = """Planned session for this day:
  Type: tempo
  Target: 40 min tempo, HR 155–170 bpm
  Description: 40 min steady tempo, even effort throughout
  Duration: 40 min"""
        prompt = _make_analysis_prompt(
            run_context=run_ctx,
            hr_zone_context=hr_ctx,
            planned_session_context=planned,
        )
        return call_ollama(prompt)

    def test_no_forbidden_words(self, response):
        hits = check_forbidden(response)
        assert not hits, f"Forbidden words found: {hits}\n\nResponse:\n{response}"

    def test_names_duration_shortfall(self, response):
        lower = response.lower()
        shortfall_signals = [
            "28", "12 min", "12 minutes", "short", "cut", "40 min", "40-min",
            "30%", "missing", "fell short", "didn't finish", "didn't complete"
        ]
        found = any(s in lower for s in shortfall_signals)
        assert found, (
            f"Did not name the duration shortfall (28 of 40 min)\n\nResponse:\n{response}"
        )

    def test_does_not_treat_as_executed(self, response):
        lower = response.lower()
        false_positive = ["that was the session", "matched the plan", "executed correctly", "on target"]
        hits = [p for p in false_positive if p in lower]
        assert not hits, (
            f"Incorrectly treated a cut-short run as EXECUTED\n\nResponse:\n{response}"
        )

    def test_print_response(self, response, capsys):
        print(f"\n--- Scenario 17 (DEVIATED — cut short) ---\n{response}\n")


# ---------------------------------------------------------------------------
# Scenario 18 — NONE: no active plan, free 45 min easy run
# ---------------------------------------------------------------------------

class TestScenario18_NoPlan:
    """No plan on file. Pak Har evaluates on merits only — no plan references."""

    @pytest.fixture(scope="class")
    def response(self):
        run_ctx = (
            "Date: 2026-05-27\n"
            "Distance: 7.8 km\n"
            "Moving time: 45 min\n"
            "Average pace: 5:46/km\n"
            "Elevation gain: 31 m\n"
            "Average HR: 141 bpm\n"
            "Time in zones: Z1 6:00 | Z2 34:00 | Z3 5:00 | Z4 0:00 | Z5 0:00"
        )
        prompt = _make_analysis_prompt(
            run_context=run_ctx,
            hr_zone_context="Average HR 141 bpm — Zone 2 (aerobic base). Solid easy effort.",
            planned_session_context=_NO_PLAN,
        )
        return call_ollama(prompt)

    def test_no_forbidden_words(self, response):
        hits = check_forbidden(response)
        assert not hits, f"Forbidden words found: {hits}\n\nResponse:\n{response}"

    def test_does_not_invent_plan_reference(self, response):
        lower = response.lower()
        invented_plan = ["deviated", "planned", "as planned", "the plan", "target was", "session type"]
        hits = [p for p in invented_plan if p in lower]
        assert not hits, (
            f"Invented a plan reference when none existed: {hits}\n\nResponse:\n{response}"
        )

    def test_evaluates_on_merits(self, response):
        lower = response.lower()
        merit_signals = [
            "zone 2", "z2", "141", "pace", "aerobic", "effort", "easy", "hr", "heart rate"
        ]
        found = any(s in lower for s in merit_signals)
        assert found, (
            f"Did not evaluate run data on its own merits\n\nResponse:\n{response}"
        )

    def test_print_response(self, response, capsys):
        print(f"\n--- Scenario 18 (NONE — no plan) ---\n{response}\n")

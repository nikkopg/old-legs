# READY FOR QA
# Feature: HR zone interpretation for post-run analysis (TASK-109)
# What was built:
#   - classify_hr_zone(): maps average HR to a 5-zone label using derived MHR from activity history (fallback: 185 bpm)
#   - build_analysis_context(): builds the full context string for the post-run analysis
#     prompt, including HR zone label, easy-run zone mismatch flag, and a fatigue trend note
#     when HR is rising at similar distance over the last 3 comparable runs
#   - HR context is omitted entirely when average_hr is null (do not speculate)
# Edge cases to test:
#   - Activity with average_hr=None → no HR lines in context, no zone label, no mismatch flag
#   - Activity with average_hr in zone 1 or 2 and name contains "easy" → no mismatch (correct effort)
#   - Activity with average_hr in zone 3+ and name contains "easy" → mismatch flag included
#   - Fewer than 3 comparable recent runs → hr_trend note omitted (not enough data)
#   - Comparable runs have declining or flat HR → no fatigue note
#   - Comparable runs have rising HR (all 3 higher than current) → fatigue flag included
#   - activity.name in various cases ("Easy Run", "EASY jog") → case-insensitive match

"""
Coach service — builds analysis context for Pak Har's post-run feedback.

Responsible for:
- HR zone classification (5-zone model, assumed max HR)
- Easy-run vs. HR zone mismatch detection
- HR fatigue trend across comparable recent runs
- Final context string assembly for the ANALYSIS_PROMPT
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from models.activity import Activity
from services.ollama import format_pace

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HR zone constants
# ---------------------------------------------------------------------------

# Fallback max HR used only when no max_hr data exists in activity history.
# 185 bpm is a population-average for recreational adult runners.
_FALLBACK_MAX_HR: int = 185

# Default resting HR used until the user provides their actual RHR via onboarding.
# 60 bpm is a reasonable population average for recreational runners.
_DEFAULT_RHR: int = 60

# Zone boundaries as percentage ranges of Heart Rate Reserve (HRR = MHR - RHR).
# Uses the Karvonen formula: zone_boundary = RHR + (pct × HRR)
# This is more accurate than % of MHR because it accounts for individual
# resting HR, shifting zones upward for fitter runners with lower RHR.
# (lower_pct_inclusive, upper_pct_exclusive, zone_number, label)
_HR_ZONE_PCTS: list[tuple[float, float, int, str]] = [
    (0.00, 0.50, 1, "Zone 1 (very easy — below 50% HRR)"),
    (0.50, 0.60, 2, "Zone 2 (easy/aerobic — 50–60% HRR)"),
    (0.60, 0.70, 3, "Zone 3 (tempo/aerobic threshold — 60–70% HRR)"),
    (0.70, 0.85, 4, "Zone 4 (hard/lactate threshold — 70–85% HRR)"),
    (0.85, 9.99, 5, "Zone 5 (max effort — above 85% HRR)"),
]

# Keywords that, when found in the activity name, indicate the runner intended
# an easy effort. Checked case-insensitively.
_EASY_RUN_KEYWORDS: tuple[str, ...] = ("easy", "recovery", "aerobic", "base")

# Distance tolerance for "comparable" runs used in trend detection.
# A run is considered comparable if its distance is within ±30% of the
# current run's distance.
_COMPARABLE_DISTANCE_TOLERANCE: float = 0.30

# Number of comparable recent runs needed before we report an HR trend.
_HR_TREND_MIN_RUNS: int = 3


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def _derive_max_hr(
    current_activity: Activity,
    recent_activities: list[Activity],
    max_hr_observed: int | None = None,
) -> int:
    """
    Derive the user's max HR.

    When max_hr_observed is provided (cached from the User row), it is used
    directly and activity history is not scanned — this avoids a full table
    scan on every analysis call.

    Falls back to scanning max_hr across the current and recent activities,
    and ultimately to _FALLBACK_MAX_HR if no max_hr data exists anywhere.

    Args:
        current_activity: The activity being analyzed.
        recent_activities: The user's other recent activities.
        max_hr_observed: Cached max HR from the User row (preferred source).

    Returns:
        The best-available max HR estimate, in bpm.
    """
    if max_hr_observed is not None:
        return max_hr_observed
    candidates = [
        a.max_hr for a in [current_activity] + recent_activities
        if a.max_hr is not None
    ]
    return max(candidates) if candidates else _FALLBACK_MAX_HR


def classify_hr_zone(average_hr: int, max_hr: int, resting_hr: int = _DEFAULT_RHR) -> tuple[int, str]:
    """
    Map an average HR to a 5-zone label using the Karvonen formula.

    Zone boundary (bpm) = resting_hr + (pct × (max_hr - resting_hr))

    Args:
        average_hr: The average heart rate for a run, in bpm.
        max_hr: The user's max HR (derived from history or fallback).
        resting_hr: The user's resting HR (default 60 until user provides actual value).

    Returns:
        A (zone_number, zone_label) tuple. zone_number is 1–5.
    """
    hrr = max_hr - resting_hr
    if hrr <= 0:
        return 1, _HR_ZONE_PCTS[0][3]
    pct = (average_hr - resting_hr) / hrr
    for lower_pct, upper_pct, zone_num, label in _HR_ZONE_PCTS:
        if lower_pct <= pct < upper_pct:
            return zone_num, label
    return 5, _HR_ZONE_PCTS[-1][3]


def _is_easy_run(activity_name: str) -> bool:
    """Return True if the activity name suggests an intended easy effort."""
    name_lower = activity_name.lower()
    return any(keyword in name_lower for keyword in _EASY_RUN_KEYWORDS)


def _compute_hr_trend(
    current_activity: Activity,
    recent_activities: list[Activity],
) -> Optional[str]:
    """
    Compare the current run's HR against the last N comparable runs.

    A comparable run is one whose distance is within ±30% of the current
    run's distance and which has a non-null average_hr.

    Returns a plain-text fatigue note if HR is rising across comparable runs,
    or None if there is not enough data or no upward trend.

    Args:
        current_activity: The activity being analyzed.
        recent_activities: The user's other recent activities, ordered by
                           activity_date descending (current activity excluded).

    Returns:
        A short string describing the HR trend, or None.
    """
    if current_activity.average_hr is None:
        return None

    target_distance = current_activity.distance_km
    lower_bound = target_distance * (1 - _COMPARABLE_DISTANCE_TOLERANCE)
    upper_bound = target_distance * (1 + _COMPARABLE_DISTANCE_TOLERANCE)

    comparable: list[Activity] = [
        a for a in recent_activities
        if a.average_hr is not None
        and lower_bound <= a.distance_km <= upper_bound
        and a.id != current_activity.id
    ]

    if len(comparable) < _HR_TREND_MIN_RUNS:
        return None

    # Take the most recent N comparable runs (already ordered desc by date)
    reference_runs = comparable[:_HR_TREND_MIN_RUNS]

    # Check whether all reference HR values are lower than the current HR
    # at a similar pace. We flag fatigue when HR is consistently higher now
    # than in prior comparable runs — same distance, HR going up.
    reference_hrs = [a.average_hr for a in reference_runs]
    current_hr = current_activity.average_hr

    if all(hr < current_hr for hr in reference_hrs):
        avg_ref_hr = round(sum(reference_hrs) / len(reference_hrs))
        return (
            f"HR trend (last {_HR_TREND_MIN_RUNS} runs at similar distance): "
            f"avg HR was {avg_ref_hr} bpm, this run was {current_hr} bpm. "
            f"HR is rising at the same distance — potential fatigue accumulation."
        )

    return None


def build_analysis_context(
    activity: Activity,
    recent_activities: list[Activity],
    resting_hr: int = _DEFAULT_RHR,
    max_hr_observed: int | None = None,
    max_hr: int | None = None,
) -> str:
    """
    Build the full context string for Pak Har's post-run analysis prompt.

    Includes basic run data (always), HR zone classification and mismatch
    flags (only when average_hr is not null), and an HR trend note (only
    when sufficient comparable runs exist and HR is rising).

    MHR resolution priority:
        1. max_hr — user-provided explicit value (most trusted)
        2. max_hr_observed — auto-derived from activity history (cached on User row)
        3. _derive_max_hr() — scans current + recent activities, falls back to
           _FALLBACK_MAX_HR (185 bpm) when no max_hr data exists anywhere

    Args:
        activity: The Activity being analyzed.
        recent_activities: The user's other recent activities, ordered by
                           activity_date descending. Used for trend detection.
                           Should exclude the current activity.
        resting_hr: The user's resting HR in bpm (default 60).
        max_hr_observed: Cached max HR from the user row. Used when max_hr is
                         not set — avoids a full table scan on every analysis call.
        max_hr: User-provided max HR (highest-priority source for zone calc).

    Returns:
        A multi-line plain-text context string ready to be injected into the
        ANALYSIS_PROMPT.
    """
    run_date = activity.activity_date.date().isoformat()
    pace_str = format_pace(activity.average_pace_min_per_km)
    moving_minutes = activity.moving_time_seconds // 60
    moving_seconds = activity.moving_time_seconds % 60
    moving_time_str = f"{moving_minutes}m {moving_seconds}s"

    lines: list[str] = [
        f"Run: {activity.name}",
        f"Date: {run_date}",
        f"Distance: {activity.distance_km:.2f} km",
        f"Moving time: {moving_time_str}",
        f"Average pace: {pace_str} min/km",
        f"Elevation gain: {activity.elevation_gain_m} m",
    ]

    # --- HR section — only populated when data exists ---
    if activity.average_hr is not None:
        # 3-tier MHR priority: user-provided > cached from history > derived from history
        if max_hr is not None:
            derived_mhr = max_hr
            mhr_source = "user-provided"
        elif max_hr_observed is not None:
            derived_mhr = max_hr_observed
            mhr_source = "cached from history"
        else:
            derived_mhr = _derive_max_hr(activity, recent_activities)
            mhr_source = (
                "from activity history" if any(
                    a.max_hr is not None for a in [activity] + recent_activities
                ) else "population average fallback"
            )
        rhr_source = "user-provided" if resting_hr != _DEFAULT_RHR else "default"
        zone_num, zone_label = classify_hr_zone(activity.average_hr, derived_mhr, resting_hr)
        lines.append(
            f"Average heart rate: {activity.average_hr} bpm ({zone_label}, "
            f"Karvonen: MHR {derived_mhr} bpm {mhr_source}, RHR {resting_hr} bpm {rhr_source})"
        )

        if activity.max_hr is not None:
            lines.append(f"Max heart rate: {activity.max_hr} bpm")

        # Flag easy-run vs. hard HR zone mismatch
        if _is_easy_run(activity.name) and zone_num >= 3:
            lines.append(
                f"HR zone mismatch: this run was named or intended as easy, "
                f"but the average HR ({activity.average_hr} bpm) puts it in {zone_label}. "
                f"That was not an easy run."
            )

        # HR trend across comparable recent runs
        hr_trend = _compute_hr_trend(activity, recent_activities)
        if hr_trend:
            lines.append(hr_trend)

    return "\n".join(lines)

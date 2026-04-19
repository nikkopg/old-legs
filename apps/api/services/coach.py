# READY FOR QA
# Feature: HR zone interpretation for post-run analysis (TASK-109)
# What was built:
#   - classify_hr_zone(): maps average HR to a 5-zone label using an assumed max HR of 185 bpm
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

# Assumed population-average max HR used when the user's actual max HR is
# unknown. 185 bpm is a reasonable middle-ground for recreational adult
# runners. It is intentionally not derived from "220 − age" because we don't
# collect the user's age either. Update this constant if the product ever
# collects real max HR data from users.
_ASSUMED_MAX_HR: int = 185

# Zone boundaries as (lower_inclusive, upper_inclusive, zone_number, label).
# Percentages are of _ASSUMED_MAX_HR.
# Zone 1: < 60%  → below 111 bpm
# Zone 2: 60–70% → 111–129 bpm  (true easy/aerobic)
# Zone 3: 70–80% → 130–148 bpm  (tempo / aerobic threshold)
# Zone 4: 80–90% → 149–166 bpm  (hard / lactate threshold)
# Zone 5: > 90%  → above 166 bpm (max effort)
_HR_ZONES: list[tuple[int, int, int, str]] = [
    (0, 110, 1, "Zone 1 (very easy — below 60% max HR)"),
    (111, 129, 2, "Zone 2 (easy/aerobic — 60–70% max HR)"),
    (130, 148, 3, "Zone 3 (tempo/aerobic threshold — 70–80% max HR)"),
    (149, 166, 4, "Zone 4 (hard/lactate threshold — 80–90% max HR)"),
    (167, 9999, 5, "Zone 5 (max effort — above 90% max HR)"),
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

def classify_hr_zone(average_hr: int) -> tuple[int, str]:
    """
    Map an average HR value to a 5-zone label.

    Uses _ASSUMED_MAX_HR (185 bpm) as the reference max HR when the user's
    actual max HR is not known.

    Args:
        average_hr: The average heart rate for a run, in bpm.

    Returns:
        A (zone_number, zone_label) tuple. zone_number is 1–5.
        Clamps to Zone 5 for any value above the highest boundary.
    """
    for lower, upper, zone_num, label in _HR_ZONES:
        if lower <= average_hr <= upper:
            return zone_num, label
    # Anything above the last boundary is Zone 5
    return 5, _HR_ZONES[-1][3]


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
) -> str:
    """
    Build the full context string for Pak Har's post-run analysis prompt.

    Includes basic run data (always), HR zone classification and mismatch
    flags (only when average_hr is not null), and an HR trend note (only
    when sufficient comparable runs exist and HR is rising).

    Args:
        activity: The Activity being analyzed.
        recent_activities: The user's other recent activities, ordered by
                           activity_date descending. Used for trend detection.
                           Should exclude the current activity.

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
        zone_num, zone_label = classify_hr_zone(activity.average_hr)
        lines.append(f"Average heart rate: {activity.average_hr} bpm ({zone_label})")

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

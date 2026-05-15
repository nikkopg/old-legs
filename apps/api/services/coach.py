# READY FOR QA
# Feature: HR zone interpretation for post-run analysis (TASK-109)
#          + cardiac drift + efficiency factor trend signals (additive)
#          + time-in-zone per-split breakdown
# What was built:
#   - classify_hr_zone(): maps average HR to a 5-zone label using derived MHR from activity history (fallback: 185 bpm)
#   - build_analysis_context(): builds the full context string for the post-run analysis
#     prompt, including HR zone label, easy-run zone mismatch flag, and a fatigue trend note
#     when HR is rising at similar distance over the last 3 comparable runs
#   - HR context is omitted entirely when average_hr is null (do not speculate)
#   - _compute_cardiac_drift(): detects HR climb relative to pace from per-km splits
#   - _compute_efficiency_factor(): computes speed/HR ratio and trends it against recent runs
#   - _compute_time_in_zones(): accumulates split moving_time per Karvonen zone from per-km splits;
#     returns None when no HR data or when timed coverage is below 50% of total split time
# Edge cases to test:
#   - Activity with average_hr=None → no HR lines in context, no zone label, no mismatch flag, no TIZ
#   - Activity with average_hr in zone 1 or 2 and name contains "easy" → no mismatch (correct effort)
#   - Activity with average_hr in zone 3+ and name contains "easy" → mismatch flag included
#   - Fewer than 3 comparable recent runs → hr_trend note omitted (not enough data)
#   - Comparable runs have declining or flat HR → no fatigue note
#   - Comparable runs have rising HR (all 3 higher than current) → fatigue flag included
#   - activity.name in various cases ("Easy Run", "EASY jog") → case-insensitive match
#   - Splits with fewer than 4 valid HR+speed entries → cardiac drift omitted
#   - cardiac drift 0–4.9% → None returned (unremarkable)
#   - Fewer than 2 recent activities with HR → EF trend omitted
#   - EF change -3% to +3% → None returned (stable)
#   - All splits have hr=None or 0 → TIZ returns None (omitted from context)
#   - Fewer than 50% of split seconds have HR data → TIZ returns None (insufficient coverage)
#   - Mix of HR and null splits with ≥50% coverage → TIZ string included, total timed < moving time
#   - All splits have valid HR → total timed = moving time

"""
Coach service — builds analysis context for Pak Har's post-run feedback.

Responsible for:
- HR zone classification (5-zone model, assumed max HR)
- Easy-run vs. HR zone mismatch detection
- HR fatigue trend across comparable recent runs
- Final context string assembly for the ANALYSIS_PROMPT
"""

import json as _json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models.activity import Activity
from services.ollama import build_voice_modifier, format_pace
from services.streaming import complete_event, error_event, progress_event, token_event

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


# ---------------------------------------------------------------------------
# Time-in-zone helper
# ---------------------------------------------------------------------------

def _compute_time_in_zones(
    splits: list,
    rhr: int,
    mhr: int,
    streams: dict | None = None,
) -> str | None:
    """
    Compute time spent in each HR zone using Karvonen formula.

    Prefers per-second streams data when available (matching the frontend
    HR zone card exactly). Falls back to per-km splits with averaged HR,
    which is an approximation — a km that crosses a zone boundary is
    assigned entirely to whichever zone its average HR lands in.

    Returns None silently when HR coverage is insufficient.
    """
    def _fmt(seconds: float) -> str:
        m, s = divmod(int(seconds), 60)
        return f"{m}:{s:02d}"

    zone_seconds: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0}

    # --- Streams path (per-second, matches frontend computeHrZonesFromStreams) ---
    if streams and streams.get("hr") and streams.get("time") and streams.get("n", 0) > 0:
        hr_arr: list = streams["hr"]
        time_arr: list = streams["time"]
        n: int = streams["n"]
        avg_stride = time_arr[-1] / (n - 1) if n > 1 else 1.0
        total = 0.0

        for i in range(n):
            hr = hr_arr[i]
            if hr is None:
                continue
            duration = (time_arr[i + 1] - time_arr[i]) if i < n - 1 else avg_stride
            if duration <= 0:
                continue
            zone_num, _ = classify_hr_zone(int(round(hr)), mhr, rhr)
            zone_seconds[zone_num] += duration
            total += duration

        if total == 0:
            return None

        zone_parts = " | ".join(f"Z{z} {_fmt(zone_seconds[z])}" for z in range(1, 6))
        return (
            f"Time in zone: {zone_parts}\n"
            f"Total timed: {_fmt(total)} (per-second streams)"
        )

    # --- Splits fallback (per-km averaged HR) ---
    timed_seconds: float = 0.0
    total_split_seconds: float = 0.0

    for split in splits:
        mt = split.get("moving_time") or 0
        total_split_seconds += mt
        hr = split.get("hr")
        if hr is None or hr == 0:
            continue
        zone_num, _ = classify_hr_zone(int(round(hr)), mhr, rhr)
        zone_seconds[zone_num] += mt
        timed_seconds += mt

    if timed_seconds == 0:
        return None

    if total_split_seconds > 0 and timed_seconds / total_split_seconds < 0.50:
        return None

    zone_parts = " | ".join(f"Z{z} {_fmt(zone_seconds[z])}" for z in range(1, 6))
    return (
        f"Time in zone: {zone_parts}\n"
        f"Total timed: {_fmt(timed_seconds)} (of {_fmt(total_split_seconds)} moving time)"
    )


# ---------------------------------------------------------------------------
# Cardiac drift helper
# ---------------------------------------------------------------------------

_CARDIAC_DRIFT_MIN_SPLITS: int = 4
_CARDIAC_DRIFT_SIGNIFICANT_PCT: float = 5.0
_PACE_DEGRADATION_THRESHOLD_PCT: float = 5.0


def _compute_cardiac_drift(splits: list[dict]) -> str | None:
    """
    Detect cardiac drift from per-km split data.

    Cardiac drift is the phenomenon of HR rising while pace remains roughly
    constant — a sign of dehydration or working beyond current aerobic
    capacity. Coaches commonly flag >5% HR drift as significant.

    The run is divided into thirds by index. HR and pace averages are taken
    from the first and last thirds. Only splits with both non-null hr and
    non-null avg_speed_ms are included. At least 4 such splits are required.

    Pace is derived from avg_speed_ms: pace_min_per_km = 1000 / (speed_ms * 60)
    so a higher pace value means slower running (min/km rises as you slow down).

    Args:
        splits: List of per-km split dicts with keys: hr (nullable),
                avg_speed_ms (nullable), and any other split fields.

    Returns:
        A plain-text string describing the cardiac drift finding, or None when
        drift is between 0–5% (unremarkable) or data is insufficient.
    """
    valid = [
        s for s in splits
        if s.get("hr") is not None and s.get("avg_speed_ms") is not None and s["avg_speed_ms"] > 0
    ]
    if len(valid) < _CARDIAC_DRIFT_MIN_SPLITS:
        return None

    third = len(valid) // 3
    first_third = valid[:third]
    last_third = valid[len(valid) - third:]

    first_avg_hr = sum(s["hr"] for s in first_third) / len(first_third)
    last_avg_hr = sum(s["hr"] for s in last_third) / len(last_third)

    first_avg_pace = sum(1000 / (s["avg_speed_ms"] * 60) for s in first_third) / len(first_third)
    last_avg_pace = sum(1000 / (s["avg_speed_ms"] * 60) for s in last_third) / len(last_third)

    drift_pct = (last_avg_hr - first_avg_hr) / first_avg_hr * 100
    pace_drift_pct = (last_avg_pace - first_avg_pace) / first_avg_pace * 100

    first_hr = round(first_avg_hr)
    last_hr = round(last_avg_hr)

    if drift_pct >= _CARDIAC_DRIFT_SIGNIFICANT_PCT:
        if pace_drift_pct < _PACE_DEGRADATION_THRESHOLD_PCT:
            # Pace held, HR climbed — classic cardiac drift
            pace_str = format_pace(first_avg_pace)
            return (
                f"Cardiac drift: +{drift_pct:.1f}% (HR first third avg {first_hr} bpm "
                f"→ last third avg {last_hr} bpm, pace held at ~{pace_str}/km). "
                f"HR climbing while pace held is cardiac drift — sign of dehydration "
                f"or working beyond current aerobic capacity."
            )
        else:
            # Both HR and pace degraded — fatigue accumulation
            first_pace_str = format_pace(first_avg_pace)
            last_pace_str = format_pace(last_avg_pace)
            return (
                f"Cardiac drift: +{drift_pct:.1f}% (HR first third avg {first_hr} bpm "
                f"→ last third avg {last_hr} bpm, pace also dropped from "
                f"~{first_pace_str} to ~{last_pace_str}/km). Both HR and pace degraded "
                f"— fatigue accumulation or insufficient recovery before this run."
            )

    if drift_pct < 0:
        abs_drift = abs(drift_pct)
        return (
            f"Cardiac efficiency: HR dropped {abs_drift:.1f}% while pace held "
            f"— well-paced warm-up or good aerobic conditioning for this effort."
        )

    # Drift 0–5%: unremarkable
    return None


# ---------------------------------------------------------------------------
# Efficiency factor helper
# ---------------------------------------------------------------------------

_EF_MIN_RECENT_ACTIVITIES: int = 2
_EF_MAX_RECENT_ACTIVITIES: int = 4
_EF_SIGNIFICANT_CHANGE_PCT: float = 3.0


def _compute_efficiency_factor(
    activity: Activity,
    recent_activities: list[Activity],
) -> str | None:
    """
    Compute the efficiency factor (speed per heartbeat) for the current run
    and compare it against the user's recent activity baseline.

    EF = speed_ms / average_hr

    Where speed_ms is derived from the activity's overall distance and
    moving time: speed_ms = distance_km * 1000 / moving_time_seconds.

    An improving EF signals aerobic fitness building — the runner is moving
    faster per heartbeat. A declining EF signals they are working harder to
    cover the same distance, indicating fatigue or declining fitness.

    Only meaningful when average_hr is not None and > 0.

    Args:
        activity: The Activity being analyzed.
        recent_activities: The user's other recent activities, ordered by
                           activity_date descending. The current activity
                           should be excluded from this list.

    Returns:
        A plain-text string describing the EF trend, or None when the change
        is within -3% to +3% (stable) or there is insufficient data.
    """
    if activity.average_hr is None or activity.average_hr == 0:
        return None

    current_speed_ms = activity.distance_km * 1000 / activity.moving_time_seconds
    current_ef = current_speed_ms / activity.average_hr

    recent_efs: list[float] = []
    for a in recent_activities:
        if a.average_hr is None or a.average_hr == 0:
            continue
        speed_ms = a.distance_km * 1000 / a.moving_time_seconds
        recent_efs.append(speed_ms / a.average_hr)
        if len(recent_efs) >= _EF_MAX_RECENT_ACTIVITIES:
            break

    if len(recent_efs) < _EF_MIN_RECENT_ACTIVITIES:
        return None

    avg_recent_ef = sum(recent_efs) / len(recent_efs)
    change_pct = (current_ef - avg_recent_ef) / avg_recent_ef * 100

    if change_pct > _EF_SIGNIFICANT_CHANGE_PCT:
        return (
            f"Efficiency factor: {current_ef:.4f} (speed/HR) — up {change_pct:.1f}% "
            f"vs recent average ({avg_recent_ef:.4f}). Aerobic fitness is building at this distance."
        )

    if change_pct < -_EF_SIGNIFICANT_CHANGE_PCT:
        return (
            f"Efficiency factor: {current_ef:.4f} (speed/HR) — down {abs(change_pct):.1f}% "
            f"vs recent average ({avg_recent_ef:.4f}). Running harder to cover the same distance "
            f"— fatigue or declining fitness."
        )

    # -3% to +3%: stable, not worth reporting
    return None


# ---------------------------------------------------------------------------
# Splits formatting
# ---------------------------------------------------------------------------

_MAX_SPLITS: int = 20


def _format_splits_context(splits: list[dict]) -> str:
    """
    Format per-km split data into a human-readable table for the analysis prompt.

    Converts avg_speed_ms to min/km pace, doubles Strava's half-cadence value,
    and omits HR or cadence columns entirely when all splits have null values
    for that field. Caps at _MAX_SPLITS entries.

    Each split dict is expected to have:
        km, moving_time, distance, avg_speed_ms, hr (nullable),
        cad (nullable), elev (nullable)

    Args:
        splits: List of per-km split dicts from Activity.splits.

    Returns:
        A plain-text multi-line string ready to inject into the prompt.
    """
    if not splits:
        return "(not available)"

    capped = splits[:_MAX_SPLITS]

    all_hr_null = all(s.get("hr") is None for s in capped)
    all_cad_null = all(s.get("cad") is None for s in capped)

    lines: list[str] = ["Per-km splits:"]
    for s in capped:
        km = s.get("km", "?")
        avg_speed_ms = s.get("avg_speed_ms")
        if avg_speed_ms and avg_speed_ms > 0:
            pace_str = format_pace(1000 / (avg_speed_ms * 60))
        else:
            pace_str = "--:--"

        parts = [f"km {km} — {pace_str}/km"]

        if not all_hr_null:
            hr_val = s.get("hr")
            parts.append(f"HR {round(hr_val) if hr_val is not None else '—'} bpm")

        if not all_cad_null:
            cad_val = s.get("cad")
            if cad_val is not None:
                parts.append(f"Cad {round(cad_val * 2)} spm")
            else:
                parts.append("Cad — spm")

        elev_val = s.get("elev")
        if elev_val is not None:
            parts.append(f"Elev {int(elev_val):+d}m")

        lines.append("  " + " | ".join(parts))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Historical analyses formatting
# ---------------------------------------------------------------------------

_MAX_HISTORICAL: int = 3
_HISTORICAL_TRUNCATE: int = 300


def _format_historical_context(recent_analyses: list[tuple[str, float, str]]) -> str:
    """
    Format a list of previous run analyses into a brief reference block.

    Each entry is a (date_str, distance_km, analysis_text) tuple.
    At most _MAX_HISTORICAL entries are included. Analysis text is truncated
    to _HISTORICAL_TRUNCATE characters.

    Args:
        recent_analyses: List of (date_str, distance_km, analysis_text) tuples,
                         ordered by date descending (most recent first).

    Returns:
        A plain-text multi-line string, or "(not available)" if the list is empty.
    """
    if not recent_analyses:
        return "(not available)"

    lines: list[str] = ["Recent run history (Pak Har's previous assessments):"]
    for date_str, distance_km, analysis_text in recent_analyses[:_MAX_HISTORICAL]:
        truncated = analysis_text[:_HISTORICAL_TRUNCATE]
        if len(analysis_text) > _HISTORICAL_TRUNCATE:
            truncated += "..."
        lines.append(f"  {date_str}, {distance_km:.1f} km: {truncated}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Weekly review formatting
# ---------------------------------------------------------------------------

_WEEKLY_REVIEW_TRUNCATE: int = 500


# ---------------------------------------------------------------------------
# RPE helpers
# ---------------------------------------------------------------------------

def _rpe_label(rpe: int) -> str:
    """
    Map an RPE integer (1–10) to a descriptive label.

    Args:
        rpe: Rate of Perceived Exertion, 1–10.

    Returns:
        A plain-text label string describing the effort band.
    """
    if rpe <= 2:
        return "very easy"
    if rpe <= 4:
        return "light to moderate"
    if rpe <= 6:
        return "somewhat hard"
    if rpe <= 8:
        return "hard to very hard"
    return "maximal"


def build_analysis_context(
    activity: Activity,
    recent_activities: list[Activity],
    resting_hr: int = _DEFAULT_RHR,
    max_hr_observed: int | None = None,
    max_hr: int | None = None,
    splits: list[dict] | None = None,
    recent_analyses: list[tuple[str, float, str]] | None = None,
    weekly_review: str | None = None,
    planned_session: dict | None = None,
    rpe: int | None = None,
) -> str:
    """
    Build the full context string for Pak Har's post-run analysis prompt.

    Includes basic run data (always), HR zone classification and mismatch
    flags (only when average_hr is not null), an HR trend note (only
    when sufficient comparable runs exist and HR is rising), and optionally:
    per-km splits, previous run analyses, the most recent weekly review,
    and the planned training session for the day of this run.

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
        splits: Optional list of per-km split dicts from Activity.splits.
                When provided and non-empty, a formatted splits table is appended.
        recent_analyses: Optional list of (date_str, distance_km, analysis_text)
                         tuples from previous analyzed runs. At most 3 are used.
        weekly_review: Optional text of the most recent weekly review. Truncated
                       to 500 characters when injected into the context.
        planned_session: Optional dict representing the training plan day that
                         corresponds to this activity's date. Expected keys:
                         type, target, description, duration_minutes. When
                         provided and non-empty, a planned session block is
                         appended so Pak Har can evaluate the run against what
                         was actually planned.
        rpe: Optional Rate of Perceived Exertion (1–10) provided by the runner.
             When present, a perceived effort line is appended after the zone
             boundaries, including an RPE label and — when HR zone data is also
             available — a cross-reference note if RPE and HR zone disagree
             significantly.

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

        hrr = derived_mhr - resting_hr
        zone_ceilings = [
            round(resting_hr + upper_pct * hrr)
            for _, upper_pct, _, _ in _HR_ZONE_PCTS[:-1]
        ]
        lines.append(
            f"Zone boundaries for this runner "
            f"(Karvonen, MHR {derived_mhr} bpm, RHR {resting_hr} bpm): "
            f"Z1 <{zone_ceilings[0]} | "
            f"Z2 {zone_ceilings[0]}–{zone_ceilings[1]} | "
            f"Z3 {zone_ceilings[1]}–{zone_ceilings[2]} | "
            f"Z4 {zone_ceilings[2]}–{zone_ceilings[3]} | "
            f"Z5 >{zone_ceilings[3]} bpm"
        )

        # --- Time in zone — streams preferred, splits as fallback ---
        streams_data = activity.streams if isinstance(activity.streams, dict) else None
        tiz = _compute_time_in_zones(splits, resting_hr, derived_mhr, streams=streams_data)
        if tiz:
            lines.append(tiz)

        # --- RPE section — only when provided and HR data is present ---
        if rpe is not None:
            rpe_label = _rpe_label(rpe)
            lines.append(f"Perceived effort (RPE): {rpe}/10 — {rpe_label}")

            # Cross-reference RPE against HR zone when they disagree significantly.
            zone_label_short = f"Zone {zone_num}"
            if rpe <= 4 and zone_num >= 4:
                lines.append(
                    f"RPE mismatch: runner rated effort {rpe}/10 (light) but HR puts this in "
                    f"{zone_label_short}. Either the effort was not perceived accurately or "
                    f"there is an underlying fatigue or health factor worth noting."
                )
            elif rpe >= 8 and zone_num <= 2:
                zone_label_easy = f"Zone {zone_num}"
                lines.append(
                    f"RPE mismatch: runner rated effort {rpe}/10 (maximal) but HR stayed in "
                    f"{zone_label_easy}. Could indicate poor fitness calibration, heat, "
                    f"dehydration, or poor sleep."
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

        # Efficiency factor trend — only meaningful when HR is available
        ef_signal = _compute_efficiency_factor(activity, recent_activities)
        if ef_signal:
            lines.append(ef_signal)

    # --- RPE without HR — emit perceived effort line when HR data is absent ---
    # (The HR-present branch handles RPE inside the HR block above.)
    if rpe is not None and activity.average_hr is None:
        rpe_label = _rpe_label(rpe)
        lines.append(f"Perceived effort (RPE): {rpe}/10 — {rpe_label}")

    # --- Splits section — only when splits are provided and non-empty ---
    if splits:
        lines.append(_format_splits_context(splits))
        # Cardiac drift — derived from split-level HR + speed data
        cardiac_drift = _compute_cardiac_drift(splits)
        if cardiac_drift:
            lines.append(cardiac_drift)

    # --- Historical analyses — only when entries are provided ---
    if recent_analyses:
        lines.append(_format_historical_context(recent_analyses))

    # --- Weekly review — only when provided ---
    if weekly_review:
        truncated = weekly_review[:_WEEKLY_REVIEW_TRUNCATE]
        if len(weekly_review) > _WEEKLY_REVIEW_TRUNCATE:
            truncated += "..."
        lines.append(f"Most recent weekly review:\n{truncated}")

    # --- Planned session — only when a matching plan day exists ---
    if planned_session:
        session_lines: list[str] = ["Planned session for this day:"]
        if planned_session.get("type"):
            session_lines.append(f"  Type: {planned_session['type']}")
        if planned_session.get("target"):
            session_lines.append(f"  Target: {planned_session['target']}")
        if planned_session.get("description"):
            session_lines.append(f"  Description: {planned_session['description']}")
        if planned_session.get("duration_minutes") is not None:
            session_lines.append(f"  Duration: {planned_session['duration_minutes']} min")
        lines.append("\n".join(session_lines))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Shared analysis pipeline — used by both the HTTP route and background sync
# ---------------------------------------------------------------------------

_VERDICT_TAGS = frozenset({
    "PACED POORLY", "ON PLAN", "HELD THE LINE", "FADED LATE",
    "FUELING", "RESTRAINED", "STEADY", "NO SHOW",
})
_TONES = frozenset({"critical", "good", "neutral"})


async def run_analysis_for_activity(
    activity_id: int, user, db: Session
) -> AsyncGenerator[str, None]:
    """
    Run Pak Har's full post-run analysis for a single activity as an SSE async generator.

    Yields SSE-formatted strings (progress, complete, or error events) that the
    router passes directly to StreamingResponse. Callers must NOT await this
    function — iterate over it instead.

    Stages (a progress event is yielded before each stage's work):
    1. "Pulling your splits"   — fetch activity record, splits, streams, build splits context
    2. "Reading the zones"     — build HR zone context, compute time-in-zones
    3. "Checking your history" — fetch prior analyses, fetch weekly review, fetch planned session
    4. "Writing the dispatch"  — format ANALYSIS_PROMPT + main Ollama streaming call (collected)
    5. "Filing the verdict"    — second non-streaming Ollama call for verdict_short/verdict_tag/tone

    On success: yields complete_event with analysis, verdict_short, verdict_tag, tone.
    DB write (saving to the Activity row) happens after the complete_event yield.

    On any exception: yields error_event(str(exc)) and returns.

    Does NOT call check_rate_limit() — rate limiting is the caller's responsibility.

    Args:
        activity_id: Primary key of the Activity to analyze.
        user: User ORM instance owning the activity.
        db: Active database session.

    Yields:
        SSE-formatted strings ready to be sent over text/event-stream.
    """
    # Lazy imports to avoid circular dependencies at module load time.
    from config import settings
    from models.training_plan import TrainingPlan
    from models.weekly_review import WeeklyReview
    from prompts.pak_har import ANALYSIS_PROMPT
    from services.ollama import (
        build_user_preferences_context,
        OLLAMA_BASE_URL,
        _CONNECT_TIMEOUT,
        _READ_TIMEOUT,
    )

    started_at = time.monotonic()

    try:
        # -----------------------------------------------------------------
        # Stage 1 — Pulling your splits
        # -----------------------------------------------------------------
        yield progress_event("Pulling your splits", started_at)

        activity = (
            db.query(Activity)
            .filter(
                Activity.id == activity_id,
                Activity.user_id == user.id,
            )
            .first()
        )
        if not activity:
            logger.warning(
                "run_analysis_for_activity: activity_id=%d not found for user_id=%d — skipping",
                activity_id,
                user.id,
            )
            yield error_event(f"Activity {activity_id} not found.")
            return

        # Fetch recent activities for HR trend detection (excluding current).
        recent_activities = (
            db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.id != activity_id,
                Activity.sync_status == "synced",
            )
            .order_by(Activity.activity_date.desc())
            .limit(20)
            .all()
        )

        splits = activity.splits or []
        splits_context = _format_splits_context(splits) if splits else "(not available)"

        # -----------------------------------------------------------------
        # Stage 2 — Reading the zones
        # -----------------------------------------------------------------
        yield progress_event("Reading the zones", started_at)

        # Build run context string (includes HR zone classification + time-in-zones).
        run_context = build_analysis_context(
            activity,
            recent_activities,
            resting_hr=user.resting_hr or 60,
            max_hr_observed=user.max_hr_observed,
            max_hr=user.max_hr,
            splits=splits,
            # Analyses and plan data are added in stage 3 — pass None here so context
            # is assembled incrementally. The full context is rebuilt in stage 4 once
            # all data is in hand.
        )

        # HR zone context lines extracted from the run context.
        if activity.average_hr is not None:
            hr_zone_context = "\n".join(
                line for line in run_context.splitlines()
                if any(
                    keyword in line.lower()
                    for keyword in ("heart rate", "hr zone", "mismatch", "hr trend", "fatigue")
                )
            ) or "(HR data present but no zone lines extracted — check build_analysis_context)"
        else:
            hr_zone_context = "(no heart rate data for this run)"

        # -----------------------------------------------------------------
        # Stage 3 — Checking your history
        # -----------------------------------------------------------------
        yield progress_event("Checking your history", started_at)

        # Fetch last 3 previously-analyzed activities for historical context.
        recent_analyzed = (
            db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.id != activity_id,
                Activity.analysis.isnot(None),
            )
            .order_by(Activity.activity_date.desc())
            .limit(3)
            .all()
        )
        recent_analyses: list[tuple[str, float, str]] = [
            (
                a.activity_date.date().isoformat(),
                a.distance_km,
                a.analysis,
            )
            for a in recent_analyzed
            if a.analysis
        ]

        # Fetch most recent weekly review.
        latest_review = (
            db.query(WeeklyReview)
            .filter(WeeklyReview.user_id == user.id)
            .order_by(WeeklyReview.created_at.desc())
            .first()
        )
        weekly_review_text: str | None = latest_review.review_text if latest_review else None

        # Look up active training plan day matching this activity's date.
        active_plan = (
            db.query(TrainingPlan)
            .filter(
                TrainingPlan.user_id == user.id,
                TrainingPlan.is_active == True,  # noqa: E712
            )
            .order_by(TrainingPlan.created_at.desc())
            .first()
        )
        planned_session: dict | None = None
        if active_plan and active_plan.plan_data:
            activity_day = activity.activity_date.strftime("%A").lower()
            planned_session = active_plan.plan_data.get(activity_day)

        # -----------------------------------------------------------------
        # Stage 4 — Writing the dispatch (main Ollama streaming call)
        # -----------------------------------------------------------------
        yield progress_event("Writing the dispatch", started_at)

        # Rebuild full context now that all data is in hand.
        full_run_context = build_analysis_context(
            activity,
            recent_activities,
            resting_hr=user.resting_hr or 60,
            max_hr_observed=user.max_hr_observed,
            max_hr=user.max_hr,
            splits=splits,
            recent_analyses=recent_analyses,
            weekly_review=weekly_review_text,
            planned_session=planned_session,
            rpe=activity.rpe,
        )

        # Format remaining context sections for prompt placeholders.
        historical_context = (
            _format_historical_context(recent_analyses) if recent_analyses else "(not available)"
        )
        if weekly_review_text:
            truncated_review = weekly_review_text[:_WEEKLY_REVIEW_TRUNCATE]
            if len(weekly_review_text) > _WEEKLY_REVIEW_TRUNCATE:
                truncated_review += "..."
            weekly_review_context = truncated_review
        else:
            weekly_review_context = "(not available)"

        if planned_session:
            plan_lines: list[str] = []
            if planned_session.get("type"):
                plan_lines.append(f"  Type: {planned_session['type']}")
            if planned_session.get("target"):
                plan_lines.append(f"  Target: {planned_session['target']}")
            if planned_session.get("description"):
                plan_lines.append(f"  Description: {planned_session['description']}")
            if planned_session.get("duration_minutes") is not None:
                plan_lines.append(f"  Duration: {planned_session['duration_minutes']} min")
            planned_session_context = (
                "\n".join(plan_lines) if plan_lines else "(no training plan active for this week)"
            )
        else:
            planned_session_context = "(no training plan active for this week)"

        # Assemble system prompt.
        user_preferences = build_user_preferences_context(user)
        system_content = ANALYSIS_PROMPT.format(
            run_context=full_run_context,
            hr_zone_context=hr_zone_context,
            planned_session_context=planned_session_context,
            splits_context=splits_context,
            historical_context=historical_context,
            weekly_review_context=weekly_review_context,
            user_preferences=user_preferences,
            voice_modifier=build_voice_modifier(user.coach_voice),
        )

        payload = {
            "model": settings.get_ollama_model(),
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": "Give me your analysis of this run."},
            ],
            "stream": True,
        }

        url = f"{OLLAMA_BASE_URL}/api/chat"
        logger.info(
            "run_analysis_for_activity: requesting Ollama analysis for activity_id=%d user_id=%d",
            activity_id,
            user.id,
        )

        # Stream response from Ollama, collect into full_analysis.
        chunks: list[str] = []
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=10.0, pool=5.0
            )
        ) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = _json.loads(line)
                    except _json.JSONDecodeError:
                        logger.warning(
                            "run_analysis_for_activity: non-JSON line from Ollama "
                            "(activity_id=%d) — skipping",
                            activity_id,
                        )
                        continue
                    if data.get("done"):
                        break
                    content = data.get("message", {}).get("content")
                    if content:
                        chunks.append(content)
                        yield token_event(content)

        full_analysis = "".join(chunks)

        logger.info(
            "run_analysis_for_activity: analysis collected for activity_id=%d user_id=%d (%d chars)",
            activity_id,
            user.id,
            len(full_analysis),
        )

        # -----------------------------------------------------------------
        # Stage 5 — Filing the verdict (structured extraction, best-effort)
        # -----------------------------------------------------------------
        yield progress_event("Filing the verdict", started_at)

        verdict_short: str | None = None
        verdict_tag: str | None = None
        tone: str | None = None

        if full_analysis.strip():
            extraction_payload = {
                "model": settings.get_ollama_model(),
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a JSON extractor. Output only valid JSON, no markdown.",
                    },
                    {
                        "role": "user",
                        "content": (
                            "Given this running analysis:\n"
                            "---\n"
                            f"{full_analysis}\n"
                            "---\n\n"
                            "Extract three fields:\n"
                            "1. verdict_short: One sentence, max 12 words, summarising what this run showed. "
                            "No praise, no fluff.\n"
                            "2. verdict_tag: Pick exactly one from this list: "
                            "PACED POORLY | ON PLAN | HELD THE LINE | FADED LATE | "
                            "FUELING | RESTRAINED | STEADY | NO SHOW\n"
                            "3. tone: Pick exactly one: critical | good | neutral\n\n"
                            'Respond with only valid JSON: {"verdict_short": "...", "verdict_tag": "...", "tone": "..."}'
                        ),
                    },
                ],
                "stream": False,
            }

            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(
                        connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=10.0, pool=5.0
                    )
                ) as client:
                    extraction_response = await client.post(url, json=extraction_payload)
                    extraction_response.raise_for_status()
                    extraction_data = extraction_response.json()

                raw_content: str = (
                    extraction_data.get("message", {}).get("content", "")
                    or extraction_data.get("response", "")
                ).strip()

                parsed = _json.loads(raw_content)

                raw_verdict_short = parsed.get("verdict_short")
                raw_verdict_tag = parsed.get("verdict_tag")
                raw_tone = parsed.get("tone")

                verdict_short = str(raw_verdict_short).strip() if raw_verdict_short else None
                verdict_tag = (
                    str(raw_verdict_tag).strip().upper()
                    if raw_verdict_tag and str(raw_verdict_tag).strip().upper() in _VERDICT_TAGS
                    else None
                )
                tone = (
                    str(raw_tone).strip().lower()
                    if raw_tone and str(raw_tone).strip().lower() in _TONES
                    else None
                )

                logger.info(
                    "run_analysis_for_activity: verdict extracted for activity_id=%d: tag=%r tone=%r",
                    activity_id,
                    verdict_tag,
                    tone,
                )

            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "run_analysis_for_activity: verdict extraction failed for activity_id=%d: %s",
                    activity_id,
                    exc,
                )
                verdict_short = None
                verdict_tag = None
                tone = None
        else:
            logger.warning(
                "run_analysis_for_activity: skipping verdict extraction for activity_id=%d "
                "— analysis text is empty",
                activity_id,
            )

        # -----------------------------------------------------------------
        # Emit complete event — DB write is fire-and-forget after yield
        # -----------------------------------------------------------------
        yield complete_event({
            "analysis": full_analysis,
            "verdict_short": verdict_short,
            "verdict_tag": verdict_tag,
            "tone": tone,
        })

        # Persist analysis + verdict fields after yielding the complete event.
        activity.analysis = full_analysis
        activity.analysis_generated_at = datetime.now(timezone.utc)
        activity.verdict_short = verdict_short
        activity.verdict_tag = verdict_tag
        activity.tone = tone
        db.commit()
        db.refresh(activity)

        logger.info(
            "run_analysis_for_activity: persisted analysis+verdict for activity_id=%d user_id=%d",
            activity_id,
            user.id,
        )

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "run_analysis_for_activity: unhandled error for activity_id=%d user_id=%d: %s",
            activity_id,
            user.id,
            exc,
        )
        yield error_event(str(exc))

"""
Insights service — aggregated multi-week trend stats and Pak Har commentary.

This module:
1. Queries Activity records for the past 6 weeks (42 days).
2. Computes trend stats: avg weekly km, avg pace, pace trend, consistency.
3. Builds a structured prompt for Pak Har and calls Ollama (non-streaming).
4. Returns an InsightsRead-ready dict for the router to return.

All data is scoped to a single user; the router passes user_id.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from sqlalchemy.orm import Session

from config import settings
from models.activity import Activity
from models.user import User
from schemas.insights import InsightsRead
from services.ollama import OLLAMA_BASE_URL, _CONNECT_TIMEOUT, _READ_TIMEOUT

logger = logging.getLogger(__name__)

# Seconds-per-km threshold that separates "stable" from directional pace trends.
_PACE_TREND_THRESHOLD_SECONDS: float = 3.0


def _iso_week_key(dt: datetime) -> str:
    """Return 'YYYY-WNN' string for the ISO week containing *dt*."""
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _compute_avg_pace(activities: list[Activity]) -> float | None:
    """
    Compute the weighted-average pace (min/km) across a list of activities.

    Weights each activity's pace by its distance so longer runs influence the
    average proportionally. Activities with distance_km <= 0 are excluded.

    Returns None if no valid activities are present.
    """
    total_seconds = 0.0
    total_km = 0.0
    for act in activities:
        if act.distance_km > 0:
            total_seconds += act.moving_time_seconds
            total_km += act.distance_km
    if total_km == 0:
        return None
    return (total_seconds / total_km) / 60.0  # seconds → minutes per km


def compute_insights_stats(
    activities: list[Activity],
) -> tuple[int, float, float, Literal["improving", "declining", "stable"], int]:
    """
    Derive aggregated trend stats from a list of Activity records.

    Args:
        activities: All synced Activity records in the 6-week analysis window,
                    ordered however — the function does its own grouping.

    Returns:
        A tuple of:
            weeks_analyzed   — distinct ISO weeks with ≥ 1 run
            avg_weekly_km    — rounded to 1 decimal
            avg_pace_min_per_km — rounded to 2 decimal
            pace_trend       — "improving" | "declining" | "stable"
            consistency_pct  — integer 0–100

    Raises:
        ValueError: If activities is empty (caller should guard with a 404 before
                    calling this function).
    """
    if not activities:
        raise ValueError("No activities provided — cannot compute insights.")

    # --- Weekly grouping -------------------------------------------------
    week_to_activities: dict[str, list[Activity]] = {}
    for act in activities:
        key = _iso_week_key(act.activity_date)
        week_to_activities.setdefault(key, []).append(act)

    weeks_analyzed = len(week_to_activities)

    # --- avg_weekly_km ---------------------------------------------------
    total_km = sum(act.distance_km for act in activities)
    avg_weekly_km = round(total_km / weeks_analyzed, 1)

    # --- avg_pace_min_per_km (weighted) ----------------------------------
    avg_pace_raw = _compute_avg_pace(activities)
    avg_pace_min_per_km = round(avg_pace_raw, 2) if avg_pace_raw is not None else 0.0

    # --- pace_trend (first half vs second half of the 6-week window) -----
    # Sort activities chronologically, split into two halves by date order.
    sorted_acts = sorted(activities, key=lambda a: a.activity_date)
    mid = len(sorted_acts) // 2
    first_half = sorted_acts[:mid]
    second_half = sorted_acts[mid:]

    first_pace = _compute_avg_pace(first_half)
    second_pace = _compute_avg_pace(second_half)

    if first_pace is not None and second_pace is not None:
        # Convert to seconds/km for threshold comparison
        diff_seconds = (second_pace - first_pace) * 60.0  # positive = slower in 2nd half
        if diff_seconds < -(_PACE_TREND_THRESHOLD_SECONDS):
            pace_trend: Literal["improving", "declining", "stable"] = "improving"
        elif diff_seconds > _PACE_TREND_THRESHOLD_SECONDS:
            pace_trend = "declining"
        else:
            pace_trend = "stable"
    else:
        pace_trend = "stable"

    # --- consistency_pct -------------------------------------------------
    consistency_pct = round((weeks_analyzed / 6) * 100)

    return weeks_analyzed, avg_weekly_km, avg_pace_min_per_km, pace_trend, consistency_pct


def _build_weekly_km_breakdown(activities: list[Activity]) -> str:
    """
    Return a human-readable weekly km breakdown string for the Pak Har prompt.

    Example output:
        Week 2026-W16: 18.0 km (3 runs)
        Week 2026-W17: 22.5 km (4 runs)
    """
    week_to_activities: dict[str, list[Activity]] = {}
    for act in activities:
        key = _iso_week_key(act.activity_date)
        week_to_activities.setdefault(key, []).append(act)

    lines: list[str] = []
    for week_key in sorted(week_to_activities.keys()):
        acts = week_to_activities[week_key]
        total = sum(a.distance_km for a in acts)
        count = len(acts)
        lines.append(f"  {week_key}: {total:.1f} km ({count} run{'s' if count != 1 else ''})")
    return "\n".join(lines)


def _build_pak_har_insights_prompt(
    weeks_analyzed: int,
    avg_weekly_km: float,
    avg_pace_min_per_km: float,
    pace_trend: str,
    consistency_pct: int,
    weekly_km_breakdown: str,
    weekly_km_target: float,
    biggest_struggle: str | None,
) -> str:
    """
    Construct the user-turn prompt fed to Pak Har for the insights commentary.

    Pak Har's system prompt governs voice rules. This prompt provides the data
    and explicit constraints (2–3 sentences, one directive, no cheerleading).
    """
    struggle_line = (
        f"The runner has said their biggest struggle is: {biggest_struggle}."
        if biggest_struggle
        else "The runner has not identified a specific struggle."
    )

    target_line = (
        f"Their weekly km target is {weekly_km_target:.1f} km."
        if weekly_km_target > 0
        else "They have not set a weekly km target."
    )

    pace_trend_descriptions = {
        "improving": "faster in the second half of the window than the first",
        "declining": "slower in the second half of the window than the first",
        "stable": "roughly consistent across the window",
    }
    trend_description = pace_trend_descriptions.get(pace_trend, pace_trend)

    return f"""You are reviewing {weeks_analyzed} weeks of running data for this runner.

Stats:
- Average weekly km: {avg_weekly_km} km
- Average pace: {avg_pace_min_per_km:.2f} min/km
- Pace trend: {pace_trend} ({trend_description})
- Consistency: {consistency_pct}% of the last 6 weeks had at least one run
{target_line}
{struggle_line}

Weekly breakdown:
{weekly_km_breakdown}

Give a 2–3 sentence honest assessment of what these trends actually mean. Name specific numbers — \
not "your pace has been inconsistent" but "your pace dropped X seconds per km over 6 weeks". \
End with exactly one concrete directive: "do X for Y weeks." No cheerleading. No vague advice. \
No exclamation points. No emojis. Stop after the directive."""


async def generate_insights(user: User, db: Session) -> InsightsRead:
    """
    Compute multi-week trend stats and generate Pak Har's insights commentary.

    Queries the last 42 days of synced Activity records for the given user,
    computes aggregated stats, builds a prompt, calls Ollama (non-streaming),
    and returns an InsightsRead-compatible object.

    Args:
        user: Authenticated User ORM object (provides id and preference fields).
        db:   Active database session.

    Returns:
        InsightsRead populated with stats and pak_har_commentary.

    Raises:
        ValueError:   Fewer than 2 distinct ISO weeks with activity data.
        RuntimeError: Ollama is unreachable.
        TimeoutError: Ollama did not begin responding within the read timeout.
    """
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(days=42)

    activities: list[Activity] = (
        db.query(Activity)
        .filter(
            Activity.user_id == user.id,
            Activity.activity_date >= cutoff.replace(tzinfo=None),
            Activity.sync_status == "synced",
            Activity.distance_km > 0,
        )
        .order_by(Activity.activity_date.asc())
        .all()
    )

    # --- Guard: need at least 2 distinct weeks ---------------------------
    distinct_weeks: set[str] = {_iso_week_key(a.activity_date) for a in activities}
    if len(distinct_weeks) < 2:
        raise ValueError(
            f"Only {len(distinct_weeks)} week(s) of data found — need at least 2."
        )

    # --- Compute stats ---------------------------------------------------
    weeks_analyzed, avg_weekly_km, avg_pace_min_per_km, pace_trend, consistency_pct = (
        compute_insights_stats(activities)
    )

    # --- Build Pak Har prompt --------------------------------------------
    weekly_km_breakdown = _build_weekly_km_breakdown(activities)
    prompt_text = _build_pak_har_insights_prompt(
        weeks_analyzed=weeks_analyzed,
        avg_weekly_km=avg_weekly_km,
        avg_pace_min_per_km=avg_pace_min_per_km,
        pace_trend=pace_trend,
        consistency_pct=consistency_pct,
        weekly_km_breakdown=weekly_km_breakdown,
        weekly_km_target=user.weekly_km_target or 0.0,
        biggest_struggle=user.biggest_struggle,
    )

    system_content = (
        "You are Pak Har. You are 70 years old. You have been running since before GPS existed. "
        "You are blunt, specific, and never give vague advice. No emojis. No hollow affirmations. "
        "No exclamation points. Say exactly what the data shows, name the numbers, give one "
        "concrete directive, then stop."
    )

    payload: dict = {
        "model": settings.get_ollama_model(),
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt_text},
        ],
        "stream": False,
    }

    url = f"{OLLAMA_BASE_URL}/api/chat"
    logger.info(
        "Requesting insights commentary from Ollama for user_id=%d "
        "(%d activities, %d weeks)",
        user.id,
        len(activities),
        weeks_analyzed,
    )

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=10.0, pool=5.0
            )
        ) as client:
            response = await client.post(url, json=payload)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Ollama returned %d during insights for user_id=%d",
                    exc.response.status_code,
                    user.id,
                )
                raise RuntimeError(
                    f"Ollama returned {exc.response.status_code}. "
                    f"Make sure the model is available: "
                    f"ollama pull {settings.get_ollama_model()}"
                ) from exc

            data = response.json()
            pak_har_commentary: str = (
                data.get("message", {}).get("content", "").strip()
            )

    except httpx.ConnectError as exc:
        logger.error("Ollama unreachable during insights for user_id=%d", user.id)
        raise RuntimeError(
            "Pak Har is unavailable right now. Make sure Ollama is running."
        ) from exc
    except httpx.ReadTimeout as exc:
        logger.error("Ollama timeout during insights for user_id=%d", user.id)
        raise TimeoutError("Pak Har took too long to respond.") from exc

    logger.info(
        "Insights commentary generated for user_id=%d (%d chars)",
        user.id,
        len(pak_har_commentary),
    )

    return InsightsRead(
        weeks_analyzed=weeks_analyzed,
        avg_weekly_km=avg_weekly_km,
        avg_pace_min_per_km=avg_pace_min_per_km,
        pace_trend=pace_trend,
        consistency_pct=consistency_pct,
        pak_har_commentary=pak_har_commentary,
        generated_at=now_utc,
    )

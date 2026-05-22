"""
Weekly review generation service.

Builds Pak Har's weekly planned-vs-actual assessment for the current user.
Queries the active TrainingPlan for planned run count, counts Activity records
for actual runs this week, calls Ollama non-streaming, and persists the result.

generate_weekly_review is an async generator that yields SSE-formatted strings.
The router wraps it in StreamingResponse — callers must NOT await it directly.
"""

import json as _json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from config import settings
from models.activity import Activity
from models.training_plan import TrainingPlan
from models.user import User
from models.weekly_review import WeeklyReview
from prompts.pak_har import REVIEW_PROMPT
from services.coach import classify_hr_zone
from services.coach import FALLBACK_MAX_HR as _FALLBACK_MAX_HR, DEFAULT_RHR as _DEFAULT_RHR
from services.ollama import (
    OLLAMA_BASE_URL,
    CONNECT_TIMEOUT,
    READ_TIMEOUT,
    build_user_preferences_context,
    build_voice_modifier,
    format_pace,
)
from services.streaming import complete_event, error_event, progress_event, token_event

# Day name lookup — weekday() returns 0=Monday … 6=Sunday
_WEEKDAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]

# Fixed verdict tag set for weekly reviews — only these values are accepted.
_WEEKLY_VERDICT_TAGS = frozenset({
    "STRONG WEEK", "ON PLAN", "BUILDING", "LIGHT WEEK",
    "FADING", "MISSED RUNS", "CONSISTENT", "NO RUNS",
})

_TONES = frozenset({"critical", "good", "neutral"})

logger = logging.getLogger(__name__)


def _get_week_monday() -> date:
    """
    Return the Monday of the current week as a date.

    Returns:
        ISO Monday date for the current week.
    """
    today = datetime.now(timezone.utc).date()
    days_since_monday = today.weekday()  # 0 = Monday, 6 = Sunday
    return today - timedelta(days=days_since_monday)


def _count_planned_runs(plan: TrainingPlan | None) -> int:
    """
    Count non-rest days in a TrainingPlan's plan_data.

    Iterates over the 7-day plan_data dict and counts any day whose
    "type" is not "rest". This gives the number of runs Pak Har intended
    for the week.

    Args:
        plan: The active TrainingPlan ORM object, or None when no plan exists.

    Returns:
        Integer count of non-rest days, or 0 when plan is None.
    """
    if plan is None:
        return 0
    plan_data: dict = plan.plan_data or {}
    return sum(
        1 for day_data in plan_data.values()
        if isinstance(day_data, dict) and day_data.get("type", "rest") != "rest"
    )


def _compute_total_km(activities: list[Activity]) -> float:
    """
    Sum distance_km across all activities.

    Args:
        activities: List of Activity ORM objects.

    Returns:
        Total km as a float. Returns 0.0 when the list is empty.
    """
    return sum(a.distance_km for a in activities)


def _format_km_target(user_weekly_km_target: float | None) -> str:
    """
    Format the user's weekly km target for prompt injection.

    Args:
        user_weekly_km_target: The stored weekly_km_target, may be None or 0.

    Returns:
        A string like "30.0 km" or "not set".
    """
    if not user_weekly_km_target:
        return "not set"
    return f"{user_weekly_km_target:.1f} km"


def _compute_remaining_sessions(
    active_plan: TrainingPlan | None,
    week_activities: list[Activity],
    week_start: date,
    today: date,
) -> str:
    """
    Return planned non-rest days from today onwards that haven't been run yet.

    "Today onwards" means date >= today. If today has a planned session but
    no run yet, it is included (the day isn't over).

    Args:
        active_plan: The user's active TrainingPlan, or None.
        week_activities: Activity records for the current week.
        week_start: Monday of the current week.
        today: Today's date (UTC).

    Returns:
        A comma-separated string of day names (e.g. "Thursday, Saturday"),
        "none" if all remaining days are rest or already have a run, or
        "no plan on file" if no active plan exists.
    """
    if active_plan is None:
        return "no plan on file"

    plan_data: dict = active_plan.plan_data or {}

    # Planned non-rest days — normalised to title-case (e.g. "Monday")
    planned_days: list[str] = [
        day.title()
        for day, day_data in plan_data.items()
        if isinstance(day_data, dict) and day_data.get("type", "rest") != "rest"
    ]

    if not planned_days:
        return "none"

    # Actual run day names from the current week
    actual_day_names: set[str] = {
        _WEEKDAY_NAMES[a.activity_date.weekday()]
        for a in week_activities
    }

    # Include a day if its date is >= today AND it has no run yet
    day_offset = {name: i for i, name in enumerate(_WEEKDAY_NAMES)}
    remaining = [
        day for day in planned_days
        if day not in actual_day_names
        and (week_start + timedelta(days=day_offset[day])) >= today
    ]

    return ", ".join(sorted(remaining, key=lambda d: _WEEKDAY_NAMES.index(d))) if remaining else "none"


def _compute_missed_days(
    active_plan: TrainingPlan | None,
    week_activities: list[Activity],
    week_start: date,
    today: date,
) -> str:
    """
    Determine which planned non-rest days in the past had no run.

    Only days whose date is strictly before today are considered — future
    sessions in the current week are not counted as missed.

    Args:
        active_plan: The user's active TrainingPlan, or None.
        week_activities: Activity records for the current week.
        week_start: Monday of the current week.
        today: Today's date (UTC).

    Returns:
        A comma-separated string of missed day names (e.g. "Wednesday, Sunday"),
        "none" when all past planned days were covered, or "no plan on file" when
        no active plan exists.
    """
    if active_plan is None:
        return "no plan on file"

    plan_data: dict = active_plan.plan_data or {}

    # Planned non-rest days — normalised to title-case (e.g. "Monday")
    planned_days: list[str] = [
        day.title()
        for day, day_data in plan_data.items()
        if isinstance(day_data, dict) and day_data.get("type", "rest") != "rest"
    ]

    if not planned_days:
        return "none"

    # Actual run day names from the current week
    actual_day_names: set[str] = {
        _WEEKDAY_NAMES[a.activity_date.weekday()]
        for a in week_activities
    }

    # Only flag a day as missed if its date is strictly in the past
    day_offset = {name: i for i, name in enumerate(_WEEKDAY_NAMES)}
    missed = [
        day for day in planned_days
        if day not in actual_day_names
        and (week_start + timedelta(days=day_offset[day])) < today
    ]

    return ", ".join(sorted(missed, key=lambda d: _WEEKDAY_NAMES.index(d))) if missed else "none"


def _compute_prior_week_stats(
    user_id: int,
    week_start: date,
    db: Session,
) -> tuple[int, float, str]:
    """
    Compute run count, total km, and average pace for the previous week.

    Queries Activity records with sync_status='synced' for the 7-day window
    immediately before week_start (i.e. 14–7 days ago).

    Args:
        user_id: The authenticated user's primary key.
        week_start: The Monday of the *current* week.
        db: Active database session.

    Returns:
        A tuple of (run_count, total_km, avg_pace_str) where avg_pace_str is
        a formatted "M:SS" string, or "no data" for all three values when no
        prior-week activities exist.
    """
    prior_start = week_start - timedelta(days=7)
    prior_end = week_start - timedelta(days=1)

    prior_start_dt = datetime(prior_start.year, prior_start.month, prior_start.day, 0, 0, 0)
    prior_end_dt = datetime(prior_end.year, prior_end.month, prior_end.day, 23, 59, 59)

    prior_activities: list[Activity] = (
        db.query(Activity)
        .filter(
            Activity.user_id == user_id,
            Activity.activity_date >= prior_start_dt,
            Activity.activity_date <= prior_end_dt,
            Activity.sync_status == "synced",
        )
        .all()
    )

    if not prior_activities:
        return 0, 0.0, "no data"

    run_count = len(prior_activities)
    total_km = sum(a.distance_km for a in prior_activities)
    paces = [a.average_pace_min_per_km for a in prior_activities if a.average_pace_min_per_km]
    avg_pace_str = format_pace(sum(paces) / len(paces)) if paces else "no data"

    return run_count, total_km, avg_pace_str


def _compute_hr_zone_summary(
    week_activities: list[Activity],
    user_max_hr: int | None,
    user_max_hr_observed: int | None,
    user_resting_hr: int | None,
) -> str:
    """
    Compute HR zone distribution as percentages across all splits in the week.

    Uses the Karvonen formula (identical to coach.py classify_hr_zone).
    Iterates over per-km splits for every activity and accumulates time in each
    zone. Falls back gracefully when no splits or HR data are available.

    Zone boundaries (% of HRR = max_hr - resting_hr):
        Z1 < 60%  |  Z2 60–70%  |  Z3 70–80%  |  Z4 80–90%  |  Z5 ≥ 90%

    The task spec uses a 5-zone model with different boundaries from coach.py's
    _HR_ZONE_PCTS (which are 0–50%, 50–60%, etc.).  Here we use:
        Z1 < 60%  Z2 60–70%  Z3 70–80%  Z4 80–90%  Z5 ≥ 90%
    which is the model called out in TASK-181 spec.  We delegate zone assignment
    to coach.classify_hr_zone (Karvonen) and accept its 5-zone output.

    Args:
        week_activities: Activities in the current week.
        user_max_hr: User-provided max HR (highest priority).
        user_max_hr_observed: Cached max HR from activity history.
        user_resting_hr: User's resting HR. Falls back to _DEFAULT_RHR.

    Returns:
        Formatted string like "Z1 30%, Z2 45%, Z3 15%, Z4 8%, Z5 2%", or
        "no HR data" when no usable data is found.
    """
    # Resolve HR values
    mhr: int = user_max_hr or user_max_hr_observed or _FALLBACK_MAX_HR
    rhr: int = user_resting_hr or _DEFAULT_RHR

    zone_seconds: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0}
    total_timed: float = 0.0

    for activity in week_activities:
        splits = activity.splits
        if not splits:
            continue
        for split in splits:
            mt = split.get("moving_time") or 0
            hr = split.get("hr")
            if hr is None or hr == 0 or mt == 0:
                continue
            zone_num, _ = classify_hr_zone(int(round(hr)), mhr, rhr)
            zone_seconds[zone_num] += mt
            total_timed += mt

    if total_timed == 0:
        return "no HR data"

    parts: list[str] = []
    for z in range(1, 6):
        pct = round(zone_seconds[z] / total_timed * 100)
        parts.append(f"Z{z} {pct}%")

    return ", ".join(parts)


def _build_activity_summary(activities: list[Activity]) -> str:
    """
    Build a plain-text summary of this week's activities for Ollama context.

    Each line includes: date, name, distance, duration, pace, avg HR (if any),
    RPE (if set), and verdict_tag (if available).

    Args:
        activities: List of Activity ORM objects from the current week.

    Returns:
        Multi-line text block, or a fallback string if no activities.
    """
    if not activities:
        return "No runs completed this week."

    lines: list[str] = []
    for activity in activities:
        run_date = activity.activity_date.date().isoformat()
        pace_str = format_pace(activity.average_pace_min_per_km)
        duration_min = round(activity.moving_time_seconds / 60)
        line = (
            f"- {run_date}: {activity.name} — "
            f"{activity.distance_km:.1f} km, {duration_min} min, {pace_str} min/km"
        )
        if activity.average_hr is not None:
            line += f", avg HR {activity.average_hr} bpm"
        # TASK-182: append RPE when available
        if activity.rpe is not None:
            line += f", RPE {activity.rpe}/10"
        # TASK-183: append verdict_tag when available
        if activity.verdict_tag is not None:
            line += f" [{activity.verdict_tag}]"
        lines.append(line)

    return "\n".join(lines)


async def generate_weekly_review(
    user: User, db: Session
) -> AsyncGenerator[str, None]:
    """
    Generate Pak Har's weekly review as an SSE async generator.

    Yields SSE-formatted strings (progress, complete, or error events) that the
    router passes directly to StreamingResponse. Callers must NOT await this
    function — iterate over it instead.

    Stages (a progress event is yielded before each stage's work):
    1. "Counting this week's runs"   — fetch activities, planned run count, missed days
    2. "Reading your zone breakdown" — build HR zone summary
    3. "Checking last week"          — fetch prior week comparison
    4. "Writing the assessment"      — format prompt + main Ollama call
    5. "Filing the headline"         — second Ollama call for headline/verdict/tone

    On success: yields complete_event with text, headline, verdict_tag, tone and
    also persists a new WeeklyReview row in the database.

    On any exception: yields error_event(str(exc)) and returns.

    Args:
        user: The authenticated User ORM object.
        db: Active database session.

    Yields:
        SSE-formatted strings ready to be sent over text/event-stream.
    """
    started_at = time.monotonic()

    try:
        # -----------------------------------------------------------------
        # Stage 1 — Counting this week's runs
        # -----------------------------------------------------------------
        yield progress_event("Counting this week's runs", started_at)

        week_start = _get_week_monday()
        today = datetime.now(timezone.utc).date()

        active_plan: TrainingPlan | None = (
            db.query(TrainingPlan)
            .filter(
                TrainingPlan.user_id == user.id,
                TrainingPlan.is_active == True,  # noqa: E712
                TrainingPlan.week_start_date == week_start,
            )
            .first()
        )

        planned_runs = _count_planned_runs(active_plan)

        week_start_dt = datetime(week_start.year, week_start.month, week_start.day, 0, 0, 0)
        today_end_dt = datetime(today.year, today.month, today.day, 23, 59, 59)

        week_activities: list[Activity] = (
            db.query(Activity)
            .filter(
                Activity.user_id == user.id,
                Activity.activity_date >= week_start_dt,
                Activity.activity_date <= today_end_dt,
                Activity.sync_status == "synced",
            )
            .order_by(Activity.activity_date.desc())
            .all()
        )

        actual_runs = len(week_activities)
        activity_summary = _build_activity_summary(week_activities)
        user_preferences = build_user_preferences_context(user)

        total_km = _compute_total_km(week_activities)
        km_target = _format_km_target(user.weekly_km_target)

        missed_days = _compute_missed_days(active_plan, week_activities, week_start, today)
        remaining_sessions = _compute_remaining_sessions(active_plan, week_activities, week_start, today)

        # -----------------------------------------------------------------
        # Stage 2 — Reading your zone breakdown
        # -----------------------------------------------------------------
        yield progress_event("Reading your zone breakdown", started_at)

        hr_zone_summary = _compute_hr_zone_summary(
            week_activities,
            user_max_hr=user.max_hr,
            user_max_hr_observed=user.max_hr_observed,
            user_resting_hr=user.resting_hr,
        )

        # -----------------------------------------------------------------
        # Stage 3 — Checking last week
        # -----------------------------------------------------------------
        yield progress_event("Checking last week", started_at)

        prior_week_runs, prior_week_km, prior_week_avg_pace = _compute_prior_week_stats(
            user.id, week_start, db
        )
        if prior_week_runs == 0:
            prior_week_runs_str = "no data"
            prior_week_km_str = "no data"
            prior_week_avg_pace_str = "no data"
        else:
            prior_week_runs_str = str(prior_week_runs)
            prior_week_km_str = f"{prior_week_km:.1f}"
            prior_week_avg_pace_str = prior_week_avg_pace

        # -----------------------------------------------------------------
        # Stage 4 — Writing the assessment (main Ollama call)
        # -----------------------------------------------------------------
        yield progress_event("Writing the assessment", started_at)

        user_message = REVIEW_PROMPT.format(
            week_start_date=week_start.isoformat(),
            today=today.isoformat(),
            planned_runs=planned_runs,
            actual_runs=actual_runs,
            total_km=total_km,
            km_target=km_target,
            missed_days=missed_days,
            remaining_sessions=remaining_sessions,
            prior_week_runs=prior_week_runs_str,
            prior_week_km=prior_week_km_str,
            prior_week_avg_pace=prior_week_avg_pace_str,
            hr_zone_summary=hr_zone_summary,
            activity_summary=activity_summary,
            user_preferences=user_preferences,
            voice_modifier=build_voice_modifier(user.coach_voice),
        )

        payload = {
            "model": settings.get_ollama_model(),
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Pak Har. You are 70 years old. You have been running since before GPS existed.\n"
                        "You give weekly assessments. You are blunt, specific, and direct. "
                        "No hollow affirmations. No exclamation points. No emojis. "
                        "You name the gap between what was planned and what happened, explain what it means, "
                        "and give one concrete adjustment — for remaining sessions this week if any, "
                        "otherwise for next week. Then stop."
                    ),
                },
                {
                    "role": "user",
                    "content": user_message,
                },
            ],
            "stream": True,
        }

        url = f"{OLLAMA_BASE_URL}/api/chat"
        logger.info(
            "Requesting weekly review from Ollama for user_id=%d, week=%s, planned=%d, actual=%d, total_km=%.1f",
            user.id,
            week_start.isoformat(),
            planned_runs,
            actual_runs,
            total_km,
        )

        chunks: list[str] = []
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=CONNECT_TIMEOUT,
                    read=READ_TIMEOUT,
                    write=10.0,
                    pool=5.0,
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
                            logger.warning("generate_weekly_review: non-JSON line from Ollama — skipping")
                            continue
                        if data.get("done"):
                            break
                        content = data.get("message", {}).get("content")
                        if content:
                            chunks.append(content)
                            yield token_event(content)
        except httpx.ConnectError as exc:
            logger.error("Ollama is unreachable at %s during weekly review generation", OLLAMA_BASE_URL)
            raise RuntimeError(
                "Pak Har is unavailable right now. Make sure Ollama is running."
            ) from exc
        except httpx.ReadTimeout as exc:
            logger.error("Ollama read timeout after %ss during weekly review generation", READ_TIMEOUT)
            raise TimeoutError("Pak Har took too long to respond.") from exc

        review_text: str = "".join(chunks).strip()
        if not review_text:
            raise RuntimeError("Ollama returned an empty response for weekly review generation.")

        # -----------------------------------------------------------------
        # Stage 5 — Filing the headline (verdict extraction)
        # -----------------------------------------------------------------
        yield progress_event("Filing the headline", started_at)

        headline: str | None = None
        verdict_tag: str | None = None
        tone: str | None = None

        verdict_payload = {
            "model": settings.get_ollama_model(),
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Pak Har. Extract a structured summary from a weekly running assessment.\n"
                        "Output only plain text in this exact format: first line = headline, "
                        "then 'TAG: <value>', then 'TONE: <value>'. No JSON. No markdown. No explanation.\n"
                        "Voice rules: no exclamation points, no hollow praise, be specific and direct."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Weekly assessment:\n{review_text}\n\n"
                        "Output plain text in exactly this format:\n"
                        "<headline — one sentence summarising this week, 12 words or fewer, Pak Har voice>\n"
                        "TAG: <one of: STRONG WEEK, ON PLAN, BUILDING, LIGHT WEEK, FADING, MISSED RUNS, CONSISTENT, NO RUNS>\n"
                        "TONE: <one of: critical, good, neutral>\n\n"
                        "No JSON. No markdown. No extra lines."
                    ),
                },
            ],
            "stream": True,
        }

        try:
            verdict_chunks: list[str] = []
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=CONNECT_TIMEOUT,
                    read=READ_TIMEOUT,
                    write=10.0,
                    pool=5.0,
                )
            ) as verdict_client:
                async with verdict_client.stream("POST", url, json=verdict_payload) as verdict_response:
                    verdict_response.raise_for_status()
                    async for line in verdict_response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = _json.loads(line)
                        except _json.JSONDecodeError:
                            logger.warning("generate_weekly_review stage 5: non-JSON line from Ollama — skipping")
                            continue
                        if data.get("done"):
                            break
                        content = data.get("message", {}).get("content")
                        if content:
                            verdict_chunks.append(content)
                            yield token_event(content)

            raw_verdict_content: str = "".join(verdict_chunks).strip()

            # Parse plain-text format: headline\nTAG: <tag>\nTONE: <tone>
            raw_headline: str | None = None
            raw_tag: str | None = None
            raw_tone_str: str | None = None

            if "\nTAG:" in raw_verdict_content:
                headline_part, tag_rest = raw_verdict_content.split("\nTAG:", 1)
                raw_headline = headline_part.strip()
                if "\nTONE:" in tag_rest:
                    tag_part, tone_part = tag_rest.split("\nTONE:", 1)
                    raw_tag = tag_part.strip()
                    raw_tone_str = tone_part.strip()
                else:
                    raw_tag = tag_rest.strip()
            else:
                raw_headline = raw_verdict_content.strip()

            headline = raw_headline if raw_headline else None
            verdict_tag = (
                raw_tag.upper()
                if raw_tag and raw_tag.upper() in _WEEKLY_VERDICT_TAGS
                else None
            )
            tone = (
                raw_tone_str.lower()
                if raw_tone_str and raw_tone_str.lower() in _TONES
                else None
            )

            logger.info(
                "generate_weekly_review: verdict extracted for user_id=%d, week=%s: tag=%r tone=%r",
                user.id,
                week_start.isoformat(),
                verdict_tag,
                tone,
            )

        except httpx.ConnectError as exc:
            logger.error(
                "Ollama is unreachable at %s during weekly review stage 5 (headline)", OLLAMA_BASE_URL
            )
            raise RuntimeError(
                "Pak Har is unavailable right now. Make sure Ollama is running."
            ) from exc
        except httpx.ReadTimeout as exc:
            logger.error(
                "Ollama read timeout after %ss during weekly review stage 5 (headline)", READ_TIMEOUT
            )
            raise TimeoutError("Pak Har took too long to respond.") from exc
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "generate_weekly_review: verdict extraction failed for user_id=%d, week=%s: %s",
                user.id,
                week_start.isoformat(),
                exc,
            )
            headline = None
            verdict_tag = None
            tone = None

        # -----------------------------------------------------------------
        # Persist new WeeklyReview (always insert — GET /review/current returns most recent)
        # -----------------------------------------------------------------
        new_review = WeeklyReview(
            user_id=user.id,
            week_start_date=week_start,
            planned_runs=planned_runs,
            actual_runs=actual_runs,
            review_text=review_text,
            headline=headline,
            verdict_tag=verdict_tag,
            tone=tone,
        )
        db.add(new_review)
        db.commit()
        db.refresh(new_review)

        logger.info(
            "Weekly review created for user_id=%d, review_id=%d, week=%s",
            user.id,
            new_review.id,
            week_start.isoformat(),
        )

        yield complete_event({
            "text": review_text,
            "headline": headline,
            "verdict_tag": verdict_tag,
            "tone": tone,
        })

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "generate_weekly_review: fatal error for user_id=%d: %s",
            user.id,
            exc,
        )
        yield error_event(str(exc))


def get_current_review(user_id: int, db: Session) -> WeeklyReview | None:
    """
    Retrieve the most recent weekly review for a user.

    Args:
        user_id: The numeric ID of the user.
        db: Active database session.

    Returns:
        The most recent WeeklyReview, or None if no reviews exist.
    """
    return (
        db.query(WeeklyReview)
        .filter(WeeklyReview.user_id == user_id)
        .order_by(WeeklyReview.created_at.desc())
        .first()
    )

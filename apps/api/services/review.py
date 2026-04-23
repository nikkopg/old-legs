"""
Weekly review generation service.

Builds Pak Har's weekly planned-vs-actual assessment for the current user.
Queries the active TrainingPlan for planned run count, counts Activity records
for actual runs this week, calls Ollama non-streaming, and persists the result.
"""

import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from config import settings
from models.activity import Activity
from models.training_plan import TrainingPlan
from models.user import User
from models.weekly_review import WeeklyReview
from prompts.pak_har import REVIEW_PROMPT
from services.ollama import (
    OLLAMA_BASE_URL,
    _CONNECT_TIMEOUT,
    _READ_TIMEOUT,
    build_user_preferences_context,
    format_pace,
)

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


def _count_planned_runs(plan: TrainingPlan) -> int:
    """
    Count non-rest days in a TrainingPlan's plan_data.

    Iterates over the 7-day plan_data dict and counts any day whose
    "type" is not "rest". This gives the number of runs Pak Har intended
    for the week.

    Args:
        plan: The active TrainingPlan ORM object.

    Returns:
        Integer count of non-rest days.
    """
    plan_data: dict = plan.plan_data or {}
    return sum(
        1 for day_data in plan_data.values()
        if isinstance(day_data, dict) and day_data.get("type", "rest") != "rest"
    )


def _build_activity_summary(activities: list[Activity]) -> str:
    """
    Build a plain-text summary of this week's activities for Ollama context.

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
        lines.append(line)

    return "\n".join(lines)


async def generate_weekly_review(user: User, db: Session) -> WeeklyReview:
    """
    Generate Pak Har's weekly review for the given user.

    Steps:
    1. Determine the Monday of the current week.
    2. Find the active TrainingPlan — count non-rest days as planned_runs.
    3. Count Activity records for this user since week_start_date as actual_runs.
    4. Build prompt context: planned vs actual, activity list, user preferences.
    5. Call Ollama non-streaming with REVIEW_PROMPT.
    6. Persist a new WeeklyReview row and return it.

    Args:
        user: The authenticated User ORM object.
        db: Active database session.

    Returns:
        The newly created WeeklyReview ORM object.

    Raises:
        ValueError: If no active training plan exists for this user.
        RuntimeError: If Ollama is unreachable.
        TimeoutError: If Ollama does not respond within the read timeout.
    """
    week_start = _get_week_monday()
    today = datetime.now(timezone.utc).date()

    # --- Fetch active plan ---
    active_plan: TrainingPlan | None = (
        db.query(TrainingPlan)
        .filter(
            TrainingPlan.user_id == user.id,
            TrainingPlan.is_active == True,  # noqa: E712
        )
        .order_by(TrainingPlan.created_at.desc())
        .first()
    )

    if active_plan is None:
        raise ValueError("No active training plan found.")

    planned_runs = _count_planned_runs(active_plan)

    # --- Count actual runs this week ---
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

    # --- Build prompt ---
    user_message = REVIEW_PROMPT.format(
        week_start_date=week_start.isoformat(),
        today=today.isoformat(),
        planned_runs=planned_runs,
        actual_runs=actual_runs,
        activity_summary=activity_summary,
        user_preferences=user_preferences,
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
                    "and give one concrete adjustment for next week. Then stop."
                ),
            },
            {
                "role": "user",
                "content": user_message,
            },
        ],
        "stream": False,
    }

    url = f"{OLLAMA_BASE_URL}/api/chat"
    logger.info(
        "Requesting weekly review from Ollama for user_id=%d, week=%s, planned=%d, actual=%d",
        user.id,
        week_start.isoformat(),
        planned_runs,
        actual_runs,
    )

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=_CONNECT_TIMEOUT,
                read=_READ_TIMEOUT,
                write=10.0,
                pool=5.0,
            )
        ) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.ConnectError as exc:
        logger.error("Ollama is unreachable at %s during weekly review generation", OLLAMA_BASE_URL)
        raise RuntimeError(
            "Pak Har is unavailable right now. Make sure Ollama is running."
        ) from exc
    except httpx.ReadTimeout as exc:
        logger.error("Ollama read timeout after %ss during weekly review generation", _READ_TIMEOUT)
        raise TimeoutError("Pak Har took too long to respond.") from exc

    review_text: str = data.get("message", {}).get("content", "").strip()
    if not review_text:
        raise RuntimeError("Ollama returned an empty response for weekly review generation.")

    # --- Persist new WeeklyReview (always insert — GET /review/current returns most recent) ---
    new_review = WeeklyReview(
        user_id=user.id,
        week_start_date=week_start,
        planned_runs=planned_runs,
        actual_runs=actual_runs,
        review_text=review_text,
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
    return new_review


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

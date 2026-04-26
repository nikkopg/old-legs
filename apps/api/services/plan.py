"""
Training plan generation service.

Builds a 7-day structured training plan using the runner's last 4 weeks of
activity data and Pak Har's plan prompt. Calls Ollama non-streaming, parses
the JSON response, and persists the plan in the database.
"""

import json
import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from models.training_plan import TrainingPlan
from models.user import User
from prompts.pak_har import PLAN_PROMPT
from config import settings
from services.ollama import (
    OLLAMA_BASE_URL,
    _CONNECT_TIMEOUT,
    _READ_TIMEOUT,
    build_strava_context,
    build_user_preferences_context,
)

logger = logging.getLogger(__name__)


def _get_week_start() -> date:
    """
    Return the Monday of the current week as a date.

    Returns:
        The ISO Monday date for the week that the plan covers.
    """
    today = datetime.now(timezone.utc).date()
    # weekday() returns 0 for Monday, 6 for Sunday
    days_since_monday = today.weekday()
    return today - timedelta(days=days_since_monday)


def _parse_plan_response(raw_json: str) -> tuple[dict, dict]:
    """
    Parse the raw JSON string returned by Ollama into plan_data and pak_har_notes.

    The expected structure is:
        {
          "week_summary": "...",
          "days": [
            {"day": ..., "type": ..., "description": ..., "duration_minutes": ..., "target": ...},
            ...
          ],
          "pak_har_notes": {"Monday": ..., ...}
        }

    ``target`` is optional in the raw JSON (absent in plans generated before TASK-147).
    It is stored as ``None`` when missing or empty.

    Args:
        raw_json: The raw string output from Ollama.

    Returns:
        A tuple of (plan_data, pak_har_notes) dicts, each keyed by lowercase day name.

    Raises:
        ValueError: If the JSON is malformed or missing required fields.
    """
    # Strip markdown code fences if the model wraps output in them
    stripped = raw_json.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        # Drop first line (```json or ```) and last line (```)
        stripped = "\n".join(lines[1:-1]).strip()

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as exc:
        logger.error("Ollama returned non-JSON plan response: %s", raw_json[:500])
        raise ValueError(f"Ollama returned a non-JSON response: {exc}") from exc

    if "days" not in data or not isinstance(data["days"], list):
        raise ValueError("Plan response missing 'days' array.")

    plan_data: dict = {}
    required_days = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}

    for entry in data["days"]:
        day = entry.get("day", "").strip()
        if day not in required_days:
            raise ValueError(f"Unexpected day value in plan: '{day}'")
        # target is nullable — present in new plans, absent in plans generated before TASK-147
        raw_target: str | None = entry.get("target") or None
        plan_data[day.lower()] = {
            "type": entry.get("type", "rest"),
            "description": entry.get("description", ""),
            "duration_minutes": int(entry.get("duration_minutes", 0)),
            "target": raw_target,
        }

    if len(plan_data) != 7:
        raise ValueError(f"Plan must contain exactly 7 days, got {len(plan_data)}.")

    raw_notes = data.get("pak_har_notes", {})
    pak_har_notes: dict = {}
    for day_name in required_days:
        pak_har_notes[day_name.lower()] = raw_notes.get(day_name, "")

    # Attach week_summary into pak_har_notes under a special key for storage
    week_summary = data.get("week_summary", "")
    if week_summary:
        pak_har_notes["week_summary"] = week_summary

    return plan_data, pak_har_notes


async def generate_plan_with_ollama(user: User, db: Session) -> TrainingPlan:
    """
    Generate a 7-day training plan for the given user using Ollama.

    Steps:
    1. Build Strava activity context from the last 4 weeks.
    2. Call Ollama non-streaming with PLAN_PROMPT, collect the full response.
    3. Parse the JSON response into plan_data and pak_har_notes dicts.
    4. Deactivate any previously active TrainingPlan for this user.
    5. Persist and return the new TrainingPlan row.

    Args:
        user: The authenticated User ORM object.
        db: Active database session.

    Returns:
        The newly created TrainingPlan ORM object.

    Raises:
        RuntimeError: If Ollama is unreachable.
        TimeoutError: If Ollama does not respond within the read timeout.
        ValueError: If the Ollama response cannot be parsed into a valid plan.
    """
    strava_context = build_strava_context(user, db)
    user_preferences = build_user_preferences_context(user)
    system_content = PLAN_PROMPT.format(
        strava_context=strava_context,
        user_preferences=user_preferences,
    )

    payload = {
        "model": settings.get_ollama_model(),
        "messages": [
            {"role": "system", "content": system_content},
            {
                "role": "user",
                "content": (
                    "Generate my training plan for this week. "
                    "Output only the JSON as instructed."
                ),
            },
        ],
        "stream": False,
    }

    url = f"{OLLAMA_BASE_URL}/api/chat"
    logger.info("Requesting training plan from Ollama for user_id=%d", user.id)

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
        logger.error("Ollama is unreachable at %s", OLLAMA_BASE_URL)
        raise RuntimeError(
            "Pak Har is unavailable right now. Make sure Ollama is running."
        ) from exc
    except httpx.ReadTimeout as exc:
        logger.error("Ollama read timeout after %ss generating plan", _READ_TIMEOUT)
        raise TimeoutError("Pak Har took too long to respond.") from exc

    raw_content: str = data.get("message", {}).get("content", "")
    if not raw_content:
        raise ValueError("Ollama returned an empty response for plan generation.")

    plan_data, pak_har_notes = _parse_plan_response(raw_content)

    # Deactivate all existing active plans for this user
    db.query(TrainingPlan).filter(
        TrainingPlan.user_id == user.id,
        TrainingPlan.is_active == True,  # noqa: E712
    ).update({"is_active": False})

    week_start = _get_week_start()
    new_plan = TrainingPlan(
        user_id=user.id,
        week_start_date=week_start,
        plan_data=plan_data,
        pak_har_notes=pak_har_notes,
        is_active=True,
    )
    db.add(new_plan)
    db.commit()
    db.refresh(new_plan)

    logger.info(
        "Training plan generated for user_id=%d, plan_id=%d, week_start=%s",
        user.id,
        new_plan.id,
        week_start.isoformat(),
    )
    return new_plan


def get_current_plan(user_id: int, db: Session) -> TrainingPlan | None:
    """
    Retrieve the most recent active training plan for a user.

    Args:
        user_id: The numeric ID of the user.
        db: Active database session.

    Returns:
        The most recent active TrainingPlan, or None if no active plan exists.
    """
    return (
        db.query(TrainingPlan)
        .filter(
            TrainingPlan.user_id == user_id,
            TrainingPlan.is_active == True,  # noqa: E712
        )
        .order_by(TrainingPlan.created_at.desc())
        .first()
    )

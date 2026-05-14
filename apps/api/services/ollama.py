"""
Ollama LLM integration service.

Sends chat messages to a local Ollama instance and handles streaming responses.
Default model: llama3 (configurable via OLLAMA_MODEL env var).
Prepends Pak Har system prompt from prompts/pak_har.py on every request.
"""

import json
import logging
from datetime import date as date_type, datetime, timedelta, timezone
from typing import AsyncGenerator

import httpx
from sqlalchemy.orm import Session

from config import settings
from models.activity import Activity
from models.user import User
from prompts.pak_har import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = settings.ollama_base_url

# Timeout for first byte from Ollama — 60 seconds.
# Streaming itself has no hard timeout.
_CONNECT_TIMEOUT = 10.0
_READ_TIMEOUT = 60.0


def format_pace(pace_float: float) -> str:
    """
    Convert a float pace (min/km) to "M:SS" display string.

    Examples:
        5.714 → "5:43"
        6.0   → "6:00"
        5.5   → "5:30"

    Args:
        pace_float: Pace in decimal minutes per km.

    Returns:
        Formatted string like "5:43".
    """
    minutes = int(pace_float)
    seconds = round((pace_float % 1) * 60)
    # Edge case: rounding can push seconds to 60
    if seconds == 60:
        minutes += 1
        seconds = 0
    return f"{minutes}:{seconds:02d}"


def build_strava_context(user: User, db: Session) -> str:
    """
    Build a plain-text Strava activity summary for the last 4 weeks.

    Queries the most recent 20 activities within the past 28 days for the
    given user. Used to inject structured running context into the Pak Har
    system prompt so coaching advice is grounded in real data.

    Args:
        user: The authenticated User ORM object.
        db: Active database session.

    Returns:
        A multi-line plain-text summary string suitable for LLM injection.
        Returns a fallback string if the user has no recent activities.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now_utc - timedelta(days=28)

    activities = (
        db.query(Activity)
        .filter(
            Activity.user_id == user.id,
            Activity.activity_date >= cutoff,
            Activity.sync_status == "synced",
        )
        .order_by(Activity.activity_date.desc())
        .limit(20)
        .all()
    )

    if not activities:
        return "This runner has no recent activity data."

    total_distance = sum(a.distance_km for a in activities)
    avg_pace_float = sum(a.average_pace_min_per_km for a in activities) / len(activities)

    most_recent = activities[0]
    today = datetime.now(timezone.utc).date()
    last_run_date = most_recent.activity_date.date()
    days_since = (today - last_run_date).days

    lines = [
        "Last 4 weeks:",
        f"- Total runs: {len(activities)}",
        f"- Total distance: {total_distance:.1f} km",
        f"- Avg pace: {format_pace(avg_pace_float)} min/km",
        f"- Last run: {days_since} day{'s' if days_since != 1 else ''} ago"
        f" ({last_run_date.isoformat()}, {most_recent.distance_km:.1f} km,"
        f" {format_pace(most_recent.average_pace_min_per_km)}/km"
        + (f", avg HR: {most_recent.average_hr} bpm" if most_recent.average_hr is not None else "")
        + ")",
        "",
        "Recent runs:",
    ]

    for activity in activities:
        run_date = activity.activity_date.date().isoformat()
        pace_str = format_pace(activity.average_pace_min_per_km)
        line = f"- {run_date}: {activity.distance_km:.1f} km @ {pace_str} min/km"
        if activity.average_hr is not None:
            hr_parts = [f"avg {activity.average_hr}"]
            if activity.max_hr is not None:
                hr_parts.append(f"max {activity.max_hr}")
            line += f" | HR: {'/'.join(hr_parts)} bpm"
        lines.append(line)

    return "\n".join(lines)


_GOAL_EVENT_LABELS: dict[str, str] = {
    "general_fitness": "No race — general fitness",
    "5k": "5K race",
    "10k": "10K race",
    "half_marathon": "Half marathon (21 km)",
    "marathon": "Marathon (42 km)",
    "ultra": "Ultra (50 km+)",
}


def goal_event_label(goal_event: str | None) -> str:
    """
    Return a human-readable display label for a goal_event value.

    Args:
        goal_event: Raw goal_event string stored on the User row, or None.

    Returns:
        A display label string. Falls back to "not set" for None or
        unrecognised values so callers never surface raw internal keys.
    """
    if goal_event is None:
        return "not set"
    return _GOAL_EVENT_LABELS.get(goal_event, "not set")


def build_user_preferences_context(user: User) -> str:
    """
    Build a plain-text summary of the user's stated preferences for LLM injection.

    Args:
        user: The authenticated User ORM object.

    Returns:
        A multi-line string describing the user's weekly target, available days,
        biggest struggle, and goal event. Falls back gracefully for unset fields.
    """
    target = f"{user.weekly_km_target:.1f} km/week" if user.weekly_km_target else "not set"
    struggle = user.biggest_struggle if user.biggest_struggle else "not specified"
    goal = goal_event_label(user.goal_event)
    lines = [
        f"- Weekly km target: {target}",
    ]

    if user.available_days:
        _DAY_LABELS: dict[str, str] = {
            'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed',
            'thursday': 'Thu', 'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun',
        }
        _DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        sorted_days = sorted(
            user.available_days,
            key=lambda d: _DAY_ORDER.index(d) if d in _DAY_ORDER else 99,
        )
        days_str = ', '.join(_DAY_LABELS.get(d, d.capitalize()) for d in sorted_days)
        lines.append(f"- Available days: {days_str} ({len(user.available_days)} days/week)")
    else:
        days = str(user.days_available) if user.days_available else "not set"
        lines.append(f"- Days available: {days} per week")

    lines += [
        f"- Biggest struggle: {struggle}",
        f"- Goal: {goal}",
    ]

    if user.race_date:
        today = date_type.today()
        weeks_to_race = (user.race_date - today).days // 7
        if weeks_to_race < 0:
            race_context = f"Race date: {user.race_date} (past)"
        elif weeks_to_race == 0:
            race_context = f"Race date: {user.race_date} (this week)"
        else:
            race_context = f"Race date: {user.race_date} ({weeks_to_race} weeks away)"
        lines.append(f"- {race_context}")

    return "\n".join(lines)


async def stream_chat(
    user_message: str,
    strava_context: str,
    user_preferences: str,
    chat_history: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Stream a chat response from Ollama using the Pak Har system prompt.

    Sends the conversation to the local Ollama /api/chat endpoint with
    streaming enabled. Yields text chunks as they arrive. The caller is
    responsible for assembling chunks and persisting the final response.

    Args:
        user_message: The raw message from the user.
        strava_context: Pre-built activity context string from build_strava_context().
        user_preferences: Pre-built preferences string from build_user_preferences_context().
        chat_history: List of {"role": ..., "content": ...} dicts for the last N
                      messages (role values must be "user" or "assistant").

    Yields:
        Decoded text chunks from the LLM response.

    Raises:
        RuntimeError: If Ollama is unreachable (connection refused / DNS failure).
        TimeoutError: If Ollama does not begin responding within the read timeout.
    """
    system_content = SYSTEM_PROMPT.format(
        strava_context=strava_context,
        user_preferences=user_preferences,
    )

    messages = [{"role": "system", "content": system_content}]
    messages.extend(chat_history[-10:])
    messages.append({"role": "user", "content": user_message})

    ollama_model = settings.get_ollama_model()
    url = f"{OLLAMA_BASE_URL}/api/chat"

    payload = {
        "model": ollama_model,
        "messages": messages,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=10.0, pool=5.0)
        ) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        logger.warning("Received non-JSON line from Ollama — skipping")
                        continue

                    if data.get("done"):
                        break

                    content = data.get("message", {}).get("content")
                    if content:
                        yield content

    except httpx.ConnectError as exc:
        logger.error("Ollama is unreachable at %s", OLLAMA_BASE_URL)
        raise RuntimeError(
            "Pak Har is unavailable right now. Make sure Ollama is running."
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.error("Ollama returned %s for model %s", exc.response.status_code, ollama_model)
        raise RuntimeError(
            f"Ollama returned {exc.response.status_code}. "
            f"Make sure the model is available: ollama pull {ollama_model}"
        ) from exc
    except httpx.ReadTimeout as exc:
        logger.error("Ollama read timeout after %ss", _READ_TIMEOUT)
        raise TimeoutError(
            "Pak Har took too long to respond."
        ) from exc

"""
Ollama LLM integration service.

Sends chat messages to a local Ollama instance and handles streaming responses.
Default model: llama3 (configurable via OLLAMA_MODEL env var).
Prepends Pak Har system prompt from prompts/pak_har.py on every request.

TODO (post-launch): Split this file. The build_*_context functions are pure domain
logic and should live in a separate services/context.py so the HTTP streaming client
(stream_chat) can be tested in isolation from the DB-dependent context builders.
"""

import json
import logging
from datetime import date as date_type, datetime, timedelta, timezone
from typing import AsyncGenerator

import httpx
from sqlalchemy.orm import Session

from config import settings
from models.activity import Activity
from models.training_plan import TrainingPlan
from models.user import User
from prompts.pak_har import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = settings.ollama_base_url

# Timeout for first byte from Ollama — 60 seconds.
# Streaming itself has no hard timeout.
CONNECT_TIMEOUT = 10.0
READ_TIMEOUT = 60.0


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
        biggest struggle, goal event, and heart rate data. Falls back gracefully
        for unset fields; resting HR and max HR are omitted entirely when not set.
    """
    target = f"{user.weekly_km_target:.1f} km/week" if user.weekly_km_target else "not set"
    raw_struggle = user.biggest_struggle or ""
    struggle = " ".join(raw_struggle[:200].split()) if raw_struggle else "not specified"
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

    if user.resting_hr is not None:
        lines.append(f"- Resting HR: {user.resting_hr} bpm")

    if user.max_hr is not None:
        lines.append(f"- Max HR: {user.max_hr} bpm (user-set)")
    elif user.max_hr_observed is not None:
        lines.append(f"- Max HR: {user.max_hr_observed} bpm (observed)")

    return "\n".join(lines)


_DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def build_plan_context(user: User, db: Session) -> str:
    """
    Build a plain-text summary of the user's most recent active training plan.

    Queries TrainingPlan for the user's most recent active plan and formats
    each day's session into a compact, LLM-friendly string. Injected into the
    Pak Har chat system prompt so Pak Har can answer questions like "what am
    I supposed to run today?" with plan-specific detail.

    Args:
        user: The authenticated User ORM object.
        db: Active database session.

    Returns:
        A multi-line plain-text summary of the plan, or "No training plan on file."
        if no active plan exists for the user.
    """
    plan = (
        db.query(TrainingPlan)
        .filter(
            TrainingPlan.user_id == user.id,
            TrainingPlan.is_active == True,  # noqa: E712
        )
        .order_by(TrainingPlan.week_start_date.desc())
        .first()
    )

    if plan is None:
        return "No training plan on file."

    week_start = plan.week_start_date
    week_end = week_start + timedelta(days=6)
    plan_data: dict = plan.plan_data or {}
    pak_har_notes: dict = plan.pak_har_notes or {}

    today = datetime.now(timezone.utc).date()
    is_next_week = week_start > today
    week_label = "NEXT WEEK" if is_next_week else "THIS WEEK"

    lines = [
        f"Today is {today.isoformat()} ({today.strftime('%A')}).",
        f"Training plan for {week_label} ({week_start.isoformat()} to {week_end.isoformat()}):",
    ]

    for day_key in _DAY_ORDER:
        day_label = day_key.capitalize()
        day = plan_data.get(day_key, {})
        session_type = day.get("type", "rest")
        description = day.get("description", "").strip()
        target = day.get("target", "").strip() if day.get("target") else ""

        if session_type == "rest":
            entry = f"- {day_label}: Rest"
        else:
            entry = f"- {day_label}: {description}"
            if target:
                entry += f" | Target: {target}"

        lines.append(entry)

    week_summary = pak_har_notes.get("week_summary", "").strip()
    if week_summary:
        lines.append(f"Week summary: {week_summary}")

    return "\n".join(lines)


def build_voice_modifier(coach_voice: str) -> str:
    """
    Return a voice modifier block for injection into the Pak Har system prompt.

    Controls the tonal range of Pak Har's responses without altering core
    personality or factual content. Standard voice returns an empty string so
    the prompt is unchanged for existing users.

    Args:
        coach_voice: One of "gentle", "standard", or "unfiltered".
                     Unrecognised values fall back to "standard" (empty string).

    Returns:
        A multiline instruction block for the LLM, or an empty string for
        "standard" and unknown values.
    """
    if coach_voice == "gentle":
        return (
            "Voice modifier — Gentle:\n"
            "- Name what the data shows without rhetorical edge. Say the fact plainly.\n"
            "- When something went well, acknowledge it in one sentence before moving to what needs to change.\n"
            "- Say each criticism once, clearly, then stop. Do not return to it.\n"
            "- Still specific. Still no vague advice. Still no hollow affirmations.\n"
            "- Do not soften to the point of dishonesty. If the week was poor, say so — once."
        )
    if coach_voice == "unfiltered":
        return (
            "Voice modifier — Unfiltered:\n"
            "- No diplomatic opener. Name what the data shows in the first sentence.\n"
            "- Lead with the finding. Do not soften with context before delivering it.\n"
            "- If the runner shows a pattern of avoidance, inconsistency, or self-deception, name it directly.\n"
            "- Shorter responses. Say what matters, stop explaining yourself.\n"
            "- You may ask one pointed question if the data raises one you cannot answer. One only.\n"
            "- Still not cruel. Still specific. But no comfort — only fact."
        )
    # "standard" or any unrecognised value — no modifier
    return ""


async def stream_chat(
    user_message: str,
    strava_context: str,
    user_preferences: str,
    plan_context: str,
    chat_history: list[dict],
    coach_voice: str = "standard",
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
        plan_context: Pre-built training plan context string from build_plan_context().
        chat_history: List of {"role": ..., "content": ...} dicts for the last N
                      messages (role values must be "user" or "assistant").
        coach_voice: Tonal modifier — "gentle", "standard", or "unfiltered".
                     Passed to build_voice_modifier() before formatting the system prompt.

    Yields:
        Decoded text chunks from the LLM response.

    Raises:
        RuntimeError: If Ollama is unreachable (connection refused / DNS failure).
        TimeoutError: If Ollama does not begin responding within the read timeout.
    """
    voice_modifier = build_voice_modifier(coach_voice)
    system_content = SYSTEM_PROMPT.format(
        strava_context=strava_context,
        user_preferences=user_preferences,
        plan_context=plan_context,
        voice_modifier=voice_modifier,
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
            timeout=httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=10.0, pool=5.0)
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
        logger.error("Ollama read timeout after %ss", READ_TIMEOUT)
        raise TimeoutError(
            "Pak Har took too long to respond."
        ) from exc

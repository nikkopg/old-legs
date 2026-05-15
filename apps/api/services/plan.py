"""
Training plan generation service.

Builds a 7-day structured training plan using the runner's last 4 weeks of
activity data and Pak Har's plan prompt. Calls Ollama non-streaming, parses
the JSON response, and persists the plan in the database.

generate_plan_with_ollama is an async generator that yields SSE-formatted
strings (progress, complete, or error events). The router wraps it in
StreamingResponse — callers must NOT await it directly.
"""

import json
import logging
import time
from collections import defaultdict
from collections.abc import AsyncGenerator
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models.activity import Activity
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
    format_pace,
    goal_event_label,
)
from services.streaming import complete_event, error_event, progress_event

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HR zone thresholds for zone distribution analysis (mirrors coach.py)
# ---------------------------------------------------------------------------
# (lower_pct_inclusive, upper_pct_exclusive)
# Zone is "easy" if zone number ≤ 2, "hard" if zone number ≥ 3.
_PLAN_HR_ZONE_PCTS: list[tuple[float, float, int]] = [
    (0.00, 0.50, 1),
    (0.50, 0.60, 2),
    (0.60, 0.70, 3),
    (0.70, 0.85, 4),
    (0.85, 9.99, 5),
]
_DEFAULT_RHR: int = 60
_FALLBACK_MAX_HR: int = 185


def _classify_zone_number(average_hr: int, max_hr: int, resting_hr: int) -> int:
    """
    Return the Karvonen zone number (1–5) for a given average HR.

    Args:
        average_hr: Average HR for a run, in bpm.
        max_hr: User's max HR.
        resting_hr: User's resting HR.

    Returns:
        Integer zone 1–5.
    """
    hrr = max_hr - resting_hr
    if hrr <= 0:
        return 1
    pct = (average_hr - resting_hr) / hrr
    for lower_pct, upper_pct, zone_num in _PLAN_HR_ZONE_PCTS:
        if lower_pct <= pct < upper_pct:
            return zone_num
    return 5


# ---------------------------------------------------------------------------
# Coaching signal helpers
# ---------------------------------------------------------------------------


def _build_weekly_breakdown(activities: list[Activity]) -> str:
    """
    Group activities by ISO calendar week and produce a per-week volume summary.

    Covers the last 4 completed weeks (Mon–Sun). Reports km, run count, avg
    pace per week, and a trend label across the four weeks.

    Args:
        activities: List of Activity ORM objects (any order, any date range).

    Returns:
        A plain-text multi-line summary string, or an empty string if there
        are fewer than 2 activities to derive a meaningful breakdown from.
    """
    if len(activities) < 2:
        return ""

    # Group by ISO year-week key (e.g. "2025-W17")
    week_buckets: dict[str, list[Activity]] = defaultdict(list)
    for a in activities:
        act_date = a.activity_date.date() if isinstance(a.activity_date, datetime) else a.activity_date
        iso = act_date.isocalendar()
        key = f"{iso.year}-W{iso.week:02d}"
        week_buckets[key].append(a)

    if len(week_buckets) < 2:
        return ""

    # Sort weeks chronologically
    sorted_weeks = sorted(week_buckets.keys())

    # Build per-week rows
    rows: list[tuple[str, float, int, float]] = []  # (week_label, km, runs, avg_pace)
    for week_key in sorted_weeks:
        acts = week_buckets[week_key]
        total_km = sum(a.distance_km for a in acts)
        avg_pace = sum(a.average_pace_min_per_km for a in acts) / len(acts)
        rows.append((week_key, total_km, len(acts), avg_pace))

    # Derive trend from first to last week's km
    first_km = rows[0][1]
    last_km = rows[-1][1]
    pct_change = ((last_km - first_km) / first_km * 100) if first_km > 0 else 0

    # Week-over-week deltas for erratic detection
    week_kms = [r[1] for r in rows]
    wow_changes = [abs(week_kms[i] - week_kms[i - 1]) / week_kms[i - 1] * 100
                   for i in range(1, len(week_kms))
                   if week_kms[i - 1] > 0]
    avg_wow_swing = sum(wow_changes) / len(wow_changes) if wow_changes else 0

    if avg_wow_swing > 25:
        trend_label = "erratic"
    elif pct_change > 8:
        trend_label = "building"
    elif pct_change < -8:
        trend_label = "declining"
    else:
        trend_label = "maintaining"

    lines = ["Week-by-week breakdown:"]
    for week_key, km, runs, avg_pace in rows:
        lines.append(
            f"  {week_key}: {km:.1f} km across {runs} run{'s' if runs != 1 else ''}"
            f", avg pace {format_pace(avg_pace)}/km"
        )
    lines.append(f"Volume trend: {trend_label}")

    # Flag dangerous buildup (>10% single-week jump on the most recent step)
    if len(week_kms) >= 2 and week_kms[-2] > 0:
        last_wow = (week_kms[-1] - week_kms[-2]) / week_kms[-2] * 100
        if last_wow > 10:
            lines.append(
                f"Warning: last week was {last_wow:.0f}% higher than the week before — "
                f"that is above the safe 10% build rate."
            )

    return "\n".join(lines)


def _build_plan_adherence(
    db: Session,
    user_id: int,
    recent_activities: list[Activity],
) -> str:
    """
    Compare the most recently completed training plan against actual activities
    that fell within its target week.

    "Completed" means is_active=False, sorted by created_at descending.

    Args:
        db: Active database session.
        user_id: The user's integer ID.
        recent_activities: Activities already fetched by the caller (used to
                           avoid a separate query for activities in the plan week).

    Returns:
        A plain-text adherence summary, or an empty string if no completed plan
        exists or plan_data is malformed.
    """
    last_plan: Optional[TrainingPlan] = (
        db.query(TrainingPlan)
        .filter(
            TrainingPlan.user_id == user_id,
            TrainingPlan.is_active == False,  # noqa: E712
        )
        .order_by(TrainingPlan.created_at.desc())
        .first()
    )

    if last_plan is None:
        return ""

    plan_data = last_plan.plan_data
    if not isinstance(plan_data, dict):
        return ""

    # Determine the plan week boundaries (Mon–Sun)
    week_start: date = last_plan.week_start_date
    week_end: date = week_start + timedelta(days=6)

    # Find activities within that plan's week
    plan_week_acts: list[Activity] = [
        a for a in recent_activities
        if week_start <= (
            a.activity_date.date()
            if isinstance(a.activity_date, datetime)
            else a.activity_date
        ) <= week_end
    ]
    # Activity dates in set for fast lookup
    run_dates: set[date] = {
        (a.activity_date.date() if isinstance(a.activity_date, datetime) else a.activity_date)
        for a in plan_week_acts
    }

    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    planned_run_days: list[str] = []
    missed_days: list[str] = []
    completed_count = 0

    for i, day_name in enumerate(day_names):
        day_plan = plan_data.get(day_name, {})
        plan_type = day_plan.get("type", "rest") if isinstance(day_plan, dict) else "rest"
        if plan_type == "rest":
            continue
        planned_run_days.append(day_name)
        # Check if there was a run on this day of the plan week
        target_date = week_start + timedelta(days=i)
        if target_date in run_dates:
            completed_count += 1
        else:
            missed_days.append(day_name.capitalize())

    total_planned = len(planned_run_days)
    if total_planned == 0:
        return ""

    lines = [
        f"Previous plan adherence (week of {week_start.isoformat()}):",
        f"  {completed_count}/{total_planned} sessions completed.",
    ]
    if missed_days:
        lines.append(f"  Missed: {', '.join(missed_days)}.")
    else:
        lines.append("  All planned sessions completed.")

    return "\n".join(lines)


def _build_rpe_trend(activities: list[Activity]) -> str:
    """
    Compute average RPE across the last 4–6 activities that have a non-null RPE.

    Args:
        activities: List of Activity ORM objects ordered by date (any order).

    Returns:
        A plain-text RPE trend string with a signal label, or an empty string
        if fewer than 3 activities have RPE data.
    """
    rpe_acts = [a for a in activities if a.rpe is not None]
    # Take the 6 most recent by activity_date
    rpe_acts_sorted = sorted(
        rpe_acts,
        key=lambda a: a.activity_date,
        reverse=True,
    )[:6]

    if len(rpe_acts_sorted) < 3:
        return ""

    avg_rpe = sum(a.rpe for a in rpe_acts_sorted) / len(rpe_acts_sorted)  # type: ignore[arg-type]

    if avg_rpe >= 7:
        signal = "high perceived load — runner is working hard across sessions"
    elif avg_rpe <= 4:
        signal = "low perceived effort — under-effort or well-recovered"
    else:
        signal = "moderate perceived effort — normal range"

    return (
        f"RPE trend (last {len(rpe_acts_sorted)} rated runs): "
        f"avg {avg_rpe:.1f}/10 — {signal}."
    )


def _build_zone_distribution(
    activities: list[Activity],
    rhr: int,
    max_hr: int,
) -> str:
    """
    Classify each run's average HR into Karvonen zones and report the easy/hard split.

    Zones 1–2 are "easy"; Zones 3–5 are "hard".

    Args:
        activities: List of Activity ORM objects (only those with avg HR are used).
        rhr: Resting heart rate in bpm.
        max_hr: Max heart rate in bpm.

    Returns:
        A plain-text zone distribution string with a signal when >50% are hard,
        or an empty string if fewer than 3 activities have HR data.
    """
    hr_acts = [a for a in activities if a.average_hr is not None]
    if len(hr_acts) < 3:
        return ""

    easy_count = 0
    hard_count = 0
    for a in hr_acts:
        zone = _classify_zone_number(a.average_hr, max_hr, rhr)  # type: ignore[arg-type]
        if zone <= 2:
            easy_count += 1
        else:
            hard_count += 1

    total = easy_count + hard_count
    easy_pct = easy_count / total * 100
    hard_pct = hard_count / total * 100

    lines = [
        f"HR zone distribution (last 4 weeks, {total} runs with HR data):",
        f"  Easy (Zone 1–2): {easy_count} runs ({easy_pct:.0f}%)",
        f"  Hard (Zone 3–5): {hard_count} runs ({hard_pct:.0f}%)",
    ]
    if hard_pct > 50:
        lines.append(
            "Signal: more than half of recent runs were in Zone 3 or higher. "
            "This is chronic overreaching. Next week needs to be predominantly easy effort."
        )

    return "\n".join(lines)


def _get_hr_params(user: User, activities: list[Activity]) -> tuple[int, int]:
    """
    Resolve resting HR and max HR for zone classification.

    Prefers values stored on the User row (resting_hr, max_hr_observed / max_hr).
    Falls back to scanning activity max_hr fields, then population defaults.

    Args:
        user: The authenticated User ORM object.
        activities: Recent activities used as fallback for max HR.

    Returns:
        A (rhr, max_hr) tuple, both in bpm.
    """
    rhr = user.resting_hr if user.resting_hr is not None else _DEFAULT_RHR
    # Prefer the explicitly stored observed max HR, then the user-entered value
    max_hr = user.max_hr_observed or user.max_hr
    if max_hr is None:
        candidates = [a.max_hr for a in activities if a.max_hr is not None]
        max_hr = max(candidates) if candidates else None
    if max_hr is None:
        # Rough estimate: highest avg_hr × 1.1, minimum fallback
        avg_hrs = [a.average_hr for a in activities if a.average_hr is not None]
        if avg_hrs:
            max_hr = int(max(avg_hrs) * 1.1)
        else:
            max_hr = _FALLBACK_MAX_HR

    return rhr, max_hr


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


async def generate_plan_with_ollama(
    user: User, db: Session
) -> AsyncGenerator[str, None]:
    """
    Generate a 7-day training plan for the given user using Ollama.

    Yields SSE-formatted strings (progress, complete, or error events) that the
    router passes directly to StreamingResponse. Callers must NOT await this
    function — iterate over it instead.

    Stages (a progress event is yielded before each stage's work):
    1. "Reading your last four weeks"   — fetch activities, build strava context
    2. "Checking plan adherence"        — fetch prior plan, compute adherence signal
    3. "Assembling coaching signals"    — build weekly breakdown, RPE trend, zone distribution
    4. "Drafting the plan"              — format prompt + Ollama call (the long one)
    5. "Filing"                         — parse JSON response, create/update TrainingPlan in DB

    On success: yields complete_event with the serialised TrainingPlan dict.
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
        # Stage 1 — Reading your last four weeks
        # -----------------------------------------------------------------
        yield progress_event("Reading your last four weeks", started_at)

        # Fetch activities once — reused by all helper functions to avoid N+1 queries.
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        cutoff = now_utc - timedelta(days=28)
        recent_activities: list[Activity] = (
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

        strava_context = build_strava_context(user, db)
        user_preferences = build_user_preferences_context(user)

        # -----------------------------------------------------------------
        # Stage 2 — Checking plan adherence
        # -----------------------------------------------------------------
        yield progress_event("Checking plan adherence", started_at)

        plan_adherence = _build_plan_adherence(db, user.id, recent_activities)

        # -----------------------------------------------------------------
        # Stage 3 — Assembling coaching signals
        # -----------------------------------------------------------------
        yield progress_event("Assembling coaching signals", started_at)

        weekly_breakdown = _build_weekly_breakdown(recent_activities)
        rpe_trend = _build_rpe_trend(recent_activities)
        rhr, max_hr = _get_hr_params(user, recent_activities)
        zone_distribution = _build_zone_distribution(recent_activities, rhr, max_hr)

        # Compute Karvonen zone boundaries so Pak Har uses the runner's actual
        # thresholds instead of anchoring on generic examples in the prompt.
        hrr = max_hr - rhr
        _upper_pcts = [lo_hi[1] for lo_hi in [(0.00, 0.50), (0.50, 0.60), (0.60, 0.70), (0.70, 0.85)]]
        z1_ceil, z2_ceil, z3_ceil, z4_ceil = [round(rhr + p * hrr) for p in _upper_pcts]
        zone_boundaries = (
            f"Zone boundaries for this runner "
            f"(Karvonen, MHR {max_hr} bpm, RHR {rhr} bpm): "
            f"Z1 <{z1_ceil} | Z2 {z1_ceil}–{z2_ceil} | "
            f"Z3 {z2_ceil}–{z3_ceil} | Z4 {z3_ceil}–{z4_ceil} | Z5 >{z4_ceil} bpm"
        )

        goal_event_context = goal_event_label(user.goal_event)

        # Compute race date context for the plan prompt
        race_date_context: str = ""
        if user.race_date:
            today_date = datetime.now(timezone.utc).date()
            weeks_to_race = (user.race_date - today_date).days // 7
            if weeks_to_race < 0:
                race_date_context = "Race date has passed. Treat this as a recovery/rebuild phase."
            elif weeks_to_race < 2:
                race_date_context = (
                    f"Race date: {user.race_date} ({weeks_to_race} weeks away). "
                    "Taper week. Cut volume 30-40%, keep two short sharp sessions, no new stressors."
                )
            elif weeks_to_race <= 7:
                race_date_context = (
                    f"Race date: {user.race_date} ({weeks_to_race} weeks away). "
                    "Focus: race-specific work. Sharpening phase — reduce volume 10-15%, maintain intensity."
                )
            else:
                race_date_context = (
                    f"Race date: {user.race_date} ({weeks_to_race} weeks away). "
                    "Focus: base building. Prioritize aerobic volume and consistency."
                )

        system_content = PLAN_PROMPT.format(
            strava_context=strava_context,
            user_preferences=user_preferences,
            weekly_breakdown=weekly_breakdown,
            plan_adherence=plan_adherence,
            rpe_trend=rpe_trend,
            zone_distribution=zone_distribution,
            zone_boundaries=zone_boundaries,
            zone2_ceiling=z2_ceil,
            goal_event_context=goal_event_context,
            race_date_context=race_date_context,
        )

        # -----------------------------------------------------------------
        # Stage 4 — Drafting the plan (main Ollama call)
        # -----------------------------------------------------------------
        yield progress_event("Drafting the plan", started_at)

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

        # -----------------------------------------------------------------
        # Stage 5 — Filing (parse + persist)
        # -----------------------------------------------------------------
        yield progress_event("Filing", started_at)

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

        # Serialise the plan using the schema — convert date/datetime to ISO strings
        plan_dict = {
            "id": new_plan.id,
            "user_id": new_plan.user_id,
            "week_start_date": new_plan.week_start_date.isoformat(),
            "plan_data": new_plan.plan_data,
            "pak_har_notes": new_plan.pak_har_notes,
            "is_active": new_plan.is_active,
            "created_at": new_plan.created_at.isoformat() if new_plan.created_at else None,
            "updated_at": new_plan.updated_at.isoformat() if new_plan.updated_at else None,
        }
        yield complete_event({"plan": plan_dict})

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "generate_plan_with_ollama: fatal error for user_id=%d: %s",
            user.id,
            exc,
        )
        yield error_event(str(exc))


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

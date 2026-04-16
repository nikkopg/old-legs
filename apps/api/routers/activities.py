# READY FOR QA
# Feature: Activity sync pipeline + list/detail endpoints (TASK-004)
# What was built:
#   - GET /activities — syncs new activities on load, returns all ordered by date desc
#   - GET /activities/{activity_id} — returns single activity detail (user ownership verified)
# Edge cases to test:
#   - Unauthenticated request (no session cookie) → 401
#   - User with no synced activities → empty list []
#   - activity_id not found → 404
#   - activity_id belongs to a different user → 404 (not 403, to avoid ID enumeration)
#   - Strava API down during sync — error is logged, existing activities still returned
#   - Activity without HR monitor — average_hr and max_hr null in response
#   - strava_activity_id deduplication — sync never creates duplicate rows

# READY FOR QA
# Feature: Post-run analysis endpoint (TASK-007)
# What was built:
#   - POST /activities/{activity_id}/analyze — triggers Pak Har's analysis for a specific run
#   - Activity ownership guard: 404 if activity belongs to another user (no ID enumeration)
#   - Rate limited (shared in-memory sliding window: 20 req/60s per user)
#   - Full streamed response from Ollama collected first, then persisted and returned as JSON
#   - Analysis stored in activity.analysis + activity.analysis_generated_at (UTC)
#   - Analysis prompt is specific to the run: distance, pace, time, elevation, HR, date, name
# Edge cases to test:
#   - Unauthenticated → 401
#   - Activity not found → 404
#   - Activity belongs to different user → 404 (not 403)
#   - Rate limit hit → 429
#   - Ollama offline → 503
#   - Ollama timeout (>60s) → 504
#   - Activity without HR data — HR lines omitted from context, prompt still valid
#   - Re-analyzing an already-analyzed activity — overwrites previous analysis (idempotent by design)

"""
Activities router.

Endpoints:
- GET  /activities                      — list all user's synced activities (triggers sync on load)
- GET  /activities/{id}                 — single activity detail
- POST /activities/{id}/analyze         — generate Pak Har's post-run analysis (Ollama)
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.activity import Activity
from models.user import User
from schemas.activity import ActivityRead
from services.database import get_db
from services.ollama import format_pace, stream_chat
from services.rate_limiter import check_rate_limit
from services.strava import get_valid_access_token, sync_activities

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=list[ActivityRead])
async def list_activities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityRead]:
    """
    List all synced running activities for the authenticated user.

    Triggers a Strava sync on every load to pull in any new activities
    since the last sync. Existing activities are never overwritten.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200):** List of ActivityRead objects ordered by activity_date descending.

    **Errors:**
    - 401: Not authenticated (no session cookie or user not found)
    """
    try:
        access_token = await get_valid_access_token(current_user, db)
        new_count = await sync_activities(current_user.id, access_token, db)
        if new_count > 0:
            logger.info(f"Synced {new_count} new activities for user {current_user.id}")
    except Exception as exc:
        logger.error(f"Activity sync failed for user {current_user.id}: {exc}")

    activities = (
        db.query(Activity)
        .filter(Activity.user_id == current_user.id)
        .order_by(Activity.activity_date.desc())
        .all()
    )

    return activities


@router.get("/{activity_id}", response_model=ActivityRead)
async def get_activity(
    activity_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityRead:
    """
    Retrieve a single activity by its internal ID.

    Only returns the activity if it belongs to the authenticated user.
    Returns 404 (not 403) for activities belonging to other users to avoid
    leaking information about which IDs exist.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200):** ActivityRead object.

    **Errors:**
    - 401: Not authenticated
    - 404: Activity not found or does not belong to this user
    """
    activity = (
        db.query(Activity)
        .filter(
            Activity.id == activity_id,
            Activity.user_id == current_user.id,
        )
        .first()
    )

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    return activity


@router.post("/{activity_id}/analyze")
async def analyze_activity(
    activity_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    POST /activities/{activity_id}/analyze — generate Pak Har's post-run analysis.

    Fetches the activity (ownership-guarded), builds a specific context string for
    this single run, calls Ollama via stream_chat, collects the full response, then
    persists it to activity.analysis and returns it as JSON.

    The response is NOT streamed — the full analysis is assembled first, stored, then
    returned so the frontend can treat it like any other JSON endpoint.

    Rate limited: shared in-memory sliding window, 20 req/60s per user.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200):**
    ```json
    { "analysis": "<Pak Har's analysis text>" }
    ```

    **Errors:**
    - 401: Not authenticated
    - 404: Activity not found or does not belong to this user
    - 429: Rate limit exceeded
    - 503: Ollama not running or unreachable
    - 504: Ollama did not respond within 60 seconds
    """
    # 1. Rate limit check (shared window with /coach/chat)
    if not check_rate_limit(current_user.id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Wait a moment before requesting another analysis.",
        )

    # 2. Fetch activity with ownership guard
    activity = (
        db.query(Activity)
        .filter(
            Activity.id == activity_id,
            Activity.user_id == current_user.id,
        )
        .first()
    )

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # 3. Build a specific context string for this single run
    run_date = activity.activity_date.date().isoformat()
    pace_str = format_pace(activity.average_pace_min_per_km)

    moving_minutes = activity.moving_time_seconds // 60
    moving_seconds = activity.moving_time_seconds % 60
    moving_time_str = f"{moving_minutes}m {moving_seconds}s"

    context_lines = [
        f"Run: {activity.name}",
        f"Date: {run_date}",
        f"Distance: {activity.distance_km:.2f} km",
        f"Moving time: {moving_time_str}",
        f"Average pace: {pace_str} min/km",
        f"Elevation gain: {activity.elevation_gain_m} m",
    ]

    if activity.average_hr is not None:
        context_lines.append(f"Average heart rate: {activity.average_hr} bpm")
    if activity.max_hr is not None:
        context_lines.append(f"Max heart rate: {activity.max_hr} bpm")

    activity_context = "\n".join(context_lines)

    # 4. Build the analysis prompt for Pak Har
    analysis_prompt = (
        f"Analyze this specific run. Give your honest assessment of the effort level, "
        f"what the numbers tell you about what went well, and one or two concrete things "
        f"to improve next time. Be specific to this run — not general advice.\n\n"
        f"Run data:\n{activity_context}"
    )

    # 5. Collect the full streamed response from Ollama
    try:
        chunks: list[str] = []
        async for chunk in stream_chat(
            user_message=analysis_prompt,
            strava_context=activity_context,
            chat_history=[],
        ):
            chunks.append(chunk)

    except RuntimeError as exc:
        logger.error(
            "Ollama unavailable while analyzing activity_id=%d for user_id=%d: %s",
            activity_id,
            current_user.id,
            exc,
        )
        raise HTTPException(status_code=503, detail=str(exc))

    except TimeoutError as exc:
        logger.error(
            "Ollama timeout while analyzing activity_id=%d for user_id=%d: %s",
            activity_id,
            current_user.id,
            exc,
        )
        raise HTTPException(status_code=504, detail=str(exc))

    full_analysis = "".join(chunks)

    # 6. Persist the analysis to the activity record
    activity.analysis = full_analysis
    activity.analysis_generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(activity)

    logger.info(
        "Analysis generated for activity_id=%d user_id=%d (%d chars)",
        activity_id,
        current_user.id,
        len(full_analysis),
    )

    # 7. Return the full analysis as JSON
    return {"analysis": full_analysis}

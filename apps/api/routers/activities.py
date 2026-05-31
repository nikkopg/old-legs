# READY FOR QA
# Feature: Activity list filtering, search, and server-side pagination (TASK-107)
# What was built:
#   - GET /activities — v2: now accepts query params for filtering + pagination
#     - start_date / end_date: filter on activity_date (ISO date strings)
#     - min_distance_km / max_distance_km: filter on distance_km (floats)
#     - search: case-insensitive substring match on activity name (ilike)
#     - page / per_page: server-side pagination (per_page capped at 100)
#   - Response shape changed from a plain array to { items, total, page, per_page }
# Edge cases to test:
#   - Unauthenticated request → 401
#   - No filters → returns first page of all user activities, ordered by date desc
#   - start_date after end_date → returns empty items list (total 0), not an error
#   - min_distance_km > max_distance_km → returns empty items list, not an error
#   - search with no matches → empty items list (total 0)
#   - page beyond last page → empty items list, total reflects actual count
#   - per_page > 100 → FastAPI rejects with 422 (Query le=100)
#   - per_page = 0 or page = 0 → FastAPI rejects with 422 (Query ge=1)
#   - Strava sync failure — logged, filters/pagination still applied to existing data
#   - Activity without HR monitor — average_hr and max_hr null in response
#   - All filter params combined — all filters are ANDed together
# ⚠️  BREAKING CHANGE for Frontend (TASK-115):
#   The response shape has changed from a plain array to a paginated object.
#   Frontend activities page must be updated to read `response.items` instead of
#   treating the response directly as an array, and must handle total/page/per_page
#   for pagination UI. Flag this when handing off to the Frontend agent.

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
# Feature: Post-run analysis — SSE streaming conversion (TASK-190)
# What was built:
#   - POST /activities/{activity_id}/analyze — now returns text/event-stream (StreamingResponse)
#   - run_analysis_for_activity (services/coach.py) is now an async generator yielding SSE strings
#   - Five progress events yielded before each stage's work:
#       1. "Pulling your splits"   — fetch activity, recent activities, splits context
#       2. "Reading the zones"     — build HR zone context via build_analysis_context()
#       3. "Checking your history" — fetch prior analyses, weekly review, planned session
#       4. "Writing the dispatch"  — format ANALYSIS_PROMPT + main Ollama streaming call (collected)
#       5. "Filing the verdict"    — second non-streaming Ollama call for verdict fields
#   - complete event: {"analysis": str, "verdict_short": str|null, "verdict_tag": str|null, "tone": str|null}
#   - error event emitted on any exception — never raises HTTP 5xx from the stream
#   - DB write (activity.analysis + verdict fields) happens after complete_event yield
#   - Rate limit check and ownership guard still fire before the generator starts (HTTP 429/404)
# Edge cases to test:
#   - Unauthenticated → 401 (before stream)
#   - Activity not found → 404 (before stream) for ownership guard
#   - Rate limit hit → 429 (before stream)
#   - Activity not found inside generator (edge case) → error event in stream
#   - Ollama offline → error event in stream
#   - Ollama timeout → error event in stream
#   - Activity with average_hr=None → no HR content in prompt; complete event still emitted
#   - Activity named "Easy Run" with zone 4 HR → mismatch flag in prompt
#   - Fewer than 3 comparable recent runs → no fatigue trend note
#   - HR rising across 3+ comparable runs at same distance → fatigue trend in prompt
#   - Re-analyzing an already-analyzed activity — overwrites previous analysis (idempotent)
#   - Verdict extraction: Ollama returns malformed JSON → verdict fields null, complete event emitted
#   - Verdict extraction: Ollama returns invalid verdict_tag or tone → stored as null
#   - Verdict extraction: empty full_analysis string → extraction skipped, complete event emitted
#   - 5 progress events in order before complete event
#   - Response headers: Cache-Control: no-cache, X-Accel-Buffering: no

"""
Activities router.

Endpoints:
- GET  /activities                      — list all user's synced activities (triggers sync on load)
- GET  /activities/{id}                 — single activity detail
- POST /activities/{id}/analyze         — generate Pak Har's post-run analysis (Ollama)
"""

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import httpx

from config import settings
from dependencies import get_current_user
from models.activity import Activity
from models.user import User
from schemas.activity import ActivityListResponse, ActivityRead, ActivityRpeUpdate, PlanVerdictRequest, PlanVerdictResponse
from services.coach import run_analysis_for_activity
from services.database import get_db
from services.ollama import OLLAMA_BASE_URL, CONNECT_TIMEOUT, READ_TIMEOUT
from services.rate_limiter import check_rate_limit
from services.strava import get_valid_access_token, sync_activities

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=ActivityListResponse)
async def list_activities(
    start_date: Optional[date] = Query(default=None, description="Filter activities on or after this date (ISO 8601, e.g. 2026-03-01)"),
    end_date: Optional[date] = Query(default=None, description="Filter activities on or before this date (ISO 8601, e.g. 2026-04-18)"),
    min_distance_km: Optional[float] = Query(default=None, ge=0, description="Minimum activity distance in kilometres"),
    max_distance_km: Optional[float] = Query(default=None, ge=0, description="Maximum activity distance in kilometres"),
    search: Optional[str] = Query(default=None, description="Case-insensitive substring match on activity name"),
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    per_page: int = Query(default=20, ge=1, le=100, description="Results per page (max 100)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityListResponse:
    """
    List synced running activities for the authenticated user with optional filtering,
    search, and server-side pagination.

    Triggers a Strava sync on every load to pull in any new activities since the last
    sync. Existing activities are never overwritten.

    All filter params are optional and ANDed together.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200):** Paginated ActivityListResponse with items, total, page, per_page.

    **Errors:**
    - 401: Not authenticated (no session cookie or user not found)
    - 422: Invalid query param values (e.g. per_page > 100, page < 1)
    """
    try:
        access_token = await get_valid_access_token(current_user, db)
        new_count = await sync_activities(current_user.id, access_token, db)
        if new_count > 0:
            logger.info("Synced %d new activities for user %d", new_count, current_user.id)
    except Exception as exc:
        logger.error("Activity sync failed for user %d: %s", current_user.id, exc)

    query = (
        db.query(Activity)
        .filter(Activity.user_id == current_user.id)
    )

    if start_date is not None:
        query = query.filter(Activity.activity_date >= datetime(start_date.year, start_date.month, start_date.day))

    if end_date is not None:
        from datetime import timedelta
        query = query.filter(Activity.activity_date < datetime.combine(end_date + timedelta(days=1), datetime.min.time()))

    if min_distance_km is not None:
        query = query.filter(Activity.distance_km >= min_distance_km)

    if max_distance_km is not None:
        query = query.filter(Activity.distance_km <= max_distance_km)

    if search is not None and search.strip():
        query = query.filter(Activity.name.ilike(f"%{search.strip()}%"))

    total = query.count()

    activities = (
        query
        .order_by(Activity.activity_date.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return ActivityListResponse(
        items=activities,
        total=total,
        page=page,
        per_page=per_page,
    )


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


# READY FOR QA
# Feature: RPE (Rate of Perceived Exertion) save endpoint
# What was built: PATCH /activities/{id}/rpe
# Edge cases to test:
#   - Unauthenticated → 401
#   - activity_id not found → 404
#   - activity_id belongs to another user → 404 (not 403, no ID enumeration)
#   - rpe=null (body: {"rpe": null}) → clears any existing RPE value, returns ActivityRead
#   - rpe=1 (min) → accepted
#   - rpe=10 (max) → accepted
#   - rpe=0 → 422 (out of range)
#   - rpe=11 → 422 (out of range)
#   - rpe omitted from body entirely → 422 (required field)
#   - rpe=-1 → 422 (out of range)


@router.patch("/{activity_id}/rpe", response_model=ActivityRead)
async def update_activity_rpe(
    activity_id: int,
    body: ActivityRpeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityRead:
    """
    PATCH /activities/{activity_id}/rpe — save or clear the runner's RPE for a run.

    RPE (Rate of Perceived Exertion) is a 1–10 integer that the runner provides
    after completing a run to indicate how hard it felt. Pass null to clear a
    previously saved value.

    Range is validated by the request schema (1–10 when not null). The DB stores
    any integer — range enforcement lives at this layer only.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Request body:** `{ "rpe": 1–10 | null }`

    **Response (200):** Full `ActivityRead` object with `rpe` updated.

    **Errors:**
    - 401: Not authenticated
    - 404: Activity not found or does not belong to this user
    - 422: rpe value out of range (not 1–10) or request body malformed
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

    activity.rpe = body.rpe
    db.commit()
    db.refresh(activity)

    logger.info(
        "RPE updated for activity_id=%d user_id=%d rpe=%r",
        activity_id,
        current_user.id,
        body.rpe,
    )

    return activity


@router.post("/{activity_id}/analyze")
async def analyze_activity(
    activity_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    POST /activities/{activity_id}/analyze — generate Pak Har's post-run analysis as SSE.

    Streams progress events as each pipeline stage runs, then a complete event
    containing the full analysis text and structured verdict fields. The Activity row
    is updated after the complete event is emitted.

    Rate limited: shared in-memory sliding window, 20 req/60s per user.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response: text/event-stream**
    - Progress events: ``{"type": "progress", "step": "<label>", "elapsed_ms": <int>}``
    - Complete event: ``{"type": "complete", "data": {"analysis": str, "verdict_short": str|null, "verdict_tag": str|null, "tone": str|null}}``
    - Error event: ``{"type": "error", "message": str}``

    Five progress step labels in order:
    1. "Pulling your splits"
    2. "Reading the zones"
    3. "Checking your history"
    4. "Writing the dispatch"
    5. "Filing the verdict"

    **Pre-stream errors (HTTP error codes, no SSE body):**
    - 401: Not authenticated
    - 404: Activity not found or does not belong to this user
    - 429: Rate limit exceeded
    """
    # 1. Rate limit check (shared window with /coach/chat) — fires before the stream starts.
    if not check_rate_limit(current_user.id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Wait a moment before requesting another analysis.",
        )

    # 2. Ownership guard — 404 if activity not found or belongs to another user.
    #    This check fires before the stream starts so the client gets a real HTTP 404,
    #    not an in-stream error event.
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

    # 3. Stream the full analysis pipeline via SSE.
    return StreamingResponse(
        run_analysis_for_activity(activity_id, current_user, db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# READY FOR QA
# Feature: Plan-aware activity verdict (TASK-149)
# What was built:
#   - POST /activities/{id}/plan-verdict
#   - Takes target (e.g. "40 min, HR < 140 bpm") and session_type (e.g. "EASY")
#   - Builds a compact activity summary and calls Ollama (non-streaming) to compare
#     actual run data against what the plan required
#   - Returns verdict_short (≤12 words), verdict_tag, and tone — stateless, nothing persisted
# Edge cases to test:
#   - Unauthenticated → 401
#   - activity_id not found → 404
#   - activity_id belongs to another user → 404 (not 403, no ID enumeration)
#   - activity.analysis is None → immediate fallback response (no Ollama call)
#   - Ollama returns valid JSON → parsed, validated, returned
#   - Ollama returns malformed JSON → fallback {"verdict_short": null, "verdict_tag": null, "tone": "neutral"}
#   - Ollama returns out-of-range verdict_tag or tone → nulled out, endpoint still returns 200
#   - Ollama unreachable (ConnectError) → fallback (no crash)
#   - Ollama timeout (ReadTimeout) → fallback (no crash)
#   - Activity with no HR monitor (average_hr=None) → "not recorded" injected in prompt
#   - session_type and target with unusual casing/characters → passed as-is to the prompt


@router.post("/{activity_id}/plan-verdict", response_model=PlanVerdictResponse)
async def plan_verdict(
    activity_id: int,
    body: PlanVerdictRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PlanVerdictResponse:
    """
    POST /activities/{activity_id}/plan-verdict — plan-aware verdict for a matched activity.

    Compares what the training plan required for a session against what the runner
    actually did. Returns a short Pak Har verdict, a tag, and a tone classification.

    This is a stateless endpoint — nothing is persisted to the database.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Request body:**
    ```json
    { "target": "40 min, HR < 140 bpm", "session_type": "EASY" }
    ```

    **Response (200):**
    ```json
    { "verdict_short": "5 minutes short and HR drifted over 140 in the last km.",
      "verdict_tag": "PACED POORLY",
      "tone": "critical" }
    ```
    All fields are null if Ollama is unavailable, returns malformed JSON, or the
    activity has no analysis. The endpoint always returns 200 — it never crashes.

    **Errors:**
    - 401: Not authenticated
    - 404: Activity not found or does not belong to this user
    """
    import json as _json

    _FALLBACK = PlanVerdictResponse(verdict_short=None, verdict_tag=None, tone="neutral")

    _VERDICT_TAGS = frozenset({
        "PACED POORLY", "ON PLAN", "HELD THE LINE", "FADED LATE",
        "FUELING", "RESTRAINED", "STEADY", "NO SHOW",
    })
    _TONES = frozenset({"critical", "good", "neutral"})

    # 1. Fetch the activity — ownership-guarded (404 for other users, no ID enumeration).
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

    # 2. Build the compact activity summary for the prompt.
    moving_time_min = round(activity.moving_time_seconds / 60)

    from services.context import format_pace
    pace_str = format_pace(activity.average_pace_min_per_km)

    avg_hr_str = f"{activity.average_hr} bpm" if activity.average_hr is not None else "not recorded"

    user_message = (
        f"Plan for this session: {body.session_type} — {body.target}\n\n"
        f"What actually happened:\n"
        f"- Distance: {activity.distance_km:.1f} km\n"
        f"- Duration: {moving_time_min} min\n"
        f"- Avg pace: {pace_str} min/km\n"
        f"- Avg HR: {avg_hr_str}\n\n"
        f"Evaluate how well this run matched the plan. Be specific. "
        f"One sentence max 12 words, no praise, no fluff.\n\n"
        f"Also output:\n"
        f"- verdict_tag: exactly one of: "
        f"PACED POORLY | ON PLAN | HELD THE LINE | FADED LATE | "
        f"FUELING | RESTRAINED | STEADY | NO SHOW\n"
        f"- tone: exactly one of: critical | good | neutral\n\n"
        'Respond with only valid JSON: {"verdict_short": "...", "verdict_tag": "...", "tone": "..."}'
    )

    payload = {
        "model": settings.get_ollama_model(),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Pak Har. You are 70 years old. You have been running since before GPS existed. "
                    "You are blunt, specific, and never give vague advice. No emojis. No hollow affirmations. "
                    "No exclamation points. Never say 'amazing', 'superstar', 'rockstar', or 'you got this'. "
                    "Reference the actual data. Name what happened. No vague praise. "
                    "Output only valid JSON, no markdown, no explanation."
                ),
            },
            {"role": "user", "content": user_message},
        ],
        "stream": False,
    }

    url = f"{OLLAMA_BASE_URL}/api/chat"
    logger.info(
        "Requesting plan-verdict from Ollama for activity_id=%d user_id=%d",
        activity_id,
        current_user.id,
    )

    # 4. Non-streaming Ollama call — any exception returns the fallback (never crashes).
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=10.0, pool=5.0)
        ) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            response_data = response.json()

        raw_content: str = (
            response_data.get("message", {}).get("content", "")
            or response_data.get("response", "")
        ).strip()

        parsed = _json.loads(raw_content)

        raw_verdict_short = parsed.get("verdict_short")
        raw_verdict_tag = parsed.get("verdict_tag")
        raw_tone = parsed.get("tone")

        verdict_short: str | None = str(raw_verdict_short).strip() if raw_verdict_short else None

        raw_tag_upper = str(raw_verdict_tag).strip().upper() if raw_verdict_tag else None
        verdict_tag: str | None = raw_tag_upper if raw_tag_upper in _VERDICT_TAGS else None

        raw_tone_lower = str(raw_tone).strip().lower() if raw_tone else None
        tone: str | None = raw_tone_lower if raw_tone_lower in _TONES else None

        logger.info(
            "plan-verdict succeeded for activity_id=%d: tag=%r tone=%r",
            activity_id,
            verdict_tag,
            tone,
        )

        return PlanVerdictResponse(
            verdict_short=verdict_short,
            verdict_tag=verdict_tag,
            tone=tone,
        )

    except Exception as exc:  # noqa: BLE001 — intentionally broad; must never crash
        logger.error(
            "plan-verdict failed for activity_id=%d: %s",
            activity_id,
            exc,
        )
        return _FALLBACK

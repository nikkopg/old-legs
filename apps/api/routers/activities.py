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
# Feature: Post-run analysis with HR zone interpretation (TASK-007 + TASK-109)
# Feature: Structured verdict extraction — verdict_short, verdict_tag, tone (TASK-133)
# What was built:
#   - POST /activities/{activity_id}/analyze — triggers Pak Har's analysis for a specific run
#   - Activity ownership guard: 404 if activity belongs to another user (no ID enumeration)
#   - Rate limited (shared in-memory sliding window: 20 req/60s per user)
#   - Full streamed response from Ollama collected first, then persisted and returned as JSON
#   - Analysis stored in activity.analysis + activity.analysis_generated_at (UTC)
#   - build_analysis_context() (services/coach.py) assembles run data + HR zone context:
#       - average_hr classified into zone 1–5 (assumed max HR 185 bpm)
#       - easy-run name + zone 3+ HR → mismatch flag injected into context
#       - HR rising across last 3 comparable-distance runs → fatigue trend note injected
#       - average_hr is None → HR section omitted entirely, no HR lines in prompt
#   - ANALYSIS_PROMPT used (prompts/pak_har.py) — separate from SYSTEM_PROMPT used for chat
#   - Second non-streaming Ollama call extracts structured verdict fields from the analysis text:
#       - verdict_short: one-line summary ≤12 words (no praise, no fluff)
#       - verdict_tag: one of PACED POORLY | ON PLAN | HELD THE LINE | FADED LATE |
#                            FUELING | RESTRAINED | STEADY | NO SHOW
#       - tone: one of critical | good | neutral
#     Stored on the Activity row alongside the analysis. If the extraction call fails or
#     Ollama returns malformed JSON / out-of-range values, all three fields are stored as
#     null — the long-form analysis is always persisted regardless.
# Edge cases to test:
#   - Unauthenticated → 401
#   - Activity not found → 404
#   - Activity belongs to different user → 404 (not 403)
#   - Rate limit hit → 429
#   - Ollama offline → 503
#   - Ollama timeout (>60s) → 504
#   - Activity with average_hr=None → no HR content in prompt or response
#   - Activity named "Easy Run" with zone 4 HR → mismatch flag in prompt
#   - Fewer than 3 comparable recent runs → no fatigue trend note
#   - HR rising across 3+ comparable runs at same distance → fatigue trend in prompt
#   - Re-analyzing an already-analyzed activity — overwrites previous analysis (idempotent)
#   - Verdict extraction: Ollama returns malformed JSON → verdict fields stored as null (no crash)
#   - Verdict extraction: Ollama returns invalid verdict_tag or tone value → stored as null
#   - Verdict extraction: Ollama offline on second call → verdict fields null, analysis still saved
#   - Verdict extraction: empty full_analysis string → extraction skipped, fields stored as null

"""
Activities router.

Endpoints:
- GET  /activities                      — list all user's synced activities (triggers sync on load)
- GET  /activities/{id}                 — single activity detail
- POST /activities/{id}/analyze         — generate Pak Har's post-run analysis (Ollama)
"""

import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import httpx

from config import settings
from dependencies import get_current_user
from models.activity import Activity
from models.user import User
from prompts.pak_har import ANALYSIS_PROMPT
from schemas.activity import ActivityListResponse, ActivityRead
from services.coach import build_analysis_context
from services.database import get_db
from services.ollama import OLLAMA_BASE_URL, _CONNECT_TIMEOUT, _READ_TIMEOUT
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

    # 3. Fetch recent activities for HR trend detection (excluding the current one).
    #    Ordered by date desc; build_analysis_context() will pick comparable runs from this list.
    recent_activities = (
        db.query(Activity)
        .filter(
            Activity.user_id == current_user.id,
            Activity.id != activity_id,
            Activity.sync_status == "synced",
        )
        .order_by(Activity.activity_date.desc())
        .limit(20)
        .all()
    )

    # 4. Build the run context string (basic stats + HR zone classification, mismatch,
    #    and trend — all gated on average_hr being non-null inside the service).
    run_context = build_analysis_context(activity, recent_activities)

    # 5. Build the hr_zone_context string for the prompt placeholder.
    #    When HR data is absent, the placeholder makes the absence explicit so
    #    ANALYSIS_PROMPT knows to skip all HR commentary.
    if activity.average_hr is not None:
        # Extract just the HR-related lines from run_context (lines 7 onward after basic stats).
        # Simpler: pass a dedicated hr-only summary so ANALYSIS_PROMPT has a clean slot.
        hr_zone_context = "\n".join(
            line for line in run_context.splitlines()
            if any(
                keyword in line.lower()
                for keyword in ("heart rate", "hr zone", "mismatch", "hr trend", "fatigue")
            )
        ) or "(HR data present but no zone lines extracted — check build_analysis_context)"
    else:
        hr_zone_context = "(no heart rate data for this run)"

    # 6. Assemble the system prompt with run context and HR zone context injected.
    system_content = ANALYSIS_PROMPT.format(
        run_context=run_context,
        hr_zone_context=hr_zone_context,
    )

    payload = {
        "model": settings.get_ollama_model(),
        "messages": [
            {"role": "system", "content": system_content},
            {
                "role": "user",
                "content": "Give me your analysis of this run.",
            },
        ],
        "stream": True,
    }

    url = f"{OLLAMA_BASE_URL}/api/chat"
    logger.info(
        "Requesting post-run analysis from Ollama for activity_id=%d user_id=%d",
        activity_id,
        current_user.id,
    )

    # 7. Stream the response from Ollama, collect chunks into full_analysis.
    import json as _json

    chunks: list[str] = []
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=10.0, pool=5.0)
        ) as client:
            async with client.stream("POST", url, json=payload) as response:
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    logger.error(
                        "Ollama returned %d for activity analysis (activity_id=%d)",
                        exc.response.status_code,
                        activity_id,
                    )
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            f"Ollama returned {exc.response.status_code}. "
                            f"Make sure the model is available: "
                            f"ollama pull {settings.get_ollama_model()}"
                        ),
                    ) from exc
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = _json.loads(line)
                    except _json.JSONDecodeError:
                        logger.warning(
                            "Non-JSON line from Ollama during analysis (activity_id=%d) — skipping",
                            activity_id,
                        )
                        continue
                    if data.get("done"):
                        break
                    content = data.get("message", {}).get("content")
                    if content:
                        chunks.append(content)

    except httpx.ConnectError as exc:
        logger.error(
            "Ollama unreachable while analyzing activity_id=%d for user_id=%d",
            activity_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=503,
            detail="Pak Har is unavailable right now. Make sure Ollama is running.",
        ) from exc

    except httpx.ReadTimeout as exc:
        logger.error(
            "Ollama timeout while analyzing activity_id=%d for user_id=%d",
            activity_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=504,
            detail="Pak Har took too long to respond.",
        ) from exc

    full_analysis = "".join(chunks)

    # 8. Persist the long-form analysis to the activity record.
    #    Always committed here — the verdict extraction below is best-effort only.
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

    # 9. Second Ollama call — structured verdict extraction.
    #    Non-streaming. Extracts verdict_short, verdict_tag, and tone from the full analysis.
    #    Any failure (network error, JSON parse error, invalid enum value) is caught and
    #    logged — fields are stored as null and the endpoint still returns 200.
    _VERDICT_TAGS = frozenset({
        "PACED POORLY", "ON PLAN", "HELD THE LINE", "FADED LATE",
        "FUELING", "RESTRAINED", "STEADY", "NO SHOW",
    })
    _TONES = frozenset({"critical", "good", "neutral"})

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
                timeout=httpx.Timeout(connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=10.0, pool=5.0)
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
            verdict_tag = str(raw_verdict_tag).strip().upper() if raw_verdict_tag and str(raw_verdict_tag).strip().upper() in _VERDICT_TAGS else None
            tone = str(raw_tone).strip().lower() if raw_tone and str(raw_tone).strip().lower() in _TONES else None

            logger.info(
                "Verdict extraction succeeded for activity_id=%d: tag=%r tone=%r",
                activity_id,
                verdict_tag,
                tone,
            )

        except Exception as exc:  # noqa: BLE001 — intentionally broad; extraction must never crash analysis
            logger.error(
                "Verdict extraction failed for activity_id=%d: %s",
                activity_id,
                exc,
            )
            verdict_short = None
            verdict_tag = None
            tone = None
    else:
        logger.warning(
            "Skipping verdict extraction for activity_id=%d — analysis text is empty",
            activity_id,
        )

    # 10. Persist verdict fields and commit.
    activity.verdict_short = verdict_short
    activity.verdict_tag = verdict_tag
    activity.tone = tone
    db.commit()
    db.refresh(activity)

    # 11. Return the full analysis as JSON.
    return {"analysis": full_analysis}

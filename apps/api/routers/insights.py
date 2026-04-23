# QA COMPLETE — TASK-120 passed. No blockers.
# Feature: Multi-week insights endpoint (TASK-106)
# What was built:
#   - GET /insights — aggregated trend stats + Pak Har commentary for the last 6 weeks
#     - Looks back 42 days from today (UTC) for synced activities with distance_km > 0
#     - Returns 404 with "Not enough data for insights. Keep running." if < 2 distinct
#       ISO calendar weeks have activity data
#     - Computed stats:
#         weeks_analyzed    — distinct ISO weeks (≤ 6) with ≥ 1 run
#         avg_weekly_km     — total km / weeks_analyzed, 1 decimal
#         avg_pace_min_per_km — distance-weighted average pace, 2 decimals
#         pace_trend        — "improving" | "declining" | "stable" (3 s/km threshold,
#                             comparing first half vs second half of the time window)
#         consistency_pct   — (weeks_analyzed / 6) * 100, nearest int
#     - Calls Ollama non-streaming (stream: false) with the above stats + weekly km
#       breakdown + user.weekly_km_target + user.biggest_struggle
#     - Returns InsightsRead schema including generated_at (UTC now)
# Edge cases to test:
#   - Unauthenticated → 401
#   - Fewer than 2 distinct weeks with synced activities → 404 ("Not enough data...")
#   - Exactly 2 weeks of data → proceeds normally (weeks_analyzed = 2)
#   - All 6 weeks present → weeks_analyzed = 6, consistency_pct = 100
#   - Some weeks empty (no synced activities) → weeks_analyzed reflects only weeks
#     that have ≥ 1 synced run; consistency_pct drops accordingly
#   - Activities with distance_km = 0 or sync_status != "synced" → excluded from all stats
#   - pace_trend = "improving" — avg pace of second half of window < first half by > 3 s/km
#   - pace_trend = "declining" — avg pace of second half > first half by > 3 s/km
#   - pace_trend = "stable"    — difference ≤ 3 s/km, or one half has no valid data
#   - user.biggest_struggle = None → prompt omits struggle line gracefully
#   - user.weekly_km_target = 0 → prompt notes "no target set"
#   - Ollama offline → 503
#   - Ollama timeout → 504
#   - Only activities from a single week within the 42-day window → 404

"""
Insights router.

Endpoints:
    GET /insights — multi-week trend stats + Pak Har's honest multi-week commentary
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.user import User
from schemas.insights import InsightsRead
from services.database import get_db
from services.insights import generate_insights

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=InsightsRead)
async def get_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InsightsRead:
    """
    GET /insights — aggregated multi-week trend stats and Pak Har commentary.

    Analyses the last 6 weeks (42 days) of the user's synced running activity.
    Requires at least 2 distinct calendar weeks with activity data; returns 404
    otherwise.

    Stats returned:
    - **weeks_analyzed** — distinct ISO weeks with ≥ 1 run (max 6)
    - **avg_weekly_km** — total km / weeks_analyzed
    - **avg_pace_min_per_km** — distance-weighted average pace
    - **pace_trend** — "improving" | "declining" | "stable" (3 s/km threshold)
    - **consistency_pct** — percentage of the 6-week window with at least one run
    - **pak_har_commentary** — 2–3 sentence Ollama-generated assessment + one directive

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200):** `InsightsRead`

    **Errors:**
    - 401: Not authenticated
    - 404: Fewer than 2 weeks of data ("Not enough data for insights. Keep running.")
    - 503: Ollama is not running or unreachable
    - 504: Ollama did not respond within the timeout
    """
    try:
        insights = await generate_insights(user=current_user, db=db)
    except ValueError as exc:
        logger.info(
            "Insights request for user_id=%d rejected — insufficient data: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=404,
            detail="Not enough data for insights. Keep running.",
        ) from exc
    except RuntimeError as exc:
        logger.error(
            "Ollama unavailable during insights for user_id=%d: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TimeoutError as exc:
        logger.error(
            "Ollama timeout during insights for user_id=%d: %s",
            current_user.id,
            exc,
        )
        raise HTTPException(status_code=504, detail=str(exc)) from exc

    return insights

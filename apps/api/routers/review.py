# READY FOR QA
# Feature: Weekly review endpoints — SSE streaming conversion (TASK-186)
# What was built:
#   - POST /review/generate — now returns text/event-stream (StreamingResponse).
#     generate_weekly_review is an async generator that yields SSE progress events before
#     each stage, a complete event on success (with text/headline/verdict_tag/tone), and
#     an error event on any failure. The WeeklyReview row is still persisted to the DB.
#   - GET /review/current — unchanged. Returns the most recent WeeklyReview as JSON.
# Edge cases to test:
#   - Rate limit exceeded (>20 req/60s): 429 returned before stream starts.
#   - Unauthenticated requests: 401 returned before stream starts.
#   - Ollama offline: error event in stream with RuntimeError message.
#   - Ollama timeout: error event in stream with TimeoutError message.
#   - Ollama returns empty content: error event in stream.
#   - No active training plan: stream completes with planned_runs=0.
#   - No activities this week: stream completes with actual_runs=0.
#   - Happy path: 5 progress events followed by one complete event.
#   - GET /review/current with no reviews ever generated: 404 returned.
#   - Multiple reviews exist: GET /review/current returns the newest one (created_at DESC).

"""
Weekly review router.

Endpoints:
    POST /review/generate  — generate a new weekly planned-vs-actual review via Ollama
    GET  /review/current   — retrieve the most recent weekly review
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.user import User
from schemas.weekly_review import WeeklyReviewRead
from services.database import get_db
from services.rate_limiter import check_rate_limit
from services.review import generate_weekly_review, get_current_review

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate")
async def generate_review(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Generate Pak Har's weekly review for the authenticated user as an SSE stream.

    Compares the active TrainingPlan's planned run count (0 when no plan exists)
    against Activity records from the current week. Streams progress events as each
    stage completes, then a complete event containing the review text and verdict
    fields. The WeeklyReview row is persisted to the DB before the complete event
    is sent. Generates successfully even when no active training plan is on file.

    Rate limited: 20 requests/60s per user (shared sliding window).

    Response: text/event-stream
      progress events: {"type": "progress", "step": "<label>", "elapsed_ms": <int>}
      complete event:  {"type": "complete", "data": {"text": str, "headline": str|null,
                        "verdict_tag": str|null, "tone": str|null}}
      error event:     {"type": "error", "message": str}

    Raises:
        401: Not authenticated.
        429: Rate limit exceeded (before stream starts).
    """
    if not check_rate_limit(user.id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Wait a moment before generating another review.",
        )

    return StreamingResponse(
        generate_weekly_review(user=user, db=db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/current", response_model=WeeklyReviewRead)
def get_current_review_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WeeklyReviewRead:
    """
    Return the most recent weekly review for the authenticated user.

    DB lookup only — no Ollama call.

    Raises:
        401: Not authenticated.
        404: No weekly review found for this user.
    """
    review = get_current_review(user_id=user.id, db=db)
    if review is None:
        raise HTTPException(
            status_code=404,
            detail="No weekly review found. Generate one with POST /review/generate.",
        )
    return WeeklyReviewRead.model_validate(review)

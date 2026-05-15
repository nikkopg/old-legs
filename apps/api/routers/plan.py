# READY FOR QA
# Feature: Weekly training plan generation — SSE streaming conversion (TASK-189)
# What was built:
#   - POST /plan/generate — now returns text/event-stream (StreamingResponse).
#     generate_plan_with_ollama is an async generator that yields SSE progress events before
#     each stage, a complete event on success (with the serialised TrainingPlan dict under
#     data.plan), and an error event on any failure. The TrainingPlan row is persisted to
#     the DB before the complete event is sent.
#   - GET /plan/current — unchanged. Returns the most recent active plan as JSON.
# Edge cases to test:
#   - Rate limit exceeded (>20 req/60s): 429 returned before stream starts.
#   - Unauthenticated requests: 401 returned before stream starts.
#   - No prior activity data: stream completes with plan generated on sparse context.
#   - Ollama offline: error event in stream with RuntimeError message.
#   - Ollama timeout: error event in stream with TimeoutError message.
#   - Ollama returns malformed JSON: error event in stream with ValueError message.
#   - Ollama wraps output in markdown code fences: parser strips them correctly.
#   - Multiple active plans before generate: all are deactivated, only new one is_active=True.
#   - Happy path: 5 progress events followed by one complete event with plan data.
#   - GET /plan/current with no plan: 404 returned.

"""
Training plan router.

Endpoints:
    POST /plan/generate  — generate a new 7-day plan via Ollama (SSE stream)
    GET  /plan/current   — retrieve the current active plan
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.user import User
from schemas.training_plan import TrainingPlanRead
from services.database import get_db
from services.plan import generate_plan_with_ollama, get_current_plan
from services.rate_limiter import check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate")
async def generate_plan(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Generate a new 7-day training plan for the authenticated user as an SSE stream.

    Calls Ollama with Pak Har's plan prompt and the user's last 4 weeks of
    activity data. Streams progress events as each stage completes, then a
    complete event containing the serialised TrainingPlan. Deactivates any
    previously active plan and persists the new one before emitting the
    complete event.

    Rate limited: 20 requests/60s per user (shared sliding window).

    Response: text/event-stream
      progress events: {"type": "progress", "step": "<label>", "elapsed_ms": <int>}
      complete event:  {"type": "complete", "data": {"plan": <TrainingPlanRead dict>}}
      error event:     {"type": "error", "message": str}

    Raises:
        401: Not authenticated.
        429: Rate limit exceeded (before stream starts).
    """
    if not check_rate_limit(user.id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Wait a moment before generating another plan.",
        )

    return StreamingResponse(
        generate_plan_with_ollama(user=user, db=db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/current", response_model=TrainingPlanRead)
def get_current_plan_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingPlanRead:
    """
    Return the most recent active training plan for the authenticated user.

    Raises:
        401: Not authenticated.
        404: No active plan exists for this user.
    """
    plan = get_current_plan(user_id=user.id, db=db)
    if plan is None:
        raise HTTPException(
            status_code=404,
            detail="No active training plan found. Generate one with POST /plan/generate.",
        )
    return TrainingPlanRead.model_validate(plan)

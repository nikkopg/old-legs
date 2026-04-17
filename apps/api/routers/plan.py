# READY FOR QA
# Feature: Weekly training plan generation (TASK-008)
# What was built:
#   - POST /plan/generate — generates a 7-day training plan via Ollama (Pak Har voice),
#     deactivates any prior active plan, persists and returns the new plan.
#   - GET /plan/current — returns the most recent active plan for the authenticated user.
# Edge cases to test:
#   - No prior activity data: Ollama receives "no recent activity" context — plan should
#     still be generated (conservative/beginner defaults expected from Pak Har).
#   - Ollama offline: 503 returned, no DB writes occur.
#   - Ollama returns malformed JSON: 500 returned with detail message.
#   - Ollama wraps output in markdown code fences (```json): parser strips them correctly.
#   - Multiple active plans before generate: all are deactivated, only new one is_active=True.
#   - GET /plan/current with no plan: 404 returned.
#   - Rate limit exceeded (>20 req/60s): 429 returned.
#   - Unauthenticated requests: 401 returned on both endpoints.

"""
Training plan router.

Endpoints:
    POST /plan/generate  — generate a new 7-day plan via Ollama
    GET  /plan/current   — retrieve the current active plan
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.user import User
from schemas.training_plan import TrainingPlanRead
from services.database import get_db
from services.plan import generate_plan_with_ollama, get_current_plan
from services.rate_limiter import check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate", response_model=TrainingPlanRead)
async def generate_plan(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingPlanRead:
    """
    Generate a new 7-day training plan for the authenticated user.

    Calls Ollama with Pak Har's plan prompt and the user's last 4 weeks of
    activity data. Deactivates any previously active plan, persists the new
    one, and returns it.

    Rate limited: 20 requests/60s per user (shared sliding window).

    Raises:
        401: Not authenticated.
        429: Rate limit exceeded.
        503: Ollama is not running or unreachable.
        504: Ollama did not respond within the timeout.
        500: Ollama returned a response that could not be parsed as a valid plan.
    """
    if not check_rate_limit(user.id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Wait a moment before generating another plan.",
        )

    try:
        plan = await generate_plan_with_ollama(user=user, db=db)
    except RuntimeError as exc:
        logger.error("Ollama unreachable during plan generation: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TimeoutError as exc:
        logger.error("Ollama timeout during plan generation: %s", exc)
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except ValueError as exc:
        logger.error("Plan parse error for user_id=%d: %s", user.id, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Plan generation failed — Pak Har returned something unexpected. Try again.",
        ) from exc

    return TrainingPlanRead.model_validate(plan)


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

# READY FOR QA
# Feature: Weekly review endpoints (TASK-105)
# What was built:
#   - POST /review/generate — generates Pak Har's weekly planned-vs-actual assessment.
#     Finds the active TrainingPlan, counts planned non-rest days, counts Activity records
#     for this week, calls Ollama non-streaming with REVIEW_PROMPT, persists a new
#     WeeklyReview row, and returns it.
#   - GET /review/current — returns the most recent WeeklyReview for the authenticated user.
# Edge cases to test:
#   - No active training plan: 404 with "No active training plan found." returned before Ollama call.
#   - No activities this week: actual_runs=0, Ollama receives "No runs completed this week." context.
#   - Ollama offline: 503 returned, no DB write occurs.
#   - Ollama returns empty content: 503 returned (treated as RuntimeError from service layer).
#   - Ollama read timeout: 504 returned.
#   - Rate limit exceeded (>20 req/60s): 429 returned.
#   - Unauthenticated requests: 401 returned on both endpoints.
#   - GET /review/current with no reviews ever generated: 404 returned.
#   - Multiple reviews exist: GET /review/current returns the newest one (created_at DESC).
#   - plan_data has non-standard "type" values: _count_planned_runs treats anything except
#     "rest" as a run — this is intentional and tested.

"""
Weekly review router.

Endpoints:
    POST /review/generate  — generate a new weekly planned-vs-actual review via Ollama
    GET  /review/current   — retrieve the most recent weekly review
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.user import User
from schemas.weekly_review import WeeklyReviewRead
from services.database import get_db
from services.rate_limiter import check_rate_limit
from services.review import generate_weekly_review, get_current_review

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate", response_model=WeeklyReviewRead)
async def generate_review(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WeeklyReviewRead:
    """
    Generate Pak Har's weekly review for the authenticated user.

    Compares the active TrainingPlan's planned run count against Activity records
    from the current week. Calls Ollama non-streaming, persists a new WeeklyReview
    row (always inserts — never upserts), and returns it.

    Rate limited: 20 requests/60s per user (shared sliding window).

    Raises:
        401: Not authenticated.
        404: No active training plan found.
        429: Rate limit exceeded.
        503: Ollama is not running, unreachable, or returned empty content.
        504: Ollama did not respond within the read timeout.
    """
    if not check_rate_limit(user.id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Wait a moment before generating another review.",
        )

    try:
        review = await generate_weekly_review(user=user, db=db)
    except ValueError as exc:
        # No active training plan
        logger.warning("Weekly review blocked for user_id=%d: %s", user.id, exc)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Ollama error during weekly review for user_id=%d: %s", user.id, exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TimeoutError as exc:
        logger.error("Ollama timeout during weekly review for user_id=%d: %s", user.id, exc)
        raise HTTPException(status_code=504, detail=str(exc)) from exc

    return WeeklyReviewRead.model_validate(review)


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

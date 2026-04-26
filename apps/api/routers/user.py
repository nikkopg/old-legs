# READY FOR QA
# Features: POST /user/onboarding (TASK-102), GET /user/me (TASK-103)
# What was built: save user preferences + mark onboarding complete; return full user profile with computed stats
# Edge cases to test: unauthenticated requests, days_available out of range (0 or 8), empty biggest_struggle, user with zero activities

"""
User router.

Endpoints:
- POST /user/onboarding — save onboarding preferences and mark onboarding complete
- GET  /user/me        — return current user profile with computed activity stats
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.activity import Activity
from models.training_plan import TrainingPlan
from models.user import User
from schemas.user import OnboardingRequest, UserProfile
from services.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/onboarding")
async def save_onboarding(
    body: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Save user onboarding preferences and mark onboarding as complete.

    Idempotent — calling this again updates the preferences even after
    onboarding_completed is already True (allows users to change preferences later).

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Request body — OnboardingRequest:**
    ```json
    { "weekly_km_target": 30, "days_available": 4, "biggest_struggle": "consistency" }
    ```

    **Response (200):**
    ```json
    { "message": "Preferences saved." }
    ```

    **Errors:**
    - 401: Not authenticated
    - 422: Validation failure (days_available out of range, empty biggest_struggle, etc.)
    """
    current_user.weekly_km_target = body.weekly_km_target
    current_user.days_available = body.days_available
    current_user.biggest_struggle = body.biggest_struggle
    current_user.onboarding_completed = True

    db.commit()
    logger.info(f"User {current_user.id} completed onboarding — target: {body.weekly_km_target} km/wk, days: {body.days_available}")

    return {"message": "Preferences saved."}


@router.get("/me", response_model=UserProfile)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfile:
    """
    Return the current user's profile with computed activity statistics.

    Computed fields:
    - `total_activities`: count of Activity rows for this user
    - `total_distance_km`: sum of distance_km across all user activities
    - `weeks_on_plan`: count of distinct TrainingPlan rows for this user

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200) — UserProfile schema**

    **Errors:**
    - 401: Not authenticated
    """
    total_activities: int = (
        db.query(func.count(Activity.id))
        .filter(Activity.user_id == current_user.id)
        .scalar()
        or 0
    )

    total_distance_km: float = (
        db.query(func.sum(Activity.distance_km))
        .filter(Activity.user_id == current_user.id)
        .scalar()
        or 0.0
    )

    weeks_on_plan: int = (
        db.query(func.count(TrainingPlan.id))
        .filter(TrainingPlan.user_id == current_user.id)
        .scalar()
        or 0
    )

    logger.info(
        f"GET /user/me — user {current_user.id}: "
        f"{total_activities} activities, {total_distance_km:.1f} km total, {weeks_on_plan} plans"
    )

    return UserProfile(
        id=current_user.id,
        name=current_user.name,
        avatar_url=current_user.avatar_url,
        strava_athlete_id=current_user.strava_athlete_id,
        onboarding_completed=current_user.onboarding_completed,
        weekly_km_target=current_user.weekly_km_target,
        days_available=current_user.days_available,
        biggest_struggle=current_user.biggest_struggle,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
        total_activities=total_activities,
        total_distance_km=round(total_distance_km, 2),
        weeks_on_plan=weeks_on_plan,
    )

# READY FOR QA
# Features: POST /user/onboarding (TASK-102), GET /user/me (TASK-103), GET /user/export (T5)
# What was built: save user preferences + mark onboarding complete; return full user profile with computed stats;
#   data export as ZIP download containing profile, activities, plans, reviews, chat, and insights JSON files
# Changes: goal_event field added to OnboardingRequest and UserProfile
# Edge cases to test:
#   - unauthenticated requests
#   - days_available out of range (0 or 8)
#   - empty biggest_struggle
#   - user with zero activities
#   - goal_event with invalid value (e.g. "triathlon") → must return 422
#   - goal_event omitted → treated as None (no change to existing stored value)
#   - goal_event: null → still accepted (clears/keeps null)
#   - GET /user/me for user with no goal_event → returns goal_event: null
#   - GET /user/export unauthenticated → 401
#   - GET /user/export with no data → returns zip with empty arrays
#   - GET /user/export never includes strava_access_token, strava_refresh_token, or any encrypted field

"""
User router.

Endpoints:
- POST /user/onboarding — save onboarding preferences and mark onboarding complete
- GET  /user/me        — return current user profile with computed activity stats
- GET  /user/export    — download all user data as a ZIP file (no tokens, no encrypted fields)
"""

import io
import json
import logging
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.activity import Activity
from models.chat_message import ChatMessage
from models.training_plan import TrainingPlan
from models.user import User
from models.weekly_review import WeeklyReview
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
    if body.resting_hr is not None:
        current_user.resting_hr = body.resting_hr
    if body.max_hr is not None:
        current_user.max_hr = body.max_hr
    if body.goal_event is not None:
        current_user.goal_event = body.goal_event
    # Always overwrite race_date — allows the user to set or clear it
    current_user.race_date = body.race_date
    if body.available_days is not None:
        current_user.available_days = body.available_days
    current_user.auto_plan_enabled = body.auto_plan_enabled
    current_user.auto_review_enabled = body.auto_review_enabled
    current_user.coach_voice = body.coach_voice
    if body.timezone is not None:
        current_user.timezone = body.timezone
    if body.ntfy_topic is not None:
        # Empty string clears the topic; store as None so the scheduler can
        # distinguish "not set" from a valid topic without string checks.
        current_user.ntfy_topic = body.ntfy_topic if body.ntfy_topic else None
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
        available_days=current_user.available_days,
        biggest_struggle=current_user.biggest_struggle,
        resting_hr=current_user.resting_hr,
        max_hr=current_user.max_hr,
        max_hr_observed=current_user.max_hr_observed,
        goal_event=current_user.goal_event,
        race_date=current_user.race_date,
        auto_plan_enabled=current_user.auto_plan_enabled,
        auto_review_enabled=current_user.auto_review_enabled,
        coach_voice=current_user.coach_voice,
        timezone=current_user.timezone,
        ntfy_topic=current_user.ntfy_topic,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
        total_activities=total_activities,
        total_distance_km=round(total_distance_km, 2),
        weeks_on_plan=weeks_on_plan,
    )


@router.get("/export")
async def export_user_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Export all user data as a ZIP archive download.

    Produces a ZIP containing six JSON files:
    - profile.json    — user profile fields (no tokens or encrypted data)
    - activities.json — all synced Activity records
    - plans.json      — all TrainingPlan records
    - reviews.json    — all WeeklyReview records
    - chat.json       — all ChatMessage records
    - insights.json   — empty list (no stored Insight model)

    No Strava tokens or encrypted fields are ever included.

    **Auth:** Requires `session_user_id` httpOnly cookie.

    **Response (200):** application/zip download
    - Content-Disposition: attachment; filename="old-legs-export-YYYY-MM-DD.zip"

    **Errors:**
    - 401: Not authenticated
    """
    # --- profile (safe fields only — never include token columns) ---
    profile_dict = {
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
        "weekly_km_target": current_user.weekly_km_target,
        "days_available": current_user.days_available,
        "available_days": current_user.available_days,
        "biggest_struggle": current_user.biggest_struggle,
        "resting_hr": current_user.resting_hr,
        "max_hr": current_user.max_hr,
        "goal_event": current_user.goal_event,
        "race_date": current_user.race_date,
        "coach_voice": current_user.coach_voice,
        "timezone": current_user.timezone,
        "auto_plan_enabled": current_user.auto_plan_enabled,
        "auto_review_enabled": current_user.auto_review_enabled,
        "created_at": current_user.created_at,
    }

    # --- activities ---
    activities = (
        db.query(Activity)
        .filter(Activity.user_id == current_user.id)
        .order_by(Activity.activity_date.desc())
        .all()
    )
    activities_list = [
        {
            "id": a.id,
            "name": a.name,
            "start_date": a.activity_date,
            "distance_m": round(a.distance_km * 1000, 1),
            "moving_time_s": a.moving_time_seconds,
            "avg_hr": a.average_hr,
            "max_hr": a.max_hr,
            "avg_speed_ms": round(a.distance_km * 1000 / a.moving_time_seconds, 4) if a.moving_time_seconds else None,
            "splits": a.splits,
            "grade_adjusted_pace": None,  # not stored — placeholder for future field
            "verdict_short": a.verdict_short,
            "verdict_tag": a.verdict_tag,
            "tone": a.tone,
        }
        for a in activities
    ]

    # --- plans ---
    plans = (
        db.query(TrainingPlan)
        .filter(TrainingPlan.user_id == current_user.id)
        .order_by(TrainingPlan.week_start_date.desc())
        .all()
    )
    plans_list = [
        {
            "id": p.id,
            "week_start_date": p.week_start_date,
            "is_active": p.is_active,
            "days": p.plan_data,
            "created_at": p.created_at,
        }
        for p in plans
    ]

    # --- weekly reviews ---
    reviews = (
        db.query(WeeklyReview)
        .filter(WeeklyReview.user_id == current_user.id)
        .order_by(WeeklyReview.week_start_date.desc())
        .all()
    )
    reviews_list = [
        {
            "id": r.id,
            "week_start_date": r.week_start_date,
            "content": r.review_text,
            "created_at": r.created_at,
        }
        for r in reviews
    ]

    # --- chat messages ---
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    chat_list = [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at,
        }
        for m in messages
    ]

    # --- insights (no DB model — stateless computation endpoint) ---
    insights_list: list = []

    # --- build ZIP in memory ---
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("profile.json", json.dumps(profile_dict, default=str, indent=2))
        zf.writestr("activities.json", json.dumps(activities_list, default=str, indent=2))
        zf.writestr("plans.json", json.dumps(plans_list, default=str, indent=2))
        zf.writestr("reviews.json", json.dumps(reviews_list, default=str, indent=2))
        zf.writestr("chat.json", json.dumps(chat_list, default=str, indent=2))
        zf.writestr("insights.json", json.dumps(insights_list, default=str, indent=2))
    buf.seek(0)

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    logger.info(f"GET /user/export — user {current_user.id}: {len(activities_list)} activities, "
                f"{len(plans_list)} plans, {len(reviews_list)} reviews, {len(chat_list)} messages")

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="old-legs-export-{date_str}.zip"'},
    )

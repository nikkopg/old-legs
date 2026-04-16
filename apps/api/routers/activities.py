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

"""
Activities router.

Endpoints:
- GET /activities          — list all user's synced activities (triggers sync on load)
- GET /activities/{id}     — single activity detail
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.activity import Activity
from models.user import User
from schemas.activity import ActivityRead
from services.database import get_db
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

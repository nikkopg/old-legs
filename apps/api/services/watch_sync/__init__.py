"""
Watch sync service — push a training plan to connected watch platforms.

Entry point: push_plan_to_watch(plan, user, db)
Returns a dict mapping platform -> result string, e.g. {"garmin": "pushed"}.
Never raises; errors are caught, logged, and reported per-platform.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models.activity import Activity
from models.training_plan import TrainingPlan
from models.user import User
from models.watch_integration import WatchIntegration
from services.encryption import decrypt_token
from services.watch_sync.adapters import get_adapter
from services.watch_sync.plan_mapper import map_plan_to_workouts

logger = logging.getLogger(__name__)


async def push_plan_to_watch(
    plan: TrainingPlan,
    user: User,
    db: Session,
) -> dict[str, str]:
    """
    Push the given plan to all connected watch platforms for this user.

    Runs sync adapter calls in a thread pool (asyncio.to_thread) to avoid
    blocking the FastAPI event loop.

    Returns:
        Dict mapping platform name to result: "pushed", "failed", or "skipped".
        "skipped" means no integration exists for that platform.
    """
    integrations: list[WatchIntegration] = (
        db.query(WatchIntegration)
        .filter(WatchIntegration.user_id == user.id)
        .all()
    )

    if not integrations:
        return {}

    # Fetch recent activities for HR param fallback
    cutoff = datetime.now(timezone.utc) - timedelta(days=28)
    activities = (
        db.query(Activity)
        .filter(Activity.user_id == user.id, Activity.activity_date >= cutoff)
        .order_by(Activity.activity_date.desc())
        .limit(50)
        .all()
    )

    workouts = map_plan_to_workouts(plan, user, activities)
    if not workouts:
        return {i.platform: "skipped" for i in integrations}

    results: dict[str, str] = {}
    for integration in integrations:
        platform = integration.platform
        try:
            credentials = json.loads(decrypt_token(integration.credentials_encrypted))
            adapter = get_adapter(platform)
            await asyncio.to_thread(adapter.connect, credentials)
            for workout in workouts:
                await asyncio.to_thread(adapter.push_workout, workout)
            integration.last_sync_error = None
            integration.last_synced_at = datetime.now(timezone.utc)
            db.add(integration)
            db.commit()
            results[platform] = "pushed"
            logger.info("watch_sync: pushed %d workouts to %s for user_id=%d",
                        len(workouts), platform, user.id)
        except Exception as exc:  # noqa: BLE001
            integration.last_sync_error = str(exc)
            db.add(integration)
            db.commit()
            results[platform] = "failed"
            logger.warning("watch_sync: failed to push to %s for user_id=%d: %s",
                           platform, user.id, exc)

    return results

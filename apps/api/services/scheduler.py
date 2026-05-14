# READY FOR QA
# Feature: Delivery preference persistence + APScheduler (TASK-176)
# What was built:
#   - auto_plan_enabled + auto_review_enabled columns on User (migration e2f3a4b5c6d7)
#   - POST /user/onboarding persists both booleans
#   - GET /user/me returns both booleans via UserRead
#   - AsyncIOScheduler with two CronTrigger jobs:
#       weekly_plan_job   — Sunday 22:00 UTC (Monday 05:00 WIB)
#       weekly_review_job — Sunday 13:00 UTC (Sunday 20:00 WIB)
#   - Scheduler started/stopped in main.py lifespan
# Edge cases to test:
#   - toggle = False: user is excluded from that job's query
#   - Strava token expired: get_valid_access_token refreshes before calling generate
#   - Ollama offline: per-user exception caught, logged, other users continue
#   - No active plan on review job: ValueError caught per-user, others continue
#   - Both jobs running simultaneously (13:00 and 22:00 are different — no overlap)
#   - Container restart within misfire_grace_time=3600s: job fires on recovery

"""
Scheduled delivery jobs for Old Legs.

Two jobs run on a fixed schedule:
  - weekly_plan_job   — Monday 05:00 WIB (UTC+7) = Sunday 22:00 UTC
  - weekly_review_job — Sunday 20:00 WIB (UTC+7) = Sunday 13:00 UTC

Each job queries for all users with the respective toggle enabled and
fires the existing generation function for each user. Failures per-user
are caught and logged — one user's error never blocks others.

Time zone is hardcoded for now; per-user scheduling is a future preference.
"""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from models.user import User
from services.database import SessionLocal
from services.plan import generate_plan_with_ollama
from services.review import generate_weekly_review
from services.strava import get_valid_access_token

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scheduler singleton — started/stopped in main.py lifespan
# ---------------------------------------------------------------------------
scheduler = AsyncIOScheduler()


# ---------------------------------------------------------------------------
# Job: weekly plan generation
# ---------------------------------------------------------------------------
async def weekly_plan_job() -> None:
    """
    Generate a new weekly training plan for all opted-in users.

    Runs every Sunday 22:00 UTC (Monday 05:00 WIB / UTC+7).

    Steps per user:
    1. Refresh the Strava token if it is about to expire.
    2. Call generate_plan_with_ollama — this deactivates the prior plan and
       persists a new one exactly as POST /plan/generate does.

    Any per-user exception is caught and logged; all other users still run.
    """
    logger.info("weekly_plan_job: starting")
    db: Session = SessionLocal()
    try:
        users: list[User] = (
            db.query(User)
            .filter(User.auto_plan_enabled == True)  # noqa: E712
            .all()
        )
        logger.info("weekly_plan_job: %d user(s) opted in", len(users))
        for user in users:
            try:
                # Refresh Strava token so activity queries inside the plan
                # service don't hit a stale token.
                await get_valid_access_token(user=user, db=db)
                await generate_plan_with_ollama(user=user, db=db)
                logger.info("weekly_plan_job: plan generated for user_id=%d", user.id)
            except Exception:
                logger.exception(
                    "weekly_plan_job: failed for user_id=%d — skipping", user.id
                )
    finally:
        db.close()
    logger.info("weekly_plan_job: complete")


# ---------------------------------------------------------------------------
# Job: weekly review generation
# ---------------------------------------------------------------------------
async def weekly_review_job() -> None:
    """
    Generate a weekly review for all opted-in users.

    Runs every Sunday 13:00 UTC (Sunday 20:00 WIB / UTC+7).

    Steps per user:
    1. Refresh the Strava token if it is about to expire.
    2. Call generate_weekly_review — this inserts a new WeeklyReview row
       exactly as POST /review/generate does.

    Any per-user exception is caught and logged; all other users still run.
    """
    logger.info("weekly_review_job: starting")
    db: Session = SessionLocal()
    try:
        users: list[User] = (
            db.query(User)
            .filter(User.auto_review_enabled == True)  # noqa: E712
            .all()
        )
        logger.info("weekly_review_job: %d user(s) opted in", len(users))
        for user in users:
            try:
                await get_valid_access_token(user=user, db=db)
                await generate_weekly_review(user=user, db=db)
                logger.info("weekly_review_job: review generated for user_id=%d", user.id)
            except Exception:
                logger.exception(
                    "weekly_review_job: failed for user_id=%d — skipping", user.id
                )
    finally:
        db.close()
    logger.info("weekly_review_job: complete")


# ---------------------------------------------------------------------------
# Register jobs on the scheduler singleton
# ---------------------------------------------------------------------------
def _register_jobs() -> None:
    """
    Add the weekly plan and weekly review jobs to the scheduler.

    Called once during app startup. Uses UTC cron times:
      - Plan:   Sunday 22:00 UTC  → Monday 05:00 WIB
      - Review: Sunday 13:00 UTC  → Sunday 20:00 WIB
    """
    scheduler.add_job(
        weekly_plan_job,
        trigger=CronTrigger(day_of_week="sun", hour=22, minute=0),
        id="weekly_plan_job",
        replace_existing=True,
        misfire_grace_time=3600,  # tolerate up to 1-hour delay (e.g. container restart)
    )
    scheduler.add_job(
        weekly_review_job,
        trigger=CronTrigger(day_of_week="sun", hour=13, minute=0),
        id="weekly_review_job",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info(
        "Scheduler: registered weekly_plan_job (Sun 22:00 UTC) "
        "and weekly_review_job (Sun 13:00 UTC)"
    )


_register_jobs()

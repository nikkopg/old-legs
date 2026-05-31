# READY FOR QA
# Feature: Per-user timezone-aware scheduler (T1 — v2 finalization)
# What was built:
#   - Single hourly sweep replaces two fixed CronTrigger UTC jobs
#   - Per-user timezone resolution via zoneinfo.ZoneInfo (stdlib, no new deps)
#   - Plan job:   Monday   05:00–06:00 local time
#   - Review job: Sunday   20:00–21:00 local time
#   - Watermark fields (last_auto_plan_at, last_auto_review_at) prevent
#     double-firing within the same window across multiple hourly runs
#   - Per-user try/except — one user's failure never blocks others
# Edge cases to test:
#   - toggle = False: user excluded from that sweep
#   - invalid timezone stored on user: ZoneInfo raises ZoneInfoNotFoundError,
#     caught per-user so others still run
#   - last_auto_plan_at set < 6 days ago: NOT re-run this window
#   - last_auto_plan_at set > 6 days ago (or None): eligible to run
#   - Strava token expired: get_valid_access_token refreshes before calling generate
#   - Ollama offline: per-user exception caught, logged, next user continues
#   - No active plan on review job: ValueError caught, next user continues
#   - Container restart within 1-hour interval: job fires on recovery (IntervalTrigger)

"""
Scheduled delivery jobs for Old Legs.

Single hourly sweep fires at the top of every hour and checks each opted-in
user's local time. Jobs run when the user's local clock is in the target window:

  Plan job:   Monday 05:00-06:00 local  (user.auto_plan_enabled = True)
  Review job: Sunday 20:00-21:00 local  (user.auto_review_enabled = True)

Timezone conversion uses zoneinfo.ZoneInfo from the Python 3.9+ stdlib --
no new runtime dependencies required.

Watermark columns (last_auto_plan_at, last_auto_review_at on the User row)
prevent double-firing if the sweep runs multiple times within the same window
(e.g. after a container restart).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from models.user import User
from services.database import SessionLocal
from services.notifications import send_ntfy
from services.plan import generate_plan_with_ollama
from services.review import generate_weekly_review
from services.strava import get_valid_access_token

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scheduler singleton -- started/stopped in main.py lifespan
# ---------------------------------------------------------------------------
scheduler = AsyncIOScheduler()

# Target local-time windows
_PLAN_LOCAL_DAY = 0     # Monday (weekday() == 0)
_PLAN_LOCAL_HOUR = 5    # 05:xx local
_REVIEW_LOCAL_DAY = 6   # Sunday (weekday() == 6)
_REVIEW_LOCAL_HOUR = 20 # 20:xx local

# Minimum gap before re-running the same job for a user
_MIN_JOB_INTERVAL_DAYS = 6


def _is_eligible(last_ran_at: datetime | None) -> bool:
    """
    Return True if a job has never run for this user, or ran more than
    _MIN_JOB_INTERVAL_DAYS ago. Handles naive datetimes stored as UTC.
    """
    if last_ran_at is None:
        return True
    now_utc = datetime.now(timezone.utc)
    if last_ran_at.tzinfo is None:
        last_ran_at = last_ran_at.replace(tzinfo=timezone.utc)
    return (now_utc - last_ran_at) > timedelta(days=_MIN_JOB_INTERVAL_DAYS)


# ---------------------------------------------------------------------------
# Hourly sweep
# ---------------------------------------------------------------------------
async def hourly_scheduler_sweep() -> None:
    """
    Hourly sweep that checks each opted-in user's local time and fires
    the plan or review job when appropriate.

    Plan job:   Runs when user's local time is Monday 05:00-06:00 and the
                user has not had a plan generated in the last 6 days.
    Review job: Runs when user's local time is Sunday 20:00-21:00 and the
                user has not had a review generated in the last 6 days.

    Per-user exceptions are caught and logged; all other users still run.
    """
    logger.info("hourly_scheduler_sweep: starting")
    db: Session = SessionLocal()
    try:
        now_utc = datetime.now(timezone.utc)

        users: list[User] = (
            db.query(User)
            .filter(
                (User.auto_plan_enabled == True)  # noqa: E712
                | (User.auto_review_enabled == True)  # noqa: E712
            )
            .all()
        )
        logger.info("hourly_scheduler_sweep: %d opted-in user(s)", len(users))

        for user in users:
            try:
                tz = ZoneInfo(user.timezone)
            except ZoneInfoNotFoundError:
                logger.warning(
                    "hourly_scheduler_sweep: unrecognised timezone %r for user_id=%d -- skipping",
                    user.timezone,
                    user.id,
                )
                continue

            local_now = now_utc.astimezone(tz)
            local_weekday = local_now.weekday()  # 0=Monday ... 6=Sunday
            local_hour = local_now.hour

            # ----------------------------------------------------------------
            # Plan job -- Monday 05:00-06:00 local
            # ----------------------------------------------------------------
            if (
                user.auto_plan_enabled
                and local_weekday == _PLAN_LOCAL_DAY
                and local_hour == _PLAN_LOCAL_HOUR
                and _is_eligible(user.last_auto_plan_at)
            ):
                try:
                    await get_valid_access_token(user=user, db=db)
                    await generate_plan_with_ollama(user=user, db=db)
                    user.last_auto_plan_at = datetime.now(timezone.utc)
                    db.commit()
                    logger.info(
                        "hourly_scheduler_sweep: plan generated for user_id=%d", user.id
                    )
                    if user.ntfy_topic:
                        asyncio.create_task(
                            send_ntfy(
                                topic=user.ntfy_topic,
                                title="Old Legs",
                                message="Your plan for the week is ready. Open the app to see what Pak Har has in store.",
                                tags=["calendar"],
                            )
                        )
                except Exception:
                    logger.exception(
                        "hourly_scheduler_sweep: plan job failed for user_id=%d -- skipping",
                        user.id,
                    )

            # ----------------------------------------------------------------
            # Review job -- Sunday 20:00-21:00 local
            # ----------------------------------------------------------------
            if (
                user.auto_review_enabled
                and local_weekday == _REVIEW_LOCAL_DAY
                and local_hour == _REVIEW_LOCAL_HOUR
                and _is_eligible(user.last_auto_review_at)
            ):
                try:
                    await get_valid_access_token(user=user, db=db)
                    await generate_weekly_review(user=user, db=db)
                    user.last_auto_review_at = datetime.now(timezone.utc)
                    db.commit()
                    logger.info(
                        "hourly_scheduler_sweep: review generated for user_id=%d", user.id
                    )
                    if user.ntfy_topic:
                        asyncio.create_task(
                            send_ntfy(
                                topic=user.ntfy_topic,
                                title="Old Legs",
                                message="Pak Har has reviewed your week. Go see what he thinks.",
                                tags=["memo"],
                            )
                        )
                except Exception:
                    logger.exception(
                        "hourly_scheduler_sweep: review job failed for user_id=%d -- skipping",
                        user.id,
                    )

    finally:
        db.close()
    logger.info("hourly_scheduler_sweep: complete")


# ---------------------------------------------------------------------------
# Register single hourly job on the scheduler singleton
# ---------------------------------------------------------------------------
def _register_jobs() -> None:
    """
    Add the hourly sweep to the scheduler.

    Replaces the previous two CronTrigger entries (weekly_plan_job +
    weekly_review_job) with a single IntervalTrigger(hours=1) that performs
    per-user local-time checks.
    """
    scheduler.add_job(
        hourly_scheduler_sweep,
        trigger=IntervalTrigger(hours=1),
        id="hourly_scheduler_sweep",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info(
        "Scheduler: registered hourly_scheduler_sweep "
        "(plan: Mon 05:00-06:00 local, review: Sun 20:00-21:00 local)"
    )


_register_jobs()

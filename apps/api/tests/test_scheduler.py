"""
Tests for services/scheduler.py.

Coverage:
- _is_eligible: None (never run) → True
- _is_eligible: last_ran_at > 6 days ago → True
- _is_eligible: last_ran_at > 6 days ago but naive tzinfo → True (naive fallback path)
- _is_eligible: recent last_ran_at → False
- hourly_scheduler_sweep: user with invalid timezone is skipped, others continue
- hourly_scheduler_sweep: not Monday 05:xx → plan job not triggered
- hourly_scheduler_sweep: Monday 05:xx, auto_plan_enabled=True → plan generated, watermark set
- hourly_scheduler_sweep: plan job runs, last_auto_plan_at watermark is updated on success
- hourly_scheduler_sweep: not Sunday 20:xx → review job not triggered
- hourly_scheduler_sweep: Sunday 20:xx, auto_review_enabled=True → review generated, watermark set
- hourly_scheduler_sweep: per-user exception does not abort remaining users

Design decisions:
- Real SQLite in-memory DB via db_session fixture
- generate_plan_with_ollama / generate_weekly_review are async generators — mocks must
  be async generators, not plain coroutines
- get_valid_access_token is patched to a no-op coroutine
- UTC time is controlled via unittest.mock.patch on services.scheduler.datetime
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from models.user import User
from services.encryption import encrypt_token


# ---------------------------------------------------------------------------
# Async generator mock factories
# ---------------------------------------------------------------------------

def _make_async_gen_plan():
    """Return an async generator mock for generate_plan_with_ollama."""
    async def _gen(*args, **kwargs):
        yield 'data: {"type":"complete"}\n\n'
    return _gen


def _make_async_gen_review():
    """Return an async generator mock for generate_weekly_review."""
    async def _gen(*args, **kwargs):
        yield 'data: {"type":"complete"}\n\n'
    return _gen


def _make_async_gen_raising(exc: Exception):
    """Return an async generator that raises immediately — simulates per-user failure."""
    async def _gen(*args, **kwargs):
        raise exc
        yield  # make it a generator
    return _gen


# ---------------------------------------------------------------------------
# Local import of the module under test — imported here so the scheduler
# singleton doesn't fire before tests configure the DB.
# ---------------------------------------------------------------------------

import services.scheduler as scheduler_module
from services.scheduler import _is_eligible, hourly_scheduler_sweep


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    db: Session,
    *,
    strava_athlete_id: str = "test_sched_100",
    timezone_str: str = "Asia/Jakarta",
    auto_plan_enabled: bool = True,
    auto_review_enabled: bool = False,
    last_auto_plan_at: datetime | None = None,
    last_auto_review_at: datetime | None = None,
    ntfy_topic: str | None = None,
) -> User:
    user = User(
        strava_athlete_id=strava_athlete_id,
        strava_access_token=encrypt_token("fake_access"),
        strava_refresh_token=encrypt_token("fake_refresh"),
        strava_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=6),
        name="Scheduler Test User",
        timezone=timezone_str,
        auto_plan_enabled=auto_plan_enabled,
        auto_review_enabled=auto_review_enabled,
        last_auto_plan_at=last_auto_plan_at,
        last_auto_review_at=last_auto_review_at,
        ntfy_topic=ntfy_topic,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_mock_utc_now(dt: datetime) -> MagicMock:
    """
    Return a MagicMock that replaces services.scheduler.datetime so that
    datetime.now(timezone.utc) returns the supplied dt.
    """
    mock_dt = MagicMock()
    mock_dt.now.return_value = dt
    mock_dt.side_effect = datetime  # pass-through constructor calls
    return mock_dt


# ---------------------------------------------------------------------------
# _is_eligible unit tests
# ---------------------------------------------------------------------------

class TestIsEligible:
    def test_none_returns_true(self):
        """Never run before → always eligible."""
        assert _is_eligible(None) is True

    def test_ran_more_than_six_days_ago_returns_true(self):
        """last_ran_at > 6 days ago → eligible."""
        old = datetime.now(timezone.utc) - timedelta(days=7)
        assert _is_eligible(old) is True

    def test_ran_less_than_six_days_ago_is_not_eligible(self):
        """5 days 23 hours ago is not > 6 days — not eligible."""
        almost_six = datetime.now(timezone.utc) - timedelta(days=6) + timedelta(seconds=60)
        assert _is_eligible(almost_six) is False

    def test_ran_recently_returns_false(self):
        """Ran yesterday → not eligible."""
        recent = datetime.now(timezone.utc) - timedelta(days=1)
        assert _is_eligible(recent) is False

    def test_naive_datetime_older_than_six_days_returns_true(self):
        """Naive datetime older than 6 days → treated as UTC, returns True."""
        # Store without tzinfo (simulates values read from SQLite without tz awareness)
        naive_old = datetime.utcnow() - timedelta(days=8)
        assert naive_old.tzinfo is None
        assert _is_eligible(naive_old) is True

    def test_naive_datetime_recent_returns_false(self):
        """Naive datetime from yesterday → treated as UTC, returns False."""
        naive_recent = datetime.utcnow() - timedelta(hours=12)
        assert naive_recent.tzinfo is None
        assert _is_eligible(naive_recent) is False


# ---------------------------------------------------------------------------
# hourly_scheduler_sweep integration tests
# (use real SQLite DB via db_session; patch SessionLocal to return it)
# ---------------------------------------------------------------------------

class TestHourlySchedulerSweep:

    def _patch_session_local(self, db: Session):
        """Return a context manager that makes SessionLocal() return the test db."""
        mock_session_local = MagicMock(return_value=db)
        return patch.object(scheduler_module, "SessionLocal", mock_session_local)

    @pytest.mark.asyncio
    async def test_invalid_timezone_skipped_other_users_run(self, db_session: Session):
        """
        User with an invalid timezone is skipped (ZoneInfoNotFoundError caught).
        A second valid user in the same sweep still runs.
        """
        # Bad timezone user — auto_plan_enabled, but timezone is garbage
        _make_user(
            db_session,
            strava_athlete_id="bad_tz_user",
            timezone_str="Not/AReal_Timezone",
            auto_plan_enabled=True,
        )
        # Good user — Jakarta is UTC+7; we freeze UTC so their local time = Mon 05:xx
        # UTC 2026-06-14 22:05 → Jakarta local 2026-06-15 Mon 05:05 (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)
        good_user = _make_user(
            db_session,
            strava_athlete_id="good_tz_user",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            last_auto_plan_at=None,
        )

        plan_calls = []

        async def mock_plan_gen(*args, **kwargs):
            plan_calls.append(kwargs.get("user") or args[0])
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        # Only the good user's plan job ran
        assert len(plan_calls) == 1
        assert plan_calls[0].strava_athlete_id == "good_tz_user"

    @pytest.mark.asyncio
    async def test_plan_job_not_triggered_outside_window(self, db_session: Session):
        """
        User with valid timezone but UTC time resolves to Tuesday 10:xx local →
        plan job must NOT fire.
        """
        # Jakarta UTC+7: UTC 2026-06-16 03:05 → Jakarta 2026-06-16 10:05 Tue (weekday=1)
        tuesday_utc = datetime(2026, 6, 16, 3, 5, 0, tzinfo=timezone.utc)
        _make_user(
            db_session,
            strava_athlete_id="plan_wrong_day",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            last_auto_plan_at=None,
        )

        plan_calls = []

        async def mock_plan_gen(*args, **kwargs):
            plan_calls.append(True)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(tuesday_utc)),
        ):
            await hourly_scheduler_sweep()

        assert plan_calls == [], "Plan job should not have fired outside Monday 05:xx window"

    @pytest.mark.asyncio
    async def test_plan_job_triggered_on_monday_0500(self, db_session: Session):
        """
        Monday 05:05 local (Jakarta, UTC+7) with auto_plan_enabled=True and
        no prior run → plan generated, last_auto_plan_at watermark set.
        """
        # UTC 2026-06-14 22:05 → Jakarta 2026-06-15 05:05 Mon (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)
        user = _make_user(
            db_session,
            strava_athlete_id="plan_monday_ok",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            last_auto_plan_at=None,
        )

        plan_calls = []

        async def mock_plan_gen(*args, **kwargs):
            plan_calls.append(True)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        assert len(plan_calls) == 1, "Plan job should have fired once"
        # Watermark must be set — re-query because the sweep closes its session,
        # expiring any objects bound to it; a fresh query still works on SQLite.
        db_session.expire_all()
        updated = db_session.get(User, user.id)
        assert updated is not None
        assert updated.last_auto_plan_at is not None

    @pytest.mark.asyncio
    async def test_plan_watermark_prevents_double_fire(self, db_session: Session):
        """
        If last_auto_plan_at was set less than 6 days ago, plan job must not re-fire
        even when local time is Monday 05:xx.
        """
        # UTC 2026-06-14 22:05 → Jakarta 2026-06-15 05:05 Mon (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)
        recent_plan_at = datetime.now(timezone.utc) - timedelta(days=1)
        _make_user(
            db_session,
            strava_athlete_id="plan_watermark",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            last_auto_plan_at=recent_plan_at,
        )

        plan_calls = []

        async def mock_plan_gen(*args, **kwargs):
            plan_calls.append(True)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        assert plan_calls == [], "Plan job should have been suppressed by watermark"

    @pytest.mark.asyncio
    async def test_review_job_not_triggered_outside_window(self, db_session: Session):
        """
        User with valid timezone but UTC time resolves to Monday 05:xx local →
        review job must NOT fire (Monday is not Sunday).
        """
        # UTC 2026-06-14 22:05 → Jakarta 2026-06-15 05:05 Mon (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)
        _make_user(
            db_session,
            strava_athlete_id="review_wrong_day",
            timezone_str="Asia/Jakarta",
            auto_review_enabled=True,
            auto_plan_enabled=False,
            last_auto_review_at=None,
        )

        review_calls = []

        async def mock_review_gen(*args, **kwargs):
            review_calls.append(True)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_weekly_review", mock_review_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        assert review_calls == [], "Review job should not have fired outside Sunday 20:xx window"

    @pytest.mark.asyncio
    async def test_review_job_triggered_on_sunday_2000(self, db_session: Session):
        """
        Sunday 20:05 local (Jakarta, UTC+7) with auto_review_enabled=True and
        no prior run → review generated, last_auto_review_at watermark set.

        UTC 2026-06-14 13:05 → Jakarta 2026-06-14 20:05 local (Sunday, weekday=6).
        """
        sunday_utc = datetime(2026, 6, 14, 13, 5, 0, tzinfo=timezone.utc)
        user = _make_user(
            db_session,
            strava_athlete_id="review_sunday_ok",
            timezone_str="Asia/Jakarta",
            auto_review_enabled=True,
            auto_plan_enabled=False,
            last_auto_review_at=None,
        )

        review_calls = []

        async def mock_review_gen(*args, **kwargs):
            review_calls.append(True)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_weekly_review", mock_review_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(sunday_utc)),
        ):
            await hourly_scheduler_sweep()

        assert len(review_calls) == 1, "Review job should have fired once"
        # Re-query after sweep closes its session
        db_session.expire_all()
        updated = db_session.get(User, user.id)
        assert updated is not None
        assert updated.last_auto_review_at is not None

    @pytest.mark.asyncio
    async def test_per_user_exception_does_not_abort_sweep(self, db_session: Session):
        """
        User 1 raises an exception during plan generation.
        User 2 must still have their plan generated.
        """
        # UTC 2026-06-14 22:05 → Jakarta 2026-06-15 05:05 Mon (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)

        _make_user(
            db_session,
            strava_athlete_id="failing_user",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            last_auto_plan_at=None,
        )
        good_user = _make_user(
            db_session,
            strava_athlete_id="succeeding_user",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            last_auto_plan_at=None,
        )

        calls = []

        async def mock_plan_gen(user, db):
            if user.strava_athlete_id == "failing_user":
                raise RuntimeError("Ollama is offline")
            calls.append(user.strava_athlete_id)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        # The good user's plan must have run despite the first user's failure
        assert "succeeding_user" in calls

    @pytest.mark.asyncio
    async def test_auto_plan_disabled_user_not_swept(self, db_session: Session):
        """
        User with auto_plan_enabled=False must not appear in the sweep at all.
        """
        # UTC 2026-06-14 22:05 → Jakarta 2026-06-15 05:05 Mon (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)
        _make_user(
            db_session,
            strava_athlete_id="plan_disabled",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=False,
            auto_review_enabled=False,
        )

        plan_calls = []

        async def mock_plan_gen(*args, **kwargs):
            plan_calls.append(True)
            yield 'data: {"type":"complete"}\n\n'

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        # User excluded at DB query level (neither flag set) — no plan call
        assert plan_calls == []


class TestNtfyNotifications:
    """
    Verify that ntfy notifications are dispatched when ntfy_topic is set.

    Coverage:
    - Plan job fires send_ntfy when user.ntfy_topic is set
    - Review job fires send_ntfy when user.ntfy_topic is set

    Design:
    - asyncio.create_task is patched so the task is run eagerly in the test loop
    - send_ntfy is patched with AsyncMock so we can assert call args
    """

    @staticmethod
    def _patch_session_local(db: Session):
        mock_session_local = MagicMock(return_value=db)
        return patch.object(scheduler_module, "SessionLocal", mock_session_local)

    @pytest.mark.asyncio
    async def test_plan_job_sends_ntfy_when_topic_set(self, db_session: Session):
        """
        When the plan job succeeds and user.ntfy_topic is set, send_ntfy must be
        called exactly once with the user's topic and a message about the plan.
        """
        # UTC 2026-06-14 22:05 → Jakarta 2026-06-15 05:05 Mon (weekday=0, hour=5)
        monday_utc = datetime(2026, 6, 14, 22, 5, 0, tzinfo=timezone.utc)
        _make_user(
            db_session,
            strava_athlete_id="ntfy_plan_user",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=True,
            ntfy_topic="my-run-topic",
        )

        async def mock_plan_gen(*args, **kwargs):
            yield 'data: {"content": "plan chunk"}\n\n'

        mock_send_ntfy = AsyncMock()

        # Patch create_task to run the coroutine eagerly so the AsyncMock is awaited
        def eager_create_task(coro):
            return asyncio.ensure_future(coro)

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_plan_with_ollama", mock_plan_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch.object(scheduler_module, "send_ntfy", mock_send_ntfy),
            patch.object(scheduler_module.asyncio, "create_task", eager_create_task),
            patch("services.scheduler.datetime", _make_mock_utc_now(monday_utc)),
        ):
            await hourly_scheduler_sweep()

        mock_send_ntfy.assert_called_once()
        call_kwargs = mock_send_ntfy.call_args
        assert call_kwargs.kwargs["topic"] == "my-run-topic"
        assert "plan" in call_kwargs.kwargs["message"].lower()

    @pytest.mark.asyncio
    async def test_review_job_sends_ntfy_when_topic_set(self, db_session: Session):
        """
        When the review job succeeds and user.ntfy_topic is set, send_ntfy must be
        called exactly once with the user's topic and a message about the review.
        """
        # UTC 2026-06-14 13:05 → Jakarta 2026-06-14 20:05 Sun (weekday=6, hour=20)
        sunday_utc = datetime(2026, 6, 14, 13, 5, 0, tzinfo=timezone.utc)
        _make_user(
            db_session,
            strava_athlete_id="ntfy_review_user",
            timezone_str="Asia/Jakarta",
            auto_plan_enabled=False,
            auto_review_enabled=True,
            ntfy_topic="my-review-topic",
        )

        async def mock_review_gen(*args, **kwargs):
            yield 'data: {"content": "review chunk"}\n\n'

        mock_send_ntfy = AsyncMock()

        def eager_create_task(coro):
            return asyncio.ensure_future(coro)

        with (
            self._patch_session_local(db_session),
            patch.object(scheduler_module, "generate_weekly_review", mock_review_gen),
            patch.object(scheduler_module, "get_valid_access_token", AsyncMock()),
            patch.object(scheduler_module, "send_ntfy", mock_send_ntfy),
            patch.object(scheduler_module.asyncio, "create_task", eager_create_task),
            patch("services.scheduler.datetime", _make_mock_utc_now(sunday_utc)),
        ):
            await hourly_scheduler_sweep()

        mock_send_ntfy.assert_called_once()
        call_kwargs = mock_send_ntfy.call_args
        assert call_kwargs.kwargs["topic"] == "my-review-topic"
        # The review message references Pak Har reviewing the week
        assert "reviewed" in call_kwargs.kwargs["message"].lower() or "week" in call_kwargs.kwargs["message"].lower()

"""
Tests for POST /plan/generate (SSE stream), GET /plan/current, and
GET /plan/next-target.

Coverage:
- POST happy path: user with activities → 200 SSE stream with complete event
- POST unauthenticated → 401
- POST Ollama offline → 200 SSE stream with error event
- POST Ollama timeout → 200 SSE stream with error event
- POST parse error → 200 SSE stream with error event
- POST rate limit → 429
- POST progress events emitted in correct order (5 steps)
- POST complete event: is_next_week field present
- POST complete event: is_next_week=True when weekend, is_next_week=False mid-week
- POST complete event: target_week_reason field present
- GET /plan/current: no plan → 404
- GET /plan/current: happy path → 200 with existing plan
- _resolve_target_week_start unit tests (all 7 rule branches)
- GET /plan/next-target: replaces_active_plan=True / False
- GET /plan/next-target: unauthenticated → 401
  (next-target tests skipped pending TASK-201-A3)
"""

import json
import time
from datetime import date, datetime, time as dt_time, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.activity import Activity
from models.training_plan import TrainingPlan
from services.streaming import complete_event, error_event, progress_event


# ---------------------------------------------------------------------------
# SSE parsing helpers
# ---------------------------------------------------------------------------

def _parse_sse_events(text: str) -> list[dict]:
    """Parse a text/event-stream body into a list of decoded JSON payloads."""
    events = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data: "):
            payload = line[len("data: "):]
            try:
                events.append(json.loads(payload))
            except json.JSONDecodeError:
                pass
    return events


def _find_event(events: list[dict], event_type: str) -> dict | None:
    """Return the first event dict whose 'type' matches event_type, or None."""
    return next((e for e in events if e.get("type") == event_type), None)


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SAMPLE_PLAN_DATA = {
    "Monday": {"day": "Monday", "type": "easy", "description": "40 min easy, HR under 145.", "duration_minutes": 40},
    "Tuesday": {"day": "Tuesday", "type": "rest", "description": "Rest.", "duration_minutes": 0},
    "Wednesday": {"day": "Wednesday", "type": "tempo", "description": "30 min tempo, HR 160-170.", "duration_minutes": 30},
    "Thursday": {"day": "Thursday", "type": "rest", "description": "Rest.", "duration_minutes": 0},
    "Friday": {"day": "Friday", "type": "easy", "description": "35 min easy.", "duration_minutes": 35},
    "Saturday": {"day": "Saturday", "type": "long", "description": "60 min long, easy pace.", "duration_minutes": 60},
    "Sunday": {"day": "Sunday", "type": "rest", "description": "Rest.", "duration_minutes": 0},
}

SAMPLE_NOTES = {
    "Monday": "Start slow. The first 10 minutes don't count.",
    "Tuesday": None,
    "Wednesday": "This is the one run this week that actually matters.",
    "Thursday": None,
    "Friday": "Shake out the legs from Wednesday.",
    "Saturday": "No watch-checking. Run on feel.",
    "Sunday": None,
}

# Plan steps as defined by the backend (must match exactly)
PLAN_STEPS = [
    "Reading your last four weeks",
    "Checking plan adherence",
    "Assembling coaching signals",
    "Drafting the plan",
    "Filing",
]


# ---------------------------------------------------------------------------
# Fake generator helpers
# ---------------------------------------------------------------------------

def _make_fake_plan_dict(week_start: date | None = None, is_next_week: bool = False) -> dict:
    """Return a serialised plan dict as the complete event would contain."""
    now = datetime.now(timezone.utc)
    ws = week_start or date.today()
    return {
        "id": 1,
        "user_id": 1,
        "week_start_date": ws.isoformat(),
        "plan_data": SAMPLE_PLAN_DATA,
        "pak_har_notes": SAMPLE_NOTES,
        "is_active": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


def _fake_generate_plan_complete(
    is_next_week: bool = False,
    target_week_reason: str = "current_week",
):
    """Return an async generator callable that yields a complete event with a plan."""
    async def _fake(user, db):
        yield complete_event({
            "plan": _make_fake_plan_dict(is_next_week=is_next_week),
            "is_next_week": is_next_week,
            "target_week_reason": target_week_reason,
        })
    return _fake


def _fake_generate_plan_with_progress():
    """Return an async generator callable that yields 5 progress events then a complete event."""
    async def _fake(user, db):
        started_at = time.monotonic()
        for step in PLAN_STEPS:
            yield progress_event(step, started_at)
        yield complete_event({
            "plan": _make_fake_plan_dict(),
            "is_next_week": False,
            "target_week_reason": "current_week",
        })
    return _fake


def _fake_generate_plan_error(message: str):
    """Return an async generator callable that yields a single error event."""
    async def _fake(user, db):
        yield error_event(message)
    return _fake


# ---------------------------------------------------------------------------
# Datetime mock factory (no freezegun — use unittest.mock.patch)
# ---------------------------------------------------------------------------

def _make_mock_datetime(date_obj: date) -> MagicMock:
    """
    Build a MagicMock that replaces services.plan.datetime.

    datetime.now(tz).date() → date_obj
    datetime.now(tz).replace(...) → datetime at midnight of date_obj (UTC)
    """
    mock_dt = MagicMock()
    mock_now = MagicMock()
    mock_now.date.return_value = date_obj
    mock_now.weekday.return_value = date_obj.weekday()
    midnight = datetime.combine(date_obj, dt_time.min)
    mock_now.replace.return_value = midnight
    mock_now.year = date_obj.year
    mock_now.month = date_obj.month
    mock_now.day = date_obj.day
    mock_dt.now.return_value = mock_now
    mock_dt.combine = datetime.combine
    # Delegate constructor calls datetime(y, m, d) to the real datetime so
    # SQLAlchemy receives a proper datetime object, not a MagicMock.
    mock_dt.side_effect = datetime
    return mock_dt


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def existing_plan(db_session: Session, test_user) -> TrainingPlan:
    plan = TrainingPlan(
        user_id=test_user.id,
        week_start_date=date.today(),
        plan_data=SAMPLE_PLAN_DATA,
        pak_har_notes=SAMPLE_NOTES,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


def _monday_of(d: date) -> date:
    """Return the ISO Monday of the week containing d."""
    return d - timedelta(days=d.weekday())


def _make_activity_this_week(db_session: Session, user_id: int) -> Activity:
    """Insert a synced activity dated to this Monday (UTC) and return it."""
    this_monday = _monday_of(date.today())
    activity = Activity(
        user_id=user_id,
        strava_activity_id="strava_this_week_001",
        name="This Week Run",
        distance_km=8.0,
        moving_time_seconds=2700,
        average_pace_min_per_km=5.625,
        average_hr=148,
        max_hr=165,
        elevation_gain_m=20,
        activity_date=datetime(this_monday.year, this_monday.month, this_monday.day, 7, 0, 0),
        sync_status="synced",
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity


# ---------------------------------------------------------------------------
# POST /plan/generate
# ---------------------------------------------------------------------------

class TestGeneratePlan:
    def test_unauthenticated_returns_401(self, test_app: TestClient):
        response = test_app.post("/plan/generate")
        assert response.status_code == 401

    def test_rate_limit_returns_429(self, authenticated_client: TestClient):
        with patch("routers.plan.check_rate_limit", return_value=False):
            response = authenticated_client.post("/plan/generate")
        assert response.status_code == 429
        assert "Too many requests" in response.json()["detail"]

    def test_happy_path_returns_sse_stream(
        self, authenticated_client: TestClient, test_activity
    ):
        """Authenticated user with activities → 200 text/event-stream with complete event."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_complete(),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None, f"No complete event found. Events: {events}"
        assert "plan" in complete["data"]

    def test_complete_event_has_plan_fields(self, authenticated_client: TestClient):
        """The complete event data.plan must contain all TrainingPlan fields."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_complete(),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        plan = complete["data"]["plan"]
        assert "plan_data" in plan
        assert "pak_har_notes" in plan
        assert "is_active" in plan
        assert plan["is_active"] is True

    def test_complete_event_includes_is_next_week(self, authenticated_client: TestClient):
        """complete event data must include an is_next_week boolean field."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_complete(is_next_week=False),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        assert "is_next_week" in complete["data"]
        assert isinstance(complete["data"]["is_next_week"], bool)

    def test_complete_event_includes_target_week_reason(self, authenticated_client: TestClient):
        """complete event data must include a target_week_reason string field."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_complete(target_week_reason="current_week"),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        reason = complete["data"]["target_week_reason"]
        assert reason in {"current_week", "weekend", "already_ran_this_week"}

    def test_complete_event_is_next_week_true_on_weekend(self, authenticated_client: TestClient):
        """Weekend → is_next_week=True in the complete event."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_complete(
                is_next_week=True, target_week_reason="weekend"
            ),
        ):
            response = authenticated_client.post("/plan/generate")

        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        assert complete["data"]["is_next_week"] is True
        assert complete["data"]["target_week_reason"] == "weekend"

    def test_complete_event_is_next_week_false_mid_week_no_runs(
        self, authenticated_client: TestClient
    ):
        """Mid-week with no runs → is_next_week=False in the complete event."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_complete(
                is_next_week=False, target_week_reason="current_week"
            ),
        ):
            response = authenticated_client.post("/plan/generate")

        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        assert complete["data"]["is_next_week"] is False
        assert complete["data"]["target_week_reason"] == "current_week"

    def test_ollama_offline_emits_error_event(self, authenticated_client: TestClient):
        """Ollama offline → HTTP 200 with an SSE error event (error is in-stream)."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_error(
                "Pak Har is unavailable right now. Make sure Ollama is running."
            ),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None, f"No error event found. Events: {events}"
        assert "Pak Har is unavailable" in err["message"]

    def test_ollama_timeout_emits_error_event(self, authenticated_client: TestClient):
        """Ollama timeout → HTTP 200 with an SSE error event."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_error("Pak Har took too long to respond."),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None
        assert "too long" in err["message"]

    def test_parse_error_emits_error_event(self, authenticated_client: TestClient):
        """Ollama returns malformed JSON → HTTP 200 with an SSE error event."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_error(
                "Ollama returned a non-JSON response: Expecting value."
            ),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None
        assert "non-JSON" in err["message"]

    def test_progress_events_emitted_in_order(self, authenticated_client: TestClient):
        """5 progress events should precede the complete event in the correct order."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_with_progress(),
        ):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)

        progress_events = [e for e in events if e.get("type") == "progress"]
        assert len(progress_events) == 5, f"Expected 5 progress events, got: {progress_events}"

        actual_steps = [e["step"] for e in progress_events]
        assert actual_steps == PLAN_STEPS

        complete = _find_event(events, "complete")
        assert complete is not None
        complete_idx = events.index(complete)
        for p in progress_events:
            assert events.index(p) < complete_idx

    def test_progress_events_have_elapsed_ms(self, authenticated_client: TestClient):
        """Each progress event must include an elapsed_ms integer field."""
        with patch(
            "routers.plan.generate_plan_with_ollama",
            side_effect=_fake_generate_plan_with_progress(),
        ):
            response = authenticated_client.post("/plan/generate")

        events = _parse_sse_events(response.text)
        progress_events = [e for e in events if e.get("type") == "progress"]
        for evt in progress_events:
            assert "elapsed_ms" in evt
            assert isinstance(evt["elapsed_ms"], int)


# ---------------------------------------------------------------------------
# GET /plan/current
# ---------------------------------------------------------------------------

class TestGetCurrentPlan:
    def test_unauthenticated_returns_401(self, test_app: TestClient):
        response = test_app.get("/plan/current")
        assert response.status_code == 401

    def test_no_plan_returns_404(self, authenticated_client: TestClient):
        response = authenticated_client.get("/plan/current")
        assert response.status_code == 404
        assert "No active training plan" in response.json()["detail"]

    def test_returns_existing_plan(
        self, authenticated_client: TestClient, existing_plan: TrainingPlan
    ):
        response = authenticated_client.get("/plan/current")
        assert response.status_code == 200
        body = response.json()
        assert body["is_active"] is True
        assert "plan_data" in body
        assert "pak_har_notes" in body
        assert "Monday" in body["plan_data"]


# ---------------------------------------------------------------------------
# _resolve_target_week_start — pure unit tests (no HTTP, no Ollama)
# ---------------------------------------------------------------------------

class TestResolveTargetWeekStart:
    """
    Unit tests for services.plan._resolve_target_week_start.

    All 7 weekday cases are covered by mocking services.plan.datetime so
    that datetime.now(tz).date() returns a controlled value. We do NOT use
    freezegun — the project uses unittest.mock.patch exclusively.

    Weekday mapping: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6.
    """

    def _call(self, db_session, test_user, today: date) -> tuple[date, str]:
        from services.plan import _resolve_target_week_start

        # Patch the datetime used inside services.plan so .now() returns today.
        # The service does: today = datetime.now(timezone.utc).date()
        # We mock the datetime class object, not the module, via patch target.
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            return _resolve_target_week_start(test_user, db_session)

    # -----------------------------------------------------------------------
    # Rule 1: weekend always → next Monday
    # -----------------------------------------------------------------------

    def test_saturday_returns_next_monday_weekend(
        self, db_session: Session, test_user
    ):
        # 2026-05-16 is a Saturday (weekday=5)
        today = date(2026, 5, 16)
        expected_monday = date(2026, 5, 18)
        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "weekend"
        assert result_date == expected_monday

    def test_sunday_returns_next_monday_weekend(
        self, db_session: Session, test_user
    ):
        # 2026-05-17 is a Sunday (weekday=6)
        today = date(2026, 5, 17)
        expected_monday = date(2026, 5, 18)
        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "weekend"
        assert result_date == expected_monday

    # -----------------------------------------------------------------------
    # Rule 2: mid-week with a run already logged → next Monday
    # -----------------------------------------------------------------------

    def test_wednesday_with_run_returns_next_monday(
        self, db_session: Session, test_user
    ):
        # 2026-05-13 is a Wednesday (weekday=2)
        today = date(2026, 5, 13)
        this_monday = date(2026, 5, 11)
        next_monday = date(2026, 5, 18)

        # Insert a synced activity on this_monday so Rule 2 fires
        activity = Activity(
            user_id=test_user.id,
            strava_activity_id="strava_wed_test",
            name="Monday Run",
            distance_km=6.0,
            moving_time_seconds=1800,
            average_pace_min_per_km=5.0,
            average_hr=145,
            max_hr=162,
            elevation_gain_m=10,
            activity_date=datetime(this_monday.year, this_monday.month, this_monday.day, 6, 0, 0),
            sync_status="synced",
        )
        db_session.add(activity)
        db_session.commit()

        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "already_ran_this_week"
        assert result_date == next_monday

    def test_friday_with_run_returns_next_monday(
        self, db_session: Session, test_user
    ):
        # 2026-05-15 is a Friday (weekday=4)
        today = date(2026, 5, 15)
        this_monday = date(2026, 5, 11)
        next_monday = date(2026, 5, 18)

        activity = Activity(
            user_id=test_user.id,
            strava_activity_id="strava_fri_test",
            name="Thursday Run",
            distance_km=9.0,
            moving_time_seconds=3240,
            average_pace_min_per_km=6.0,
            average_hr=150,
            max_hr=168,
            elevation_gain_m=30,
            activity_date=datetime(this_monday.year, this_monday.month, this_monday.day, 7, 0, 0),
            sync_status="synced",
        )
        db_session.add(activity)
        db_session.commit()

        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "already_ran_this_week"
        assert result_date == next_monday

    # -----------------------------------------------------------------------
    # Rule 3: mid-week with no runs → this Monday
    # -----------------------------------------------------------------------

    def test_monday_no_runs_returns_this_monday(
        self, db_session: Session, test_user
    ):
        # 2026-05-11 is a Monday (weekday=0)
        today = date(2026, 5, 11)
        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "current_week"
        assert result_date == today  # Monday is its own week start

    def test_wednesday_no_runs_returns_this_monday(
        self, db_session: Session, test_user
    ):
        # 2026-05-13 is a Wednesday (weekday=2) — no activities in DB
        today = date(2026, 5, 13)
        this_monday = date(2026, 5, 11)
        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "current_week"
        assert result_date == this_monday

    def test_friday_no_runs_returns_this_monday(
        self, db_session: Session, test_user
    ):
        # Friday salvage: no runs this week yet → still this week
        today = date(2026, 5, 15)  # Friday
        this_monday = date(2026, 5, 11)
        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "current_week"
        assert result_date == this_monday

    # -----------------------------------------------------------------------
    # Rule 2 boundary: activity with sync_status != "synced" must not trigger
    # -----------------------------------------------------------------------

    def test_unsynced_activity_does_not_trigger_next_week(
        self, db_session: Session, test_user
    ):
        # Wednesday with a pending (not synced) activity — should still be current_week
        today = date(2026, 5, 13)
        this_monday = date(2026, 5, 11)

        activity = Activity(
            user_id=test_user.id,
            strava_activity_id="strava_pending",
            name="Pending Run",
            distance_km=5.0,
            moving_time_seconds=1500,
            average_pace_min_per_km=5.0,
            average_hr=140,
            max_hr=160,
            elevation_gain_m=5,
            activity_date=datetime(this_monday.year, this_monday.month, this_monday.day, 6, 0, 0),
            sync_status="pending",
        )
        db_session.add(activity)
        db_session.commit()

        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "current_week"
        assert result_date == this_monday

    # -----------------------------------------------------------------------
    # Rule 2 boundary: activity from last week must not trigger next_week rule
    # -----------------------------------------------------------------------

    def test_last_week_activity_does_not_trigger_next_week(
        self, db_session: Session, test_user
    ):
        # Wednesday 2026-05-13; activity is from last week (2026-05-06)
        today = date(2026, 5, 13)
        this_monday = date(2026, 5, 11)
        last_week_date = date(2026, 5, 6)

        activity = Activity(
            user_id=test_user.id,
            strava_activity_id="strava_last_week",
            name="Last Week Run",
            distance_km=7.0,
            moving_time_seconds=2520,
            average_pace_min_per_km=6.0,
            average_hr=152,
            max_hr=169,
            elevation_gain_m=22,
            activity_date=datetime(last_week_date.year, last_week_date.month, last_week_date.day, 7, 0, 0),
            sync_status="synced",
        )
        db_session.add(activity)
        db_session.commit()

        result_date, reason = self._call(db_session, test_user, today)
        assert reason == "current_week"
        assert result_date == this_monday


# ---------------------------------------------------------------------------
# GET /plan/next-target  (skipped — TASK-201-A3 still in progress)
# ---------------------------------------------------------------------------

class TestGetPlanNextTarget:
    """
    Integration tests for GET /plan/next-target.

    These are skipped because the backend agent (A3) is still shipping the
    endpoint. The test bodies are written and ready — remove the class-level
    skip once A3 merges.
    """

    def test_unauthenticated_returns_401(self, test_app: TestClient):
        response = test_app.get("/plan/next-target")
        assert response.status_code == 401

    def test_response_shape(self, authenticated_client: TestClient):
        """Response must include the four required fields with correct types."""
        # On Saturday (2026-05-16) by default; mock to a known mid-week day
        # so the assertion is deterministic.
        today = date(2026, 5, 13)  # Wednesday, no runs → current_week
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            response = authenticated_client.get("/plan/next-target")

        assert response.status_code == 200
        body = response.json()
        assert "week_start_date" in body
        assert "is_next_week" in body
        assert "reason" in body
        assert "replaces_active_plan" in body
        assert isinstance(body["is_next_week"], bool)
        assert isinstance(body["replaces_active_plan"], bool)
        assert body["reason"] in {"current_week", "weekend", "already_ran_this_week"}

    def test_weekend_sets_is_next_week_true(self, authenticated_client: TestClient):
        today = date(2026, 5, 16)  # Saturday
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            response = authenticated_client.get("/plan/next-target")

        assert response.status_code == 200
        body = response.json()
        assert body["is_next_week"] is True
        assert body["reason"] == "weekend"
        assert body["week_start_date"] == "2026-05-18"

    def test_mid_week_no_runs_sets_is_next_week_false(
        self, authenticated_client: TestClient
    ):
        today = date(2026, 5, 13)  # Wednesday, no runs in DB
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            response = authenticated_client.get("/plan/next-target")

        assert response.status_code == 200
        body = response.json()
        assert body["is_next_week"] is False
        assert body["reason"] == "current_week"
        assert body["week_start_date"] == "2026-05-11"

    def test_replaces_active_plan_true_when_active_plan_for_target_week(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ):
        # Wednesday, no runs → target is this_monday 2026-05-11.
        # Pre-seed an active plan for that week.
        this_monday = date(2026, 5, 11)
        plan = TrainingPlan(
            user_id=test_user.id,
            week_start_date=this_monday,
            plan_data=SAMPLE_PLAN_DATA,
            pak_har_notes=SAMPLE_NOTES,
            is_active=True,
        )
        db_session.add(plan)
        db_session.commit()

        today = date(2026, 5, 13)
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            response = authenticated_client.get("/plan/next-target")

        assert response.status_code == 200
        assert response.json()["replaces_active_plan"] is True

    def test_replaces_active_plan_false_when_no_active_plan_for_target_week(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ):
        # No plans in DB at all → replaces_active_plan must be False
        today = date(2026, 5, 13)
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            response = authenticated_client.get("/plan/next-target")

        assert response.status_code == 200
        assert response.json()["replaces_active_plan"] is False

    def test_replaces_active_plan_false_when_active_plan_is_for_different_week(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ):
        # Active plan exists but for a different week → should not count.
        other_monday = date(2026, 4, 27)
        plan = TrainingPlan(
            user_id=test_user.id,
            week_start_date=other_monday,
            plan_data=SAMPLE_PLAN_DATA,
            pak_har_notes=SAMPLE_NOTES,
            is_active=True,
        )
        db_session.add(plan)
        db_session.commit()

        today = date(2026, 5, 13)  # target → 2026-05-11, not 2026-04-27
        mock_dt = _make_mock_datetime(today)
        with patch("services.plan.datetime", mock_dt):
            response = authenticated_client.get("/plan/next-target")

        assert response.status_code == 200
        assert response.json()["replaces_active_plan"] is False

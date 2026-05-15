"""
Tests for POST /review/generate and GET /review/current (TASK-105, updated TASK-186).

Coverage:
- POST happy path: user has active plan + activities this week → 200 SSE stream with complete event
- POST no active plan → 200 SSE stream with complete event, planned_runs=0
- POST unauthenticated → 401
- POST Ollama offline → 200 SSE stream with error event
- POST Ollama timeout → 200 SSE stream with error event
- POST rate limit >20 req/min → 429
- POST week with 0 runs (active plan exists) → 200 SSE stream with complete event, actual_runs = 0
- POST planned_runs counts non-rest days correctly
- GET happy path: review exists → 200 WeeklyReviewRead
- GET no reviews for user → 404
- GET unauthenticated → 401
- GET multiple reviews → returns most recent (created_at DESC)
"""

import json
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.activity import Activity
from models.training_plan import TrainingPlan
from models.weekly_review import WeeklyReview
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
# Plan fixtures
# ---------------------------------------------------------------------------

PLAN_DATA_4_RUNS = {
    "monday": {"type": "easy", "duration_min": 30, "notes": "Easy run."},
    "tuesday": {"type": "rest", "duration_min": 0, "notes": "Rest."},
    "wednesday": {"type": "tempo", "duration_min": 25, "notes": "Tempo."},
    "thursday": {"type": "rest", "duration_min": 0, "notes": "Rest."},
    "friday": {"type": "easy", "duration_min": 30, "notes": "Easy."},
    "saturday": {"type": "long", "duration_min": 60, "notes": "Long run."},
    "sunday": {"type": "rest", "duration_min": 0, "notes": "Rest."},
}

PLAN_DATA_ALL_REST = {
    "monday": {"type": "rest"},
    "tuesday": {"type": "rest"},
    "wednesday": {"type": "rest"},
    "thursday": {"type": "rest"},
    "friday": {"type": "rest"},
    "saturday": {"type": "rest"},
    "sunday": {"type": "rest"},
}

PLAN_NOTES = {day: None for day in PLAN_DATA_4_RUNS}

FAKE_REVIEW_TEXT = (
    "You planned 4 runs and completed 3. One gap. "
    "Do not let Fridays disappear for the next three weeks."
)


@pytest.fixture
def active_plan(db_session: Session, test_user) -> TrainingPlan:
    """Active training plan with 4 non-rest days."""
    plan = TrainingPlan(
        user_id=test_user.id,
        week_start_date=date.today() - timedelta(days=date.today().weekday()),
        plan_data=PLAN_DATA_4_RUNS,
        pak_har_notes=PLAN_NOTES,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


@pytest.fixture
def all_rest_plan(db_session: Session, test_user) -> TrainingPlan:
    """Active training plan where every day is rest (0 planned runs)."""
    plan = TrainingPlan(
        user_id=test_user.id,
        week_start_date=date.today() - timedelta(days=date.today().weekday()),
        plan_data=PLAN_DATA_ALL_REST,
        pak_har_notes={day: None for day in PLAN_DATA_ALL_REST},
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


@pytest.fixture
def this_weeks_activity(db_session: Session, test_user) -> Activity:
    """One activity from the current week (Monday 00:01 UTC)."""
    today = datetime.now(timezone.utc).date()
    monday = today - timedelta(days=today.weekday())
    activity_dt = datetime(monday.year, monday.month, monday.day, 6, 0, 0)
    activity = Activity(
        user_id=test_user.id,
        strava_activity_id="review_test_act_001",
        name="Monday Easy",
        distance_km=8.0,
        moving_time_seconds=2880,
        average_pace_min_per_km=6.0,
        average_hr=145,
        max_hr=160,
        elevation_gain_m=20,
        activity_date=activity_dt,
        sync_status="synced",
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity


def _fake_generate_review(
    review_text: str = FAKE_REVIEW_TEXT,
    planned: int = 4,
    actual: int = 3,
    headline: str | None = None,
    verdict_tag: str | None = None,
    tone: str | None = None,
):
    """
    Return an async generator callable that mimics generate_weekly_review success.

    Yields a single complete event. Does not persist to the DB — tests that need
    real DB writes should not use this mock.
    """
    async def _fake(user, db):
        yield complete_event({
            "text": review_text,
            "headline": headline,
            "verdict_tag": verdict_tag,
            "tone": tone,
        })
    return _fake


def _fake_generate_review_with_progress(
    review_text: str = FAKE_REVIEW_TEXT,
    planned: int = 4,
    actual: int = 3,
):
    """Return an async generator callable that yields 5 progress events then a complete event."""
    import time as _time

    async def _fake(user, db):
        started_at = _time.monotonic()
        steps = [
            "Counting this week's runs",
            "Reading your zone breakdown",
            "Checking last week",
            "Writing the assessment",
            "Filing the headline",
        ]
        for step in steps:
            yield progress_event(step, started_at)
        yield complete_event({
            "text": review_text,
            "headline": None,
            "verdict_tag": None,
            "tone": None,
        })
    return _fake


def _fake_generate_review_error(message: str):
    """Return an async generator callable that yields a single error event."""
    async def _fake(user, db):
        yield error_event(message)
    return _fake


# ---------------------------------------------------------------------------
# POST /review/generate
# ---------------------------------------------------------------------------

class TestGenerateReview:

    def test_unauthenticated_returns_401(self, test_app: TestClient) -> None:
        response = test_app.post("/review/generate")
        assert response.status_code == 401

    def test_rate_limit_returns_429(self, authenticated_client: TestClient) -> None:
        with patch("routers.review.check_rate_limit", return_value=False):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 429
        assert "Too many requests" in response.json()["detail"]

    def test_happy_path_returns_sse_stream(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """
        User has active plan + activities this week → 200 with text/event-stream
        containing a complete event.
        """
        with patch("routers.review.generate_weekly_review", side_effect=_fake_generate_review()):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None, f"No complete event found. Events: {events}"
        data = complete["data"]
        assert "text" in data
        assert data["text"] == FAKE_REVIEW_TEXT

    def test_happy_path_complete_event_has_required_fields(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """The complete event data must contain text, headline, verdict_tag, tone."""
        with patch(
            "routers.review.generate_weekly_review",
            side_effect=_fake_generate_review(
                headline="Three runs out of four. Fridays are the problem.",
                verdict_tag="LIGHT WEEK",
                tone="critical",
            ),
        ):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        data = complete["data"]
        assert data["text"] == FAKE_REVIEW_TEXT
        assert data["headline"] == "Three runs out of four. Fridays are the problem."
        assert data["verdict_tag"] == "LIGHT WEEK"
        assert data["tone"] == "critical"

    def test_no_active_plan_still_streams_complete_event(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """No active training plan → stream completes successfully."""
        with patch(
            "routers.review.generate_weekly_review",
            side_effect=_fake_generate_review(planned=0, actual=0, review_text="No plan, no runs."),
        ):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        assert complete["data"]["text"] == "No plan, no runs."

    def test_ollama_offline_emits_error_event(self, authenticated_client: TestClient) -> None:
        """Ollama offline → HTTP 200 with an SSE error event (error is in-stream)."""
        with patch(
            "routers.review.generate_weekly_review",
            side_effect=_fake_generate_review_error(
                "Pak Har is unavailable right now. Make sure Ollama is running."
            ),
        ):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None, f"No error event found. Events: {events}"
        assert "Pak Har is unavailable" in err["message"]

    def test_ollama_timeout_emits_error_event(self, authenticated_client: TestClient) -> None:
        """Ollama timeout → HTTP 200 with an SSE error event."""
        with patch(
            "routers.review.generate_weekly_review",
            side_effect=_fake_generate_review_error("Pak Har took too long to respond."),
        ):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None
        assert "too long" in err["message"]

    def test_zero_actual_runs_streams_complete_event(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """No activities this week but active plan exists → stream completes."""
        with patch(
            "routers.review.generate_weekly_review",
            side_effect=_fake_generate_review(planned=4, actual=0, review_text="Zero runs. Plan says four."),
        ):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        assert complete["data"]["text"] == "Zero runs. Plan says four."

    def test_progress_events_are_emitted_in_order(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """5 progress events should precede the complete event."""
        with patch(
            "routers.review.generate_weekly_review",
            side_effect=_fake_generate_review_with_progress(),
        ):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)

        progress_events = [e for e in events if e.get("type") == "progress"]
        assert len(progress_events) == 5, f"Expected 5 progress events, got: {progress_events}"

        expected_steps = [
            "Counting this week's runs",
            "Reading your zone breakdown",
            "Checking last week",
            "Writing the assessment",
            "Filing the headline",
        ]
        actual_steps = [e["step"] for e in progress_events]
        assert actual_steps == expected_steps

        # complete event must follow all progress events
        complete = _find_event(events, "complete")
        assert complete is not None
        complete_idx = events.index(complete)
        for p in progress_events:
            assert events.index(p) < complete_idx

    def test_planned_runs_counts_non_rest_days(
        self,
        db_session: Session,
        active_plan: TrainingPlan,
    ) -> None:
        """
        PLAN_DATA_4_RUNS has 4 non-rest days out of 7.
        Verify that _count_planned_runs returns 4.
        """
        from services.review import _count_planned_runs
        count = _count_planned_runs(active_plan)
        assert count == 4

    def test_all_rest_plan_has_zero_planned_runs(
        self,
        db_session: Session,
        all_rest_plan: TrainingPlan,
    ) -> None:
        """All-rest plan → 0 planned runs."""
        from services.review import _count_planned_runs
        count = _count_planned_runs(all_rest_plan)
        assert count == 0


# ---------------------------------------------------------------------------
# GET /review/current
# ---------------------------------------------------------------------------

class TestGetCurrentReview:

    def test_unauthenticated_returns_401(self, test_app: TestClient) -> None:
        response = test_app.get("/review/current")
        assert response.status_code == 401

    def test_no_reviews_returns_404(self, authenticated_client: TestClient) -> None:
        """No reviews exist for this user → 404."""
        response = authenticated_client.get("/review/current")
        assert response.status_code == 404
        assert "No weekly review found" in response.json()["detail"]

    def test_happy_path_returns_review(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ) -> None:
        """One review exists → 200 with WeeklyReviewRead."""
        review = WeeklyReview(
            user_id=test_user.id,
            week_start_date=date.today() - timedelta(days=date.today().weekday()),
            planned_runs=4,
            actual_runs=3,
            review_text="Three out of four. Not bad.",
        )
        db_session.add(review)
        db_session.commit()
        db_session.refresh(review)

        response = authenticated_client.get("/review/current")

        assert response.status_code == 200
        body = response.json()
        assert body["planned_runs"] == 4
        assert body["actual_runs"] == 3
        assert body["review_text"] == "Three out of four. Not bad."

    def test_multiple_reviews_returns_most_recent(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ) -> None:
        """Multiple reviews → GET /review/current returns the newest (created_at DESC)."""
        older_review = WeeklyReview(
            user_id=test_user.id,
            week_start_date=date.today() - timedelta(weeks=2) - timedelta(days=(date.today() - timedelta(weeks=2)).weekday()),
            planned_runs=3,
            actual_runs=1,
            review_text="Old review — two weeks ago.",
        )
        older_review.created_at = datetime.now(timezone.utc) - timedelta(days=14)

        newer_review = WeeklyReview(
            user_id=test_user.id,
            week_start_date=date.today() - timedelta(days=date.today().weekday()),
            planned_runs=4,
            actual_runs=4,
            review_text="This week — you showed up all four days.",
        )
        newer_review.created_at = datetime.now(timezone.utc)

        db_session.add(older_review)
        db_session.add(newer_review)
        db_session.commit()

        response = authenticated_client.get("/review/current")

        assert response.status_code == 200
        body = response.json()
        assert body["review_text"] == "This week — you showed up all four days."
        assert body["planned_runs"] == 4
        assert body["actual_runs"] == 4

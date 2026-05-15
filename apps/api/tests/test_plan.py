"""
Tests for POST /plan/generate (SSE stream) and GET /plan/current.

Coverage:
- POST happy path: user with activities → 200 SSE stream with complete event
- POST unauthenticated → 401
- POST Ollama offline → 200 SSE stream with error event
- POST Ollama timeout → 200 SSE stream with error event
- POST parse error → 200 SSE stream with error event
- POST rate limit → 429
- POST progress events emitted in correct order (5 steps)
- GET no plan → 404
- GET happy path → 200 with existing plan
"""

import json
import time
from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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

def _make_fake_plan_dict() -> dict:
    """Return a serialised plan dict as the complete event would contain."""
    now = datetime.now(timezone.utc)
    return {
        "id": 1,
        "user_id": 1,
        "week_start_date": date.today().isoformat(),
        "plan_data": SAMPLE_PLAN_DATA,
        "pak_har_notes": SAMPLE_NOTES,
        "is_active": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


def _fake_generate_plan_complete():
    """Return an async generator callable that yields a complete event with a plan."""
    async def _fake(user, db):
        yield complete_event({"plan": _make_fake_plan_dict()})
    return _fake


def _fake_generate_plan_with_progress():
    """Return an async generator callable that yields 5 progress events then a complete event."""
    async def _fake(user, db):
        started_at = time.monotonic()
        for step in PLAN_STEPS:
            yield progress_event(step, started_at)
        yield complete_event({"plan": _make_fake_plan_dict()})
    return _fake


def _fake_generate_plan_error(message: str):
    """Return an async generator callable that yields a single error event."""
    async def _fake(user, db):
        yield error_event(message)
    return _fake


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

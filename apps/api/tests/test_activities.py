"""
Tests for activity list + detail endpoints, plus normalize_activity unit tests,
and POST /activities/{id}/analyze (SSE stream).

Endpoints covered:
- GET /activities              — list (triggers sync on load)
- GET /activities/{id}         — single activity detail
- POST /activities/{id}/analyze — SSE streaming analysis

Strava HTTP calls are mocked via respx. Database is real SQLite in-memory.
"""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import respx
from httpx import Response
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.activity import Activity
from models.user import User
from services.encryption import encrypt_token
from services.streaming import complete_event, error_event, progress_event, token_event
from services.strava import normalize_activity


# ---------------------------------------------------------------------------
# SSE parsing helpers (mirrors test_review.py and test_plan.py)
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
# Fake generator helpers for analyze endpoint
# ---------------------------------------------------------------------------

FAKE_ANALYSIS_TEXT = (
    "You held your pace through the last three kilometres. That took discipline. "
    "The HR drift in the final km is worth watching — do not ignore it."
)

_ANALYZE_STEPS = [
    "Pulling your splits",
    "Reading the zones",
    "Checking your history",
    "Writing the dispatch",
    "Filing the verdict",
]


def _fake_analyze_complete(
    analysis: str = FAKE_ANALYSIS_TEXT,
    verdict_short: str | None = "Held pace but HR drifted in the last km.",
    verdict_tag: str | None = "FADED LATE",
    tone: str | None = "critical",
):
    """Return an async generator callable that yields a single complete event."""
    async def _fake(activity_id, user, db):
        yield complete_event({
            "analysis": analysis,
            "verdict_short": verdict_short,
            "verdict_tag": verdict_tag,
            "tone": tone,
        })
    return _fake


def _fake_analyze_with_progress(
    analysis: str = FAKE_ANALYSIS_TEXT,
):
    """Return an async generator callable that yields 5 progress events then a complete event."""
    import time as _time

    async def _fake(activity_id, user, db):
        started_at = _time.monotonic()
        for step in _ANALYZE_STEPS:
            yield progress_event(step, started_at)
        yield complete_event({
            "analysis": analysis,
            "verdict_short": None,
            "verdict_tag": None,
            "tone": None,
        })
    return _fake


def _fake_analyze_with_tokens(
    analysis: str = FAKE_ANALYSIS_TEXT,
    tokens: list[str] | None = None,
):
    """Return an async generator that yields all 5 progress events with token events
    between 'Writing the dispatch' and 'Filing the verdict', then a complete event.

    This mirrors what run_analysis_for_activity produces when Ollama streams tokens
    during stage 4.
    """
    import time as _time

    if tokens is None:
        tokens = ["You held ", "your pace. ", "HR drifted."]

    async def _fake(activity_id, user, db):
        started_at = _time.monotonic()
        # Stages 1–3
        for step in _ANALYZE_STEPS[:3]:
            yield progress_event(step, started_at)
        # Stage 4 — Writing the dispatch: progress then token stream
        yield progress_event("Writing the dispatch", started_at)
        for chunk in tokens:
            yield token_event(chunk)
        # Stage 5 — Filing the verdict
        yield progress_event("Filing the verdict", started_at)
        yield complete_event({
            "analysis": analysis,
            "verdict_short": None,
            "verdict_tag": None,
            "tone": None,
        })
    return _fake


def _fake_analyze_error(message: str):
    """Return an async generator callable that yields a single error event."""
    async def _fake(activity_id, user, db):
        yield error_event(message)
    return _fake


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _patch_strava_settings():
    """Ensure strava service has env credentials set so token refresh works."""
    import services.strava as strava_service
    strava_service._settings.strava_client_id = "test_id"
    strava_service._settings.strava_client_secret = "test_secret"
    strava_service._settings.strava_redirect_uri = "http://localhost:8000/auth/strava/callback"


def _mock_strava_activities(mock_router, activities_payload: list) -> None:
    """Register a respx mock for the Strava athlete activities endpoint."""
    mock_router.get("https://www.strava.com/api/v3/athlete/activities").mock(
        return_value=Response(200, json=activities_payload)
    )


# ---------------------------------------------------------------------------
# GET /activities — list
# ---------------------------------------------------------------------------

def test_list_activities_unauthenticated(test_app: TestClient):
    """No session cookie → 401."""
    response = test_app.get("/activities")
    assert response.status_code == 401


def test_list_activities_empty(authenticated_client: TestClient):
    """Authenticated, no activities seeded, Strava returns [] → response is []."""
    _patch_strava_settings()
    with respx.mock as mock:
        _mock_strava_activities(mock, [])
        response = authenticated_client.get("/activities")

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_list_activities_returns_existing(
    authenticated_client: TestClient,
    test_activity: Activity,
):
    """Existing activity is returned even when Strava sync returns nothing new."""
    _patch_strava_settings()
    with respx.mock as mock:
        _mock_strava_activities(mock, [])
        response = authenticated_client.get("/activities")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["strava_activity_id"] == "strava_act_001"


def test_list_activities_syncs_new_from_strava(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
    monkeypatch,
):
    """Strava returns a new run → it is synced and returned in the list."""
    raw_strava_activity = {
        "id": 555001,
        "name": "Evening 5K",
        "type": "Run",
        "distance": 5000.0,
        "moving_time": 1800,
        "average_speed": 2.778,  # ~6 min/km
        "average_heartrate": 148,
        "max_heartrate": 165,
        "total_elevation_gain": 20,
        "start_date": "2026-04-15T18:00:00Z",
    }

    async def mock_fetch_activities(_access_token: str, _days: int = 90):
        return [raw_strava_activity]

    monkeypatch.setattr("services.strava.fetch_activities", mock_fetch_activities)

    response = authenticated_client.get("/activities")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["distance_km"] == pytest.approx(5.0, abs=0.01)


# ---------------------------------------------------------------------------
# GET /activities/{id} — detail
# ---------------------------------------------------------------------------

def test_get_activity_unauthenticated(test_app: TestClient):
    """No cookie → 401."""
    response = test_app.get("/activities/1")
    assert response.status_code == 401


def test_get_activity_not_found(authenticated_client: TestClient):
    """Valid auth, non-existent activity ID → 404."""
    response = authenticated_client.get("/activities/99999")
    assert response.status_code == 404


def test_get_activity_success(
    authenticated_client: TestClient,
    test_activity: Activity,
):
    """Valid auth + own activity → 200 with correct data."""
    response = authenticated_client.get(f"/activities/{test_activity.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["strava_activity_id"] == "strava_act_001"
    assert data["name"] == "Morning Run"
    assert data["distance_km"] == pytest.approx(10.5)
    assert data["average_hr"] == 155
    assert data["max_hr"] == 172


def test_get_activity_other_users_activity(
    authenticated_client: TestClient,
    db_session: Session,
):
    """Authenticated as user A — trying to access user B's activity returns 404 (not 403)."""
    # Create a second user
    other_user = User(
        strava_athlete_id="other_athlete_456",
        strava_access_token=encrypt_token("other_access_token"),
        strava_refresh_token=encrypt_token("other_refresh_token"),
        strava_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=6),
        name="Other Runner",
        avatar_url=None,
    )
    db_session.add(other_user)
    db_session.commit()
    db_session.refresh(other_user)

    # Create activity belonging to second user
    other_activity = Activity(
        user_id=other_user.id,
        strava_activity_id="strava_act_other_001",
        name="Other User Run",
        distance_km=8.0,
        moving_time_seconds=2800,
        average_pace_min_per_km=5.83,
        average_hr=None,
        max_hr=None,
        elevation_gain_m=12,
        activity_date=datetime.now(timezone.utc) - timedelta(days=2),
        sync_status="synced",
    )
    db_session.add(other_activity)
    db_session.commit()
    db_session.refresh(other_activity)

    # Authenticated as user A (from authenticated_client fixture)
    response = authenticated_client.get(f"/activities/{other_activity.id}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# normalize_activity() — pure unit tests (no HTTP)
# ---------------------------------------------------------------------------

def test_normalize_activity_unit_conversion():
    """
    Raw Strava dict → correct km, min/km pace, and time values.

    Input:  distance=10500m, average_speed=2.917 m/s, moving_time=3600s
    Expect: distance_km=10.5, pace≈5.714 min/km, moving_time_seconds=3600
    """
    raw = {
        "id": 100001,
        "name": "Test Run",
        "distance": 10500.0,
        "moving_time": 3600,
        "average_speed": 2.917,
        "average_heartrate": 150,
        "max_heartrate": 168,
        "total_elevation_gain": 30,
        "start_date": "2026-04-14T07:00:00Z",
    }

    result = normalize_activity(raw)

    assert result["distance_km"] == pytest.approx(10.5, abs=0.01)
    # 1000 / (2.917 * 60) ≈ 5.714
    assert result["average_pace_min_per_km"] == pytest.approx(5.714, abs=0.01)
    assert result["moving_time_seconds"] == 3600
    assert result["strava_activity_id"] == "100001"
    assert result["name"] == "Test Run"
    assert result["elevation_gain_m"] == 30


def test_normalize_activity_no_hr():
    """
    Activity without HR monitor → average_hr and max_hr are None.
    """
    raw = {
        "id": 100002,
        "name": "HR-less Run",
        "distance": 5000.0,
        "moving_time": 1500,
        "average_speed": 3.333,
        "total_elevation_gain": 10,
        "start_date": "2026-04-13T06:00:00Z",
        # No average_heartrate or max_heartrate keys
    }

    result = normalize_activity(raw)

    assert result["average_hr"] is None
    assert result["max_hr"] is None
    assert result["distance_km"] == pytest.approx(5.0, abs=0.01)


# ---------------------------------------------------------------------------
# POST /activities/{id}/analyze — SSE stream
# ---------------------------------------------------------------------------

class TestAnalyzeActivity:
    """Tests for the SSE-streaming analyze endpoint (TASK-190)."""

    def test_unauthenticated_returns_401(self, test_app: TestClient) -> None:
        """No session cookie → 401 before stream starts."""
        response = test_app.post("/activities/1/analyze")
        assert response.status_code == 401

    def test_activity_not_found_returns_404(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """Valid auth, non-existent activity ID → 404 before stream starts."""
        response = authenticated_client.post("/activities/99999/analyze")
        assert response.status_code == 404

    def test_rate_limit_returns_429(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Rate limit exceeded → 429 before stream starts."""
        with patch("routers.activities.check_rate_limit", return_value=False):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")
        assert response.status_code == 429
        assert "Too many requests" in response.json()["detail"]

    def test_happy_path_returns_sse_stream(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Valid auth + own activity → 200 text/event-stream with complete event."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_complete(),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None, f"No complete event found. Events: {events}"
        data = complete["data"]
        assert "analysis" in data
        assert data["analysis"] == FAKE_ANALYSIS_TEXT

    def test_complete_event_has_all_verdict_fields(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Complete event data must contain analysis, verdict_short, verdict_tag, tone."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_complete(
                verdict_short="Held pace but HR drifted in the last km.",
                verdict_tag="FADED LATE",
                tone="critical",
            ),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        data = complete["data"]
        assert data["analysis"] == FAKE_ANALYSIS_TEXT
        assert data["verdict_short"] == "Held pace but HR drifted in the last km."
        assert data["verdict_tag"] == "FADED LATE"
        assert data["tone"] == "critical"

    def test_verdict_fields_can_be_null(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Verdict fields are null when extraction fails — complete event still emitted."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_complete(
                verdict_short=None,
                verdict_tag=None,
                tone=None,
            ),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete = _find_event(events, "complete")
        assert complete is not None
        data = complete["data"]
        assert "analysis" in data
        assert data["verdict_short"] is None
        assert data["verdict_tag"] is None
        assert data["tone"] is None

    def test_ollama_offline_emits_error_event(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Ollama offline → HTTP 200 with an SSE error event (error is in-stream)."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_error(
                "Pak Har is unavailable right now. Make sure Ollama is running."
            ),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None, f"No error event found. Events: {events}"
        assert "Pak Har is unavailable" in err["message"]

    def test_ollama_timeout_emits_error_event(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Ollama timeout → HTTP 200 with an SSE error event."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_error("Pak Har took too long to respond."),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        err = _find_event(events, "error")
        assert err is not None
        assert "too long" in err["message"]

    def test_progress_events_emitted_in_order(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """5 progress events must precede the complete event, in the correct order."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_with_progress(),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)

        progress_events = [e for e in events if e.get("type") == "progress"]
        assert len(progress_events) == 5, (
            f"Expected 5 progress events, got: {progress_events}"
        )

        actual_steps = [e["step"] for e in progress_events]
        assert actual_steps == _ANALYZE_STEPS

        # complete event must follow all progress events
        complete = _find_event(events, "complete")
        assert complete is not None
        complete_idx = events.index(complete)
        for p in progress_events:
            assert events.index(p) < complete_idx

    def test_progress_events_have_elapsed_ms(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Each progress event must carry an elapsed_ms integer."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_with_progress(),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        events = _parse_sse_events(response.text)
        progress_events = [e for e in events if e.get("type") == "progress"]
        for evt in progress_events:
            assert "elapsed_ms" in evt
            assert isinstance(evt["elapsed_ms"], int)

    def test_response_headers_for_sse(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """SSE response must include Cache-Control and X-Accel-Buffering headers."""
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_complete(),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        assert response.headers.get("cache-control") == "no-cache"
        assert response.headers.get("x-accel-buffering") == "no"

    def test_other_users_activity_returns_404(
        self,
        authenticated_client: TestClient,
        db_session: Session,
    ) -> None:
        """Authenticated as user A — analyzing user B's activity returns 404 (not 403)."""
        from services.encryption import encrypt_token as _enc

        other_user = User(
            strava_athlete_id="other_athlete_analyze_test",
            strava_access_token=_enc("other_access_token"),
            strava_refresh_token=_enc("other_refresh_token"),
            strava_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=6),
            name="Other Runner",
            avatar_url=None,
        )
        db_session.add(other_user)
        db_session.commit()
        db_session.refresh(other_user)

        other_activity = Activity(
            user_id=other_user.id,
            strava_activity_id="strava_other_analyze_001",
            name="Other User Run",
            distance_km=8.0,
            moving_time_seconds=2800,
            average_pace_min_per_km=5.83,
            average_hr=None,
            max_hr=None,
            elevation_gain_m=12,
            activity_date=datetime.now(timezone.utc) - timedelta(days=2),
            sync_status="synced",
        )
        db_session.add(other_activity)
        db_session.commit()
        db_session.refresh(other_activity)

        response = authenticated_client.post(f"/activities/{other_activity.id}/analyze")
        assert response.status_code == 404

    def test_token_events_appear_between_dispatch_and_verdict(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Token events must appear after 'Writing the dispatch' progress and before
        'Filing the verdict' progress in the SSE stream."""
        tokens = ["You held ", "your pace. ", "HR drifted."]
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_with_tokens(tokens=tokens),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)

        token_events = [e for e in events if e.get("type") == "token"]
        assert len(token_events) == len(tokens), (
            f"Expected {len(tokens)} token events, got: {token_events}"
        )

        # Locate the bounding progress events by step label.
        dispatch_idx = next(
            (i for i, e in enumerate(events)
             if e.get("type") == "progress" and e.get("step") == "Writing the dispatch"),
            None,
        )
        verdict_idx = next(
            (i for i, e in enumerate(events)
             if e.get("type") == "progress" and e.get("step") == "Filing the verdict"),
            None,
        )
        assert dispatch_idx is not None, "No 'Writing the dispatch' progress event found"
        assert verdict_idx is not None, "No 'Filing the verdict' progress event found"

        for tok_evt in token_events:
            tok_idx = events.index(tok_evt)
            assert dispatch_idx < tok_idx < verdict_idx, (
                f"Token event at index {tok_idx} is not between "
                f"dispatch ({dispatch_idx}) and verdict ({verdict_idx})"
            )

    def test_token_event_payload_shape(
        self,
        authenticated_client: TestClient,
        test_activity: Activity,
    ) -> None:
        """Each token event must have type='token' and a string 'content' field."""
        tokens = ["First chunk.", " Second chunk."]
        with patch(
            "routers.activities.run_analysis_for_activity",
            side_effect=_fake_analyze_with_tokens(tokens=tokens),
        ):
            response = authenticated_client.post(f"/activities/{test_activity.id}/analyze")

        assert response.status_code == 200
        events = _parse_sse_events(response.text)

        token_events = [e for e in events if e.get("type") == "token"]
        assert len(token_events) == len(tokens)

        for evt in token_events:
            assert evt.get("type") == "token"
            assert "content" in evt
            assert isinstance(evt["content"], str)

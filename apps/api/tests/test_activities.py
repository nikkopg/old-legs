"""
Tests for activity list + detail endpoints, plus normalize_activity unit tests.

Endpoints covered:
- GET /activities              — list (triggers sync on load)
- GET /activities/{id}         — single activity detail

Strava HTTP calls are mocked via respx. Database is real SQLite in-memory.
"""

from datetime import datetime, timedelta, timezone

import pytest
import respx
from httpx import Response
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.activity import Activity
from models.user import User
from services.encryption import encrypt_token
from services.strava import normalize_activity


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _patch_strava_settings():
    """Ensure strava service has env credentials set so token refresh works."""
    import services.strava as strava_service
    strava_service._settings.client_id = "test_id"
    strava_service._settings.client_secret = "test_secret"
    strava_service._settings.redirect_uri = "http://localhost:8000/auth/strava/callback"


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
    assert response.json() == []


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
    assert len(data) == 1
    assert data[0]["strava_activity_id"] == "strava_act_001"


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
    assert len(data) == 1
    assert data[0]["distance_km"] == pytest.approx(5.0, abs=0.01)


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

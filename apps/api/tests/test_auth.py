"""
Tests for Strava OAuth auth endpoints.

Endpoints covered:
- POST /auth/strava     — initiate OAuth, return redirect URL
- GET  /auth/strava/callback — exchange code, store tokens, set cookie
- GET  /auth/strava/status   — check session state

Strava HTTP calls are mocked via respx. The database is a real SQLite
in-memory instance (never mocked).
"""

import os

import pytest
import respx
from httpx import Response
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.user import User


# ---------------------------------------------------------------------------
# POST /auth/strava — initiate OAuth
# ---------------------------------------------------------------------------

def test_initiate_oauth_returns_url(test_app: TestClient, monkeypatch):
    """Happy path: valid env vars → returns oauth_url pointing to Strava."""
    monkeypatch.setenv("STRAVA_CLIENT_ID", "test_id")
    monkeypatch.setenv("STRAVA_REDIRECT_URI", "http://localhost:8000/auth/strava/callback")

    # Re-read env in the router's _oauth_settings object
    import routers.auth as auth_router
    auth_router._oauth_settings.client_id = "test_id"
    auth_router._oauth_settings.redirect_uri = "http://localhost:8000/auth/strava/callback"

    response = test_app.post("/auth/strava", json={})

    assert response.status_code == 200
    data = response.json()
    assert "oauth_url" in data
    assert "strava.com/oauth/authorize" in data["oauth_url"]


def test_initiate_oauth_missing_client_id(test_app: TestClient):
    """Missing STRAVA_CLIENT_ID → 500."""
    import routers.auth as auth_router
    original_client_id = auth_router._oauth_settings.client_id
    original_redirect = auth_router._oauth_settings.redirect_uri

    auth_router._oauth_settings.client_id = ""
    auth_router._oauth_settings.redirect_uri = "http://localhost:8000/auth/strava/callback"

    try:
        response = test_app.post("/auth/strava", json={})
        assert response.status_code == 500
    finally:
        auth_router._oauth_settings.client_id = original_client_id
        auth_router._oauth_settings.redirect_uri = original_redirect


# ---------------------------------------------------------------------------
# GET /auth/strava/callback — OAuth exchange
# ---------------------------------------------------------------------------

def test_oauth_callback_missing_code(test_app: TestClient):
    """No code query param → 400 (FastAPI 422 for missing required param is also acceptable)."""
    response = test_app.get("/auth/strava/callback")
    assert response.status_code in (400, 422)


def test_oauth_callback_success(test_app: TestClient, db_session: Session, monkeypatch):
    """
    Full happy-path callback:
    - exchange_code_for_tokens returns valid token data
    - fetch_athlete_profile returns valid athlete profile
    - User is created in DB
    - session_user_id cookie is set in response
    """
    from datetime import datetime, timedelta, timezone
    import routers.auth as auth_router

    auth_router._oauth_settings.client_id = "test_client_id"
    auth_router._oauth_settings.redirect_uri = "http://localhost:8000/auth/strava/callback"

    async def mock_exchange_code(_code: str) -> dict:
        return {
            "access_token": "strava_access_abc",
            "refresh_token": "strava_refresh_abc",
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=6),
            "athlete": {"id": 99001},
        }

    async def mock_fetch_athlete(_token: str) -> dict:
        return {
            "id": 99001,
            "firstname": "Test",
            "lastname": "Runner",
            "profile": None,
        }

    monkeypatch.setattr("services.strava.exchange_code_for_tokens", mock_exchange_code)
    monkeypatch.setattr("services.strava.fetch_athlete_profile", mock_fetch_athlete)

    response = test_app.get("/auth/strava/callback", params={"code": "valid_code"})

    assert response.status_code == 200
    data = response.json()
    assert data.get("success") is True

    # Cookie must be set
    assert "session_user_id" in response.cookies

    # User must exist in DB
    user = db_session.query(User).filter_by(strava_athlete_id="99001").first()
    assert user is not None
    assert user.name == "Test Runner"


def test_oauth_callback_strava_api_error(test_app: TestClient):
    """Strava returns 400 for bad code → endpoint returns 400 or 500."""
    import routers.auth as auth_router
    import services.strava as strava_service

    auth_router._oauth_settings.client_id = "test_client_id"
    auth_router._oauth_settings.redirect_uri = "http://localhost:8000/auth/strava/callback"
    strava_service._settings.client_id = "test_client_id"
    strava_service._settings.client_secret = "test_client_secret"
    strava_service._settings.redirect_uri = "http://localhost:8000/auth/strava/callback"

    with respx.mock as mock:
        mock.post("https://www.strava.com/oauth/token").mock(
            return_value=Response(400, json={"message": "Bad Request", "errors": []})
        )
        response = test_app.get("/auth/strava/callback", params={"code": "bad_code"})

    assert response.status_code in (400, 500)


# ---------------------------------------------------------------------------
# GET /auth/strava/status — session check
# ---------------------------------------------------------------------------

def test_oauth_status_no_cookie(test_app: TestClient):
    """No cookie → 200 with connected: false."""
    response = test_app.get("/auth/strava/status")
    assert response.status_code == 200
    assert response.json()["connected"] is False


def test_oauth_status_valid_session(authenticated_client: TestClient):
    """Valid session cookie → 200 with connected: true."""
    response = authenticated_client.get("/auth/strava/status")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is True


def test_oauth_status_invalid_user_id(test_app: TestClient):
    """Cookie with non-existent user ID → 200 with connected: false."""
    test_app.cookies.set("session_user_id", "999999")
    response = test_app.get("/auth/strava/status")
    assert response.status_code == 200
    assert response.json()["connected"] is False

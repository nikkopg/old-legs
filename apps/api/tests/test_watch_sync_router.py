"""
Integration tests for /watch endpoints.

All garminconnect.Garmin calls are mocked — no real Garmin credentials needed.
Uses real SQLite in-memory DB and the existing conftest fixtures.
"""

import json
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.training_plan import TrainingPlan
from models.watch_integration import WatchIntegration
from services.encryption import encrypt_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_integration(db: Session, user_id: int, platform: str = "garmin") -> WatchIntegration:
    creds = json.dumps({"email": "runner@example.com", "password": "secret"})
    integration = WatchIntegration(
        user_id=user_id,
        platform=platform,
        credentials_encrypted=encrypt_token(creds),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(integration)
    db.commit()
    db.refresh(integration)
    return integration


def _make_plan(db: Session, user_id: int) -> TrainingPlan:
    plan = TrainingPlan(
        user_id=user_id,
        week_start_date=date(2026, 6, 1),
        plan_data={
            "monday": {"type": "easy", "description": "Easy run", "duration_minutes": 40},
            "tuesday": {"type": "rest", "description": "Rest", "duration_minutes": 0},
        },
        pak_har_notes={"monday": "Start slow.", "tuesday": None},
        is_active=True,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# POST /watch/connect
# ---------------------------------------------------------------------------

class TestConnectWatch:
    def test_connect_happy_path(self, authenticated_client: TestClient, db_session: Session, test_user):
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect"):
            resp = authenticated_client.post("/watch/connect", json={
                "platform": "garmin",
                "credentials": {"email": "runner@example.com", "password": "secret"},
            })
        assert resp.status_code == 200
        body = resp.json()
        assert body["platform"] == "garmin"
        assert body["connected"] is True

        integration = db_session.query(WatchIntegration).filter_by(user_id=test_user.id).first()
        assert integration is not None
        assert integration.platform == "garmin"

    def test_connect_unknown_platform_returns_422(self, authenticated_client: TestClient):
        resp = authenticated_client.post("/watch/connect", json={
            "platform": "fitbit",
            "credentials": {"token": "abc"},
        })
        assert resp.status_code == 422
        assert "fitbit" in resp.json()["detail"]

    def test_connect_wrong_credentials_returns_400(self, authenticated_client: TestClient):
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect",
                   side_effect=Exception("Invalid credentials")):
            resp = authenticated_client.post("/watch/connect", json={
                "platform": "garmin",
                "credentials": {"email": "bad@example.com", "password": "wrong"},
            })
        assert resp.status_code == 400

    def test_connect_mfa_required_returns_428(self, authenticated_client: TestClient):
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect",
                   side_effect=Exception("MFA code required")):
            resp = authenticated_client.post("/watch/connect", json={
                "platform": "garmin",
                "credentials": {"email": "runner@example.com", "password": "secret"},
            })
        assert resp.status_code == 428
        body = resp.json()
        assert body["detail"]["mfa_required"] is True
        assert body["detail"]["platform"] == "garmin"

    def test_connect_unauthenticated_returns_401(self, test_app: TestClient):
        resp = test_app.post("/watch/connect", json={
            "platform": "garmin",
            "credentials": {"email": "x@x.com", "password": "y"},
        })
        assert resp.status_code == 401

    def test_connect_updates_existing_integration(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect"):
            resp = authenticated_client.post("/watch/connect", json={
                "platform": "garmin",
                "credentials": {"email": "new@example.com", "password": "newsecret"},
            })
        assert resp.status_code == 200
        rows = db_session.query(WatchIntegration).filter_by(user_id=test_user.id).all()
        assert len(rows) == 1  # not duplicated


# ---------------------------------------------------------------------------
# POST /watch/connect/mfa
# ---------------------------------------------------------------------------

class TestConnectMfa:
    def test_mfa_complete_happy_path(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect_with_mfa"):
            resp = authenticated_client.post("/watch/connect/mfa", json={
                "platform": "garmin",
                "mfa_code": "123456",
            })
        assert resp.status_code == 200

    def test_mfa_no_integration_returns_404(self, authenticated_client: TestClient):
        resp = authenticated_client.post("/watch/connect/mfa", json={
            "platform": "garmin",
            "mfa_code": "000000",
        })
        assert resp.status_code == 404

    def test_mfa_bad_code_returns_400(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect_with_mfa",
                   side_effect=Exception("MFA verification failed")):
            resp = authenticated_client.post("/watch/connect/mfa", json={
                "platform": "garmin",
                "mfa_code": "999999",
            })
        assert resp.status_code == 400

    def test_mfa_unauthenticated_returns_401(self, test_app: TestClient):
        resp = test_app.post("/watch/connect/mfa", json={"platform": "garmin", "mfa_code": "123456"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /watch/{platform}/disconnect
# ---------------------------------------------------------------------------

class TestDisconnect:
    def test_disconnect_removes_integration(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        resp = authenticated_client.delete("/watch/garmin/disconnect")
        assert resp.status_code == 204
        assert db_session.query(WatchIntegration).filter_by(user_id=test_user.id).first() is None

    def test_disconnect_idempotent(self, authenticated_client: TestClient):
        """Disconnecting when not connected returns 204, not 404."""
        resp = authenticated_client.delete("/watch/garmin/disconnect")
        assert resp.status_code == 204

    def test_disconnect_unauthenticated_returns_401(self, test_app: TestClient):
        resp = test_app.delete("/watch/garmin/disconnect")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /watch/status
# ---------------------------------------------------------------------------

class TestWatchStatus:
    def test_status_not_connected_returns_empty_list(self, authenticated_client: TestClient):
        resp = authenticated_client.get("/watch/status")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_status_connected_returns_list(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        resp = authenticated_client.get("/watch/status")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["platform"] == "garmin"
        assert body[0]["connected"] is True

    def test_status_unauthenticated_returns_401(self, test_app: TestClient):
        resp = test_app.get("/watch/status")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /watch/sync
# ---------------------------------------------------------------------------

class TestWatchSync:
    def test_sync_no_active_plan_returns_404(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        resp = authenticated_client.post("/watch/sync")
        assert resp.status_code == 404

    def test_sync_no_integration_returns_404(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_plan(db_session, test_user.id)
        resp = authenticated_client.post("/watch/sync")
        assert resp.status_code == 404

    def test_sync_happy_path(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        _make_plan(db_session, test_user.id)
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect"), \
             patch("services.watch_sync.adapters.garmin.GarminAdapter.push_workout",
                   return_value="garmin-workout-123"):
            resp = authenticated_client.post("/watch/sync")
        assert resp.status_code == 200
        body = resp.json()
        assert body["results"]["garmin"] == "pushed"

    def test_sync_garmin_down_returns_failed(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        _make_integration(db_session, test_user.id)
        _make_plan(db_session, test_user.id)
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect",
                   side_effect=Exception("Connection refused")):
            resp = authenticated_client.post("/watch/sync")
        assert resp.status_code == 200
        assert resp.json()["results"]["garmin"] == "failed"

    def test_sync_plan_still_ok_when_garmin_fails(
        self, authenticated_client: TestClient, db_session: Session, test_user
    ):
        """Garmin failure must not affect the plan itself."""
        _make_integration(db_session, test_user.id)
        _make_plan(db_session, test_user.id)
        with patch("services.watch_sync.adapters.garmin.GarminAdapter.connect",
                   side_effect=Exception("API down")):
            sync_resp = authenticated_client.post("/watch/sync")
        assert sync_resp.status_code == 200
        # Plan endpoint still works
        plan_resp = authenticated_client.get("/plan/current")
        assert plan_resp.status_code == 200

    def test_sync_unauthenticated_returns_401(self, test_app: TestClient):
        resp = test_app.post("/watch/sync")
        assert resp.status_code == 401

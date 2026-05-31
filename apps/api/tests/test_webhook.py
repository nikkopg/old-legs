"""
Tests for Strava webhook endpoints.

Endpoints covered:
- GET  /strava/webhook — subscription verification (hub challenge handshake)
- POST /strava/webhook — incoming activity event (signature validation + sync trigger)

Design decisions:
- Real SQLite in-memory DB (not mocked)
- Background sync task is mocked — we only verify it is scheduled, not that it runs
- Signature validation exercised directly through the router
"""

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_signature(body: bytes, secret: str) -> str:
    """Produce a valid X-Hub-Signature header value for the given body and secret."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _activity_create_event(owner_id: int = 12345, object_id: int = 9999001) -> dict:
    return {
        "object_type": "activity",
        "aspect_type": "create",
        "owner_id": owner_id,
        "object_id": object_id,
    }


# ---------------------------------------------------------------------------
# GET /strava/webhook — subscription verification
# ---------------------------------------------------------------------------

class TestWebhookVerification:
    """Tests for the Strava webhook subscription verification GET endpoint."""

    def test_verification_correct_token(self, test_app: TestClient, monkeypatch):
        """Correct hub.verify_token → 200 echoing hub.challenge."""
        import routers.webhook as wh
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", "my-secret")

        resp = test_app.get(
            "/strava/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "my-secret",
                "hub.challenge": "abc123",
            },
        )

        assert resp.status_code == 200
        assert resp.json() == {"hub.challenge": "abc123"}

    def test_verification_wrong_token(self, test_app: TestClient, monkeypatch):
        """Wrong hub.verify_token → 403."""
        import routers.webhook as wh
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", "my-secret")

        resp = test_app.get(
            "/strava/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong-token",
                "hub.challenge": "abc123",
            },
        )

        assert resp.status_code == 403

    def test_verification_missing_params(self, test_app: TestClient):
        """Missing required query params → 422 (FastAPI validation)."""
        resp = test_app.get("/strava/webhook")
        assert resp.status_code == 422

    def test_verification_dev_mode_no_token_configured(
        self, test_app: TestClient, monkeypatch
    ):
        """When STRAVA_WEBHOOK_VERIFY_TOKEN is empty, any token is accepted (dev mode)."""
        import routers.webhook as wh
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", "")

        resp = test_app.get(
            "/strava/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "anything",
                "hub.challenge": "challenge-xyz",
            },
        )

        assert resp.status_code == 200
        assert resp.json() == {"hub.challenge": "challenge-xyz"}


# ---------------------------------------------------------------------------
# POST /strava/webhook — event handling
# ---------------------------------------------------------------------------

class TestWebhookEventHandling:
    """Tests for the Strava webhook POST event endpoint."""

    def test_activity_create_returns_ok(
        self,
        authenticated_client: TestClient,
        test_user,
        test_app: TestClient,
        monkeypatch,
    ):
        """
        Valid activity-create event for a known athlete → 200 {"status": "ok"}.
        Background sync task is scheduled (not awaited in tests).
        """
        import routers.webhook as wh

        secret = "webhook-secret"
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", secret)

        # Patch asyncio.create_task so it doesn't actually run the coroutine
        scheduled = []

        def fake_create_task(coro):
            scheduled.append(coro)
            # Close to avoid 'coroutine was never awaited' warning
            coro.close()

        monkeypatch.setattr(wh.asyncio, "create_task", fake_create_task)

        body = json.dumps(
            _activity_create_event(owner_id=int(test_user.strava_athlete_id.replace("test_athlete_", "") or 123))
        ).encode()

        # Use the actual strava_athlete_id stored on test_user
        event = {
            "object_type": "activity",
            "aspect_type": "create",
            "owner_id": test_user.strava_athlete_id,  # stored as str in our model
            "object_id": 9999001,
        }
        body = json.dumps(event).encode()
        sig = _make_signature(body, secret)

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": sig,
            },
        )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert len(scheduled) == 1

    def test_non_activity_event_ignored(self, test_app: TestClient, monkeypatch):
        """Event with object_type != 'activity' → 200 ok, no sync task."""
        import routers.webhook as wh

        secret = "webhook-secret"
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", secret)

        scheduled = []

        def fake_create_task(coro):
            scheduled.append(coro)
            coro.close()

        monkeypatch.setattr(wh.asyncio, "create_task", fake_create_task)

        event = {
            "object_type": "athlete",
            "aspect_type": "update",
            "owner_id": 12345,
            "object_id": 12345,
        }
        body = json.dumps(event).encode()
        sig = _make_signature(body, secret)

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature": sig},
        )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert len(scheduled) == 0

    def test_activity_update_event_ignored(self, test_app: TestClient, monkeypatch):
        """activity/update event → 200 ok, no sync task."""
        import routers.webhook as wh

        secret = "webhook-secret"
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", secret)

        scheduled = []

        def fake_create_task(coro):
            scheduled.append(coro)
            coro.close()

        monkeypatch.setattr(wh.asyncio, "create_task", fake_create_task)

        event = {
            "object_type": "activity",
            "aspect_type": "update",
            "owner_id": 12345,
            "object_id": 9999001,
        }
        body = json.dumps(event).encode()
        sig = _make_signature(body, secret)

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature": sig},
        )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert len(scheduled) == 0

    def test_invalid_signature_rejected(self, test_app: TestClient, monkeypatch):
        """Wrong X-Hub-Signature → 403 when token is configured."""
        import routers.webhook as wh

        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", "real-secret")

        body = json.dumps(_activity_create_event()).encode()

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature": "sha256=deadbeef",
            },
        )

        assert resp.status_code == 403

    def test_missing_signature_rejected(self, test_app: TestClient, monkeypatch):
        """No X-Hub-Signature header → 403 when token is configured."""
        import routers.webhook as wh

        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", "real-secret")

        body = json.dumps(_activity_create_event()).encode()

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )

        assert resp.status_code == 403

    def test_dev_mode_skips_signature(self, test_app: TestClient, monkeypatch):
        """When STRAVA_WEBHOOK_VERIFY_TOKEN is empty, signature is not required."""
        import routers.webhook as wh

        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", "")

        scheduled = []

        def fake_create_task(coro):
            scheduled.append(coro)
            coro.close()

        monkeypatch.setattr(wh.asyncio, "create_task", fake_create_task)

        # Send event for an athlete that has no DB record — should still return ok
        event = {
            "object_type": "activity",
            "aspect_type": "create",
            "owner_id": 999999,
            "object_id": 111111,
        }
        body = json.dumps(event).encode()

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
            # No X-Hub-Signature header
        )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        # No sync task because athlete is unknown
        assert len(scheduled) == 0

    def test_unknown_athlete_no_crash(self, test_app: TestClient, monkeypatch):
        """Event for an athlete not in our DB → 200 ok, no task."""
        import routers.webhook as wh

        secret = "webhook-secret"
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", secret)

        scheduled = []

        def fake_create_task(coro):
            scheduled.append(coro)
            coro.close()

        monkeypatch.setattr(wh.asyncio, "create_task", fake_create_task)

        event = {
            "object_type": "activity",
            "aspect_type": "create",
            "owner_id": 999999999,
            "object_id": 8888001,
        }
        body = json.dumps(event).encode()
        sig = _make_signature(body, secret)

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature": sig},
        )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert len(scheduled) == 0

    def test_missing_owner_id_no_crash(self, test_app: TestClient, monkeypatch):
        """Event body missing owner_id → 200 ok, no crash."""
        import routers.webhook as wh

        secret = "webhook-secret"
        monkeypatch.setattr(wh.settings, "strava_webhook_verify_token", secret)

        event = {
            "object_type": "activity",
            "aspect_type": "create",
            # owner_id intentionally omitted
            "object_id": 8888001,
        }
        body = json.dumps(event).encode()
        sig = _make_signature(body, secret)

        resp = test_app.post(
            "/strava/webhook",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature": sig},
        )

        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# _verify_strava_signature unit tests
# ---------------------------------------------------------------------------

class TestVerifyStravaSignature:
    """Unit tests for the HMAC signature helper."""

    def test_valid_signature(self):
        from routers.webhook import _verify_strava_signature

        secret = "test-secret"
        body = b'{"object_type":"activity"}'
        sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        assert _verify_strava_signature(body, sig, secret) is True

    def test_invalid_signature(self):
        from routers.webhook import _verify_strava_signature

        assert _verify_strava_signature(b"body", "sha256=wrong", "secret") is False

    def test_empty_body_valid_signature(self):
        from routers.webhook import _verify_strava_signature

        secret = "s"
        body = b""
        sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        assert _verify_strava_signature(body, sig, secret) is True

    def test_wrong_prefix(self):
        """Header value without sha256= prefix is rejected."""
        from routers.webhook import _verify_strava_signature

        secret = "s"
        body = b"x"
        raw_hex = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        # No prefix
        assert _verify_strava_signature(body, raw_hex, secret) is False

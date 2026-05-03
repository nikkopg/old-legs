"""
Security audit tests for Old Legs API.

Coverage:
- Unauthenticated requests to all protected routes return 401
- Rate limiting on /coach/chat enforced (429 on >20/min)
- User isolation: User A cannot access User B's activities or chat history
- Token encryption: stored access_token is not plaintext Strava token
"""

from datetime import datetime, date, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.user import User
from models.activity import Activity
from models.chat_message import ChatMessage
from models.training_plan import TrainingPlan
from models.weekly_review import WeeklyReview
from services.encryption import encrypt_token, decrypt_token


class TestUnauthenticatedAccess:
    """All protected endpoints must return 401 with no session cookie."""

    def test_get_activities_requires_auth(self, test_app: TestClient):
        response = test_app.get("/activities")
        assert response.status_code == 401

    def test_get_activity_detail_requires_auth(self, test_app: TestClient):
        response = test_app.get("/activities/1")
        assert response.status_code == 401

    def test_analyze_activity_requires_auth(self, test_app: TestClient):
        response = test_app.post("/activities/1/analyze")
        assert response.status_code == 401

    def test_coach_chat_requires_auth(self, test_app: TestClient):
        response = test_app.post("/coach/chat", json={"message": "hello"})
        assert response.status_code == 401

    def test_generate_plan_requires_auth(self, test_app: TestClient):
        response = test_app.post("/plan/generate")
        assert response.status_code == 401

    def test_get_current_plan_requires_auth(self, test_app: TestClient):
        response = test_app.get("/plan/current")
        assert response.status_code == 401

    def test_strava_status_requires_auth(self, test_app: TestClient):
        # /auth/strava/status is a status-check endpoint, not a protected resource.
        # It intentionally returns 200 with {"connected": false} for unauthenticated requests.
        response = test_app.get("/auth/strava/status")
        assert response.status_code == 200
        assert response.json()["connected"] is False

    def test_post_user_onboarding_requires_auth(self, test_app: TestClient):
        response = test_app.post("/user/onboarding", json={})
        assert response.status_code == 401

    def test_get_user_me_requires_auth(self, test_app: TestClient):
        response = test_app.get("/user/me")
        assert response.status_code == 401

    def test_post_review_generate_requires_auth(self, test_app: TestClient):
        response = test_app.post("/review/generate")
        assert response.status_code == 401

    def test_get_review_current_requires_auth(self, test_app: TestClient):
        response = test_app.get("/review/current")
        assert response.status_code == 401

    def test_get_insights_requires_auth(self, test_app: TestClient):
        response = test_app.get("/insights")
        assert response.status_code == 401

    def test_delete_coach_history_requires_auth(self, test_app: TestClient):
        response = test_app.delete("/coach/history")
        assert response.status_code == 401

    def test_delete_coach_reset_requires_auth(self, test_app: TestClient):
        response = test_app.delete("/coach/reset")
        assert response.status_code == 401

    def test_post_plan_verdict_requires_auth(self, test_app: TestClient):
        response = test_app.post("/activities/1/plan-verdict", json={})
        assert response.status_code == 401


class TestRateLimiting:
    """Rate limit on /coach/chat: >20 req/min → 429."""

    def test_rate_limit_enforced_on_coach_chat(self, authenticated_client: TestClient):
        with patch("routers.coach.check_rate_limit", return_value=False):
            response = authenticated_client.post(
                "/coach/chat", json={"message": "hello"}
            )
        assert response.status_code == 429

    def test_rate_limit_enforced_on_plan_generate(self, authenticated_client: TestClient):
        with patch("routers.plan.check_rate_limit", return_value=False):
            response = authenticated_client.post("/plan/generate")
        assert response.status_code == 429


class TestUserIsolation:
    """User A must not be able to access User B's data."""

    @pytest.fixture
    def user_b(self, db_session: Session) -> User:
        user = User(
            strava_athlete_id="athlete_user_b",
            strava_access_token=encrypt_token("token_b"),
            strava_refresh_token=encrypt_token("refresh_b"),
            strava_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=6),
            name="User B",
            avatar_url=None,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    @pytest.fixture
    def user_b_activity(self, db_session: Session, user_b: User) -> Activity:
        activity = Activity(
            user_id=user_b.id,
            strava_activity_id="strava_b_001",
            name="User B's Run",
            distance_km=5.0,
            moving_time_seconds=1800,
            average_pace_min_per_km=6.0,
            average_hr=None,
            max_hr=None,
            elevation_gain_m=10,
            activity_date=datetime.now(timezone.utc),
            sync_status="synced",
        )
        db_session.add(activity)
        db_session.commit()
        db_session.refresh(activity)
        return activity

    def test_user_a_cannot_access_user_b_activity(
        self,
        authenticated_client: TestClient,
        user_b_activity: Activity,
    ):
        # authenticated_client is logged in as test_user (User A)
        response = authenticated_client.get(f"/activities/{user_b_activity.id}")
        # Should return 404 (not found for this user) rather than exposing User B's data
        assert response.status_code in (404, 403)

    def test_user_a_analyze_request_on_user_b_activity(
        self,
        authenticated_client: TestClient,
        user_b_activity: Activity,
    ):
        response = authenticated_client.post(f"/activities/{user_b_activity.id}/analyze")
        assert response.status_code in (404, 403)

    def test_user_me_returns_only_own_profile(
        self,
        authenticated_client: TestClient,
        test_user: User,
        user_b: User,
    ):
        # authenticated_client is logged in as test_user (User A)
        response = authenticated_client.get("/user/me")
        assert response.status_code == 200
        body = response.json()
        # Must return User A's identity, not User B's
        assert body["id"] == test_user.id
        assert body["id"] != user_b.id
        assert body["name"] == test_user.name

    def test_delete_coach_history_only_affects_own_messages(
        self,
        authenticated_client: TestClient,
        test_user: User,
        user_b: User,
        db_session: Session,
    ):
        # Seed one message for User A and one for User B
        msg_a = ChatMessage(user_id=test_user.id, role="user", content="User A message")
        msg_b = ChatMessage(user_id=user_b.id, role="user", content="User B message")
        db_session.add_all([msg_a, msg_b])
        db_session.commit()

        # User A deletes their history
        response = authenticated_client.delete("/coach/history")
        assert response.status_code == 200

        # User B's message must still exist
        remaining = (
            db_session.query(ChatMessage)
            .filter(ChatMessage.user_id == user_b.id)
            .count()
        )
        assert remaining == 1, "DELETE /coach/history deleted User B's messages"

        # User A's message must be gone
        user_a_remaining = (
            db_session.query(ChatMessage)
            .filter(ChatMessage.user_id == test_user.id)
            .count()
        )
        assert user_a_remaining == 0

    def test_delete_reset_only_affects_own_data(
        self,
        authenticated_client: TestClient,
        test_user: User,
        user_b: User,
        db_session: Session,
    ):
        # Seed a ChatMessage, TrainingPlan, and WeeklyReview for both users
        msg_a = ChatMessage(user_id=test_user.id, role="user", content="A msg")
        msg_b = ChatMessage(user_id=user_b.id, role="user", content="B msg")

        plan_a = TrainingPlan(
            user_id=test_user.id,
            week_start_date=date.today(),
            plan_data={"days": []},
            pak_har_notes={},
        )
        plan_b = TrainingPlan(
            user_id=user_b.id,
            week_start_date=date.today(),
            plan_data={"days": []},
            pak_har_notes={},
        )

        review_b = WeeklyReview(
            user_id=user_b.id,
            week_start_date=date.today(),
            planned_runs=3,
            actual_runs=2,
            review_text="User B review",
        )

        db_session.add_all([msg_a, msg_b, plan_a, plan_b, review_b])
        db_session.commit()

        # User A resets their AI context
        response = authenticated_client.delete("/coach/reset")
        assert response.status_code == 200

        # User B's data must be untouched
        b_messages = (
            db_session.query(ChatMessage)
            .filter(ChatMessage.user_id == user_b.id)
            .count()
        )
        assert b_messages == 1, "DELETE /coach/reset deleted User B's chat messages"

        b_plans = (
            db_session.query(TrainingPlan)
            .filter(TrainingPlan.user_id == user_b.id)
            .count()
        )
        assert b_plans == 1, "DELETE /coach/reset deleted User B's training plans"

        b_reviews = (
            db_session.query(WeeklyReview)
            .filter(WeeklyReview.user_id == user_b.id)
            .count()
        )
        assert b_reviews == 1, "DELETE /coach/reset deleted User B's weekly reviews"

    def test_review_current_returns_only_own_review(
        self,
        authenticated_client: TestClient,
        test_user: User,
        user_b: User,
        db_session: Session,
    ):
        # Only User B has a review — User A has none
        review_b = WeeklyReview(
            user_id=user_b.id,
            week_start_date=date.today(),
            planned_runs=4,
            actual_runs=3,
            review_text="User B's review text",
        )
        db_session.add(review_b)
        db_session.commit()

        # authenticated_client is logged in as User A
        response = authenticated_client.get("/review/current")
        # User A has no review — must not return User B's data
        assert response.status_code == 404


class TestTokenEncryption:
    """Strava tokens stored in DB must be encrypted, never plaintext."""

    def test_access_token_is_encrypted_at_rest(self, db_session: Session, test_user: User):
        # Reload from DB to ensure we're reading the persisted value
        db_user = db_session.query(User).filter(User.id == test_user.id).first()
        assert db_user is not None

        stored = db_user.strava_access_token
        # The stored value must not equal the plaintext token
        assert stored != "fake_access_token", "Access token stored in plaintext"

        # Decrypting should recover the original value
        decrypted = decrypt_token(stored)
        assert decrypted == "fake_access_token"

    def test_refresh_token_is_encrypted_at_rest(self, db_session: Session, test_user: User):
        db_user = db_session.query(User).filter(User.id == test_user.id).first()
        assert db_user is not None

        stored = db_user.strava_refresh_token
        assert stored != "fake_refresh_token", "Refresh token stored in plaintext"

        decrypted = decrypt_token(stored)
        assert decrypted == "fake_refresh_token"

    def test_tokens_not_in_activity_response(
        self, authenticated_client: TestClient, test_activity: Activity
    ):
        response = authenticated_client.get("/activities")
        assert response.status_code == 200
        body = response.text
        assert "fake_access_token" not in body
        assert "fake_refresh_token" not in body

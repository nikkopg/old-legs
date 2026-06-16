"""
Tests for plan archive endpoints — GET /plan/list, GET /plan/{id}, DELETE /plan/{id}.

Coverage:
- GET /plan/list: empty list when user has no plans
- GET /plan/list: returns plans ordered newest-first by week_start_date
- GET /plan/list: 401 when unauthenticated
- GET /plan/{id}: 404 when plan belongs to a different user (ownership check)
- GET /plan/{id}: 404 for non-existent id
- GET /plan/{id}: 401 when unauthenticated
- DELETE /plan/{id}: 204 on success
- DELETE /plan/{id}: 404 on second delete (plan already gone)
- DELETE /plan/{id}: 404 when plan belongs to a different user
- DELETE /plan/{id}: 401 when unauthenticated

Design decisions:
- Real SQLite in-memory DB (not mocked) — per SQA standards
- A second user is created to test cross-user ownership isolation
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.training_plan import TrainingPlan
from models.user import User
from services.encryption import encrypt_token


# ---------------------------------------------------------------------------
# Sample plan data (minimal but valid)
# ---------------------------------------------------------------------------

_PLAN_DATA = {
    "Monday": {"day": "Monday", "type": "easy", "description": "30 min easy.", "duration_minutes": 30},
    "Tuesday": {"day": "Tuesday", "type": "rest", "description": "Rest.", "duration_minutes": 0},
    "Wednesday": {"day": "Wednesday", "type": "tempo", "description": "25 min tempo.", "duration_minutes": 25},
    "Thursday": {"day": "Thursday", "type": "rest", "description": "Rest.", "duration_minutes": 0},
    "Friday": {"day": "Friday", "type": "easy", "description": "30 min easy.", "duration_minutes": 30},
    "Saturday": {"day": "Saturday", "type": "long", "description": "50 min long.", "duration_minutes": 50},
    "Sunday": {"day": "Sunday", "type": "rest", "description": "Rest.", "duration_minutes": 0},
}

_NOTES = {
    "Monday": "Don't start fast.",
    "Tuesday": None,
    "Wednesday": "Only run that matters this week.",
    "Thursday": None,
    "Friday": "Shake-out.",
    "Saturday": "No splits. Run on feel.",
    "Sunday": None,
}


# ---------------------------------------------------------------------------
# Fixture: a second user not authenticated on any client
# ---------------------------------------------------------------------------

@pytest.fixture()
def other_user(db_session: Session) -> User:
    """A different user whose plans must be inaccessible to test_user."""
    user = User(
        strava_athlete_id="other_athlete_999",
        strava_access_token=encrypt_token("other_access"),
        strava_refresh_token=encrypt_token("other_refresh"),
        strava_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=6),
        name="Other Runner",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Fixture: a plan belonging to test_user
# ---------------------------------------------------------------------------

@pytest.fixture()
def owned_plan(db_session: Session, test_user: User) -> TrainingPlan:
    plan = TrainingPlan(
        user_id=test_user.id,
        week_start_date=date(2026, 5, 11),
        plan_data=_PLAN_DATA,
        pak_har_notes=_NOTES,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# Fixture: a plan belonging to other_user
# ---------------------------------------------------------------------------

@pytest.fixture()
def other_plan(db_session: Session, other_user: User) -> TrainingPlan:
    plan = TrainingPlan(
        user_id=other_user.id,
        week_start_date=date(2026, 5, 11),
        plan_data=_PLAN_DATA,
        pak_har_notes=_NOTES,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# TestPlanArchiveEndpoints
# ---------------------------------------------------------------------------

class TestPlanArchiveEndpoints:

    # ------------------------------------------------------------------
    # GET /plan/list
    # ------------------------------------------------------------------

    def test_list_returns_empty_when_no_plans(self, authenticated_client: TestClient):
        """User with no plans → 200 with empty list."""
        response = authenticated_client.get("/plan/list")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_returns_plans_newest_first(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ):
        """Plans returned ordered by week_start_date descending (newest first)."""
        older = TrainingPlan(
            user_id=test_user.id,
            week_start_date=date(2026, 4, 27),
            plan_data=_PLAN_DATA,
            pak_har_notes=_NOTES,
            is_active=False,
        )
        newer = TrainingPlan(
            user_id=test_user.id,
            week_start_date=date(2026, 5, 11),
            plan_data=_PLAN_DATA,
            pak_har_notes=_NOTES,
            is_active=True,
        )
        db_session.add_all([older, newer])
        db_session.commit()

        response = authenticated_client.get("/plan/list")
        assert response.status_code == 200

        body = response.json()
        assert len(body) == 2
        # First entry must be the newer plan
        assert body[0]["week_start_date"] == "2026-05-11"
        assert body[1]["week_start_date"] == "2026-04-27"

    def test_list_unauthenticated_returns_401(self, test_app: TestClient):
        """No session cookie → 401."""
        response = test_app.get("/plan/list")
        assert response.status_code == 401

    def test_list_does_not_return_other_users_plans(
        self,
        authenticated_client: TestClient,
        other_plan: TrainingPlan,
    ):
        """Plans belonging to other users must not appear in the list."""
        response = authenticated_client.get("/plan/list")
        assert response.status_code == 200
        # test_user has no plans; other_user's plan must not leak through
        assert response.json() == []

    # ------------------------------------------------------------------
    # GET /plan/{id}
    # ------------------------------------------------------------------

    def test_get_plan_happy_path(
        self,
        authenticated_client: TestClient,
        owned_plan: TrainingPlan,
    ):
        """Authenticated user fetching their own plan → 200 with plan data."""
        response = authenticated_client.get(f"/plan/{owned_plan.id}")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == owned_plan.id
        assert body["week_start_date"] == "2026-05-11"
        assert "plan_data" in body
        assert "pak_har_notes" in body

    def test_get_plan_other_user_returns_404(
        self,
        authenticated_client: TestClient,
        other_plan: TrainingPlan,
    ):
        """Attempting to fetch another user's plan → 404 (ownership check)."""
        response = authenticated_client.get(f"/plan/{other_plan.id}")
        assert response.status_code == 404

    def test_get_plan_nonexistent_returns_404(self, authenticated_client: TestClient):
        """Non-existent plan_id → 404."""
        response = authenticated_client.get("/plan/99999")
        assert response.status_code == 404

    def test_get_plan_unauthenticated_returns_401(
        self,
        test_app: TestClient,
        owned_plan: TrainingPlan,
    ):
        """No session cookie → 401."""
        response = test_app.get(f"/plan/{owned_plan.id}")
        assert response.status_code == 401

    # ------------------------------------------------------------------
    # DELETE /plan/{id}
    # ------------------------------------------------------------------

    def test_delete_plan_returns_204(
        self,
        authenticated_client: TestClient,
        owned_plan: TrainingPlan,
    ):
        """Deleting an owned plan → 204 No Content."""
        response = authenticated_client.delete(f"/plan/{owned_plan.id}")
        assert response.status_code == 204
        # Response body must be empty for 204
        assert response.content == b""

    def test_delete_plan_second_call_returns_404(
        self,
        authenticated_client: TestClient,
        owned_plan: TrainingPlan,
    ):
        """Second DELETE on the same plan → 404 (row already gone)."""
        authenticated_client.delete(f"/plan/{owned_plan.id}")
        response = authenticated_client.delete(f"/plan/{owned_plan.id}")
        assert response.status_code == 404

    def test_delete_plan_actually_removes_row(
        self,
        authenticated_client: TestClient,
        owned_plan: TrainingPlan,
    ):
        """After DELETE, GET on the same id must return 404."""
        authenticated_client.delete(f"/plan/{owned_plan.id}")
        response = authenticated_client.get(f"/plan/{owned_plan.id}")
        assert response.status_code == 404

    def test_delete_plan_other_user_returns_404(
        self,
        authenticated_client: TestClient,
        other_plan: TrainingPlan,
    ):
        """Attempting to delete another user's plan → 404."""
        response = authenticated_client.delete(f"/plan/{other_plan.id}")
        assert response.status_code == 404

    def test_delete_plan_unauthenticated_returns_401(
        self,
        test_app: TestClient,
        owned_plan: TrainingPlan,
    ):
        """No session cookie → 401."""
        response = test_app.delete(f"/plan/{owned_plan.id}")
        assert response.status_code == 401

    def test_delete_does_not_affect_other_users_plans(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        owned_plan: TrainingPlan,
        other_plan: TrainingPlan,
        other_user: User,
    ):
        """Deleting test_user's plan must not remove other_user's plan from DB."""
        authenticated_client.delete(f"/plan/{owned_plan.id}")

        surviving = db_session.get(TrainingPlan, other_plan.id)
        assert surviving is not None

"""
Tests for POST /plan/generate and GET /plan/current.

Coverage:
- POST happy path: user with activities → 200 with plan structure
- POST no auth → 401
- POST Ollama offline → 503
- POST Ollama timeout → 504
- POST rate limit → 429
- GET no plan → 404
- GET happy path → 200 with existing plan
"""

import json
from datetime import date
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.training_plan import TrainingPlan


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


class TestGeneratePlan:
    def test_unauthenticated_returns_401(self, test_app: TestClient):
        response = test_app.post("/plan/generate")
        assert response.status_code == 401

    def test_authenticated_generates_plan(
        self, authenticated_client: TestClient, test_activity
    ):
        with patch("routers.plan.generate_plan_with_ollama") as mock_gen:
            from models.training_plan import TrainingPlan as PlanModel
            from datetime import date

            fake_plan = PlanModel(
                id=1,
                user_id=1,
                week_start_date=date.today(),
                plan_data=SAMPLE_PLAN_DATA,
                pak_har_notes=SAMPLE_NOTES,
                is_active=True,
            )

            async def fake_generate(*args, **kwargs):
                return fake_plan

            mock_gen.side_effect = fake_generate

            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 200
        body = response.json()
        assert "plan_data" in body
        assert "pak_har_notes" in body

    def test_ollama_offline_returns_503(self, authenticated_client: TestClient):
        with patch("routers.plan.generate_plan_with_ollama") as mock_gen:
            async def raise_runtime(*args, **kwargs):
                raise RuntimeError("Pak Har is unavailable right now. Make sure Ollama is running.")

            mock_gen.side_effect = raise_runtime

            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 503

    def test_ollama_timeout_returns_504(self, authenticated_client: TestClient):
        with patch("routers.plan.generate_plan_with_ollama") as mock_gen:
            async def raise_timeout(*args, **kwargs):
                raise TimeoutError("Pak Har took too long to respond.")

            mock_gen.side_effect = raise_timeout

            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 504

    def test_rate_limit_returns_429(self, authenticated_client: TestClient):
        with patch("routers.plan.check_rate_limit", return_value=False):
            response = authenticated_client.post("/plan/generate")

        assert response.status_code == 429


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

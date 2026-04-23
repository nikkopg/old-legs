"""
Tests for POST /review/generate and GET /review/current (TASK-105).

Coverage:
- POST happy path: user has active plan + activities this week → 200 WeeklyReviewRead
- POST no active plan → 404
- POST unauthenticated → 401
- POST Ollama offline → 503
- POST Ollama timeout → 504
- POST rate limit >20 req/min → 429
- POST week with 0 runs (active plan exists) → 200, actual_runs = 0
- POST planned_runs counts non-rest days correctly
- GET happy path: review exists → 200 WeeklyReviewRead
- GET no reviews for user → 404
- GET unauthenticated → 401
- GET multiple reviews → returns most recent (created_at DESC)
"""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.activity import Activity
from models.training_plan import TrainingPlan
from models.weekly_review import WeeklyReview


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
    # Place the activity on the Monday of the current week
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


def _fake_generate_review(review_text: str = FAKE_REVIEW_TEXT, planned: int = 4, actual: int = 3):
    """Return an async callable that mimics generate_weekly_review success."""
    async def _fake(user, db):
        week_start = date.today() - timedelta(days=date.today().weekday())
        review = WeeklyReview(
            user_id=user.id,
            week_start_date=week_start,
            planned_runs=planned,
            actual_runs=actual,
            review_text=review_text,
        )
        review.id = 1
        review.created_at = datetime.now(timezone.utc)
        db.add(review)
        db.commit()
        db.refresh(review)
        return review
    return _fake


# ---------------------------------------------------------------------------
# POST /review/generate
# ---------------------------------------------------------------------------

class TestGenerateReview:

    def test_unauthenticated_returns_401(self, test_app: TestClient) -> None:
        response = test_app.post("/review/generate")
        assert response.status_code == 401

    def test_no_active_plan_returns_404(self, authenticated_client: TestClient) -> None:
        """No active training plan → service raises ValueError → 404."""
        with patch("routers.review.generate_weekly_review") as mock_gen:
            async def raise_value_error(user, db):
                raise ValueError("No active training plan found.")

            mock_gen.side_effect = raise_value_error
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 404
        assert "No active training plan" in response.json()["detail"]

    def test_happy_path_returns_weekly_review_read(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ) -> None:
        """User has active plan + activities this week → 200 with WeeklyReviewRead."""
        with patch("routers.review.generate_weekly_review", side_effect=_fake_generate_review()):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        body = response.json()
        assert "id" in body
        assert "week_start_date" in body
        assert "planned_runs" in body
        assert "actual_runs" in body
        assert "review_text" in body
        assert "created_at" in body
        assert body["planned_runs"] == 4
        assert body["actual_runs"] == 3
        assert body["review_text"] == FAKE_REVIEW_TEXT

    def test_ollama_offline_returns_503(self, authenticated_client: TestClient) -> None:
        with patch("routers.review.generate_weekly_review") as mock_gen:
            async def raise_runtime(user, db):
                raise RuntimeError("Pak Har is unavailable right now. Make sure Ollama is running.")

            mock_gen.side_effect = raise_runtime
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 503

    def test_ollama_timeout_returns_504(self, authenticated_client: TestClient) -> None:
        with patch("routers.review.generate_weekly_review") as mock_gen:
            async def raise_timeout(user, db):
                raise TimeoutError("Pak Har took too long to respond.")

            mock_gen.side_effect = raise_timeout
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 504

    def test_rate_limit_returns_429(self, authenticated_client: TestClient) -> None:
        with patch("routers.review.check_rate_limit", return_value=False):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 429
        assert "Too many requests" in response.json()["detail"]

    def test_zero_actual_runs_succeeds(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user,
    ) -> None:
        """No activities this week but active plan exists → 200, actual_runs = 0."""
        with patch("routers.review.generate_weekly_review", side_effect=_fake_generate_review(planned=4, actual=0)):
            response = authenticated_client.post("/review/generate")

        assert response.status_code == 200
        body = response.json()
        assert body["actual_runs"] == 0

    def test_planned_runs_counts_non_rest_days(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        active_plan: TrainingPlan,
        test_user,
    ) -> None:
        """
        PLAN_DATA_4_RUNS has 4 non-rest days out of 7.
        Verify that generate_weekly_review (called directly via service) counts 4.
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

async def _async_return(value):
    return value


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
        # Should return the most recent review
        assert body["review_text"] == "This week — you showed up all four days."
        assert body["planned_runs"] == 4
        assert body["actual_runs"] == 4

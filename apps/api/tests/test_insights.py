"""
Tests for GET /insights (TASK-106).

Coverage:
- Happy path: user has ≥ 2 weeks of activity → 200 InsightsRead with all fields
- Fewer than 2 distinct ISO weeks → 404 "Not enough data for insights. Keep running."
- Exactly 2 weeks → 200 (boundary)
- Unauthenticated → 401
- Ollama offline → 503
- Ollama timeout → 504
- All activities in same ISO week → 404
- Activities with distance_km = 0 → excluded; if all zero → 404
- pace_trend = "improving": second half faster by > 3 s/km
- pace_trend = "declining": second half slower by > 3 s/km
- pace_trend = "stable": difference ≤ 3 s/km
- consistency_pct: correct calculation (3 weeks with runs out of 6 → 50%)
- user.biggest_struggle = None → endpoint succeeds
- user.weekly_km_target = 0 → endpoint succeeds
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
import respx
from httpx import Response as HttpxResponse
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from types import SimpleNamespace
from models.activity import Activity
from models.user import User
from services.insights import compute_insights_stats, _iso_week_key


OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
FAKE_COMMENTARY = (
    "Your average pace dropped 8 seconds per km in the second half of the window. "
    "You ran consistently, but you are getting slower — not fitter. "
    "Add one tempo session per week for the next four weeks."
)


# ---------------------------------------------------------------------------
# Helper factory — build Activity objects for different weeks
# ---------------------------------------------------------------------------

def _make_activity(
    db_session: Session,
    user: User,
    strava_id: str,
    activity_date: datetime,
    distance_km: float = 8.0,
    moving_time_seconds: int = 2880,
    average_pace_min_per_km: float = 6.0,
    sync_status: str = "synced",
) -> Activity:
    activity = Activity(
        user_id=user.id,
        strava_activity_id=strava_id,
        name="Run",
        distance_km=distance_km,
        moving_time_seconds=moving_time_seconds,
        average_pace_min_per_km=average_pace_min_per_km,
        average_hr=None,
        max_hr=None,
        elevation_gain_m=0,
        activity_date=activity_date,
        sync_status=sync_status,
    )
    db_session.add(activity)
    db_session.flush()
    return activity


def _mock_ollama_success(commentary: str = FAKE_COMMENTARY):
    """Context manager that mocks the Ollama /api/chat endpoint."""
    return respx.mock(assert_all_called=False)


def _register_ollama_mock(mock_router, commentary: str = FAKE_COMMENTARY):
    mock_router.post(OLLAMA_CHAT_URL).mock(
        return_value=HttpxResponse(
            200,
            json={"message": {"content": commentary}},
        )
    )


def _mock_httpx_client(commentary: str = FAKE_COMMENTARY):
    """
    Return a patch context manager that replaces httpx.AsyncClient in
    services.insights with an AsyncMock that simulates a successful
    Ollama response.

    Use this instead of respx.mock for tests that drive the full service
    stack via FastAPI's TestClient (sync). respx.mock intercepts httpx at
    the transport layer but does not reliably intercept clients created
    inside async code driven by TestClient's internal event loop.
    """
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock(return_value=None)
    mock_response.json = MagicMock(return_value={"message": {"content": commentary}})

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    mock_async_client_cls = MagicMock()
    # Support `async with httpx.AsyncClient(...) as client:`
    mock_async_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    mock_async_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

    return patch("services.insights.httpx.AsyncClient", mock_async_client_cls)


# ---------------------------------------------------------------------------
# GET /insights — auth
# ---------------------------------------------------------------------------

def test_insights_unauthenticated_returns_401(test_app: TestClient) -> None:
    response = test_app.get("/insights")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /insights — insufficient data
# ---------------------------------------------------------------------------

def test_insights_no_activities_returns_404(authenticated_client: TestClient) -> None:
    """No activities at all → 404 with 'Not enough data' detail."""
    response = authenticated_client.get("/insights")
    assert response.status_code == 404
    assert "Not enough data for insights" in response.json()["detail"]


def test_insights_single_week_returns_404(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
) -> None:
    """All activities in same ISO week → only 1 distinct week → 404."""
    # Create 3 activities all in the same ISO week (this week)
    base = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    monday_offset = base.weekday()
    week_monday = base - timedelta(days=monday_offset)

    for i in range(3):
        _make_activity(
            db_session, test_user,
            strava_id=f"same_week_{i}",
            activity_date=week_monday + timedelta(days=i),
        )
    db_session.commit()

    response = authenticated_client.get("/insights")
    assert response.status_code == 404
    assert "Not enough data for insights" in response.json()["detail"]


def test_insights_all_distance_zero_returns_404(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
) -> None:
    """Activities with distance_km = 0 are excluded; if all zero → 404."""
    base = datetime.now(timezone.utc) - timedelta(days=14)
    for i in range(4):
        _make_activity(
            db_session, test_user,
            strava_id=f"zero_dist_{i}",
            activity_date=base + timedelta(days=i * 3),
            distance_km=0,
        )
    db_session.commit()

    response = authenticated_client.get("/insights")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /insights — happy path (service mocked)
# ---------------------------------------------------------------------------

class TestInsightsHappyPath:

    def test_two_weeks_of_data_returns_200(
        self,
        authenticated_client: TestClient,
    ) -> None:
        """Exactly 2 weeks of activity → 200 InsightsRead."""
        with patch("routers.insights.generate_insights") as mock_gen:
            from schemas.insights import InsightsRead

            async def fake_insights(user, db) -> InsightsRead:
                return InsightsRead(
                    weeks_analyzed=2,
                    avg_weekly_km=20.0,
                    avg_pace_min_per_km=5.80,
                    pace_trend="stable",
                    consistency_pct=33,
                    pak_har_commentary=FAKE_COMMENTARY,
                    generated_at=datetime.now(timezone.utc),
                )

            mock_gen.side_effect = fake_insights
            response = authenticated_client.get("/insights")

        assert response.status_code == 200
        body = response.json()
        assert body["weeks_analyzed"] == 2
        assert body["avg_weekly_km"] == 20.0
        assert body["avg_pace_min_per_km"] == 5.80
        assert body["pace_trend"] == "stable"
        assert body["consistency_pct"] == 33
        assert body["pak_har_commentary"] == FAKE_COMMENTARY
        assert "generated_at" in body

    def test_all_fields_present_in_response(
        self, authenticated_client: TestClient
    ) -> None:
        """Verify all InsightsRead fields are included in the response."""
        with patch("routers.insights.generate_insights") as mock_gen:
            from schemas.insights import InsightsRead

            async def fake_insights(user, db) -> InsightsRead:
                return InsightsRead(
                    weeks_analyzed=6,
                    avg_weekly_km=35.2,
                    avg_pace_min_per_km=5.45,
                    pace_trend="improving",
                    consistency_pct=100,
                    pak_har_commentary="Six weeks. Every week. Now add intensity.",
                    generated_at=datetime.now(timezone.utc),
                )

            mock_gen.side_effect = fake_insights
            response = authenticated_client.get("/insights")

        assert response.status_code == 200
        body = response.json()
        required_fields = {
            "weeks_analyzed", "avg_weekly_km", "avg_pace_min_per_km",
            "pace_trend", "consistency_pct", "pak_har_commentary", "generated_at",
        }
        for field in required_fields:
            assert field in body, f"Missing field: {field}"


# ---------------------------------------------------------------------------
# GET /insights — Ollama errors
# ---------------------------------------------------------------------------

def test_insights_ollama_offline_returns_503(
    authenticated_client: TestClient,
) -> None:
    with patch("routers.insights.generate_insights") as mock_gen:
        async def raise_runtime(user, db):
            raise RuntimeError("Pak Har is unavailable right now. Make sure Ollama is running.")

        mock_gen.side_effect = raise_runtime
        response = authenticated_client.get("/insights")

    assert response.status_code == 503


def test_insights_ollama_timeout_returns_504(
    authenticated_client: TestClient,
) -> None:
    with patch("routers.insights.generate_insights") as mock_gen:
        async def raise_timeout(user, db):
            raise TimeoutError("Pak Har took too long to respond.")

        mock_gen.side_effect = raise_timeout
        response = authenticated_client.get("/insights")

    assert response.status_code == 504


# ---------------------------------------------------------------------------
# GET /insights — edge cases with real DB + mocked Ollama
# ---------------------------------------------------------------------------

class TestInsightsWithRealDB:

    def _seed_activities_across_weeks(
        self,
        db_session: Session,
        user: User,
        num_weeks: int,
        activities_per_week: int = 2,
        pace_min_per_km: float = 6.0,
        moving_time_seconds: int = 2880,
        distance_km: float = 8.0,
    ) -> list[Activity]:
        """Seed activities across distinct ISO weeks within the 42-day window."""
        base = datetime.now(timezone.utc) - timedelta(days=7)
        acts: list[Activity] = []
        for week_idx in range(num_weeks):
            for day_offset in range(activities_per_week):
                dt = base - timedelta(weeks=week_idx, days=day_offset)
                act = _make_activity(
                    db_session, user,
                    strava_id=f"rdb_{week_idx}_{day_offset}",
                    activity_date=dt,
                    distance_km=distance_km,
                    moving_time_seconds=moving_time_seconds,
                    average_pace_min_per_km=pace_min_per_km,
                )
                acts.append(act)
        db_session.commit()
        return acts

    def test_exactly_two_weeks_succeeds(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        """Boundary: exactly 2 distinct ISO weeks → 200."""
        self._seed_activities_across_weeks(db_session, test_user, num_weeks=2)

        with _mock_httpx_client():
            response = authenticated_client.get("/insights")

        assert response.status_code == 200
        assert response.json()["weeks_analyzed"] == 2

    def test_user_biggest_struggle_none_succeeds(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        """user.biggest_struggle = None → endpoint does not crash."""
        test_user.biggest_struggle = None
        db_session.commit()

        self._seed_activities_across_weeks(db_session, test_user, num_weeks=2)

        with _mock_httpx_client():
            response = authenticated_client.get("/insights")

        assert response.status_code == 200

    def test_user_weekly_km_target_zero_succeeds(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        """user.weekly_km_target = 0 → endpoint does not crash."""
        test_user.weekly_km_target = 0.0
        db_session.commit()

        self._seed_activities_across_weeks(db_session, test_user, num_weeks=2)

        with _mock_httpx_client():
            response = authenticated_client.get("/insights")

        assert response.status_code == 200

    def test_distance_zero_activities_excluded_from_stats(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
    ) -> None:
        """Activities with distance_km = 0 are excluded; valid activities counted."""
        # 2 weeks of zero-distance (excluded) + 2 weeks of valid activities
        base = datetime.now(timezone.utc) - timedelta(days=7)
        for i in range(2):
            _make_activity(
                db_session, test_user,
                strava_id=f"zero_{i}",
                activity_date=base - timedelta(weeks=i),
                distance_km=0,
            )
        # Valid activities in 2 different weeks
        _make_activity(
            db_session, test_user,
            strava_id="valid_w1",
            activity_date=base - timedelta(weeks=2),
            distance_km=10.0,
        )
        _make_activity(
            db_session, test_user,
            strava_id="valid_w2",
            activity_date=base - timedelta(weeks=3),
            distance_km=10.0,
        )
        db_session.commit()

        with _mock_httpx_client():
            response = authenticated_client.get("/insights")

        # The zero-distance activities are excluded by the DB query (distance_km > 0)
        # But we have 2 valid weeks, so it should succeed
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Unit tests: compute_insights_stats — pace trend and consistency
# ---------------------------------------------------------------------------

class TestComputeInsightsStats:
    """
    Direct unit tests for compute_insights_stats — exercises pace_trend and
    consistency_pct without any HTTP calls.
    """

    def _make_activity_obj(
        self,
        week_offset: int,
        distance_km: float,
        moving_time_seconds: int,
        day_offset: int = 0,
    ) -> SimpleNamespace:
        """Create a lightweight activity namespace for unit testing pure stat logic."""
        base = datetime.now(timezone.utc) - timedelta(days=7)
        dt = base - timedelta(weeks=week_offset, days=day_offset)
        return SimpleNamespace(
            activity_date=dt,
            distance_km=distance_km,
            moving_time_seconds=moving_time_seconds,
            average_pace_min_per_km=(moving_time_seconds / distance_km) / 60,
            sync_status="synced",
        )

    def test_pace_trend_improving(self) -> None:
        """
        Second half faster by > 3 s/km → "improving".

        First 2 activities at 7 min/km (420 s/km).
        Last 2 activities at 6 min/km (360 s/km).
        Diff: 360 - 420 = -60 s/km → well beyond the -3 threshold → improving.
        """
        # Older (first half): slow pace — 7 min/km
        acts = [
            self._make_activity_obj(week_offset=3, distance_km=10.0, moving_time_seconds=4200),
            self._make_activity_obj(week_offset=2, distance_km=10.0, moving_time_seconds=4200),
            # Newer (second half): faster — 6 min/km
            self._make_activity_obj(week_offset=1, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=0, distance_km=10.0, moving_time_seconds=3600),
        ]
        _, _, _, pace_trend, _ = compute_insights_stats(acts)
        assert pace_trend == "improving"

    def test_pace_trend_declining(self) -> None:
        """
        Second half slower by > 3 s/km → "declining".

        First 2 activities at 6 min/km (360 s/km).
        Last 2 activities at 7 min/km (420 s/km).
        Diff: 420 - 360 = +60 s/km → beyond +3 threshold → declining.
        """
        acts = [
            self._make_activity_obj(week_offset=3, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=2, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=1, distance_km=10.0, moving_time_seconds=4200),
            self._make_activity_obj(week_offset=0, distance_km=10.0, moving_time_seconds=4200),
        ]
        _, _, _, pace_trend, _ = compute_insights_stats(acts)
        assert pace_trend == "declining"

    def test_pace_trend_stable(self) -> None:
        """
        Difference ≤ 3 s/km → "stable".

        All activities at exactly 6 min/km (360 s/km). Diff = 0 → stable.
        """
        acts = [
            self._make_activity_obj(week_offset=3, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=2, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=1, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=0, distance_km=10.0, moving_time_seconds=3600),
        ]
        _, _, _, pace_trend, _ = compute_insights_stats(acts)
        assert pace_trend == "stable"

    def test_pace_trend_stable_within_threshold(self) -> None:
        """
        Difference of exactly 1 s/km → "stable" (below 3 s/km threshold).

        First half: 360 s/km. Second half: 361 s/km. Diff = 1 s → stable.
        """
        # 10 km in 3600s = 360 s/km
        # 10 km in 3610s = 361 s/km — difference = 1 s/km
        acts = [
            self._make_activity_obj(week_offset=3, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=2, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=1, distance_km=10.0, moving_time_seconds=3610),
            self._make_activity_obj(week_offset=0, distance_km=10.0, moving_time_seconds=3610),
        ]
        _, _, _, pace_trend, _ = compute_insights_stats(acts)
        assert pace_trend == "stable"

    def test_consistency_pct_three_of_six_weeks(self) -> None:
        """
        3 weeks with runs out of 6 → consistency_pct = 50.

        Activities in weeks 0, 1, 2 — the 3 most recent. Weeks 3, 4, 5 absent.
        """
        acts = []
        for week_offset in range(3):
            acts.append(
                self._make_activity_obj(week_offset=week_offset, distance_km=8.0, moving_time_seconds=2880)
            )
        _, _, _, _, consistency_pct = compute_insights_stats(acts)
        assert consistency_pct == 50

    def test_consistency_pct_six_of_six_weeks(self) -> None:
        """6 weeks with runs → consistency_pct = 100."""
        acts = [
            self._make_activity_obj(week_offset=i, distance_km=8.0, moving_time_seconds=2880)
            for i in range(6)
        ]
        _, _, _, _, consistency_pct = compute_insights_stats(acts)
        assert consistency_pct == 100

    def test_consistency_pct_two_of_six_weeks(self) -> None:
        """2 weeks with runs → consistency_pct = 33 (rounded from 33.33...)."""
        acts = [
            self._make_activity_obj(week_offset=0, distance_km=8.0, moving_time_seconds=2880),
            self._make_activity_obj(week_offset=3, distance_km=8.0, moving_time_seconds=2880),
        ]
        _, _, _, _, consistency_pct = compute_insights_stats(acts)
        assert consistency_pct == 33

    def test_weeks_analyzed_counts_distinct_iso_weeks(self) -> None:
        """Multiple activities in the same week count as one week."""
        # 3 activities in week 0, 2 activities in week 1 → 2 distinct weeks
        acts = [
            self._make_activity_obj(week_offset=0, distance_km=8.0, moving_time_seconds=2880, day_offset=0),
            self._make_activity_obj(week_offset=0, distance_km=8.0, moving_time_seconds=2880, day_offset=1),
            self._make_activity_obj(week_offset=0, distance_km=8.0, moving_time_seconds=2880, day_offset=2),
            self._make_activity_obj(week_offset=1, distance_km=8.0, moving_time_seconds=2880, day_offset=0),
            self._make_activity_obj(week_offset=1, distance_km=8.0, moving_time_seconds=2880, day_offset=1),
        ]
        weeks_analyzed, _, _, _, _ = compute_insights_stats(acts)
        assert weeks_analyzed == 2

    def test_avg_weekly_km_correct(self) -> None:
        """avg_weekly_km = total km / weeks_analyzed, rounded to 1 decimal."""
        # 2 weeks: week 0 has 10 km, week 1 has 20 km → total = 30 km, avg = 15.0
        acts = [
            self._make_activity_obj(week_offset=0, distance_km=10.0, moving_time_seconds=3600),
            self._make_activity_obj(week_offset=1, distance_km=20.0, moving_time_seconds=7200),
        ]
        _, avg_weekly_km, _, _, _ = compute_insights_stats(acts)
        assert avg_weekly_km == 15.0

    def test_empty_activities_raises_value_error(self) -> None:
        """Empty list → ValueError."""
        with pytest.raises(ValueError, match="No activities provided"):
            compute_insights_stats([])

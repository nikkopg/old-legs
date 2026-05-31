"""
Tests for GET /user/export (T5).

Coverage:
1. Unauthenticated request → 401
2. Export returns a valid ZIP (application/zip, Content-Disposition header)
3. ZIP contains profile.json and activities.json
4. ZIP contains all six expected files
5. profile.json never includes strava_access_token, strava_refresh_token, or any encrypted field
6. activities.json reflects seeded Activity records
7. Export with no data → ZIP with empty arrays (not a crash)
8. chat.json, plans.json, reviews.json present and parseable
"""

import io
import json
import zipfile
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.activity import Activity
from models.chat_message import ChatMessage
from models.training_plan import TrainingPlan
from models.user import User
from models.weekly_review import WeeklyReview


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _open_zip(response_content: bytes) -> zipfile.ZipFile:
    """Return an open ZipFile from raw response bytes."""
    return zipfile.ZipFile(io.BytesIO(response_content))


def _read_json_from_zip(zf: zipfile.ZipFile, name: str) -> object:
    """Read and parse a JSON member from an open ZipFile."""
    with zf.open(name) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_export_unauthenticated_returns_401(test_app: TestClient) -> None:
    """No session cookie → 401."""
    response = test_app.get("/user/export")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Core: ZIP response shape
# ---------------------------------------------------------------------------

def test_export_returns_zip(authenticated_client: TestClient) -> None:
    """Authenticated request returns a valid application/zip response."""
    response = authenticated_client.get("/user/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    assert "old-legs-export-" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith('.zip"')

    # Verify it is actually a valid ZIP
    zf = _open_zip(response.content)
    assert zf.namelist()  # non-empty


def test_export_zip_contains_profile_and_activities(authenticated_client: TestClient) -> None:
    """ZIP must contain at least profile.json and activities.json."""
    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        names = zf.namelist()
        assert "profile.json" in names
        assert "activities.json" in names


def test_export_zip_contains_all_six_files(authenticated_client: TestClient) -> None:
    """ZIP must contain exactly the six expected JSON files."""
    expected = {"profile.json", "activities.json", "plans.json", "reviews.json", "chat.json", "insights.json"}

    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        assert set(zf.namelist()) == expected


# ---------------------------------------------------------------------------
# Security: no tokens in export
# ---------------------------------------------------------------------------

def test_export_profile_excludes_tokens(authenticated_client: TestClient) -> None:
    """profile.json must never include strava_access_token, strava_refresh_token, or any encrypted field."""
    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        profile = _read_json_from_zip(zf, "profile.json")

    assert isinstance(profile, dict)
    assert "strava_access_token" not in profile
    assert "strava_refresh_token" not in profile
    assert "strava_token_expires_at" not in profile
    # Verify expected safe fields are present
    assert "name" in profile
    assert "weekly_km_target" in profile
    assert "created_at" in profile


# ---------------------------------------------------------------------------
# Content: activities reflect DB rows
# ---------------------------------------------------------------------------

def test_export_activities_reflects_seeded_data(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
    test_activity: Activity,
) -> None:
    """activities.json should contain one entry matching the seeded test_activity."""
    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        activities = _read_json_from_zip(zf, "activities.json")

    assert isinstance(activities, list)
    assert len(activities) == 1
    entry = activities[0]
    assert entry["id"] == test_activity.id
    assert entry["name"] == test_activity.name
    # distance_m = distance_km * 1000
    assert abs(entry["distance_m"] - test_activity.distance_km * 1000) < 0.5


def test_export_activities_empty_when_no_runs(
    authenticated_client: TestClient,
) -> None:
    """User with no activities → activities.json is an empty list (no crash)."""
    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        activities = _read_json_from_zip(zf, "activities.json")

    assert activities == []


# ---------------------------------------------------------------------------
# Content: plans, reviews, chat present and parseable
# ---------------------------------------------------------------------------

def test_export_plans_present_and_parseable(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
) -> None:
    """plans.json parses correctly and reflects seeded TrainingPlan."""
    from datetime import date

    plan = TrainingPlan(
        user_id=test_user.id,
        week_start_date=date(2026, 5, 26),
        plan_data={"monday": {"type": "easy", "duration_minutes": 30}},
        pak_har_notes={"monday": "Go slow."},
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        plans = _read_json_from_zip(zf, "plans.json")

    assert isinstance(plans, list)
    assert len(plans) == 1
    assert plans[0]["is_active"] is True
    assert plans[0]["week_start_date"] == "2026-05-26"


def test_export_chat_present_and_parseable(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
) -> None:
    """chat.json parses correctly and reflects seeded ChatMessage records."""
    msg = ChatMessage(
        user_id=test_user.id,
        role="user",
        content="Why am I getting slower?",
    )
    db_session.add(msg)
    db_session.commit()

    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        chat = _read_json_from_zip(zf, "chat.json")

    assert isinstance(chat, list)
    assert len(chat) == 1
    assert chat[0]["role"] == "user"
    assert chat[0]["content"] == "Why am I getting slower?"


def test_export_reviews_present_and_parseable(
    authenticated_client: TestClient,
    db_session: Session,
    test_user: User,
) -> None:
    """reviews.json parses correctly and reflects seeded WeeklyReview record."""
    from datetime import date

    review = WeeklyReview(
        user_id=test_user.id,
        week_start_date=date(2026, 5, 26),
        planned_runs=4,
        actual_runs=2,
        review_text="You planned 4 runs and did 2. Fix that.",
    )
    db_session.add(review)
    db_session.commit()

    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        reviews = _read_json_from_zip(zf, "reviews.json")

    assert isinstance(reviews, list)
    assert len(reviews) == 1
    assert reviews[0]["content"] == "You planned 4 runs and did 2. Fix that."


def test_export_insights_is_empty_list(authenticated_client: TestClient) -> None:
    """insights.json is always an empty list (no stored Insight model)."""
    response = authenticated_client.get("/user/export")
    assert response.status_code == 200

    with _open_zip(response.content) as zf:
        insights = _read_json_from_zip(zf, "insights.json")

    assert insights == []

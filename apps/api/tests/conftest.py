"""
Shared test fixtures for Old Legs backend tests.

Key design decisions:
- Real SQLite in-memory DB (not mocked) — per SQA standards
- Strava HTTP calls mocked via respx — Strava is an external service
- Ollama HTTP calls mocked via respx — Ollama may not be running in CI
- test_user fixture creates a user with valid encrypted tokens
- authenticated_client sets the session cookie automatically
"""

import sys
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Add the api directory to sys.path so imports resolve correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.base import Base
from models.user import User
from models.activity import Activity
from services.database import get_db
from services.encryption import encrypt_token
from main import app


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def db_session():
    """
    Provide a real SQLite in-memory database session for each test.

    Creates all tables fresh, yields a session, then drops everything.
    The get_db FastAPI dependency is overridden so routes use this session.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


# ---------------------------------------------------------------------------
# App / client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def test_app(db_session: Session):
    """
    Return a TestClient with the get_db dependency overridden to use
    the in-memory SQLite session.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass  # session lifecycle managed by db_session fixture

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app, raise_server_exceptions=False)
    yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User / activity fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def test_user(db_session: Session) -> User:
    """
    Create a test User with valid (not-expiring) encrypted Strava tokens.
    Tokens are encrypted with whatever Fernet key is active in the test env.
    They are never logged.
    """
    user = User(
        strava_athlete_id="test_athlete_123",
        strava_access_token=encrypt_token("fake_access_token"),
        strava_refresh_token=encrypt_token("fake_refresh_token"),
        strava_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=6),
        name="Test Runner",
        avatar_url=None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def authenticated_client(test_app: TestClient, test_user: User) -> TestClient:
    """
    Return a TestClient with the session cookie pre-set for test_user.
    Use this fixture for any test that requires an authenticated user.
    """
    test_app.cookies.set("session_user_id", str(test_user.id))
    return test_app


@pytest.fixture(scope="function")
def test_activity(db_session: Session, test_user: User) -> Activity:
    """
    Create a test Activity linked to test_user with realistic run data.
    """
    activity = Activity(
        user_id=test_user.id,
        strava_activity_id="strava_act_001",
        name="Morning Run",
        distance_km=10.5,
        moving_time_seconds=3780,
        average_pace_min_per_km=6.0,
        average_hr=155,
        max_hr=172,
        elevation_gain_m=45,
        activity_date=datetime.now(timezone.utc) - timedelta(days=1),
        sync_status="synced",
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity

# READY FOR QA
# Feature: User Pydantic schemas
# What was built: UserCreate, UserRead, UserUpdate, UserProfile (for GET /user/me)
# Edge cases to consider:
#   - strava_athlete_id is nullable in DB (not set until OAuth completes)
#   - biggest_struggle is free-text, no validation needed
#   - UserRead exposes all fields; consider separate schema without tokens for public-facing endpoints
#   - tokens (access/refresh) are NEVER exposed via API — not included in any schema

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    name: str
    avatar_url: str | None = None
    weekly_km_goal: float = 0.0
    days_available: int = 3
    biggest_struggle: str | None = None


class UserCreate(UserBase):
    """Used internally when creating a user from OAuth callback data."""
    strava_athlete_id: str
    strava_access_token: str  # encrypted
    strava_refresh_token: str  # encrypted
    strava_token_expires_at: datetime


class UserRead(UserBase):
    """Public-facing user schema — no sensitive token fields."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    strava_athlete_id: str | None
    name: str
    avatar_url: str | None
    weekly_km_goal: float
    days_available: int
    biggest_struggle: str | None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    """Fields a user can update about themselves."""
    name: str | None = None
    avatar_url: str | None = None
    weekly_km_goal: float | None = None
    days_available: int | None = None
    biggest_struggle: str | None = None


class UserProfile(UserRead):
    """Extended user read — includes computed stats for GET /user/me."""
    total_activities: int = 0
    total_distance_km: float = 0.0
    weeks_on_plan: int = 0

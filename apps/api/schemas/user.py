# READY FOR QA
# Feature: User Pydantic schemas (updated for v2 — TASK-101)
# What was built: UserCreate, UserRead, UserUpdate, UserProfile (for GET /user/me), OnboardingRequest
# Changes in v2:
#   - Renamed weekly_km_goal → weekly_km_target (aligns model with api-spec-v2)
#   - Added onboarding_completed to UserBase / UserRead
#   - Added OnboardingRequest schema for POST /user/onboarding
# Edge cases to consider:
#   - strava_athlete_id is nullable in DB (not set until OAuth completes)
#   - biggest_struggle is free-text, no server-side validation beyond Pydantic str type
#   - UserRead exposes all fields; consider separate schema without tokens for public-facing endpoints
#   - tokens (access/refresh) are NEVER exposed via API — not included in any schema
#   - days_available must be 1–7; weekly_km_target must be >= 0

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


_VALID_GOAL_EVENTS: set[str] = {
    "general_fitness",
    "5k",
    "10k",
    "half_marathon",
    "marathon",
    "ultra",
}


class UserBase(BaseModel):
    name: str
    avatar_url: str | None = None
    onboarding_completed: bool = False
    weekly_km_target: float = 0.0
    days_available: int = 3
    biggest_struggle: str | None = None
    resting_hr: int | None = None
    goal_event: Optional[str] = None


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
    onboarding_completed: bool
    weekly_km_target: float
    days_available: int
    biggest_struggle: str | None
    resting_hr: int | None = None
    max_hr: int | None = None
    max_hr_observed: int | None = None
    goal_event: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    """Fields a user can update about themselves."""
    name: str | None = None
    avatar_url: str | None = None
    weekly_km_target: float | None = None
    days_available: int | None = None
    biggest_struggle: str | None = None


class OnboardingRequest(BaseModel):
    """Request body for POST /user/onboarding."""
    weekly_km_target: float = Field(..., ge=0, description="Current weekly km target (>= 0)")
    days_available: int = Field(..., ge=1, le=7, description="Training days available per week (1–7)")
    biggest_struggle: str = Field(..., min_length=1, description="The runner's biggest struggle, free-text")
    resting_hr: int | None = Field(None, ge=40, le=220, description="Resting HR in bpm (40–220, optional)")
    max_hr: int | None = Field(None, ge=100, le=220, description="User-provided max HR in bpm (100–220, optional)")
    goal_event: Optional[str] = Field(
        None,
        description=(
            "Runner's goal event. "
            "One of: general_fitness, 5k, 10k, half_marathon, marathon, ultra. "
            "Null means not set."
        ),
    )

    @field_validator("goal_event")
    @classmethod
    def validate_goal_event(cls, v: Optional[str]) -> Optional[str]:
        """Reject unrecognised goal_event values with a 422."""
        if v is None:
            return v
        if v not in _VALID_GOAL_EVENTS:
            raise ValueError(
                f"Invalid goal_event '{v}'. "
                f"Must be one of: {', '.join(sorted(_VALID_GOAL_EVENTS))}."
            )
        return v


class UserProfile(UserRead):
    """Extended user read — includes computed stats for GET /user/me."""
    total_activities: int = 0
    total_distance_km: float = 0.0
    weeks_on_plan: int = 0

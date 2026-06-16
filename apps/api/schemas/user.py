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

from datetime import date, datetime
from typing import Optional
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, Field, field_validator


_VALID_GOAL_EVENTS: set[str] = {
    "general_fitness",
    "5k",
    "10k",
    "half_marathon",
    "marathon",
    "ultra",
}

_VALID_COACH_VOICES: set[str] = {"gentle", "standard", "unfiltered"}


class UserBase(BaseModel):
    name: str
    avatar_url: str | None = None
    onboarding_completed: bool = False
    weekly_km_target: float = 0.0
    days_available: int = 3
    available_days: Optional[list[str]] = None
    biggest_struggle: str | None = None
    resting_hr: int | None = None
    goal_event: Optional[str] = None
    race_date: Optional[date] = None
    coach_voice: str = "standard"


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
    available_days: Optional[list[str]] = None
    biggest_struggle: str | None
    resting_hr: int | None = None
    max_hr: int | None = None
    max_hr_observed: int | None = None
    goal_event: Optional[str] = None
    race_date: Optional[date] = None
    auto_plan_enabled: bool = True
    auto_review_enabled: bool = True
    coach_voice: str
    timezone: str = "Asia/Jakarta"
    ntfy_topic: str | None = None
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
    race_date: Optional[date] = Field(
        None,
        description="Target race date in ISO 8601 format (YYYY-MM-DD). Null clears the race date.",
    )
    available_days: Optional[list[str]] = Field(
        None,
        description=(
            "Specific days the runner is available to train. "
            "Valid values: monday, tuesday, wednesday, thursday, friday, saturday, sunday. "
            "Must contain at least one day if provided."
        ),
    )
    auto_plan_enabled: bool = Field(
        True,
        description="If True, a new weekly plan is generated automatically every Monday 05:00 WIB.",
    )
    auto_review_enabled: bool = Field(
        True,
        description="If True, a weekly review is generated automatically every Sunday 20:00 WIB.",
    )
    coach_voice: str = Field(
        "standard",
        description=(
            "Controls how blunt Pak Har's responses are. "
            "One of: gentle, standard, unfiltered."
        ),
    )
    timezone: Optional[str] = Field(
        None,
        description=(
            "IANA timezone key for the runner, e.g. 'Asia/Jakarta', 'America/New_York'. "
            "If provided, must be a valid IANA timezone. "
            "Null leaves the existing value unchanged."
        ),
    )
    ntfy_topic: Optional[str] = Field(
        None,
        max_length=256,
        description=(
            "ntfy.sh topic name or full URL for a self-hosted instance. "
            "When set, the scheduler posts a push notification after each "
            "auto-generated plan or review. Empty string clears the topic."
        ),
    )

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        """Reject invalid IANA timezone keys with a 422."""
        if v is None:
            return v
        if v not in available_timezones():
            raise ValueError(
                f"Invalid timezone '{v}'. Must be a valid IANA timezone key "
                f"(e.g. 'Asia/Jakarta', 'America/New_York')."
            )
        return v

    @field_validator("coach_voice")
    @classmethod
    def validate_coach_voice(cls, v: str) -> str:
        """Reject unrecognised coach_voice values with a 422."""
        if v not in _VALID_COACH_VOICES:
            raise ValueError(
                f"Invalid coach_voice '{v}'. "
                f"Must be one of: {', '.join(sorted(_VALID_COACH_VOICES))}."
            )
        return v

    @field_validator("available_days")
    @classmethod
    def validate_available_days(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        """Reject invalid day names and empty lists with a 422."""
        if v is None:
            return v
        valid = {'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'}
        for day in v:
            if day not in valid:
                raise ValueError(
                    f"Invalid day: '{day}'. Must be one of {sorted(valid)}."
                )
        if len(v) == 0:
            raise ValueError("available_days must contain at least one day if provided.")
        return v

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

# READY FOR QA
# Feature: User model (updated for v2 — TASK-101)
# What was built: Full User model with encrypted Strava tokens, onboarding fields, relationships
# Changes in v2:
#   - Renamed weekly_km_goal → weekly_km_target (aligns with api-spec-v2 field name)
#   - Added onboarding_completed (Boolean) to gate the onboarding flow for first-time users
# Edge cases to consider:
#   - User may not have strava_athlete_id until OAuth completes (nullable)
#   - Token fields must never be logged (encrypt/decrypt only)
#   - onboarding fields (weekly_km_target, days_available, biggest_struggle, resting_hr) nullable for first login
#   - resting_hr, max_hr, and max_hr_observed are nullable cached values — never log or expose raw HR data
#   - onboarding_completed defaults to False — set to True after POST /user/onboarding
#   - unique constraint on strava_athlete_id once set prevents duplicate Strava accounts

from datetime import date, datetime, timezone

from sqlalchemy import Date, JSON, String, DateTime, Boolean, Float, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class User(Base):
    """
    User model — linked to a Strava account via OAuth.

    Tokens are encrypted at rest using Fernet. They must NEVER be logged.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable until OAuth completes — set by auth layer
    strava_athlete_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )

    # Encrypted Strava tokens — use encrypt_token() / decrypt_token() from services/encryption
    # Nullable so disconnect can clear them without deleting the user record.
    strava_access_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    strava_refresh_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    strava_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Profile snapshot from Strava
    name: Mapped[str] = mapped_column(String(256))
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Onboarding preferences (set during onboarding flow — POST /user/onboarding)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    weekly_km_target: Mapped[float] = mapped_column(Float, default=0.0)
    days_available: Mapped[int] = mapped_column(Integer, default=3)
    # Replaces days_available for new users — stores specific day names as a JSON array.
    # Old users who haven't re-saved will retain the count in days_available.
    available_days: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    biggest_struggle: Mapped[str | None] = mapped_column(Text, nullable=True)
    resting_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr_observed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    goal_event: Mapped[str | None] = mapped_column(String, nullable=True)
    race_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Delivery preference toggles (set via onboarding or settings)
    auto_plan_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    auto_review_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")

    # Coach voice preference — controls how blunt Pak Har is
    # Values: "gentle" | "standard" | "unfiltered"
    coach_voice: Mapped[str] = mapped_column(
        String(16),
        default="standard",
        nullable=False,
        server_default="standard",
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    activities: Mapped[list["Activity"]] = relationship(
        "Activity", back_populates="user", lazy="raise"
    )
    training_plans: Mapped[list["TrainingPlan"]] = relationship(
        "TrainingPlan", back_populates="user", lazy="raise"
    )
    chat_messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="user", lazy="raise"
    )
    weekly_reviews: Mapped[list["WeeklyReview"]] = relationship(
        "WeeklyReview", back_populates="user", lazy="raise"
    )
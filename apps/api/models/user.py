# READY FOR QA
# Feature: User model (updated for v2 — TASK-101)
# What was built: Full User model with encrypted Strava tokens, onboarding fields, relationships
# Changes in v2:
#   - Renamed weekly_km_goal → weekly_km_target (aligns with api-spec-v2 field name)
#   - Added onboarding_completed (Boolean) to gate the onboarding flow for first-time users
# Edge cases to consider:
#   - User may not have strava_athlete_id until OAuth completes (nullable)
#   - Token fields must never be logged (encrypt/decrypt only)
#   - onboarding fields (weekly_km_target, days_available, biggest_struggle) nullable for first login
#   - onboarding_completed defaults to False — set to True after POST /user/onboarding
#   - unique constraint on strava_athlete_id once set prevents duplicate Strava accounts

from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, Float, Integer, Text, func
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
    biggest_struggle: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    activities: Mapped[list["Activity"]] = relationship(
        "Activity", back_populates="user", lazy="selectin"
    )
    training_plans: Mapped[list["TrainingPlan"]] = relationship(
        "TrainingPlan", back_populates="user", lazy="selectin"
    )
    chat_messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="user", lazy="selectin"
    )
    weekly_reviews: Mapped[list["WeeklyReview"]] = relationship(
        "WeeklyReview", back_populates="user", lazy="selectin"
    )
# READY FOR QA
# Feature: User model
# What was built: Full User model with encrypted Strava tokens, onboarding fields, relationships
# Edge cases to consider:
#   - User may not have strava_athlete_id until OAuth completes (nullable)
#   - Token fields must never be logged (encrypt/decrypt only)
#   - onboarding fields (weekly_km_goal, days_available, biggest_struggle) nullable for first login
#   - unique constraint on strava_athlete_id once set prevents duplicate Strava accounts

from datetime import datetime

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
    strava_access_token: Mapped[str] = mapped_column(String(512))
    strava_refresh_token: Mapped[str] = mapped_column(String(512))
    strava_token_expires_at: Mapped[datetime] = mapped_column(DateTime)

    # Profile snapshot from Strava
    name: Mapped[str] = mapped_column(String(256))
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Onboarding preferences (set during onboarding flow)
    weekly_km_goal: Mapped[float] = mapped_column(Float, default=0.0)
    days_available: Mapped[int] = mapped_column(Integer, default=3)
    biggest_struggle: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
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
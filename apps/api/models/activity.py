# READY FOR QA
# Feature: Activity model
# What was built: Full Activity model with all Strava fields, sync status, and Pak Har analysis
# Edge cases to consider:
#   - HR fields (average_hr, max_hr) nullable for activities without a HR monitor
#   - analysis is nullable — analysis_generated_at used to know if analysis was attempted
#   - sync_status tracks the full sync lifecycle: pending → synced | failed
#   - unique constraint on strava_activity_id prevents duplicate Strava activities
#   - average_pace_min_per_km is stored as float (e.g. 5.5 = 5:30 min/km) for easier calculations

from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Activity(Base):
    """
    Activity model — a single run synced from Strava.

    Stores normalized values (km, min/km) for easier AI prompt construction.
    """
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    # Strava's unique activity ID — used for deduplication
    strava_activity_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Core activity data
    name: Mapped[str] = mapped_column(String(512))
    distance_km: Mapped[float] = mapped_column(Float)  # converted from meters
    moving_time_seconds: Mapped[int] = mapped_column(Integer)
    average_pace_min_per_km: Mapped[float] = mapped_column(Float)  # e.g. 5.5 = 5:30/km
    average_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elevation_gain_m: Mapped[int] = mapped_column(Integer, default=0)

    # When the activity was performed
    activity_date: Mapped[datetime] = mapped_column(DateTime, index=True)

    # Pak Har's analysis of this run
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Sync lifecycle
    sync_status: Mapped[str] = mapped_column(
        String(16), default="pending", index=True
    )  # "pending" | "synced" | "failed"

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="activities")
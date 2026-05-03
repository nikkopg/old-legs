# READY FOR QA
# Feature: Activity model
# What was built: Full Activity model with all Strava fields, sync status, Pak Har analysis,
#   and structured verdict fields (verdict_short, verdict_tag, tone)
# Edge cases to consider:
#   - HR fields (average_hr, max_hr) nullable for activities without a HR monitor
#   - analysis is nullable — analysis_generated_at used to know if analysis was attempted
#   - sync_status tracks the full sync lifecycle: pending → synced | failed
#   - unique constraint on strava_activity_id prevents duplicate Strava activities
#   - average_pace_min_per_km is stored as float (e.g. 5.5 = 5:30 min/km) for easier calculations
#   - verdict_short / verdict_tag / tone are all nullable — populated only after analysis runs
#     the structured extraction second Ollama call; remain null if extraction fails or is skipped
#   - splits: nullable JSON array of per-km split dicts — populated by a second-pass detail fetch
#     during sync (Strava GET /activities/{id}). Null until that fetch runs; never re-fetched once set.
#   - streams: nullable JSON dict of high-resolution Strava streams data (per-second arrays).
#     Keys: n, time, dist, vel, hr, cad, alt, grade, latlng. Null until explicitly fetched.

from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, Float, Integer, Text, ForeignKey, JSON
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

    # Structured verdict fields — populated by a second Ollama extraction call after analysis.
    # All nullable; extraction failure stores null rather than crashing the analysis endpoint.
    # verdict_short: one-line summary ≤12 words (no praise, no fluff)
    # verdict_tag:   one of PACED POORLY | ON PLAN | HELD THE LINE | FADED LATE |
    #                        FUELING | RESTRAINED | STEADY | NO SHOW
    # tone:          one of critical | good | neutral
    verdict_short: Mapped[str | None] = mapped_column(String(120), nullable=True)
    verdict_tag: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Per-km split data fetched from Strava detail endpoint during sync.
    # Null until the second-pass split fetch runs. Never overwritten once populated.
    # Each element: {km, moving_time, distance, avg_speed_ms, hr, cad, elev}
    splits: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)

    # High-resolution Strava streams data (per-second arrays, downsampled to ≤500 points).
    # Keys: n, time, dist, vel, hr, cad, alt, grade, latlng (absent streams stored as null).
    # Null until explicitly fetched; never re-fetched once populated.
    streams: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

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
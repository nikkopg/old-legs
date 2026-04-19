# READY FOR QA
# Feature: WeeklyReview model
# What was built: DB model for storing Pak Har's weekly planned-vs-actual run review
# Edge cases to consider:
#   - week_start_date should always be a Monday (enforced at service layer, not DB)
#   - planned_runs comes from the active TrainingPlan; actual_runs counted from Activity records
#   - review_text is Pak Har's full assessment — may be long (Text column, not String)
#   - A user may have multiple reviews over time; GET /review/current returns the most recent
#   - No unique constraint on (user_id, week_start_date) — re-generating overwrites at service layer

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class WeeklyReview(Base):
    """
    WeeklyReview model — Pak Har's end-of-week assessment.

    Compares planned runs (from TrainingPlan) vs actual runs (from Activity)
    for a given week and stores Pak Har's written commentary.
    """
    __tablename__ = "weekly_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    # The Monday that starts the reviewed week (ISO date)
    week_start_date: Mapped[date] = mapped_column(Date, index=True)

    # Planned runs come from the active TrainingPlan's day count for that week
    planned_runs: Mapped[int] = mapped_column(Integer)

    # Actual runs counted from Activity records in the same date range
    actual_runs: Mapped[int] = mapped_column(Integer)

    # Pak Har's written assessment of the gap, patterns, and one concrete adjustment
    review_text: Mapped[str] = mapped_column(Text)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="weekly_reviews")

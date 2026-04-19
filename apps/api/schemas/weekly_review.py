# READY FOR QA
# Feature: WeeklyReview Pydantic schemas
# What was built: WeeklyReviewRead — matches POST /review/generate and GET /review/current response shape
# Edge cases to consider:
#   - review_text is never None — generation always produces text before persisting
#   - week_start_date is a date (not datetime) — matches api-spec response shape
#   - planned_runs and actual_runs are non-negative integers; validation is service-layer responsibility
#   - created_at reflects DB insertion time in UTC

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class WeeklyReviewRead(BaseModel):
    """
    Public-facing weekly review schema.

    Matches the response shape for POST /review/generate and GET /review/current.
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    week_start_date: date
    planned_runs: int
    actual_runs: int
    review_text: str
    created_at: datetime

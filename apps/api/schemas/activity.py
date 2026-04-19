# READY FOR QA
# Feature: Activity Pydantic schemas
# What was built: ActivityCreate, ActivityRead, ActivityUpdate, ActivityWithAnalysis
# Edge cases to consider:
#   - HR fields nullable for activities without a HR monitor
#   - analysis is nullable — analysis_generated_at indicates if analysis was attempted
#   - sync_status enum validated in service layer, not DB
#   - average_pace_min_per_km displayed as float (e.g. 5.5 = 5:30/km)

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ActivityBase(BaseModel):
    strava_activity_id: str
    name: str
    distance_km: float
    moving_time_seconds: int
    average_pace_min_per_km: float
    average_hr: int | None = None
    max_hr: int | None = None
    elevation_gain_m: int = 0
    activity_date: datetime
    sync_status: str = "pending"


class ActivityCreate(ActivityBase):
    """Used internally when syncing from Strava API."""
    user_id: int


class ActivityRead(ActivityBase):
    """Public-facing activity schema."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    activity_date: datetime
    analysis: str | None = None
    analysis_generated_at: datetime | None = None
    sync_status: str
    created_at: datetime
    updated_at: datetime


class ActivityUpdate(BaseModel):
    """Fields updatable after initial sync (e.g. analysis fields)."""
    analysis: str | None = None
    analysis_generated_at: datetime | None = None
    sync_status: str | None = None


class ActivityWithAnalysis(ActivityRead):
    """Activity when returned with Pak Har's full analysis."""
    pass


class ActivityListResponse(BaseModel):
    """Paginated activity list response (v2)."""
    items: list[ActivityRead]
    total: int
    page: int
    per_page: int

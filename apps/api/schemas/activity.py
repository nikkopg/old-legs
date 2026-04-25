# READY FOR QA
# Feature: Activity Pydantic schemas
# What was built: ActivityCreate, ActivityRead, ActivityUpdate, ActivityWithAnalysis
# Edge cases to consider:
#   - HR fields nullable for activities without a HR monitor
#   - analysis is nullable — analysis_generated_at indicates if analysis was attempted
#   - sync_status enum validated in service layer, not DB
#   - average_pace_min_per_km displayed as float (e.g. 5.5 = 5:30/km)
#   - verdict_short, verdict_tag, tone: all Optional[str], default None
#     Populated only after /analyze is called and structured extraction succeeds.
#     If extraction fails or Ollama returns malformed JSON, all three remain None.

from datetime import datetime
from typing import Optional

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
    analysis: Optional[str] = None
    analysis_generated_at: Optional[datetime] = None
    sync_status: str
    created_at: datetime
    updated_at: datetime

    # Structured verdict fields — null until /analyze is called and extraction succeeds.
    # verdict_tag allowed values: PACED POORLY | ON PLAN | HELD THE LINE | FADED LATE |
    #                              FUELING | RESTRAINED | STEADY | NO SHOW
    # tone allowed values: critical | good | neutral
    verdict_short: Optional[str] = None
    verdict_tag: Optional[str] = None
    tone: Optional[str] = None


class ActivityUpdate(BaseModel):
    """Fields updatable after initial sync (e.g. analysis fields)."""
    analysis: Optional[str] = None
    analysis_generated_at: Optional[datetime] = None
    sync_status: Optional[str] = None
    verdict_short: Optional[str] = None
    verdict_tag: Optional[str] = None
    tone: Optional[str] = None


class ActivityWithAnalysis(ActivityRead):
    """Activity when returned with Pak Har's full analysis."""
    pass


class ActivityListResponse(BaseModel):
    """Paginated activity list response (v2)."""
    items: list[ActivityRead]
    total: int
    page: int
    per_page: int


class PlanVerdictRequest(BaseModel):
    """Request body for POST /activities/{id}/plan-verdict."""
    target: str
    session_type: str


class PlanVerdictResponse(BaseModel):
    """Response for POST /activities/{id}/plan-verdict."""
    verdict_short: Optional[str] = None
    verdict_tag: Optional[str] = None
    tone: Optional[str] = None

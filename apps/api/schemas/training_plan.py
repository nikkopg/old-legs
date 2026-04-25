# READY FOR QA
# Feature: TrainingPlan Pydantic schemas — TASK-147 added PlanDay.target
# What was built: TrainingPlanCreate, TrainingPlanRead, PlanDay
# Edge cases to consider:
#   - plan_data is a JSON object with 7 days of plan entries
#   - pak_har_notes is a JSON object with notes per day (keys match plan_data keys)
#   - is_active: service layer enforces only one active plan per user
#   - week_start_date is the Monday of the plan week
#   - PlanDay.target is nullable — existing saved plans without the field must not break on read
#   - target for REST days should be "Rest completely" or "No running"
#   - target for cross-training days should be "30 min low-impact, no running" (≤10 words)

from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PlanDay(BaseModel):
    """
    Represents a single day's entry within a training plan.

    ``target`` is a short, scannable summary of what the runner should hit
    that day — ≤10 words, measurable and specific (e.g. "8 km easy",
    "40 min, HR ≤ 140 bpm", "Rest completely"). It is nullable so that
    plans generated before TASK-147 continue to deserialise without error.
    """

    type: str
    description: str
    duration_minutes: int
    target: Optional[str] = None


class TrainingPlanBase(BaseModel):
    week_start_date: date
    plan_data: dict
    pak_har_notes: dict
    is_active: bool = True


class TrainingPlanCreate(TrainingPlanBase):
    """Used when generating a new plan."""
    user_id: int


class TrainingPlanRead(TrainingPlanBase):
    """Public-facing training plan schema."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    week_start_date: date
    plan_data: dict
    pak_har_notes: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

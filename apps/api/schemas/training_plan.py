# READY FOR QA
# Feature: TrainingPlan Pydantic schemas
# What was built: TrainingPlanCreate, TrainingPlanRead
# Edge cases to consider:
#   - plan_data is a JSON object with 7 days of plan entries
#   - pak_har_notes is a JSON object with notes per day (keys match plan_data keys)
#   - is_active: service layer enforces only one active plan per user
#   - week_start_date is the Monday of the plan week

from datetime import datetime, date

from pydantic import BaseModel, ConfigDict


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

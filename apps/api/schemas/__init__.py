"""
Schemas package — all Pydantic request/response models.

Exports all schemas so route handlers can import from a single place.
"""

from schemas.common import ErrorResponse, PaginatedResponse
from schemas.user import UserCreate, UserRead, UserUpdate, UserProfile
from schemas.activity import ActivityCreate, ActivityRead, ActivityUpdate, ActivityWithAnalysis
from schemas.training_plan import TrainingPlanCreate, TrainingPlanRead
from schemas.chat_message import ChatMessageCreate, ChatMessageRead
from schemas.weekly_review import WeeklyReviewRead

__all__ = [
    "ErrorResponse",
    "PaginatedResponse",
    "UserCreate",
    "UserRead",
    "UserUpdate",
    "UserProfile",
    "ActivityCreate",
    "ActivityRead",
    "ActivityUpdate",
    "ActivityWithAnalysis",
    "TrainingPlanCreate",
    "TrainingPlanRead",
    "ChatMessageCreate",
    "ChatMessageRead",
    "WeeklyReviewRead",
]

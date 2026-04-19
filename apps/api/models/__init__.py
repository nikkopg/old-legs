"""
Models package — all SQLAlchemy ORM models.

Imports all models so Alembic can detect all tables when generating migrations.
"""

from models.base import Base
from models.user import User
from models.activity import Activity
from models.training_plan import TrainingPlan
from models.chat_message import ChatMessage
from models.weekly_review import WeeklyReview

__all__ = ["Base", "User", "Activity", "TrainingPlan", "ChatMessage", "WeeklyReview"]

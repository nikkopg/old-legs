# READY FOR QA
# Feature: ChatMessage model
# What was built: Full ChatMessage model for Pak Har conversation history
# Edge cases to consider:
#   - tokens_used is nullable — may not be tracked for all LLM responses
#   - role is validated in service layer: "user" or "coach"
#   - Chat history grows indefinitely — consider pagination in service layer when listing
#   - No encryption needed for message content (not Strava tokens)

from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class ChatMessage(Base):
    """
    ChatMessage model — a single message in the Pak Har conversation thread.

    Stores full conversation history per user for context in future LLM calls.
    """
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    # "user" or "coach"
    role: Mapped[str] = mapped_column(String(16), index=True)
    content: Mapped[str] = mapped_column(Text)

    # Token usage for cost tracking (nullable until LLM responds)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="chat_messages")
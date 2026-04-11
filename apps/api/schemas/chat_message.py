# READY FOR QA
# Feature: ChatMessage Pydantic schemas
# What was built: ChatMessageCreate, ChatMessageRead
# Edge cases to consider:
#   - role validated in service layer ("user" or "coach")
#   - tokens_used is nullable — LLM response tokens may not be available on first chunk
#   - ChatMessageRead used for listing history; ChatMessageCreate for sending new messages

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChatMessageBase(BaseModel):
    role: str
    content: str


class ChatMessageCreate(ChatMessageBase):
    """Used when creating a new chat message (from user or coach)."""
    user_id: int
    role: str  # "user" | "coach" — validated in service layer
    tokens_used: int | None = None


class ChatMessageRead(ChatMessageBase):
    """Public-facing chat message schema."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    role: str
    content: str
    tokens_used: int | None
    created_at: datetime

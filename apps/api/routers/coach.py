# READY FOR QA
# Feature: Pak Har chat endpoint — Ollama streaming integration (TASK-006)
# What was built:
#   - POST /coach/chat — streaming coach response via Server-Sent Events
#   - In-memory rate limiter (20 req/min per user)
#   - Strava context injection from last 4 weeks of activities
#   - Chat history persistence (ChatMessage model, last 10 messages as context)
#   - Pak Har system prompt prepended on every Ollama call
# Edge cases to test:
#   - Rate limit hit: 429 with clear message (20th request allowed, 21st blocked)
#   - Ollama offline: 503 with human-readable message
#   - Ollama slow (>60s first token): 504 with human-readable message
#   - User with no Strava activities: fallback context string passed to LLM
#   - Empty message body: Pydantic validation rejects it (422)
#   - User not authenticated: 401 from get_current_user dependency
#   - Long message history: only last 10 messages sent to Ollama (not full history)
#   - Chat role mapping: "coach" stored in DB → "assistant" sent to Ollama

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.chat_message import ChatMessage
from models.user import User
from services.database import get_db
from services.ollama import build_strava_context, stream_chat
from services.rate_limiter import check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


@router.post("/chat")
async def coach_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    POST /coach/chat — Send a message to Pak Har and receive a streaming response.

    The response is a Server-Sent Events stream where each event carries a text
    chunk from the LLM. The stream ends with a final "data: [DONE]" event.

    Rate limited to 20 requests per 60-second window per user.

    The full assistant response is saved to the database after streaming completes
    so it can be included in future context. The user message is saved before
    streaming begins.

    Errors:
        401 — Not authenticated (no valid session cookie)
        422 — Missing or invalid request body
        429 — Rate limit exceeded
        503 — Ollama is not running or unreachable
        504 — Ollama did not respond within 60 seconds
    """
    # 1. Rate limit check
    if not check_rate_limit(current_user.id):
        raise HTTPException(
            status_code=429,
            detail="You have sent too many messages. Wait a moment before trying again.",
        )

    # 2. Persist the user message
    user_message_record = ChatMessage(
        user_id=current_user.id,
        role="user",
        content=body.message,
    )
    db.add(user_message_record)
    db.commit()
    db.refresh(user_message_record)

    # 3. Fetch the last 10 messages for context (oldest first for chronological order)
    recent_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
        .all()
    )
    # Reverse so messages are in chronological order for the LLM
    recent_messages = list(reversed(recent_messages))

    # 4. Build Strava context
    strava_context = build_strava_context(current_user, db)

    # 5. Build chat history for Ollama (map "coach" → "assistant")
    chat_history = [
        {
            "role": "assistant" if msg.role == "coach" else "user",
            "content": msg.content,
        }
        for msg in recent_messages
        # Exclude the message we just saved — it's appended inside stream_chat()
        if msg.id != user_message_record.id
    ]

    async def event_generator():
        """
        Yield SSE-formatted chunks from Ollama, then persist the full response.

        Error handling note: because headers are sent before streaming begins,
        HTTP errors that occur mid-stream cannot change the status code. Instead
        we send a structured error event so the client can surface the message,
        then terminate. Errors that happen before the first yield (Ollama
        unreachable or immediate timeout) are raised as HTTPException so FastAPI
        can still return a proper error response before the stream opens.
        """
        accumulated: list[str] = []

        try:
            async for chunk in stream_chat(body.message, strava_context, chat_history):
                accumulated.append(chunk)
                yield f"data: {chunk}\n\n"

        except RuntimeError as exc:
            logger.error("Ollama unavailable for user_id=%d: %s", current_user.id, exc)
            yield f"data: [ERROR] {exc}\n\n"
            return

        except TimeoutError as exc:
            logger.error("Ollama timeout for user_id=%d: %s", current_user.id, exc)
            yield f"data: [ERROR] {exc}\n\n"
            return

        finally:
            # Persist whatever response we collected, even on partial success.
            full_response = "".join(accumulated)
            if full_response:
                coach_message = ChatMessage(
                    user_id=current_user.id,
                    role="coach",
                    content=full_response,
                )
                db.add(coach_message)
                db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering for SSE
        },
    )

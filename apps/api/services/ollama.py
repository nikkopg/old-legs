"""
Ollama LLM integration service.

Sends chat messages to a local Ollama instance and handles streaming responses.
Default model: llama3 (configurable via OLLAMA_MODEL env var).
Prepends Pak Har system prompt from prompts/pak_har.py on every request.
"""

import json
import logging
from typing import AsyncGenerator

import httpx

from config import settings
from prompts.pak_har import SYSTEM_PROMPT
from services.context import build_voice_modifier

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = settings.ollama_base_url

# Timeout for first byte from Ollama — 60 seconds.
# Streaming itself has no hard timeout.
CONNECT_TIMEOUT = 10.0
READ_TIMEOUT = 60.0


async def stream_chat(
    user_message: str,
    strava_context: str,
    user_preferences: str,
    plan_context: str,
    chat_history: list[dict],
    coach_voice: str = "standard",
) -> AsyncGenerator[str, None]:
    """
    Stream a chat response from Ollama using the Pak Har system prompt.

    Sends the conversation to the local Ollama /api/chat endpoint with
    streaming enabled. Yields text chunks as they arrive. The caller is
    responsible for assembling chunks and persisting the final response.

    Args:
        user_message: The raw message from the user.
        strava_context: Pre-built activity context string from build_strava_context().
        user_preferences: Pre-built preferences string from build_user_preferences_context().
        plan_context: Pre-built training plan context string from build_plan_context().
        chat_history: List of {"role": ..., "content": ...} dicts for the last N
                      messages (role values must be "user" or "assistant").
        coach_voice: Tonal modifier — "gentle", "standard", or "unfiltered".
                     Passed to build_voice_modifier() before formatting the system prompt.

    Yields:
        Decoded text chunks from the LLM response.

    Raises:
        RuntimeError: If Ollama is unreachable (connection refused / DNS failure).
        TimeoutError: If Ollama does not begin responding within the read timeout.
    """
    voice_modifier = build_voice_modifier(coach_voice)
    system_content = SYSTEM_PROMPT.format(
        strava_context=strava_context,
        user_preferences=user_preferences,
        plan_context=plan_context,
        voice_modifier=voice_modifier,
    )

    messages = [{"role": "system", "content": system_content}]
    messages.extend(chat_history[-10:])
    messages.append({"role": "user", "content": user_message})

    ollama_model = settings.get_ollama_model()
    url = f"{OLLAMA_BASE_URL}/api/chat"

    payload = {
        "model": ollama_model,
        "messages": messages,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=10.0, pool=5.0)
        ) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        logger.warning("Received non-JSON line from Ollama — skipping")
                        continue

                    if data.get("done"):
                        break

                    content = data.get("message", {}).get("content")
                    if content:
                        yield content

    except httpx.ConnectError as exc:
        logger.error("Ollama is unreachable at %s", OLLAMA_BASE_URL)
        raise RuntimeError(
            "Pak Har is unavailable right now. Make sure Ollama is running."
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.error("Ollama returned %s for model %s", exc.response.status_code, ollama_model)
        raise RuntimeError(
            f"Ollama returned {exc.response.status_code}. "
            f"Make sure the model is available: ollama pull {ollama_model}"
        ) from exc
    except httpx.ReadTimeout as exc:
        logger.error("Ollama read timeout after %ss", READ_TIMEOUT)
        raise TimeoutError(
            "Pak Har took too long to respond."
        ) from exc

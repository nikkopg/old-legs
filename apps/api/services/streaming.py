"""SSE (Server-Sent Events) formatting utilities.

Pure formatting helpers — no Ollama calls, no DB queries, no imports from
other app modules. All streaming endpoints share this standard event format.

Event wire format:
    data: <json payload>\n\n

Three event types:
    progress  — fired before each stage begins
    complete  — fired when the operation finishes successfully
    error     — fired on any exception
"""

import json
import time


def progress_event(step: str, started_at: float) -> str:
    """Return an SSE progress event string.

    Args:
        step: Human-readable label describing the stage that is about to run.
        started_at: Monotonic timestamp captured at the start of the operation
            (from ``time.monotonic()``). Used to compute elapsed milliseconds.

    Returns:
        A fully-formed SSE data line, e.g.
        ``data: {"type": "progress", "step": "...", "elapsed_ms": 120}\\n\\n``
    """
    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    payload = {"type": "progress", "step": step, "elapsed_ms": elapsed_ms}
    return f"data: {json.dumps(payload)}\n\n"


def complete_event(data: dict) -> str:
    """Return an SSE complete event string.

    Args:
        data: Arbitrary dict representing the finished result. Callers are
            responsible for ensuring it is JSON-serialisable.

    Returns:
        A fully-formed SSE data line, e.g.
        ``data: {"type": "complete", "data": {...}}\\n\\n``
    """
    payload = {"type": "complete", "data": data}
    return f"data: {json.dumps(payload)}\n\n"


def error_event(message: str) -> str:
    """Return an SSE error event string.

    Args:
        message: Human-readable description of the error. Do not include
            raw stack traces — callers should log those separately.

    Returns:
        A fully-formed SSE data line, e.g.
        ``data: {"type": "error", "message": "..."}\\n\\n``
    """
    payload = {"type": "error", "message": message}
    return f"data: {json.dumps(payload)}\n\n"


def token_event(content: str) -> str:
    """Return an SSE token event string for streaming text content.

    Args:
        content: A text chunk yielded by the Ollama streaming response.
            Emitted once per chunk so the frontend can render tokens
            incrementally as they arrive.

    Returns:
        A fully-formed SSE data line, e.g.
        ``data: {"type": "token", "content": "..."}\\n\\n``
    """
    payload = {"type": "token", "content": content}
    return f"data: {json.dumps(payload)}\n\n"

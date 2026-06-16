"""
Push notification service — ntfy.sh integration.

All functions here are fire-and-forget: they never raise. A failed
notification is logged as a warning and silently dropped so that it
cannot interrupt the scheduler or any request handler.
"""

import logging

import httpx

logger = logging.getLogger(__name__)

# Short timeouts — notifications are best-effort; we never want to block
# the scheduler loop waiting for an external HTTP call.
_CONNECT_TIMEOUT = 5.0   # seconds
_READ_TIMEOUT = 10.0     # seconds


def _resolve_url(topic: str) -> str:
    """
    Return the full ntfy endpoint URL for the given topic.

    If topic already starts with http:// or https:// it is treated as a
    full URL (self-hosted ntfy instance). Otherwise it is treated as a
    bare topic name on the public ntfy.sh service.
    """
    if topic.startswith("http://") or topic.startswith("https://"):
        return topic
    return f"https://ntfy.sh/{topic}"


async def send_ntfy(
    topic: str,
    title: str,
    message: str,
    tags: list[str] | None = None,
) -> None:
    """
    POST a push notification to an ntfy topic. Fire-and-forget.

    Args:
        topic:   ntfy topic name or full URL for self-hosted instances.
        title:   Notification title (sent via ``Title`` header).
        message: Plain-text notification body.
        tags:    Optional list of ntfy tag strings (sent via ``Tags`` header,
                 comma-joined). Ntfy maps well-known tags to emoji icons in
                 supported clients.

    This coroutine never raises. All exceptions are caught and logged as
    warnings. The caller does not need error handling.
    """
    url = _resolve_url(topic)
    headers: dict[str, str] = {"Title": title}
    if tags:
        headers["Tags"] = ",".join(tags)

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=_CONNECT_TIMEOUT, read=_READ_TIMEOUT, write=5.0, pool=5.0)
        ) as client:
            response = await client.post(url, content=message.encode(), headers=headers)
            if response.status_code >= 400:
                logger.warning(
                    "send_ntfy: non-OK response from %s — status=%d", url, response.status_code
                )
            else:
                logger.debug("send_ntfy: notification sent to %s", url)
    except Exception:
        logger.warning("send_ntfy: failed to deliver notification to %s", url, exc_info=True)

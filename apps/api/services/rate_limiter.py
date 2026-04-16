"""
Simple in-memory rate limiter for the coach chat endpoint.
Limits per user_id: 20 requests per 60-second sliding window.
Not suitable for multi-process deployments — sufficient for single-container self-hosting.
"""

import time
from collections import defaultdict

RATE_LIMIT = 20  # requests per window
WINDOW_SECONDS = 60

# Keyed by user_id → list of request timestamps within the current window
_request_log: dict[int, list[float]] = defaultdict(list)


def check_rate_limit(user_id: int) -> bool:
    """
    Check whether a user is within their rate limit.

    Uses a sliding window: requests older than WINDOW_SECONDS are discarded
    before counting. If the user is under the limit, the current timestamp is
    recorded and True is returned. If over the limit, False is returned and
    nothing is recorded.

    Args:
        user_id: The numeric ID of the authenticated user.

    Returns:
        True if the request is allowed, False if the user is rate limited.
    """
    now = time.time()
    window_start = now - WINDOW_SECONDS
    _request_log[user_id] = [t for t in _request_log[user_id] if t > window_start]
    if len(_request_log[user_id]) >= RATE_LIMIT:
        return False
    _request_log[user_id].append(now)
    return True

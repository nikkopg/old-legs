"""
Watch adapter registry. Add new platforms here — nothing else needs to change.
"""

from __future__ import annotations

from services.watch_sync.adapters.garmin import GarminAdapter
from services.watch_sync.base import WatchAdapter

ADAPTERS: dict[str, type] = {
    "garmin": GarminAdapter,
    # "polar": PolarAdapter,
    # "coros": CorosAdapter,
}


def get_adapter(platform: str) -> WatchAdapter:
    """
    Return a fresh adapter instance for the given platform name.

    Raises:
        ValueError: platform not in ADAPTERS.
    """
    cls = ADAPTERS.get(platform)
    if cls is None:
        supported = ", ".join(sorted(ADAPTERS))
        raise ValueError(f"Unsupported platform: {platform!r}. Supported: {supported}")
    return cls()

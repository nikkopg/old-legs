from datetime import datetime
from typing import Any

from pydantic import BaseModel


class WatchConnectRequest(BaseModel):
    platform: str          # "garmin", "polar", etc.
    credentials: dict[str, Any]   # platform-specific; validated by adapter
    # Note: auto_sync intentionally absent — sync is user-initiated via POST /watch/sync


class WatchMfaRequest(BaseModel):
    platform: str
    mfa_code: str


class WatchStatusResponse(BaseModel):
    platform: str
    connected: bool
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None


class WatchSyncResponse(BaseModel):
    results: dict[str, str]   # {"garmin": "pushed"} etc.

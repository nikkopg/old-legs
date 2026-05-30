from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class WatchConnectRequest(BaseModel):
    platform: str
    credentials: dict[str, str]   # platform-specific; validated by adapter
    # Note: auto_sync intentionally absent — sync is user-initiated via POST /watch/sync

    @field_validator("credentials")
    @classmethod
    def _credentials_bounded(cls, v: dict[str, str]) -> dict[str, str]:
        if len(v) > 10:
            raise ValueError("credentials must not contain more than 10 keys")
        for key, val in v.items():
            if len(key) > 128 or len(val) > 512:
                raise ValueError("credential key/value exceeds maximum length")
        return v


class WatchMfaRequest(BaseModel):
    platform: str
    mfa_code: str

    @field_validator("mfa_code")
    @classmethod
    def _mfa_code_bounded(cls, v: str) -> str:
        if len(v) > 16:
            raise ValueError("mfa_code must not exceed 16 characters")
        return v


class WatchStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    platform: str
    connected: bool
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None


class WatchSyncResponse(BaseModel):
    results: dict[str, str]   # {"garmin": "pushed"} etc.

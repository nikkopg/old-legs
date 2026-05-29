"""
Watch sync router.

Endpoints:
    POST   /watch/connect            — connect a watch platform (store credentials)
    POST   /watch/connect/mfa        — complete MFA challenge for platforms that need it
    DELETE /watch/{platform}/disconnect — remove a watch integration
    GET    /watch/status             — list all connected platforms for this user
    POST   /watch/sync               — manually push current active plan to all connected platforms
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from dependencies import get_current_user
from models.user import User
from models.watch_integration import WatchIntegration
from schemas.watch_sync import (
    WatchConnectRequest,
    WatchMfaRequest,
    WatchStatusResponse,
    WatchSyncResponse,
)
from services.database import get_db
from services.encryption import decrypt_token, encrypt_token
from services.plan import get_current_plan
from services.watch_sync import push_plan_to_watch
from services.watch_sync.adapters import get_adapter

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_adapter_or_422(platform: str):
    try:
        return get_adapter(platform)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _upsert_integration(
    db: Session, user_id: int, platform: str, credentials_encrypted: str
) -> WatchIntegration:
    existing = (
        db.query(WatchIntegration)
        .filter(WatchIntegration.user_id == user_id, WatchIntegration.platform == platform)
        .first()
    )
    if existing:
        existing.credentials_encrypted = credentials_encrypted
        existing.session_token_encrypted = None
        existing.session_expires_at = None
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        return existing
    integration = WatchIntegration(
        user_id=user_id,
        platform=platform,
        credentials_encrypted=credentials_encrypted,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(integration)
    db.commit()
    return integration


def _integration_to_status(integration: WatchIntegration) -> WatchStatusResponse:
    return WatchStatusResponse(
        platform=integration.platform,
        connected=True,
        last_synced_at=integration.last_synced_at,
        last_sync_error=integration.last_sync_error,
    )


@router.post("/connect", response_model=WatchStatusResponse)
async def connect_watch(
    body: WatchConnectRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchStatusResponse:
    """
    Connect a watch platform by storing encrypted credentials.

    Validates credentials by attempting a login. Returns 428 if the platform
    requires MFA — the client should then call POST /watch/connect/mfa.

    Raises:
        401: Not authenticated.
        422: Unsupported platform or invalid credentials shape.
        428: MFA required (Garmin 2FA).
    """
    adapter = _get_adapter_or_422(body.platform)

    credentials_json = json.dumps(body.credentials)
    credentials_encrypted = encrypt_token(credentials_json)

    try:
        await asyncio.to_thread(adapter.connect, body.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        exc_str = str(exc).lower()
        if "mfa" in exc_str or "2fa" in exc_str or "code" in exc_str or "factor" in exc_str:
            # Persist credentials so POST /watch/connect/mfa can read them.
            _upsert_integration(db, user.id, body.platform, credentials_encrypted)
            raise HTTPException(
                status_code=428,
                detail={"mfa_required": True, "platform": body.platform},
            ) from exc
        raise HTTPException(status_code=400, detail="Authentication failed. Check your credentials.") from exc

    existing = (
        db.query(WatchIntegration)
        .filter(WatchIntegration.user_id == user.id, WatchIntegration.platform == body.platform)
        .first()
    )
    if existing:
        existing.credentials_encrypted = credentials_encrypted
        existing.session_token_encrypted = None
        existing.session_expires_at = None
        existing.last_sync_error = None
        existing.updated_at = datetime.now(timezone.utc)
        integration = existing
    else:
        integration = WatchIntegration(
            user_id=user.id,
            platform=body.platform,
            credentials_encrypted=credentials_encrypted,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(integration)

    db.commit()
    db.refresh(integration)
    return _integration_to_status(integration)


@router.post("/connect/mfa", response_model=WatchStatusResponse)
async def connect_watch_mfa(
    body: WatchMfaRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchStatusResponse:
    """
    Complete a pending MFA challenge for a watch platform.

    The client must have previously called POST /watch/connect and received a 428.
    The credentials are read from a pending integration row (if it exists) or
    the client must re-submit credentials in a prior connect call.

    Note: the MFA statefulness problem (garminconnect holds in-memory instance state)
    must be resolved in the PoC script before this endpoint is fully hardened.
    This implementation re-initiates a fresh login with the MFA code (option a).

    Raises:
        401: Not authenticated.
        422: Unsupported platform.
        404: No pending integration found — call /watch/connect first.
        400: MFA code rejected.
    """
    _get_adapter_or_422(body.platform)

    integration = (
        db.query(WatchIntegration)
        .filter(WatchIntegration.user_id == user.id, WatchIntegration.platform == body.platform)
        .first()
    )
    if integration is None:
        raise HTTPException(
            status_code=404,
            detail=f"No pending integration for platform '{body.platform}'. Call /watch/connect first.",
        )

    credentials = json.loads(decrypt_token(integration.credentials_encrypted))

    if body.platform == "garmin":
        from services.watch_sync.adapters.garmin import GarminAdapter
        garmin_adapter = GarminAdapter()
        try:
            await asyncio.to_thread(garmin_adapter.connect_with_mfa, credentials, body.mfa_code)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="MFA verification failed. Check the code and try again.") from exc
    else:
        raise HTTPException(status_code=422, detail=f"MFA not supported for platform '{body.platform}'")

    integration.last_sync_error = None
    integration.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(integration)
    return _integration_to_status(integration)


@router.delete("/{platform}/disconnect", status_code=204)
def disconnect_watch(
    platform: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """
    Remove a watch platform integration for the current user.

    Returns 204 whether or not an integration existed (idempotent).

    Raises:
        401: Not authenticated.
        422: Unsupported platform.
    """
    _get_adapter_or_422(platform)
    integration = (
        db.query(WatchIntegration)
        .filter(WatchIntegration.user_id == user.id, WatchIntegration.platform == platform)
        .first()
    )
    if integration:
        db.delete(integration)
        db.commit()
    return Response(status_code=204)


@router.get("/status", response_model=list[WatchStatusResponse])
def get_watch_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WatchStatusResponse]:
    """
    Return all connected watch platforms for the current user.

    Returns an empty list if no platforms are connected.

    Raises:
        401: Not authenticated.
    """
    integrations = (
        db.query(WatchIntegration)
        .filter(WatchIntegration.user_id == user.id)
        .order_by(WatchIntegration.platform)
        .all()
    )
    return [_integration_to_status(i) for i in integrations]


@router.post("/sync", response_model=WatchSyncResponse)
async def sync_watch(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchSyncResponse:
    """
    Manually push the current active plan to all connected watch platforms.

    Runs sync synchronously per platform (via asyncio.to_thread inside push_plan_to_watch).
    Returns per-platform results: "pushed", "failed", or "skipped".

    Raises:
        401: Not authenticated.
        404: No active training plan found.
    """
    plan = get_current_plan(user_id=user.id, db=db)
    if plan is None:
        raise HTTPException(
            status_code=404,
            detail="No active training plan. Generate one with POST /plan/generate first.",
        )

    results = await push_plan_to_watch(plan, user, db)
    if not results:
        raise HTTPException(
            status_code=404,
            detail="No watch integrations connected. Use POST /watch/connect first.",
        )

    return WatchSyncResponse(results=results)

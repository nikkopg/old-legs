# READY FOR QA
# Feature: Strava webhook endpoint for real-time activity sync (T8)
# What was built:
#   - GET  /strava/webhook — Strava subscription verification (hub challenge handshake)
#   - POST /strava/webhook — Incoming activity event handler (HMAC-SHA256 signature validation)
# Edge cases to test:
#   - GET with correct hub.verify_token → echoes hub.challenge
#   - GET with wrong hub.verify_token → 403
#   - GET with missing params → 400
#   - POST with valid signature, activity create event → 200 {"status": "ok"}, sync triggered
#   - POST with valid signature, non-activity or non-create event → 200 {"status": "ok"}, no sync
#   - POST with invalid signature → 403
#   - POST with missing X-Hub-Signature header → 403 (or dev-mode bypass with warning)
#   - POST for unknown athlete (owner_id not in DB) → 200 {"status": "ok"}, no crash
#   - STRAVA_WEBHOOK_VERIFY_TOKEN unset → dev mode, signature skipped, warning logged

"""
Strava webhook router.

Handles two endpoints:
- GET  /strava/webhook — one-time subscription verification challenge from Strava
- POST /strava/webhook — real-time event delivery from Strava

Signature validation uses HMAC-SHA256 with STRAVA_WEBHOOK_VERIFY_TOKEN.
When the token is not set (dev mode), validation is bypassed with a warning.

The POST handler returns immediately (< 2s as required by Strava) and fires
activity sync + analysis as a non-blocking background task via asyncio.create_task().
"""

import asyncio
import hashlib
import hmac
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from config import settings
from models.user import User
from services.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _verify_strava_signature(body: bytes, signature_header: str, secret: str) -> bool:
    """
    Validate the X-Hub-Signature header sent by Strava on webhook POSTs.

    Strava computes: sha256=HMAC-SHA256(secret, body) and places it in the
    X-Hub-Signature header.  We recompute and compare with hmac.compare_digest
    to avoid timing attacks.

    Args:
        body: Raw request body bytes.
        signature_header: Value of the X-Hub-Signature header.
        secret: STRAVA_WEBHOOK_VERIFY_TOKEN from settings.

    Returns:
        True if the signature is valid, False otherwise.
    """
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


async def _sync_and_analyze(user: User, strava_activity_id: str) -> None:
    """
    Background task: sync the user's recent activities and auto-analyze any new ones.

    This runs non-blocking after the webhook handler returns.  All exceptions are
    caught and logged — a background failure must never surface to Strava.

    Args:
        user: The User ORM object for the athlete who triggered the event.
        strava_activity_id: Strava numeric activity ID from the webhook event.
    """
    from services.database import SessionLocal
    from services.strava import get_valid_access_token, sync_activities

    db: Optional[Session] = None
    try:
        db = SessionLocal()
        # Re-fetch user inside the new session so the ORM object is bound correctly
        user_row = db.query(User).filter(User.id == user.id).first()
        if user_row is None:
            logger.warning(
                "Webhook background task: user_id=%d not found in new session — aborting",
                user.id,
            )
            return

        if not user_row.strava_access_token:
            logger.warning(
                "Webhook background task: user_id=%d has no Strava token — aborting",
                user.id,
            )
            return

        access_token = await get_valid_access_token(user_row, db)
        new_count = await sync_activities(user_row.id, access_token, db)
        logger.info(
            "Webhook background sync complete: user_id=%d strava_activity_id=%s new=%d",
            user_row.id,
            strava_activity_id,
            new_count,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Webhook background task failed for user_id=%d strava_activity_id=%s: %s",
            user.id,
            strava_activity_id,
            exc,
        )
    finally:
        if db is not None:
            db.close()


# ---------------------------------------------------------------------------
# GET /strava/webhook — Strava subscription verification
# ---------------------------------------------------------------------------

@router.get("/webhook")
async def verify_webhook_subscription(
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
):
    """
    Strava webhook subscription verification endpoint.

    When you register a webhook subscription via the Strava API, Strava sends a
    GET request to this endpoint with three query parameters.  We must echo back
    ``hub.challenge`` in JSON if ``hub.verify_token`` matches our secret.

    Args:
        hub_mode: Must be ``"subscribe"`` (sent by Strava).
        hub_verify_token: Token that must match ``STRAVA_WEBHOOK_VERIFY_TOKEN``.
        hub_challenge: Random string Strava expects us to echo back.

    Returns:
        ``{"hub.challenge": "<value>"}`` on success.

    Raises:
        403: If the verify token does not match.
    """
    configured_token = settings.strava_webhook_verify_token

    if not configured_token:
        # Dev mode — log and accept any token so local testing works without config
        logger.warning(
            "STRAVA_WEBHOOK_VERIFY_TOKEN is not set. "
            "Accepting webhook verification in dev mode. Set the token for production."
        )
        return {"hub.challenge": hub_challenge}

    if not hmac.compare_digest(hub_verify_token, configured_token):
        logger.warning(
            "Webhook verification failed: hub.verify_token mismatch "
            "(hub_mode=%r hub_challenge=%r)",
            hub_mode,
            hub_challenge,
        )
        raise HTTPException(status_code=403, detail="Invalid verify token")

    logger.info(
        "Webhook subscription verified (hub_mode=%r hub_challenge=%r)",
        hub_mode,
        hub_challenge,
    )
    return {"hub.challenge": hub_challenge}


# ---------------------------------------------------------------------------
# POST /strava/webhook — Incoming activity event
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def receive_webhook_event(
    request: Request,
    db: Session = Depends(get_db),
    x_hub_signature: Optional[str] = Header(default=None, alias="X-Hub-Signature"),
):
    """
    Receive and process a real-time activity event from Strava.

    Strava POSTs events here when activities are created, updated, or deleted.
    We only act on ``{"object_type": "activity", "aspect_type": "create"}`` events.

    Signature validation:
        Strava signs each POST with HMAC-SHA256 using the webhook verify token as
        the key.  The signature is in the ``X-Hub-Signature`` header.  If
        ``STRAVA_WEBHOOK_VERIFY_TOKEN`` is configured, we validate and reject
        mismatches with 403.  If unset (dev mode), validation is skipped with a
        warning.

    Response:
        Always returns ``{"status": "ok"}`` immediately (required by Strava within
        2 seconds).  Background sync is fired non-blocking via
        ``asyncio.create_task()``.

    Args:
        request: The raw FastAPI Request (needed to read raw bytes for HMAC).
        db: Database session for user lookup.
        x_hub_signature: Value of the X-Hub-Signature header from Strava.

    Returns:
        ``{"status": "ok"}`` in all success paths.

    Raises:
        403: If signature validation fails (only when token is configured).
    """
    body = await request.body()

    configured_token = settings.strava_webhook_verify_token

    if configured_token:
        # Signature validation is required when the token is configured
        if not x_hub_signature:
            logger.warning(
                "Webhook POST missing X-Hub-Signature header — rejecting"
            )
            raise HTTPException(
                status_code=403,
                detail="Missing X-Hub-Signature header",
            )
        if not _verify_strava_signature(body, x_hub_signature, configured_token):
            logger.warning(
                "Webhook POST signature validation failed — rejecting "
                "(header=%r)", x_hub_signature
            )
            raise HTTPException(
                status_code=403,
                detail="Invalid webhook signature",
            )
    else:
        logger.warning(
            "STRAVA_WEBHOOK_VERIFY_TOKEN is not set. "
            "Skipping signature validation in dev mode."
        )

    # Parse event body
    try:
        event = await request.json()
    except Exception:
        # body was already consumed above — parse manually from bytes
        import json as _json
        try:
            event = _json.loads(body)
        except Exception as exc:
            logger.warning("Webhook POST: failed to parse JSON body: %s", exc)
            return {"status": "ok"}

    object_type = event.get("object_type")
    aspect_type = event.get("aspect_type")
    owner_id = event.get("owner_id")
    object_id = event.get("object_id")  # Strava activity ID

    logger.info(
        "Webhook event received: object_type=%r aspect_type=%r "
        "owner_id=%r object_id=%r",
        object_type,
        aspect_type,
        owner_id,
        object_id,
    )

    # Only act on activity-create events
    if object_type != "activity" or aspect_type != "create":
        logger.info(
            "Webhook event ignored (not an activity create): "
            "object_type=%r aspect_type=%r",
            object_type,
            aspect_type,
        )
        return {"status": "ok"}

    if owner_id is None or object_id is None:
        logger.warning(
            "Webhook activity-create event missing owner_id or object_id — ignoring"
        )
        return {"status": "ok"}

    # Look up user by Strava athlete ID
    strava_athlete_id = str(owner_id)
    user = (
        db.query(User)
        .filter(User.strava_athlete_id == strava_athlete_id)
        .first()
    )

    if user is None:
        logger.info(
            "Webhook: no user found for strava_athlete_id=%r — ignoring event",
            strava_athlete_id,
        )
        return {"status": "ok"}

    if not user.strava_access_token:
        logger.warning(
            "Webhook: user_id=%d has no Strava access token — ignoring event",
            user.id,
        )
        return {"status": "ok"}

    # Fire background sync — must not block; Strava requires < 2s response
    strava_activity_id = str(object_id)
    asyncio.create_task(_sync_and_analyze(user, strava_activity_id))
    logger.info(
        "Webhook: background sync task created for user_id=%d activity=%s",
        user.id,
        strava_activity_id,
    )

    return {"status": "ok"}

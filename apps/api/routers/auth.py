# READY FOR QA
# Feature: Strava OAuth flow (TASK-003)
# What was built:
#   - POST /auth/strava — initiates OAuth, returns redirect URL
#   - GET /auth/strava/callback — handles OAuth callback, stores tokens
# Edge cases to test:
#   - Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET environment variables
#   - Invalid authorization code (expired, already used, revoked)
#   - Strava API network failures
#   - User already connected (should update tokens, not create duplicate)
#   - Missing athlete id in Strava response

"""
Strava OAuth authentication router.

Endpoints:
- POST /auth/strava — Generate OAuth URL and redirect user to Strava
- GET /auth/strava/callback — Handle Strava OAuth callback, exchange code, store tokens
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.user import User
from schemas.user import UserRead
from services.database import get_db
from services.strava import complete_oauth_flow, get_redirect_url

logger = logging.getLogger(__name__)

router = APIRouter()


class OAuthSettings:
    """OAuth configuration from environment variables."""

    client_id: str
    redirect_uri: str

    def __init__(self):
        self.client_id = os.environ.get("STRAVA_CLIENT_ID", "")
        self.redirect_uri = os.environ.get("STRAVA_REDIRECT_URI", "")


_oauth_settings = OAuthSettings()


# Request schemas
class OAuthInitiateRequest(BaseModel):
    """Request body for initiating OAuth (optional state for CSRF)."""

    state: Optional[str] = None


# Response schemas
class OAuthInitiateResponse(BaseModel):
    """Response for OAuth initiation."""

    oauth_url: str


class OAuthCallbackResponse(BaseModel):
    """Response for OAuth callback success."""

    success: bool
    message: str
    user: Optional[dict] = None


class OAuthStatusResponse(BaseModel):
    """Response for OAuth status check."""

    connected: bool
    message: str


@router.post("/strava")
async def initiate_strava_oauth(request: OAuthInitiateRequest):
    """
    Initiate Strava OAuth flow.

    Generates the Strava OAuth authorization URL and returns it to the frontend.
    The frontend should redirect the user's browser to this URL.

    **Request (JSON body):**
    ```json
    {
      "state": "optional-csrf-token"
    }
    ```

    **Response (200):**
    ```json
    {
      "oauth_url": "https://www.strava.com/oauth/authorize?client_id=..."
    }
    ```

    **Errors:**
    - 500: STRAVA_CLIENT_ID or STRAVA_REDIRECT_URI not configured
    """
    if not _oauth_settings.client_id:
        raise HTTPException(
            status_code=500,
            detail="Strava client ID not configured. Set STRAVA_CLIENT_ID environment variable."
        )

    if not _oauth_settings.redirect_uri:
        raise HTTPException(
            status_code=500,
            detail="Strava redirect URI not configured. Set STRAVA_REDIRECT_URI environment variable."
        )

    # Generate OAuth URL
    oauth_url = get_redirect_url(state=request.state if request.state else None)

    return OAuthInitiateResponse(oauth_url=oauth_url)


@router.get("/strava/callback")
async def strava_oauth_callback(
    code: str,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """
    Handle Strava OAuth callback.

    Exchanges the authorization code for access/refresh tokens,
    fetches athlete profile, and creates or updates the user in the database.

    Query params:
        code: Authorization code from Strava
        state: Optional CSRF token (currently not validated)

    Returns:
        JSON response with success status and user data

    Raises:
        400: Missing code parameter or invalid OAuth flow
        500: Strava API errors or database issues
    """
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Missing authorization code. 'code' query parameter required."
        )

    # Validate environment
    if not _oauth_settings.client_id:
        raise HTTPException(
            status_code=500,
            detail="Strava client ID not configured."
        )

    if not _oauth_settings.redirect_uri:
        raise HTTPException(
            status_code=500,
            detail="Strava redirect URI not configured."
        )

    try:
        # Complete OAuth flow
        user = await complete_oauth_flow(code, db)

        # Success response
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "Strava account connected successfully",
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "avatar_url": user.avatar_url,
                    "strava_athlete_id": user.strava_athlete_id,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "updated_at": user.updated_at.isoformat() if user.updated_at else None,
                },
            },
        )

    except ValueError as e:
        logger.warning(f"OAuth validation error: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
    except RuntimeError as e:
        logger.error(f"OAuth runtime error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Unexpected OAuth error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to complete OAuth flow. Please try again.",
        )


@router.get("/strava/status")
async def oauth_status(db: Session = Depends(get_db)):
    """
    Check OAuth status for current session/user.

    Returns connection status and basic user info if authenticated.

    TODO: Implement proper session/user detection.
    For now, returns generic status.
    """
    return {
        "connected": False,
        "message": "Session not implemented yet. Use /auth/strava to connect.",
    }

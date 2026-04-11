# READY FOR QA
# Feature: Strava OAuth service
# What was built: OAuth flow with token exchange, athlete profile fetch, and token encryption
# Edge cases to consider:
#   - Strava API may return errors (invalid code, expired token, revoked access)
#   - Token expiration handling — refresh token needed when access_token expires
#   - Multiple users may connect same Strava account (rare, but handle with unique constraint)
#   - Network failures to Strava API — retry with exponential backoff

"""
Strava OAuth integration service.

Handles the Authorization Code flow:
1. Generate OAuth URL for user redirect
2. Exchange authorization code for access/refresh tokens
3. Fetch athlete profile data
4. Encrypt and store tokens in database
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models.user import User
from services.encryption import encrypt_token

logger = logging.getLogger(__name__)


class StravaSettings:
    """Strava API configuration loaded from environment."""

    client_id: str
    client_secret: str
    redirect_uri: str
    auth_url: str = "https://www.strava.com/oauth/token"

    def __init__(self):
        self.client_id = os.environ.get("STRAVA_CLIENT_ID")
        self.client_secret = os.environ.get("STRAVA_CLIENT_SECRET")
        self.redirect_uri = os.environ.get("STRAVA_REDIRECT_URI")

        if not all([self.client_id, self.client_secret, self.redirect_uri]):
            logger.warning(
                "Strava credentials not fully configured. "
                "Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI"
            )


_settings = StravaSettings()


def get_redirect_url(state: Optional[str] = None) -> str:
    """
    Generate Strava OAuth authorization URL.

    The frontend redirects the user to this URL where they authorize
    the app and Strava redirects back to the callback endpoint.

    Args:
        state: Optional CSRF token for security (not implemented yet)

    Returns:
        Full URL to redirect user to Strava's OAuth page
    """
    params = {
        "client_id": _settings.client_id,
        "redirect_uri": _settings.redirect_uri,
        "response_type": "code",
        "scope": "read,activity:read",
    }

    param_str = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://www.strava.com/oauth/authorize?{param_str}"


async def exchange_code_for_tokens(code: str) -> dict:
    """
    Exchange authorization code for Strava access and refresh tokens.

    Args:
        code: Authorization code from Strava callback

    Returns:
        Dict with access_token, refresh_token, expires_at, and athlete data

    Raises:
        httpx.HTTPStatusError: If Strava API returns non-200
        ValueError: If required fields are missing from response
    """
    if not _settings.client_id or not _settings.client_secret:
        raise RuntimeError("Strava credentials not configured")

    payload = {
        "client_id": _settings.client_id,
        "client_secret": _settings.client_secret,
        "code": code,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(_settings.auth_url, data=payload)
        response.raise_for_status()

        data = response.json()

        # Validate required fields
        if "access_token" not in data:
            raise ValueError("Strava response missing access_token")
        if "refresh_token" not in data:
            raise ValueError("Strava response missing refresh_token")
        if "expires_in" not in data:
            raise ValueError("Strava response missing expires_in")

        expires_at = datetime.utcnow() + timedelta(seconds=data["expires_in"])

        return {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": expires_at,
            "athlete": data.get("athlete", {}),
        }


async def fetch_athlete_profile(access_token: str) -> dict:
    """
    Fetch athlete profile from Strava API.

    Args:
        access_token: Strava access token

    Returns:
        Dict with athlete profile data (id, firstname, lastname, profile, sex, etc.)

    Raises:
        httpx.HTTPStatusError: If API returns non-200
    """
    url = "https://www.strava.com/api/v3/athlete"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            url, headers={"Authorization": f"Bearer {access_token}"}
        )
        response.raise_for_status()
        return response.json()


async def complete_oauth_flow(code: str, db: Session) -> User:
    """
    Complete the full OAuth flow: exchange code, fetch profile, create/update user.

    Args:
        code: Authorization code from Strava callback
        db: Database session

    Returns:
        Created or updated User object
    """
    # Step 1: Exchange code for tokens
    token_data = await exchange_code_for_tokens(code)

    # Step 2: Fetch athlete profile
    athlete = await fetch_athlete_profile(token_data["access_token"])

    # Validate athlete data
    athlete_id = str(athlete.get("id"))
    if not athlete_id:
        raise ValueError("Strava athlete id not found in profile")

    # Step 3: Encrypt tokens
    access_token_encrypted = encrypt_token(token_data["access_token"])
    refresh_token_encrypted = encrypt_token(token_data["refresh_token"])

    # Step 4: Create or update user
    existing_user = db.query(User).filter_by(strava_athlete_id=athlete_id).first()

    if existing_user:
        # Update existing user with new tokens
        existing_user.strava_access_token = access_token_encrypted
        existing_user.strava_refresh_token = refresh_token_encrypted
        existing_user.strava_token_expires_at = token_data["expires_at"]
        existing_user.name = athlete.get("firstname", "") + " " + athlete.get("lastname", "")
        existing_user.avatar_url = athlete.get("profile")
        db.commit()
        db.refresh(existing_user)
        logger.info(f"Updated existing user: {athlete_id}")
        return existing_user

    # Create new user
    user = User(
        strava_athlete_id=athlete_id,
        strava_access_token=access_token_encrypted,
        strava_refresh_token=refresh_token_encrypted,
        strava_token_expires_at=token_data["expires_at"],
        name=athlete.get("firstname", "") + " " + athlete.get("lastname", ""),
        avatar_url=athlete.get("profile"),
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info(f"Created new user: {athlete_id}")

    return user

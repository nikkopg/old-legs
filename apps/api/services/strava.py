# READY FOR QA
# Feature: Strava OAuth service + activity sync with per-km splits (TASK-161–163)
# What was built: OAuth flow with token exchange, athlete profile fetch, and token encryption.
#   sync_activities() now includes a second pass that fetches per-km split data from
#   GET /activities/{strava_id} for any activity in the current sync batch where splits IS NULL.
# Edge cases to consider:
#   - Strava API may return errors (invalid code, expired token, revoked access)
#   - Token expiration handling — refresh token needed when access_token expires
#   - Multiple users may connect same Strava account (rare, but handle with unique constraint)
#   - Network failures to Strava API — retry with exponential backoff
#   - Split fetch errors are logged as warnings and skipped — they never fail the sync
#   - Only activities in the current sync batch with splits IS NULL are detail-fetched
#   - Activities already carrying splits data are never re-fetched

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
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models.activity import Activity
from models.user import User
from services.encryption import decrypt_token, encrypt_token

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


async def get_valid_access_token(user: User, db: Session) -> str:
    """
    Return a valid plaintext Strava access token for the given user.

    If the current token expires within 5 minutes, refreshes it automatically
    via the Strava token refresh endpoint, re-encrypts, and saves to DB.

    Args:
        user: User ORM object with encrypted token fields.
        db: Database session.

    Returns:
        Plaintext access token ready for use in Strava API calls.

    Raises:
        RuntimeError: If Strava credentials are not configured.
        httpx.HTTPStatusError: If token refresh fails.
    """
    now = datetime.now(timezone.utc)
    expires_at = user.strava_token_expires_at

    # Normalise to aware datetime if stored as naive UTC
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at - now <= timedelta(minutes=5):
        logger.info(f"Access token expiring soon for user {user.id} — refreshing")

        if not _settings.client_id or not _settings.client_secret:
            raise RuntimeError("Strava credentials not configured for token refresh")

        plaintext_refresh = decrypt_token(user.strava_refresh_token)

        payload = {
            "client_id": _settings.client_id,
            "client_secret": _settings.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": plaintext_refresh,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(_settings.auth_url, data=payload)
            response.raise_for_status()
            data = response.json()

        new_access = data["access_token"]
        new_refresh = data["refresh_token"]
        new_expires_at = datetime.utcnow() + timedelta(seconds=data["expires_in"])

        user.strava_access_token = encrypt_token(new_access)
        user.strava_refresh_token = encrypt_token(new_refresh)
        user.strava_token_expires_at = new_expires_at
        db.commit()
        db.refresh(user)

        logger.info(f"Token refreshed for user {user.id}")
        return new_access

    return decrypt_token(user.strava_access_token)


async def fetch_activities(access_token: str, days: int = 90) -> list[dict]:
    """
    Fetch running activities from Strava for the past `days` days.

    Filters to type == "Run" only. Returns raw Strava activity dicts.

    Args:
        access_token: Valid plaintext Strava access token.
        days: How many days back to fetch (default 90).

    Returns:
        List of raw Strava activity dicts (runs only).

    Raises:
        httpx.HTTPStatusError: If Strava API returns non-200.
    """
    after_ts = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
    url = "https://www.strava.com/api/v3/athlete/activities"
    params = {"after": after_ts, "per_page": 200}
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)
        response.raise_for_status()
        all_activities = response.json()

    runs = [a for a in all_activities if a.get("type") == "Run"]
    logger.info(f"Fetched {len(all_activities)} activities from Strava, {len(runs)} are runs")
    return runs


def normalize_activity(raw: dict) -> dict:
    """
    Map raw Strava activity fields to our internal schema.

    Unit conversions:
    - distance: meters → km (round 2dp)
    - average_speed: m/s → min/km pace (1000 / (speed_m_s * 60))
    - elevation: kept as int metres
    - HR fields: kept as int or None

    Args:
        raw: Single Strava activity dict as returned by the activities API.

    Returns:
        Dict matching ActivityCreate field names (excluding user_id).
    """
    distance_m = raw.get("distance", 0.0) or 0.0
    distance_km = round(distance_m / 1000, 2)

    average_speed_ms = raw.get("average_speed", 0.0) or 0.0
    if average_speed_ms > 0:
        average_pace = round(1000 / (average_speed_ms * 60), 4)
    else:
        average_pace = 0.0

    avg_hr_raw = raw.get("average_heartrate")
    max_hr_raw = raw.get("max_heartrate")

    # Prefer start_date_local (naive local time) over start_date (UTC) so the
    # stored date matches the runner's local clock rather than UTC.
    # start_date_local from Strava is a naive ISO string with no tz suffix,
    # e.g. "2026-04-25T06:00:00". start_date is UTC with a Z suffix.
    activity_date_raw = raw.get("start_date_local") or raw.get("start_date", "")
    try:
        if "Z" in activity_date_raw or "+" in activity_date_raw:
            # Fallback start_date (UTC) — strip tz info for consistent naive storage
            activity_date = datetime.fromisoformat(
                activity_date_raw.replace("Z", "+00:00")
            ).replace(tzinfo=None)
        else:
            # start_date_local — already a naive local time string, parse as-is
            activity_date = datetime.fromisoformat(activity_date_raw)
    except (ValueError, TypeError, AttributeError):
        activity_date = datetime.utcnow()
        logger.warning(
            f"Could not parse activity date '{activity_date_raw}' for activity "
            f"{raw.get('id')} — using utcnow"
        )

    return {
        "strava_activity_id": str(raw.get("id", "")),
        "name": raw.get("name", "Run"),
        "distance_km": distance_km,
        "moving_time_seconds": int(raw.get("moving_time", 0) or 0),
        "average_pace_min_per_km": average_pace,
        "average_hr": int(avg_hr_raw) if avg_hr_raw is not None else None,
        "max_hr": int(max_hr_raw) if max_hr_raw is not None else None,
        "elevation_gain_m": int(raw.get("total_elevation_gain", 0) or 0),
        "activity_date": activity_date,
    }


async def _fetch_splits_for_activity(
    strava_activity_id: str, access_token: str
) -> list[dict] | None:
    """
    Fetch per-km split data from the Strava activity detail endpoint.

    Returns a list of cleaned split dicts, or None on any error.  Errors are
    logged as warnings — callers must never raise based on this return value.

    Args:
        strava_activity_id: Strava's numeric activity ID (stored as str).
        access_token: Valid plaintext Strava access token.

    Returns:
        List of split dicts or None.
    """
    url = f"https://www.strava.com/api/v3/activities/{strava_activity_id}"
    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            detail = response.json()
    except Exception as exc:
        logger.warning(
            f"Failed to fetch Strava detail for activity {strava_activity_id}: {exc}"
        )
        return None

    raw_splits = detail.get("splits_metric")
    if not raw_splits or not isinstance(raw_splits, list):
        logger.warning(
            f"No splits_metric in Strava detail for activity {strava_activity_id}"
        )
        return None

    cleaned: list[dict] = []
    for split in raw_splits:
        try:
            cleaned.append({
                "km": split["split"],
                "moving_time": split["moving_time"],
                "distance": split["distance"],
                "avg_speed_ms": split["average_speed"],
                "hr": split.get("average_heartrate"),
                "cad": split.get("average_cadence"),
                "elev": split.get("elevation_difference"),
            })
        except (KeyError, TypeError) as exc:
            logger.warning(
                f"Skipping malformed split entry for activity {strava_activity_id}: {exc}"
            )
            continue

    if not cleaned:
        return None

    return cleaned


async def sync_activities(user_id: int, access_token: str, db: Session) -> int:
    """
    Fetch, normalize, and upsert Strava running activities for a user.

    For activities that already exist in the database, mutable Strava-owned fields
    (name, date, distance, pace, HR, elevation) are updated in place.  App-owned
    fields (analysis, analysis_generated_at, verdict_short, verdict_tag, tone,
    sync_status) are never overwritten on existing rows.

    After the main upsert loop, a second pass fetches per-km split data from the
    Strava detail endpoint (GET /activities/{id}) for activities in this sync batch
    that still have splits IS NULL.  Split fetch failures are silently skipped —
    they never cause the overall sync to fail.

    Returns count of *newly inserted* activities only; updates are not counted.

    Args:
        user_id: Internal user ID (FK for Activity.user_id).
        access_token: Valid plaintext Strava access token.
        db: Database session.

    Returns:
        Number of newly synced (inserted) activities.
    """
    raw_activities = await fetch_activities(access_token)
    new_count = 0
    updated_count = 0

    # Track strava_activity_ids touched in this sync pass so the split-fetch
    # second pass is bounded to the current batch (not the entire history).
    touched_strava_ids: set[str] = set()

    for raw in raw_activities:
        normalized = normalize_activity(raw)
        strava_id = normalized["strava_activity_id"]

        if not strava_id:
            logger.warning("Skipping activity with empty strava_activity_id")
            continue

        existing = (
            db.query(Activity)
            .filter(Activity.strava_activity_id == strava_id)
            .first()
        )
        if existing:
            # Update mutable Strava fields only — do not touch app-owned fields
            # (analysis, analysis_generated_at, verdict_short, verdict_tag, tone,
            # sync_status).
            existing.name = normalized["name"]
            existing.activity_date = normalized["activity_date"]
            existing.distance_km = normalized["distance_km"]
            existing.moving_time_seconds = normalized["moving_time_seconds"]
            existing.average_pace_min_per_km = normalized["average_pace_min_per_km"]
            existing.average_hr = normalized["average_hr"]
            existing.max_hr = normalized["max_hr"]
            existing.elevation_gain_m = normalized["elevation_gain_m"]
            db.add(existing)
            updated_count += 1
            touched_strava_ids.add(strava_id)
            continue

        activity = Activity(
            user_id=user_id,
            sync_status="synced",
            **normalized,
        )
        db.add(activity)
        new_count += 1
        touched_strava_ids.add(strava_id)

    if new_count > 0 or updated_count > 0:
        db.commit()
        logger.info(
            f"Sync complete for user {user_id}: "
            f"{new_count} new, {updated_count} updated"
        )

        # Update max_hr_observed on the user row — cached so zone calc avoids
        # re-scanning activity history on every analysis call.
        from sqlalchemy import func as sa_func
        new_max = (
            db.query(sa_func.max(Activity.max_hr))
            .filter(Activity.user_id == user_id)
            .scalar()
        )
        if new_max is not None:
            user_row = db.query(User).filter(User.id == user_id).first()
            if user_row and (user_row.max_hr_observed is None or new_max > user_row.max_hr_observed):
                user_row.max_hr_observed = new_max
                db.commit()
                logger.info(
                    f"Updated max_hr_observed for user {user_id}: {new_max} bpm"
                )
    else:
        logger.info(f"No activities to sync for user {user_id}")

    # --- Second pass: fetch per-km splits for touched activities missing them ---
    # Capped at 10 per sync (newest first) to stay well inside Strava's 100 req/15 min
    # rate limit and avoid HTTP timeouts on large sync batches. Historical activities
    # without splits are backfilled gradually across subsequent syncs.
    _MAX_SPLITS_PER_SYNC = 10
    if touched_strava_ids:
        activities_needing_splits = (
            db.query(Activity)
            .filter(
                Activity.user_id == user_id,
                Activity.strava_activity_id.in_(touched_strava_ids),
                Activity.splits.is_(None),
            )
            .order_by(Activity.activity_date.desc())
            .limit(_MAX_SPLITS_PER_SYNC)
            .all()
        )

        splits_fetched = 0
        for activity in activities_needing_splits:
            splits = await _fetch_splits_for_activity(
                activity.strava_activity_id, access_token
            )
            if splits is not None:
                activity.splits = splits
                db.add(activity)
                splits_fetched += 1

        if splits_fetched > 0:
            db.commit()
            logger.info(
                f"Splits fetched for {splits_fetched} activities (user {user_id})"
            )

    return new_count

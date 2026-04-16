"""
FastAPI shared dependencies.

Provides reusable dependency functions for route handlers.
"""

import logging

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from models.user import User
from services.database import get_db

logger = logging.getLogger(__name__)


def get_current_user(
    session_user_id: str = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: resolve the current authenticated user from session cookie.

    The session cookie `session_user_id` is set by the OAuth callback handler
    after a successful Strava login.

    Args:
        session_user_id: Value of the `session_user_id` httpOnly cookie.
        db: Database session.

    Returns:
        The authenticated User ORM object.

    Raises:
        401: If the cookie is missing or the user does not exist in the database.
    """
    if not session_user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = int(session_user_id)
    except (ValueError, TypeError):
        logger.warning("Invalid session_user_id cookie value — not an integer")
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning(f"session_user_id={user_id} not found in database")
        raise HTTPException(status_code=401, detail="User not found")

    return user

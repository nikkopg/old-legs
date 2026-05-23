"""
FastAPI shared dependencies.

Provides reusable dependency functions for route handlers.
"""

import logging

from fastapi import Cookie, Depends, HTTPException
from itsdangerous import BadSignature, SignatureExpired
from sqlalchemy.orm import Session

from config import settings
from models.user import User
from services.database import get_db

logger = logging.getLogger(__name__)

_SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days in seconds


def get_current_user(
    session_user_id: str = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: resolve the current authenticated user from session cookie.

    The session cookie `session_user_id` is a signed token issued by the OAuth
    callback handler. The signature is verified on every request using SECRET_KEY.

    Args:
        session_user_id: Signed value of the `session_user_id` httpOnly cookie.
        db: Database session.

    Returns:
        The authenticated User ORM object.

    Raises:
        401: If the cookie is missing, signature invalid, expired, or user not found.
    """
    if not session_user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = settings.get_session_signer().loads(session_user_id, max_age=_SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        logger.warning("Invalid or expired session cookie")
        raise HTTPException(status_code=401, detail="Not authenticated")
    except Exception:
        logger.warning("Failed to verify session cookie")
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.warning("Session cookie user_id not found in database")
        raise HTTPException(status_code=401, detail="User not found")

    return user

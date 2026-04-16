"""
Encryption utilities for Strava tokens at rest.

Uses Fernet (symmetric encryption) from the cryptography library.
Tokens are NEVER logged — only encrypted bytes are stored in the DB.
"""

import base64
import os
import logging

from cryptography.fernet import Fernet
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class EncryptionSettings(BaseSettings):
    """Fernet key loaded from environment. Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" """
    model_config = ConfigDict(env_file=".env", extra="allow")

    fernet_key: str | None = None


_encryption_settings = EncryptionSettings()
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = _encryption_settings.fernet_key
        if not key:
            # Auto-generate a key for local dev (not suitable for production)
            logger.warning("FERNET_KEY not set — generating ephemeral key for development only. DO NOT use this in production.")
            key = Fernet.generate_key().decode()
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext string (e.g. Strava access token). Returns base64-encoded ciphertext."""
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to plaintext."""
    fernet = _get_fernet()
    return fernet.decrypt(ciphertext.encode()).decode()
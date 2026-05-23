"""
Encryption utilities for Strava tokens at rest.

Uses Fernet (symmetric encryption) from the cryptography library.
Tokens are NEVER logged — only encrypted bytes are stored in the DB.
"""

import logging

from cryptography.fernet import Fernet, InvalidToken

from config import settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.fernet_key
        if not key:
            raise RuntimeError(
                "FERNET_KEY is not set. Generate one with:\n"
                "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"\n"
                "Then add FERNET_KEY=<value> to your .env file."
            )
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext string (e.g. Strava access token). Returns base64-encoded ciphertext."""
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to plaintext."""
    fernet = _get_fernet()
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError(
            "Token decryption failed — token may be corrupted or encrypted with a different FERNET_KEY"
        ) from exc
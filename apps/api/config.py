"""
Central application configuration — reads from environment / .env file.

All configurable values live here. Import `settings` anywhere in the app
instead of calling os.getenv() directly.
"""

import os
from dotenv import load_dotenv

# Load .env early so class-level os.getenv() calls (executed at import time)
# always see the correct values, regardless of whether the caller has already
# called load_dotenv() themselves.
load_dotenv()


class Settings:
    strava_client_id: str = os.getenv("STRAVA_CLIENT_ID", "")
    strava_client_secret: str = os.getenv("STRAVA_CLIENT_SECRET", "")
    strava_redirect_uri: str = os.getenv("STRAVA_REDIRECT_URI", "http://localhost:8000/auth/strava/callback")

    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./oldlegs.db")
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    secret_key: str = os.getenv("SECRET_KEY", "")

    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "")

    def get_ollama_model(self) -> str:
        model = self.ollama_model
        if not model:
            raise RuntimeError(
                "OLLAMA_MODEL is not set. Add it to your .env file, e.g.: OLLAMA_MODEL=llama3"
            )
        return model


settings = Settings()

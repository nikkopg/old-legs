"""
Central application configuration — reads from environment / .env file.

All configurable values live here. Import `settings` anywhere in the app
instead of calling os.getenv() directly.
"""

from pydantic import ConfigDict, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    # Strava OAuth
    strava_client_id: str = ""
    strava_client_secret: str = ""
    strava_redirect_uri: str = "http://localhost:8000/auth/strava/callback"

    # Database
    database_url: str = "sqlite:///./oldlegs.db"
    echo_sql: bool = False

    # App
    frontend_url: str = "http://localhost:3000"
    secret_key: str = ""
    api_port: int = 8000
    cors_origin: str = "http://localhost:3000"

    # Cookies — set COOKIE_SECURE=false for local dev (HTTP)
    cookie_secure: bool = True

    # Fernet encryption key for Strava tokens at rest
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    fernet_key: str | None = None

    @field_validator("strava_client_secret")
    @classmethod
    def validate_strava_client_secret(cls, v: str) -> str:
        if not v:
            raise ValueError(
                "STRAVA_CLIENT_SECRET is not set. "
                "Get it from your Strava API app at https://www.strava.com/settings/api"
            )
        return v

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v:
            raise ValueError(
                "SECRET_KEY is not set. Generate one with: "
                'python -c "import secrets; print(secrets.token_hex(32))"'
            )
        return v

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = ""

    def get_session_signer(self):
        from itsdangerous import URLSafeTimedSerializer
        if not self.secret_key:
            raise RuntimeError(
                "SECRET_KEY is not set. Generate one with: "
                "python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return URLSafeTimedSerializer(self.secret_key, salt="session")

    def get_ollama_model(self) -> str:
        if not self.ollama_model:
            raise RuntimeError(
                "OLLAMA_MODEL is not set. Add it to your .env file, e.g.: OLLAMA_MODEL=llama3"
            )
        return self.ollama_model


settings = Settings()

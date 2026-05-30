from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class WatchIntegration(Base):
    """
    Per-user, per-platform watch integration credentials.

    credentials_encrypted: Fernet-encrypted JSON blob, shape is platform-specific.
      Garmin: {"email": "...", "password": "..."}
    session_token_encrypted: optional cached session token to avoid re-auth on every sync.
    """

    __tablename__ = "watch_integrations"
    __table_args__ = (UniqueConstraint("user_id", "platform", name="uq_watch_user_platform"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(64))

    credentials_encrypted: Mapped[str] = mapped_column(String, nullable=False)
    session_token_encrypted: Mapped[str | None] = mapped_column(String, nullable=True)
    session_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(String, nullable=True)
    last_synced_plan_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship("User", back_populates="watch_integrations", passive_deletes=True)

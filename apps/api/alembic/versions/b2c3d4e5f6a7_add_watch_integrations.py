"""add watch_integrations table

Revision ID: b2c3d4e5f6a7
Revises: a3b4c5d6e7f8
Create Date: 2026-05-28 00:00:00.000000

Adds watch_integrations table for per-user, per-platform watch sync credentials.
Supports Garmin Connect (v1) and future platforms (Polar, Coros, etc.) without
schema changes — credentials_encrypted stores a Fernet-encrypted JSON blob whose
shape is platform-specific.
"""

from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "watch_integrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("platform", sa.String(64), nullable=False),
        sa.Column("credentials_encrypted", sa.String(), nullable=False),
        sa.Column("session_token_encrypted", sa.String(), nullable=True),
        sa.Column("session_expires_at", sa.DateTime(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "platform", name="uq_watch_user_platform"),
    )


def downgrade() -> None:
    op.drop_table("watch_integrations")

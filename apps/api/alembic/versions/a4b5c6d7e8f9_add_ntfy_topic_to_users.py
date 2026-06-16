"""T4: add ntfy_topic to users

Revision ID: a4b5c6d7e8f9
Revises: f5a6b7c8d9e0
Create Date: 2026-05-31 00:00:00.000000

Adds the optional ntfy_topic column to the users table.
When set, the scheduler sends a push notification via ntfy.sh (or a
self-hosted instance) after each automatically generated plan or review.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ntfy_topic", sa.String(256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "ntfy_topic")

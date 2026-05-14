"""add available_days to users

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-05-14 00:00:00.000000

Adds `available_days` (JSON, nullable) to the users table.

This replaces the integer `days_available` field for new users. Old users who
have not re-saved their preferences retain their count in `days_available`.
Both fields coexist so no data is lost and no back-fill is required.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('available_days', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'available_days')

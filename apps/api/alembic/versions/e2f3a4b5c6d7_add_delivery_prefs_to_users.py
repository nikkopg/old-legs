"""add delivery preferences to users

Revision ID: e2f3a4b5c6d7
Revises: d5e6f7a8b9c0
Create Date: 2026-05-14 00:00:00.000000

Adds two boolean delivery preference toggle columns to the users table:
  - auto_plan_enabled   — send the weekly plan automatically on Monday 05:00 WIB
  - auto_review_enabled — send the weekly review automatically on Sunday 20:00 WIB

Both default to True so all existing users opt in automatically.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('auto_plan_enabled', sa.Boolean(), nullable=False, server_default='true'),
    )
    op.add_column(
        'users',
        sa.Column('auto_review_enabled', sa.Boolean(), nullable=False, server_default='true'),
    )


def downgrade() -> None:
    op.drop_column('users', 'auto_review_enabled')
    op.drop_column('users', 'auto_plan_enabled')

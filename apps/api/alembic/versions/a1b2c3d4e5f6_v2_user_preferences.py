"""
v2 user preferences: rename weekly_km_goal to weekly_km_target, add onboarding_completed

Revision ID: a1b2c3d4e5f6
Revises: 3e7eb70ea298
Create Date: 2026-04-19 00:00:00.000000

Changes:
  - Rename users.weekly_km_goal → users.weekly_km_target
    Reason: api-spec-v2 uses weekly_km_target consistently. The model was renamed
    to match the API contract (TASK-101 / DEC-012).
  - Add users.onboarding_completed (Boolean, default False)
    Reason: PRD-v2 F2 — needed to gate onboarding flow for first-time users.
    Without this flag there is no reliable way to know whether a user has
    completed onboarding independent of whether preference fields are set.
"""

# READY FOR QA
# Feature: v2 User preference columns (TASK-101)
# What was built:
#   - Renamed column weekly_km_goal → weekly_km_target on users table
#   - Added onboarding_completed Boolean column (default False) to users table
# Edge cases to test:
#   - Upgrade on an existing DB with users already in it — existing rows get
#     onboarding_completed=False and weekly_km_target carries over the old value
#   - Downgrade restores weekly_km_goal and drops onboarding_completed cleanly
#   - SQLite does not support ALTER COLUMN rename natively — migration uses
#     batch mode (op.batch_alter_table) which recreates the table; safe for dev
#   - PostgreSQL handles both ops natively via batch mode as well

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3e7eb70ea298'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use batch mode for SQLite compatibility (SQLite does not support
    # ALTER TABLE ... RENAME COLUMN or ADD COLUMN with constraints natively).
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Rename weekly_km_goal → weekly_km_target
        batch_op.alter_column(
            'weekly_km_goal',
            new_column_name='weekly_km_target',
            existing_type=sa.Float(),
            existing_nullable=False,
        )
        # Add onboarding_completed — default False so existing users are
        # not treated as having completed onboarding.
        batch_op.add_column(
            sa.Column(
                'onboarding_completed',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('onboarding_completed')
        batch_op.alter_column(
            'weekly_km_target',
            new_column_name='weekly_km_goal',
            existing_type=sa.Float(),
            existing_nullable=False,
        )

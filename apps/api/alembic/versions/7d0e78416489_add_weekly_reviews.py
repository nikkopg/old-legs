"""
add weekly_reviews table

Revision ID: 7d0e78416489
Revises: 3e7eb70ea298
Create Date: 2026-04-19 00:00:00.000000

"""
# READY FOR QA
# Feature: WeeklyReview DB migration (TASK-104)
# What was built: Creates weekly_reviews table with FK to users, indexes on user_id and week_start_date
# Edge cases to test:
#   - Migration runs cleanly on top of the initial migration (3e7eb70ea298)
#   - Downgrade drops the table cleanly without affecting existing tables
#   - Foreign key to users.id is enforced (insert with unknown user_id must fail)
#   - Indexes on user_id and week_start_date are created correctly

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d0e78416489'
down_revision: Union[str, None] = '3e7eb70ea298'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'weekly_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('week_start_date', sa.Date(), nullable=False),
        sa.Column('planned_runs', sa.Integer(), nullable=False),
        sa.Column('actual_runs', sa.Integer(), nullable=False),
        sa.Column('review_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_weekly_reviews_user_id'), 'weekly_reviews', ['user_id'], unique=False)
    op.create_index(op.f('ix_weekly_reviews_week_start_date'), 'weekly_reviews', ['week_start_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_weekly_reviews_week_start_date'), table_name='weekly_reviews')
    op.drop_index(op.f('ix_weekly_reviews_user_id'), table_name='weekly_reviews')
    op.drop_table('weekly_reviews')

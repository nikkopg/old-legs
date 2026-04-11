"""
initial

Revision ID: 3e7eb70ea298
Revises:
Create Date: 2026-04-11 14:29:31.555154

"""
# READY FOR QA
# Feature: Database models + Alembic migrations
# What was built: Complete migration creating users, activities, training_plans, chat_messages tables
# Edge cases to test:
#   - Migration runs cleanly on empty database (SQLite for dev)
#   - Migration is idempotent (downgrade + upgrade works)
#   - All constraints created: unique, foreign key, indexes on key fields
#   - Tables match SQLAlchemy model definitions exactly

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e7eb70ea298'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('strava_athlete_id', sa.String(length=64), nullable=True),
        sa.Column('strava_access_token', sa.String(length=512), nullable=False),
        sa.Column('strava_refresh_token', sa.String(length=512), nullable=False),
        sa.Column('strava_token_expires_at', sa.DateTime(), nullable=False),
        sa.Column('name', sa.String(length=256), nullable=False),
        sa.Column('avatar_url', sa.String(length=512), nullable=True),
        sa.Column('weekly_km_goal', sa.Float(), nullable=False),
        sa.Column('days_available', sa.Integer(), nullable=False),
        sa.Column('biggest_struggle', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('strava_athlete_id')
    )
    op.create_index(op.f('ix_users_strava_athlete_id'), 'users', ['strava_athlete_id'], unique=False)

    # Create activities table
    op.create_table(
        'activities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('strava_activity_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=512), nullable=False),
        sa.Column('distance_km', sa.Float(), nullable=False),
        sa.Column('moving_time_seconds', sa.Integer(), nullable=False),
        sa.Column('average_pace_min_per_km', sa.Float(), nullable=False),
        sa.Column('average_hr', sa.Integer(), nullable=True),
        sa.Column('max_hr', sa.Integer(), nullable=True),
        sa.Column('elevation_gain_m', sa.Integer(), nullable=False),
        sa.Column('activity_date', sa.DateTime(), nullable=False),
        sa.Column('analysis', sa.Text(), nullable=True),
        sa.Column('analysis_generated_at', sa.DateTime(), nullable=True),
        sa.Column('sync_status', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('strava_activity_id')
    )
    op.create_index(op.f('ix_activities_user_id'), 'activities', ['user_id'], unique=False)
    op.create_index(op.f('ix_activities_strava_activity_id'), 'activities', ['strava_activity_id'], unique=False)
    op.create_index(op.f('ix_activities_activity_date'), 'activities', ['activity_date'], unique=False)

    # Create training_plans table
    op.create_table(
        'training_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('week_start_date', sa.Date(), nullable=False),
        sa.Column('plan_data', sa.JSON(), nullable=False),
        sa.Column('pak_har_notes', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_training_plans_user_id'), 'training_plans', ['user_id'], unique=False)
    op.create_index(op.f('ix_training_plans_week_start_date'), 'training_plans', ['week_start_date'], unique=False)
    op.create_index(op.f('ix_training_plans_is_active'), 'training_plans', ['is_active'], unique=False)

    # Create chat_messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tokens_used', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_messages_user_id'), 'chat_messages', ['user_id'], unique=False)
    op.create_index(op.f('ix_chat_messages_role'), 'chat_messages', ['role'], unique=False)
    op.create_index(op.f('ix_chat_messages_created_at'), 'chat_messages', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_table('chat_messages')
    op.drop_table('training_plans')
    op.drop_table('activities')
    op.drop_table('users')

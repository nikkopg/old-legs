"""add headline verdict to weekly review

Revision ID: f4a5b6c7d8e9
Revises: e2f3a4b5c6d7
Create Date: 2026-05-14 00:00:00.000000

Adds three nullable columns to weekly_reviews for structured verdict output:
  - headline    — one-sentence weekly summary in Pak Har voice (12 words or fewer)
  - verdict_tag — fixed-set weekly tag stamp
                  (STRONG WEEK | ON PLAN | BUILDING | LIGHT WEEK | FADING |
                   MISSED RUNS | CONSISTENT | NO RUNS)
  - tone        — sentiment classification: critical | good | neutral

All three are nullable — existing rows retain NULL until a new review is generated.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('weekly_reviews', sa.Column('headline', sa.String(), nullable=True))
    op.add_column('weekly_reviews', sa.Column('verdict_tag', sa.String(), nullable=True))
    op.add_column('weekly_reviews', sa.Column('tone', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('weekly_reviews', 'tone')
    op.drop_column('weekly_reviews', 'verdict_tag')
    op.drop_column('weekly_reviews', 'headline')

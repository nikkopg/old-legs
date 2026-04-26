"""add hr fields to users

Revision ID: f3a8b1c29d4e
Revises: 45cea3127645
Create Date: 2026-04-26 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a8b1c29d4e'
down_revision: Union[str, None] = '45cea3127645'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('resting_hr', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('max_hr_observed', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'max_hr_observed')
    op.drop_column('users', 'resting_hr')

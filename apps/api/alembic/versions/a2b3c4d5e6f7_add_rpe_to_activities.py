"""add rpe to activities

Revision ID: a2b3c4d5e6f7
Revises: e1f9d71fd3f0
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'e1f9d71fd3f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('activities', sa.Column('rpe', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('activities', 'rpe')

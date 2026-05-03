"""add splits to activities

Revision ID: c3d4e5f6a7b8
Revises: a7f3c9b04d12
Create Date: 2026-04-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'a7f3c9b04d12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('activities', sa.Column('splits', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('activities', 'splits')

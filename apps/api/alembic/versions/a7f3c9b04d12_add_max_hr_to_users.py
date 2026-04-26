"""add max_hr to users

Revision ID: a7f3c9b04d12
Revises: f3a8b1c29d4e
Create Date: 2026-04-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7f3c9b04d12'
down_revision: Union[str, None] = 'f3a8b1c29d4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('max_hr', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'max_hr')

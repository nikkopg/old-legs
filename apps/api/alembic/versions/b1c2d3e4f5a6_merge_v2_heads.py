"""merge v2 heads

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6, 7d0e78416489
Create Date: 2026-04-19

"""
from typing import Sequence, Union

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str]] = ('a1b2c3d4e5f6', '7d0e78416489')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

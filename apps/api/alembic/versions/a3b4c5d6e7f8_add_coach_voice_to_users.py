"""add coach_voice to users

Revision ID: a3b4c5d6e7f8
Revises: f4a5b6c7d8e9
Create Date: 2026-05-15 00:00:00.000000

Adds coach_voice column to the users table.
Controls how blunt Pak Har's responses are.
Values: "gentle" | "standard" | "unfiltered"
server_default="standard" ensures existing rows get the default value without a data migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'coach_voice',
            sa.String(16),
            nullable=False,
            server_default='standard',
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'coach_voice')

"""watch_integrations: add ON DELETE CASCADE + last_synced_plan_id

Revision ID: d6e7f8a9b0c1
Revises: b2c3d4e5f6a7
Create Date: 2026-05-30 00:00:00.000000

Two changes:
1. user_id FK gains ON DELETE CASCADE — deleting a user now removes their
   watch integrations instead of raising a FK constraint violation.
2. last_synced_plan_id (nullable int) — tracks which plan was last pushed
   to this integration so the service layer can skip duplicate syncs.
"""

from alembic import op
import sqlalchemy as sa

revision = "d6e7f8a9b0c1"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("watch_integrations", schema=None) as batch_op:
        # Re-create FK with ON DELETE CASCADE
        batch_op.drop_constraint("watch_integrations_user_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "watch_integrations_user_id_fkey",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        # Dedup column — nullable, no default needed (NULL means never synced)
        batch_op.add_column(sa.Column("last_synced_plan_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("watch_integrations", schema=None) as batch_op:
        batch_op.drop_column("last_synced_plan_id")
        batch_op.drop_constraint("watch_integrations_user_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "watch_integrations_user_id_fkey",
            "users",
            ["user_id"],
            ["id"],
        )

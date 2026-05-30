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
    # Use raw ALTER TABLE — batch mode does a full table rebuild which hangs on
    # PostgreSQL when the existing FK name doesn't match the migration's assumption.
    # The actual constraint name in the DB is fk_watch_integrations_user_id_users.
    op.drop_constraint("fk_watch_integrations_user_id_users", "watch_integrations", type_="foreignkey")
    op.create_foreign_key(
        "fk_watch_integrations_user_id_users",
        "watch_integrations",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column("watch_integrations", sa.Column("last_synced_plan_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("watch_integrations", "last_synced_plan_id")
    op.drop_constraint("fk_watch_integrations_user_id_users", "watch_integrations", type_="foreignkey")
    op.create_foreign_key(
        "fk_watch_integrations_user_id_users",
        "watch_integrations",
        "users",
        ["user_id"],
        ["id"],
    )

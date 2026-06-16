"""T1+T2: timezone fields + available_days backfill

Revision ID: f5a6b7c8d9e0
Revises: d6e7f8a9b0c1
Create Date: 2026-05-31 00:00:00.000000

Two tasks in one migration:

T2 — Backfill available_days for existing users where it is NULL.
Maps the integer days_available value to a canonical JSON list of day names
so all new code can read available_days unconditionally.

Mapping:
  0 / NULL → ["Monday","Wednesday","Friday"]  (safe default)
  1        → ["Monday"]
  2        → ["Monday","Thursday"]
  3        → ["Monday","Wednesday","Friday"]
  4        → ["Monday","Tuesday","Thursday","Saturday"]
  5        → ["Monday","Tuesday","Wednesday","Thursday","Friday"]
  6        → ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  7        → ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]

T1 — Add three new columns to users:
  timezone          VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta'
  last_auto_plan_at  DATETIME   NULLABLE
  last_auto_review_at DATETIME  NULLABLE
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DAYS_MAP: dict[int, list[str]] = {
    1: ["Monday"],
    2: ["Monday", "Thursday"],
    3: ["Monday", "Wednesday", "Friday"],
    4: ["Monday", "Tuesday", "Thursday", "Saturday"],
    5: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    7: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
}
_DEFAULT_DAYS = _DAYS_MAP[3]  # safe default for 0 / NULL


def upgrade() -> None:
    # ------------------------------------------------------------------
    # T1 — Add timezone + scheduler timestamp columns
    # ------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "timezone",
            sa.String(64),
            nullable=False,
            server_default="Asia/Jakarta",
        ),
    )
    op.add_column(
        "users",
        sa.Column("last_auto_plan_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_auto_review_at", sa.DateTime(), nullable=True),
    )

    # ------------------------------------------------------------------
    # T2 — Backfill available_days for rows where it is NULL
    # ------------------------------------------------------------------
    # Use a connection-level operation so we can read + update rows.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, days_available FROM users WHERE available_days IS NULL")
    ).fetchall()

    for row_id, days_int in rows:
        # Coerce NULL / 0 / out-of-range to default
        days_list = _DAYS_MAP.get(days_int or 0, _DEFAULT_DAYS)
        conn.execute(
            sa.text(
                "UPDATE users SET available_days = :val WHERE id = :uid"
            ),
            {"val": json.dumps(days_list), "uid": row_id},
        )


def downgrade() -> None:
    # Remove T1 columns (available_days backfill is intentionally not rolled back)
    op.drop_column("users", "last_auto_review_at")
    op.drop_column("users", "last_auto_plan_at")
    op.drop_column("users", "timezone")

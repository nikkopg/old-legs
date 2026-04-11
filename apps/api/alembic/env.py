"""
Alembic migration environment configuration.

This file is used by Alembic to generate and run migrations.
It imports the Base model and configures the database connection.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Import Base and ALL models — all models must be imported so their tables are registered
from models.base import Base
from models.user import User  # noqa: F401
from models.activity import Activity  # noqa: F401
from models.training_plan import TrainingPlan  # noqa: F401
from models.chat_message import ChatMessage  # noqa: F401

# Alembic Config object — loaded from alembic.ini
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Ensure the sqlalchemy.url is set from alembic.ini
# (it is already set there under [alembic] → sqlalchemy.url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generates SQL without a live DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — uses a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()

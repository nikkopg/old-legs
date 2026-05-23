"""
Database session management.

Provides get_db() dependency for FastAPI routes and Alembic env.py.
"""

import logging
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from config import settings

logger = logging.getLogger(__name__)

# Engine is created once at module load — reuse across requests
engine = create_engine(
    settings.database_url,
    echo=settings.echo_sql,
    pool_pre_ping=True,  # validates connections before use
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session.

    Ensures the session is closed after each request.
    Usage in routes:
        @app.get("/items")
        def list_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

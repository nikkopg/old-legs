"""
Common Pydantic schemas used across the API.

- ErrorResponse: consistent error envelope
- PaginatedResponse: wrapper for list endpoints
"""

from typing import Generic, TypeVar, list
from pydantic import BaseModel

T = TypeVar("T")


class ErrorResponse(BaseModel):
    """Consistent error envelope for all API error responses."""
    detail: str
    code: str | None = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Wrapper for paginated list responses."""
    items: list[T]
    total: int
    page: int
    page_size: int
    has_more: bool

"""
Shared validation utilities for database operations.
"""

from typing import List
from ..constants import EMBEDDING_DIMENSION


def validate_embedding_dimension(embedding: List[float]) -> bool:
    """Validate that embedding has correct dimensions."""
    return len(embedding) == EMBEDDING_DIMENSION


def validate_client(client) -> bool:
    """Validate that database client is initialized."""
    return client is not None
"""
Database module for JTBD Assistant Platform.
Simplified modular structure with proper separation of concerns.
"""

from .connection import DatabaseManager, get_database_manager
from .operations import DatabaseOperations

__all__ = [
    'DatabaseManager',
    'get_database_manager', 
    'DatabaseOperations'
]
"""
Core modules for the JTBD Assistant Platform.
Provides database, LLM, embedding, and other essential functionality.
"""

# Core modules
from . import constants
from . import exceptions

# Database modules (new modular structure)
from .database.connection import DatabaseManager as NewDatabaseManager, get_database_manager
from .database.operations import DatabaseOperations

# LLM and embedding modules
from .llm_wrapper import LLMWrapper, initialize_llm, get_llm
from .embeddings import EmbeddingManager, initialize_embedding_manager, get_embedding_manager

# Legacy compatibility
DatabaseManager = NewDatabaseManager
db = get_database_manager()

__all__ = [
    # Constants and exceptions
    'constants',
    'exceptions',
    
    # Database 
    'DatabaseManager',
    'get_database_manager',
    'DatabaseOperations',
    'db',  # Legacy
    
    # LLM
    'LLMWrapper',
    'initialize_llm',
    'get_llm',
    
    # Embeddings
    'EmbeddingManager',
    'initialize_embedding_manager', 
    'get_embedding_manager',
]
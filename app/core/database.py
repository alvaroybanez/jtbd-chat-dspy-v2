"""
Database connection and utilities for JTBD Assistant Platform.
DEPRECATED: This file provides backward compatibility.
Use app.core.database.* modules directly for new code.
"""

import warnings
from typing import Optional, List, Dict, Any, Tuple

# Import from new modular structure
from app.core.database.connection import DatabaseManager as NewDatabaseManager, get_database_manager
from app.core.database.operations import DatabaseOperations

# Backward compatibility warning
warnings.warn(
    "Importing DatabaseManager from app.core.database is deprecated. "
    "Use app.core.database.connection.DatabaseManager instead.",
    DeprecationWarning,
    stacklevel=2
)


class DatabaseManager(NewDatabaseManager):
    """
    DEPRECATED: Legacy DatabaseManager class for backward compatibility.
    
    This class extends the new modular DatabaseManager and adds
    methods from DocumentOperations, EmbeddingOperations, and SearchOperations
    to maintain compatibility with existing code.
    
    For new code, use the modular approach:
    - app.core.database.connection.DatabaseManager
    - app.core.database.documents.DocumentOperations  
    - app.core.database.embeddings.EmbeddingOperations
    - app.core.database.search.SearchOperations
    """

    def __init__(self):
        super().__init__()
        
        # Initialize operations module for backward compatibility
        if self.client:
            self.ops = DatabaseOperations(self.client)

    # === DATABASE OPERATIONS (delegated to ops module) ===
    
    def store_document_with_embedding(self, title: str, content: str, embedding: List[float]) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.store_document_with_embedding instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.store_document_with_embedding(title, content, embedding)

    def store_document_chunks(self, document_id: str, chunks: List[Tuple[int, str, List[float]]]) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.store_document_chunks instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.store_document_chunks(document_id, chunks)

    def update_document_embedding(self, document_id: str, embedding: List[float]) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.update_document_embedding instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.update_document_embedding(document_id, embedding)

    def get_documents_without_embeddings(self) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.get_documents_without_embeddings instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.get_documents_without_embeddings()

    def batch_insert_insights(self, insights: List[Dict[str, Any]]) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.batch_insert_insights instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.batch_insert_insights(insights)

    def get_insights_without_embeddings(self) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.get_insights_without_embeddings instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.get_insights_without_embeddings()

    def batch_insert_jtbds(self, jtbds: List[Dict[str, Any]]) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.batch_insert_jtbds instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.batch_insert_jtbds(jtbds)

    def get_jtbds_without_embeddings(self) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.get_jtbds_without_embeddings instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.get_jtbds_without_embeddings()

    def search_similar_chunks(
        self,
        query_embedding: List[float],
        limit: int = 10,
        similarity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.search_similar_chunks instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.search_similar_chunks(query_embedding, limit, similarity_threshold)

    def search_similar_insights(
        self,
        query_embedding: List[float],
        limit: int = 10,
        similarity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.search_similar_insights instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.search_similar_insights(query_embedding, limit, similarity_threshold)

    def search_similar_jtbds(
        self,
        query_embedding: List[float],
        limit: int = 10,
        similarity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.search_similar_jtbds instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.search_similar_jtbds(query_embedding, limit, similarity_threshold)

    def create_jtbd(
        self, statement: str, context: str = None, outcome: str = None, embedding: List[float] = None
    ) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.create_jtbd instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.create_jtbd(statement, context, outcome, embedding)

    def create_metric(
        self, name: str, current_value: float = None, target_value: float = None, unit: str = None
    ) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.create_metric instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.create_metric(name, current_value, target_value, unit)

    def get_all_metrics(self) -> Dict[str, Any]:
        """DEPRECATED: Use DatabaseOperations.get_all_metrics instead."""
        if not hasattr(self, 'ops') or not self.ops:
            if self.client:
                self.ops = DatabaseOperations(self.client)
            else:
                return {"success": False, "error": "Client not initialized"}
        return self.ops.get_all_metrics()


# Global database manager instance for backward compatibility
db = DatabaseManager()


if __name__ == "__main__":
    """Test the database connection."""
    print("Testing database connection...")

    # Test connection
    result = db.test_connection()
    print(f"Connection test: {result}")

    if result["success"]:
        print("\n✅ Database connection successful!")
        print("Table status:")
        for table, status in result["tables"].items():
            print(f"  {table}: {status}")
    else:
        print(f"\n❌ Database connection failed: {result['error']}")
        print("\nPlease ensure:")
        print("1. SUPABASE_URL is set in your .env file")
        print("2. SUPABASE_KEY (or SUPABASE_SECRET) is set in your .env file")
        print("3. The Supabase project is running")
        print("4. The migration has been applied")
"""
Database connection management for JTBD Assistant Platform.
Handles Supabase client initialization and connection testing.
"""

import os
from typing import Optional, Dict, Any, List, Tuple
from supabase import create_client, Client
from dotenv import load_dotenv

from ..constants import (
    ENV_SUPABASE_URL,
    ENV_SUPABASE_KEY,
    ENV_SUPABASE_URL_ALTERNATIVES,
    ENV_SUPABASE_KEY_ALTERNATIVES,
    TABLE_DOCUMENTS,
    TABLE_DOCUMENT_CHUNKS,
    TABLE_INSIGHTS,
    TABLE_JTBDS,
    TABLE_METRICS,
    TABLE_HMWS,
    TABLE_SOLUTIONS,
    TABLE_LLM_TRACES,
    RPC_SEARCH_CHUNKS,
    EMBEDDING_DIMENSION,
    ERROR_CLIENT_NOT_INITIALIZED,
    ERROR_CONNECTION_FAILED
)
from ..exceptions import (
    ConnectionError,
    ClientNotInitializedError,
    EnvironmentVariableNotFoundError,
    handle_database_exception
)

# Load environment variables
load_dotenv()


class DatabaseManager:
    """Manages Supabase database connections and basic operations."""

    def __init__(self):
        self.client: Optional[Client] = None
        self.ops: Optional['DatabaseOperations'] = None
        self._initialize_client()
        self._initialize_ops()

    def _get_environment_variable(self, primary_name: str, alternatives: list) -> Optional[str]:
        """Get environment variable value trying primary name first, then alternatives."""
        value = os.getenv(primary_name)
        if value:
            return value
            
        for alt_name in alternatives:
            value = os.getenv(alt_name)
            if value:
                return value
                
        return None

    def _initialize_client(self):
        """Initialize Supabase client with proper error handling."""
        url = self._get_environment_variable(ENV_SUPABASE_URL, ENV_SUPABASE_URL_ALTERNATIVES)
        key = self._get_environment_variable(ENV_SUPABASE_KEY, ENV_SUPABASE_KEY_ALTERNATIVES)

        if not url:
            raise EnvironmentVariableNotFoundError(
                ENV_SUPABASE_URL, 
                ENV_SUPABASE_URL_ALTERNATIVES
            )
        
        if not key:
            raise EnvironmentVariableNotFoundError(
                ENV_SUPABASE_KEY,
                ENV_SUPABASE_KEY_ALTERNATIVES
            )

        try:
            self.client = create_client(url, key)
        except Exception as e:
            raise ConnectionError(f"Failed to create Supabase client: {e}")

    def _initialize_ops(self):
        """Initialize DatabaseOperations module for backward compatibility."""
        if self.client:
            from .operations import DatabaseOperations
            self.ops = DatabaseOperations(self.client)

    def test_connection(self) -> Dict[str, Any]:
        """
        Test database connection and verify table structure.
        
        Returns:
            Dict with success status and detailed table information
        """
        if not self.client:
            return ClientNotInitializedError(ERROR_CLIENT_NOT_INITIALIZED).to_dict()

        try:
            # Test basic connection by querying documents table
            self.client.table(TABLE_DOCUMENTS).select("count").limit(0).execute()

            # Test all required tables
            tables = [
                TABLE_DOCUMENTS,
                TABLE_DOCUMENT_CHUNKS,
                TABLE_INSIGHTS,
                TABLE_JTBDS,
                TABLE_METRICS,
                TABLE_HMWS,
                TABLE_SOLUTIONS,
                TABLE_LLM_TRACES,
            ]

            table_results = {}
            for table in tables:
                try:
                    self.client.table(table).select("count").limit(1).execute()
                    table_results[table] = "exists"
                except Exception as e:
                    table_results[table] = f"error: {str(e)}"

            # Test vector search function
            try:
                # Create a test vector with correct dimensions
                test_vector = [0.0] * EMBEDDING_DIMENSION
                self.client.rpc(
                    RPC_SEARCH_CHUNKS, 
                    {"query_embedding": test_vector, "match_count": 1}
                ).execute()
                table_results["search_chunks_function"] = "working"
            except Exception as e:
                table_results["search_chunks_function"] = f"error: {str(e)}"

            return {
                "success": True,
                "tables": table_results,
                "message": "Database connection successful",
            }

        except Exception as e:
            return handle_database_exception(e)

    def insert_test_data(self) -> Dict[str, Any]:
        """
        Insert minimal test data to verify database functionality.
        
        Returns:
            Dict with success status and inserted data information
        """
        if not self.client:
            return ClientNotInitializedError(ERROR_CLIENT_NOT_INITIALIZED).to_dict()

        try:
            # Insert a test document
            doc_response = (
                self.client.table(TABLE_DOCUMENTS)
                .insert({
                    "title": "Test Document",
                    "content": "This is a test document for JTBD Assistant Platform",
                })
                .execute()
            )

            if not doc_response.data:
                return {"success": False, "error": "Failed to insert test document"}

            doc_id = doc_response.data[0]["id"]

            # Insert a test metric
            self.client.table(TABLE_METRICS).insert({
                "name": "User Satisfaction",
                "current_value": 7.5,
                "target_value": 9.0,
                "unit": "rating",
            }).execute()

            # Insert a test JTBD
            self.client.table(TABLE_JTBDS).insert({
                "statement": "When I need to analyze customer feedback, I want to quickly extract insights, so I can make data-driven product decisions",
                "context": "Product management workflow",
                "outcome": "Faster decision making based on customer insights",
            }).execute()

            return {
                "success": True,
                "document_id": doc_id,
                "message": "Test data inserted successfully",
            }

        except Exception as e:
            return handle_database_exception(e)

    def cleanup_test_data(self) -> Dict[str, Any]:
        """
        Clean up test data from all tables.
        
        Returns:
            Dict with success status and cleanup information
        """
        if not self.client:
            return ClientNotInitializedError(ERROR_CLIENT_NOT_INITIALIZED).to_dict()

        try:
            # Clean tables in dependency order
            tables_to_clean = [
                TABLE_SOLUTIONS,
                TABLE_HMWS,
                TABLE_INSIGHTS,
                TABLE_JTBDS,
                TABLE_METRICS,
                TABLE_DOCUMENTS,
                TABLE_LLM_TRACES,
            ]

            cleanup_results = {}
            for table in tables_to_clean:
                try:
                    self.client.table(table).delete().gte(
                        "id", "00000000-0000-0000-0000-000000000000"
                    ).execute()
                    cleanup_results[table] = "cleaned"
                except Exception as e:
                    cleanup_results[table] = f"error: {str(e)}"

            return {
                "success": True, 
                "message": "Test data cleanup completed",
                "tables": cleanup_results
            }

        except Exception as e:
            return handle_database_exception(e)

    def get_client(self) -> Optional[Client]:
        """Get the Supabase client instance."""
        return self.client

    def is_connected(self) -> bool:
        """Check if database connection is active."""
        if not self.client:
            return False
        
        try:
            self.client.table(TABLE_DOCUMENTS).select("count").limit(0).execute()
            return True
        except Exception:
            return False
    
    def store_document_with_embedding(self, title: str, content: str, embedding: List[float]) -> Dict[str, Any]:
        """Store a document with its embedding."""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        try:
            response = (
                self.client.table(TABLE_DOCUMENTS)
                .insert({"title": title, "content": content, "embedding": embedding})
                .execute()
            )
            
            if response.data:
                return {"success": True, "document_id": response.data[0]["id"]}
            else:
                return {"success": False, "error": "No data returned from insert"}
                
        except Exception as e:
            return {"success": False, "error": f"Failed to store document: {str(e)}"}
    
    def store_document_chunks(self, document_id: str, chunks: List[Tuple[int, str, List[float]]]) -> Dict[str, Any]:
        """Store document chunks with embeddings."""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        if not chunks:
            return {"success": False, "error": "No chunks provided"}
            
        try:
            chunk_records = []
            for chunk_index, content, embedding in chunks:
                chunk_records.append({
                    "document_id": document_id,
                    "chunk_index": chunk_index, 
                    "content": content,
                    "embedding": embedding,
                })
                
            response = (
                self.client.table(TABLE_DOCUMENT_CHUNKS).insert(chunk_records).execute()
            )
            
            return {"success": True, "chunks_stored": len(chunk_records)}
            
        except Exception as e:
            return {"success": False, "error": f"Failed to store chunks: {str(e)}"}
    
    def search_similar_chunks(
        self,
        query_embedding: List[float],
        limit: int = 10,
        similarity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """Search for similar document chunks using vector similarity."""
        if self.ops:
            return self.ops.search_similar_chunks(query_embedding, limit, similarity_threshold)
        
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        try:
            response = self.client.rpc(
                RPC_SEARCH_CHUNKS,
                {
                    "query_embedding": query_embedding,
                    "match_count": limit,
                    "similarity_threshold": similarity_threshold,
                },
            ).execute()
            
            return {
                "success": True,
                "results": response.data or [],
                "count": len(response.data) if response.data else 0,
            }
            
        except Exception as e:
            return {"success": False, "error": f"Search failed: {str(e)}"}

    def search_similar_insights(
        self,
        query_embedding: List[float],
        limit: int = 10,
        similarity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """Search for similar insights using vector similarity."""
        if self.ops:
            return self.ops.search_similar_insights(query_embedding, limit, similarity_threshold)
        
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        try:
            response = self.client.rpc(
                "search_insights",
                {
                    "query_embedding": query_embedding,
                    "match_count": limit,
                    "similarity_threshold": similarity_threshold,
                },
            ).execute()
            
            return {
                "success": True,
                "results": response.data or [],
                "count": len(response.data) if response.data else 0,
            }
            
        except Exception as e:
            return {"success": False, "error": f"Search failed: {str(e)}"}

    def search_similar_jtbds(
        self,
        query_embedding: List[float],
        limit: int = 10,
        similarity_threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """Search for similar JTBDs using vector similarity."""
        if self.ops:
            return self.ops.search_similar_jtbds(query_embedding, limit, similarity_threshold)
        
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        try:
            response = self.client.rpc(
                "search_jtbds",
                {
                    "query_embedding": query_embedding,
                    "match_count": limit,
                    "similarity_threshold": similarity_threshold,
                },
            ).execute()
            
            return {
                "success": True,
                "results": response.data or [],
                "count": len(response.data) if response.data else 0,
            }
            
        except Exception as e:
            return {"success": False, "error": f"Search failed: {str(e)}"}

    def create_jtbd(
        self, statement: str, context: str = None, outcome: str = None, embedding: List[float] = None
    ) -> Dict[str, Any]:
        """Create a single JTBD with optional embedding."""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if not statement or not statement.strip():
            return {"success": False, "error": "Statement is required"}

        try:
            jtbd_data = {
                "statement": statement.strip(),
                "context": context.strip() if context else None,
                "outcome": outcome.strip() if outcome else None,
            }
            
            if embedding:
                jtbd_data["embedding"] = embedding

            response = self.client.table(TABLE_JTBDS).insert(jtbd_data).execute()

            if response.data:
                return {"success": True, "jtbd": response.data[0]}
            else:
                return {"success": False, "error": "No data returned from insert"}

        except Exception as e:
            return {"success": False, "error": f"Failed to create JTBD: {str(e)}"}

    def create_metric(
        self, name: str, current_value: float = None, target_value: float = None, unit: str = None
    ) -> Dict[str, Any]:
        """Create a single metric."""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if not name or not name.strip():
            return {"success": False, "error": "Name is required"}

        try:
            metric_data = {
                "name": name.strip(),
                "current_value": current_value,
                "target_value": target_value,
                "unit": unit.strip() if unit else None,
            }

            response = self.client.table(TABLE_METRICS).insert(metric_data).execute()

            if response.data:
                return {"success": True, "metric": response.data[0]}
            else:
                return {"success": False, "error": "No data returned from insert"}

        except Exception as e:
            return {"success": False, "error": f"Failed to create metric: {str(e)}"}

    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all metrics for selection purposes."""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table(TABLE_METRICS)
                .select("id, name, current_value, target_value, unit, created_at")
                .order("created_at", desc=True)
                .execute()
            )

            return {
                "success": True,
                "metrics": response.data or [],
                "count": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to get metrics: {str(e)}"}


# Global database manager instance
_db_manager: Optional[DatabaseManager] = None


def get_database_manager() -> DatabaseManager:
    """Get or create the global database manager instance."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager


# Backward compatibility - global db instance
db = get_database_manager()


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
        print(f"1. {ENV_SUPABASE_URL} is set in your .env file")
        print(f"2. {ENV_SUPABASE_KEY} (service role key) is set in your .env file")
        print("3. The Supabase project is running")
        print("4. The migration has been applied")
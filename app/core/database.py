"""
Database connection and utilities for JTBD Assistant Platform
"""

import os
from typing import Optional, List, Dict, Any, Tuple
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class DatabaseManager:
    """Manages Supabase database connections and operations"""

    def __init__(self):
        self.client: Optional[Client] = None
        self._initialize_client()

    def _initialize_client(self):
        """Initialize Supabase client"""
        # Try multiple possible environment variable names
        url = (
            os.getenv("SUPABASE_URL")
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
            or os.getenv("VITE_SUPABASE_URL")
        )

        key = (
            os.getenv("SUPABASE_KEY")
            or os.getenv("SUPABASE_ANON_KEY")
            or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
            or os.getenv("NEXT_SUPABASE_SECRET")
            or os.getenv("VITE_SUPABASE_ANON_KEY")
        )

        if not url or not key:
            available_vars = [k for k in os.environ.keys() if "SUPABASE" in k.upper()]
            raise ValueError(
                f"Supabase URL and KEY must be set in environment. "
                f"Available Supabase vars: {available_vars}"
            )

        self.client = create_client(url, key)

    def test_connection(self) -> Dict[str, Any]:
        """Test database connection and basic functionality"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            # Test basic connection by querying tables
            response = self.client.table("documents").select("count").limit(0).execute()

            # Test table existence
            tables = [
                "documents",
                "document_chunks",
                "insights",
                "jtbds",
                "metrics",
                "hmws",
                "solutions",
                "llm_traces",
            ]

            results = {}
            for table in tables:
                try:
                    response = (
                        self.client.table(table).select("count").limit(1).execute()
                    )
                    results[table] = "exists"
                except Exception as e:
                    results[table] = f"error: {str(e)}"

            # Test vector search function
            try:
                # Create a dummy vector for testing (1536 dimensions of zeros)
                test_vector = [0.0] * 1536
                response = self.client.rpc(
                    "search_chunks", {"query_embedding": test_vector, "match_count": 1}
                ).execute()
                results["search_chunks_function"] = "working"
            except Exception as e:
                results["search_chunks_function"] = f"error: {str(e)}"

            return {
                "success": True,
                "tables": results,
                "message": "Database connection successful",
            }

        except Exception as e:
            return {"success": False, "error": f"Connection failed: {str(e)}"}

    def insert_test_data(self) -> Dict[str, Any]:
        """Insert minimal test data to verify functionality"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            # Insert a test document
            doc_response = (
                self.client.table("documents")
                .insert(
                    {
                        "title": "Test Document",
                        "content": "This is a test document for JTBD Assistant Platform",
                    }
                )
                .execute()
            )

            if not doc_response.data:
                return {"success": False, "error": "Failed to insert test document"}

            doc_id = doc_response.data[0]["id"]

            # Insert a test metric
            metric_response = (
                self.client.table("metrics")
                .insert(
                    {
                        "name": "User Satisfaction",
                        "current_value": 7.5,
                        "target_value": 9.0,
                        "unit": "rating",
                    }
                )
                .execute()
            )

            # Insert a test JTBD
            jtbd_response = (
                self.client.table("jtbds")
                .insert(
                    {
                        "statement": "When I need to analyze customer feedback, I want to quickly extract insights, so I can make data-driven product decisions",
                        "context": "Product management workflow",
                        "outcome": "Faster decision making based on customer insights",
                    }
                )
                .execute()
            )

            return {
                "success": True,
                "document_id": doc_id,
                "message": "Test data inserted successfully",
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to insert test data: {str(e)}"}

    def cleanup_test_data(self) -> Dict[str, Any]:
        """Clean up test data"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            # Delete test data
            tables_to_clean = [
                "solutions",
                "hmws",
                "insights",
                "jtbds",
                "metrics",
                "documents",
                "llm_traces",
            ]

            for table in tables_to_clean:
                try:
                    self.client.table(table).delete().gte(
                        "id", "00000000-0000-0000-0000-000000000000"
                    ).execute()
                except Exception as e:
                    print(f"Note: Could not clean {table}: {str(e)}")

            return {"success": True, "message": "Test data cleaned up"}

        except Exception as e:
            return {"success": False, "error": f"Cleanup failed: {str(e)}"}

    # === EMBEDDING METHODS ===

    def store_document_with_embedding(
        self, title: str, content: str, embedding: List[float]
    ) -> Dict[str, Any]:
        """
        Store a document with its embedding.

        Args:
            title: Document title
            content: Document content
            embedding: 1536-dimension embedding vector

        Returns:
            Dict with success status and document ID
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if len(embedding) != 1536:
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(embedding)}",
            }

        try:
            response = (
                self.client.table("documents")
                .insert({"title": title, "content": content, "embedding": embedding})
                .execute()
            )

            if response.data:
                return {"success": True, "document_id": response.data[0]["id"]}
            else:
                return {"success": False, "error": "No data returned from insert"}

        except Exception as e:
            return {"success": False, "error": f"Failed to store document: {str(e)}"}

    def store_document_chunks(
        self, document_id: str, chunks: List[Tuple[int, str, List[float]]]
    ) -> Dict[str, Any]:
        """
        Store document chunks with embeddings.

        Args:
            document_id: UUID of the parent document
            chunks: List of (chunk_index, content, embedding) tuples

        Returns:
            Dict with success status and chunk count
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if not chunks:
            return {"success": False, "error": "No chunks provided"}

        try:
            chunk_records = []
            for chunk_index, content, embedding in chunks:
                if len(embedding) != 1536:
                    return {
                        "success": False,
                        "error": f"Invalid embedding dimension: {len(embedding)}",
                    }

                chunk_records.append(
                    {
                        "document_id": document_id,
                        "chunk_index": chunk_index,
                        "content": content,
                        "embedding": embedding,
                    }
                )

            response = (
                self.client.table("document_chunks").insert(chunk_records).execute()
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
        """
        Search for similar document chunks using vector similarity.

        Args:
            query_embedding: 1536-dimension query embedding
            limit: Maximum number of results
            similarity_threshold: Minimum similarity score

        Returns:
            Dict with success status and similar chunks
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if len(query_embedding) != 1536:
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(query_embedding)}",
            }

        try:
            response = self.client.rpc(
                "search_chunks",
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
        """
        Search for similar insights using vector similarity.

        Args:
            query_embedding: 1536-dimension query embedding
            limit: Maximum number of results
            similarity_threshold: Minimum similarity score

        Returns:
            Dict with success status and similar insights
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if len(query_embedding) != 1536:
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(query_embedding)}",
            }

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
        """
        Search for similar JTBDs using vector similarity.

        Args:
            query_embedding: 1536-dimension query embedding
            limit: Maximum number of results
            similarity_threshold: Minimum similarity score

        Returns:
            Dict with success status and similar JTBDs
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if len(query_embedding) != 1536:
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(query_embedding)}",
            }

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

    def update_document_embedding(
        self, document_id: str, embedding: List[float]
    ) -> Dict[str, Any]:
        """
        Update a document's embedding vector.

        Args:
            document_id: UUID of the document
            embedding: New 1536-dimension embedding

        Returns:
            Dict with success status
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if len(embedding) != 1536:
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(embedding)}",
            }

        try:
            response = (
                self.client.table("documents")
                .update({"embedding": embedding})
                .eq("id", document_id)
                .execute()
            )

            return {
                "success": True,
                "updated": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to update embedding: {str(e)}"}

    def batch_insert_insights(self, insights: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Insert multiple insights in batch.

        Args:
            insights: List of insight dictionaries with description, document_id, embedding

        Returns:
            Dict with success status and insert count
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if not insights:
            return {"success": False, "error": "No insights provided"}

        # Validate embeddings
        for insight in insights:
            if "embedding" in insight and len(insight["embedding"]) != 1536:
                return {
                    "success": False,
                    "error": f"Invalid embedding dimension: {len(insight['embedding'])}",
                }

        try:
            response = self.client.table("insights").insert(insights).execute()

            return {
                "success": True,
                "insights_stored": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to insert insights: {str(e)}"}

    def batch_insert_jtbds(self, jtbds: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Insert multiple JTBDs in batch.

        Args:
            jtbds: List of JTBD dictionaries with statement, context, outcome, embedding

        Returns:
            Dict with success status and insert count
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        if not jtbds:
            return {"success": False, "error": "No JTBDs provided"}

        # Validate embeddings
        for jtbd in jtbds:
            if "embedding" in jtbd and len(jtbd["embedding"]) != 1536:
                return {
                    "success": False,
                    "error": f"Invalid embedding dimension: {len(jtbd['embedding'])}",
                }

        try:
            response = self.client.table("jtbds").insert(jtbds).execute()

            return {
                "success": True,
                "jtbds_stored": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to insert JTBDs: {str(e)}"}

    def get_documents_without_embeddings(self) -> Dict[str, Any]:
        """
        Get documents that don't have embeddings yet.

        Returns:
            Dict with success status and documents
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table("documents")
                .select("id, title, content")
                .is_("embedding", "null")
                .execute()
            )

            return {
                "success": True,
                "documents": response.data or [],
                "count": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to get documents: {str(e)}"}

    def get_insights_without_embeddings(self) -> Dict[str, Any]:
        """
        Get insights that don't have embeddings yet.

        Returns:
            Dict with success status and insights
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table("insights")
                .select("id, description, document_id")
                .is_("embedding", "null")
                .execute()
            )

            return {
                "success": True,
                "insights": response.data or [],
                "count": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to get insights: {str(e)}"}

    def get_jtbds_without_embeddings(self) -> Dict[str, Any]:
        """
        Get JTBDs that don't have embeddings yet.

        Returns:
            Dict with success status and JTBDs
        """
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table("jtbds")
                .select("id, statement, context, outcome")
                .is_("embedding", "null")
                .execute()
            )

            return {
                "success": True,
                "jtbds": response.data or [],
                "count": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to get JTBDs: {str(e)}"}


# Create global database manager instance
db = DatabaseManager()

if __name__ == "__main__":
    """Test the database connection"""
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
        print("2. SUPABASE_KEY is set in your .env file")
        print("3. The Supabase project is running")
        print("4. The migration has been applied")

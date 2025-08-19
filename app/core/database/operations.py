"""
Database operations for JTBD Assistant Platform.
Contains only the operations that were in the original database.py file.
"""

from typing import List, Dict, Any, Tuple
from supabase import Client

from ..constants import (
    TABLE_DOCUMENTS,
    TABLE_DOCUMENT_CHUNKS,
    TABLE_INSIGHTS,
    TABLE_JTBDS,
    RPC_SEARCH_CHUNKS,
    RPC_SEARCH_INSIGHTS,
    RPC_SEARCH_JTBDS,
    EMBEDDING_DIMENSION,
    DEFAULT_SIMILARITY_THRESHOLD,
    DEFAULT_SEARCH_LIMIT
)
from .validators import validate_embedding_dimension, validate_client


class DatabaseOperations:
    """Handles all database operations from the original database.py file."""

    def __init__(self, client: Client):
        self.client = client

    def store_document_with_embedding(
        self, title: str, content: str, embedding: List[float]
    ) -> Dict[str, Any]:
        """Store a document with its embedding."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not validate_embedding_dimension(embedding):
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(embedding)}",
            }

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

    def store_document_chunks(
        self, document_id: str, chunks: List[Tuple[int, str, List[float]]]
    ) -> Dict[str, Any]:
        """Store document chunks with embeddings."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not chunks:
            return {"success": False, "error": "No chunks provided"}

        try:
            chunk_records = []
            for chunk_index, content, embedding in chunks:
                if not validate_embedding_dimension(embedding):
                    return {
                        "success": False,
                        "error": f"Invalid embedding dimension: {len(embedding)}",
                    }

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
        limit: int = DEFAULT_SEARCH_LIMIT,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> Dict[str, Any]:
        """Search for similar document chunks using vector similarity."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not validate_embedding_dimension(query_embedding):
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(query_embedding)}",
            }

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
        limit: int = DEFAULT_SEARCH_LIMIT,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> Dict[str, Any]:
        """Search for similar insights using vector similarity."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not validate_embedding_dimension(query_embedding):
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(query_embedding)}",
            }

        try:
            response = self.client.rpc(
                RPC_SEARCH_INSIGHTS,
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
        limit: int = DEFAULT_SEARCH_LIMIT,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> Dict[str, Any]:
        """Search for similar JTBDs using vector similarity."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not validate_embedding_dimension(query_embedding):
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(query_embedding)}",
            }

        try:
            response = self.client.rpc(
                RPC_SEARCH_JTBDS,
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
        """Update a document's embedding vector."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not validate_embedding_dimension(embedding):
            return {
                "success": False,
                "error": f"Invalid embedding dimension: {len(embedding)}",
            }

        try:
            response = (
                self.client.table(TABLE_DOCUMENTS)
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
        """Insert multiple insights in batch."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not insights:
            return {"success": False, "error": "No insights provided"}

        # Validate embeddings
        for insight in insights:
            if "embedding" in insight and insight["embedding"]:
                if not validate_embedding_dimension(insight["embedding"]):
                    return {
                        "success": False,
                        "error": f"Invalid embedding dimension: {len(insight['embedding'])}",
                    }

        try:
            response = self.client.table(TABLE_INSIGHTS).insert(insights).execute()

            return {
                "success": True,
                "insights_stored": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to insert insights: {str(e)}"}

    def batch_insert_jtbds(self, jtbds: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Insert multiple JTBDs in batch."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        if not jtbds:
            return {"success": False, "error": "No JTBDs provided"}

        # Validate embeddings
        for jtbd in jtbds:
            if "embedding" in jtbd and jtbd["embedding"]:
                if not validate_embedding_dimension(jtbd["embedding"]):
                    return {
                        "success": False,
                        "error": f"Invalid embedding dimension: {len(jtbd['embedding'])}",
                    }

        try:
            response = self.client.table(TABLE_JTBDS).insert(jtbds).execute()

            return {
                "success": True,
                "jtbds_stored": len(response.data) if response.data else 0,
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to insert JTBDs: {str(e)}"}

    def get_documents_without_embeddings(self) -> Dict[str, Any]:
        """Get documents that don't have embeddings yet."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table(TABLE_DOCUMENTS)
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
        """Get insights that don't have embeddings yet."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table(TABLE_INSIGHTS)
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
        """Get JTBDs that don't have embeddings yet."""
        if not validate_client(self.client):
            return {"success": False, "error": "Client not initialized"}

        try:
            response = (
                self.client.table(TABLE_JTBDS)
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
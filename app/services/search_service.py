"""
Search service for unified vector search across documents, insights, and JTBDs.
Provides a single interface for semantic search using existing database RPC functions.
"""

from typing import Dict, List, Any, Optional, Union
import logging

from ..core.constants import (
    DEFAULT_SIMILARITY_THRESHOLD,
    MAX_SEARCH_RESULTS,
    DEFAULT_SEARCH_LIMIT
)
from ..core.database.connection import get_database_manager
from ..core.embeddings import get_embedding_manager

logger = logging.getLogger(__name__)


class SearchService:
    """Unified search interface for vector search across all content types."""

    def __init__(self, database_manager=None, embedding_manager=None):
        """Initialize search service with database and embedding managers."""
        self.db = database_manager or get_database_manager()
        self.embeddings = embedding_manager or get_embedding_manager()
        
        if not self.db:
            raise ValueError("Database manager is required for SearchService")
        if not self.embeddings:
            raise ValueError("Embedding manager is required for SearchService")

    def search_all_content(
        self,
        query_text: str,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit_per_type: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, Any]:
        """
        Search across all content types (chunks, insights, JTBDs) with a single query.

        Args:
            query_text: Text to search for
            similarity_threshold: Minimum similarity score
            limit_per_type: Maximum results per content type

        Returns:
            Dict with aggregated search results from all content types
        """
        try:
            if not query_text or not query_text.strip():
                return {
                    "success": False,
                    "error": "Query text cannot be empty"
                }

            # Generate embedding for query
            embedding_result = self.embeddings.generate_single_embedding(
                text=query_text, 
                template_key="search_query"
            )
            
            if not embedding_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to generate query embedding: {embedding_result.get('error')}"
                }

            query_embedding = embedding_result["embedding"]

            # Search all content types in parallel
            results = {}
            total_results = 0

            # Search document chunks
            chunk_results = self.search_chunks(
                query_embedding=query_embedding,
                similarity_threshold=similarity_threshold,
                limit=limit_per_type
            )
            if chunk_results["success"]:
                results["chunks"] = chunk_results["results"]
                total_results += len(chunk_results["results"])

            # Search insights
            insight_results = self.search_insights(
                query_embedding=query_embedding,
                similarity_threshold=similarity_threshold,
                limit=limit_per_type
            )
            if insight_results["success"]:
                results["insights"] = insight_results["results"]
                total_results += len(insight_results["results"])

            # Search JTBDs
            jtbd_results = self.search_jtbds(
                query_embedding=query_embedding,
                similarity_threshold=similarity_threshold,
                limit=limit_per_type
            )
            if jtbd_results["success"]:
                results["jtbds"] = jtbd_results["results"]
                total_results += len(jtbd_results["results"])

            # Rank and filter all results together
            ranked_results = self._rank_and_filter_results(
                results, 
                similarity_threshold=similarity_threshold,
                max_results=MAX_SEARCH_RESULTS
            )

            return {
                "success": True,
                "query": query_text,
                "results": ranked_results,
                "total_found": total_results,
                "similarity_threshold": similarity_threshold,
                "from_cache": embedding_result.get("from_cache", False)
            }

        except Exception as e:
            logger.error(f"Search failed: {str(e)}")
            return {
                "success": False,
                "error": f"Search operation failed: {str(e)}"
            }

    def search_chunks(
        self,
        query_embedding: List[float],
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, Any]:
        """
        Search document chunks using vector similarity.

        Args:
            query_embedding: Vector embedding of the search query
            similarity_threshold: Minimum similarity score
            limit: Maximum number of results

        Returns:
            Dict with search results and metadata
        """
        try:
            if not self.db.ops:
                return {
                    "success": False,
                    "error": "Database operations not available"
                }

            result = self.db.ops.search_similar_chunks(
                query_embedding=query_embedding,
                limit=limit,
                similarity_threshold=similarity_threshold
            )

            if result["success"]:
                # Add content type to results for unified handling
                for item in result["results"]:
                    item["content_type"] = "chunk"
                    item["source_type"] = "document"

            return result

        except Exception as e:
            logger.error(f"Chunk search failed: {str(e)}")
            return {
                "success": False,
                "error": f"Chunk search failed: {str(e)}"
            }

    def search_insights(
        self,
        query_embedding: List[float],
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, Any]:
        """
        Search insights using vector similarity.

        Args:
            query_embedding: Vector embedding of the search query
            similarity_threshold: Minimum similarity score
            limit: Maximum number of results

        Returns:
            Dict with search results and metadata
        """
        try:
            if not self.db.ops:
                return {
                    "success": False,
                    "error": "Database operations not available"
                }

            result = self.db.ops.search_similar_insights(
                query_embedding=query_embedding,
                limit=limit,
                similarity_threshold=similarity_threshold
            )

            if result["success"]:
                # Add content type to results for unified handling
                for item in result["results"]:
                    item["content_type"] = "insight"
                    item["source_type"] = "insight"

            return result

        except Exception as e:
            logger.error(f"Insight search failed: {str(e)}")
            return {
                "success": False,
                "error": f"Insight search failed: {str(e)}"
            }

    def search_jtbds(
        self,
        query_embedding: List[float],
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, Any]:
        """
        Search JTBDs using vector similarity.

        Args:
            query_embedding: Vector embedding of the search query
            similarity_threshold: Minimum similarity score
            limit: Maximum number of results

        Returns:
            Dict with search results and metadata
        """
        try:
            if not self.db.ops:
                return {
                    "success": False,
                    "error": "Database operations not available"
                }

            result = self.db.ops.search_similar_jtbds(
                query_embedding=query_embedding,
                limit=limit,
                similarity_threshold=similarity_threshold
            )

            if result["success"]:
                # Add content type to results for unified handling
                for item in result["results"]:
                    item["content_type"] = "jtbd"
                    item["source_type"] = "jtbd"

            return result

        except Exception as e:
            logger.error(f"JTBD search failed: {str(e)}")
            return {
                "success": False,
                "error": f"JTBD search failed: {str(e)}"
            }

    def _rank_and_filter_results(
        self,
        results: Dict[str, List[Dict[str, Any]]],
        similarity_threshold: float,
        max_results: int
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Rank and filter results across all content types.

        Args:
            results: Dict of content type -> list of results
            similarity_threshold: Minimum similarity score
            max_results: Maximum total results to return

        Returns:
            Filtered and ranked results
        """
        # Collect all results with their scores
        all_results = []
        
        for content_type, items in results.items():
            for item in items:
                if item.get("similarity", 0) >= similarity_threshold:
                    all_results.append({
                        "content_type": content_type,
                        "similarity": item.get("similarity", 0),
                        "data": item
                    })

        # Sort by similarity score (descending)
        all_results.sort(key=lambda x: x["similarity"], reverse=True)

        # Limit total results
        if len(all_results) > max_results:
            all_results = all_results[:max_results]

        # Group back by content type
        ranked_results = {}
        for item in all_results:
            content_type = item["content_type"]
            if content_type not in ranked_results:
                ranked_results[content_type] = []
            ranked_results[content_type].append(item["data"])

        return ranked_results


# Global search service instance
search_service = None


def initialize_search_service(database_manager=None, embedding_manager=None):
    """Initialize global search service instance."""
    global search_service
    search_service = SearchService(database_manager, embedding_manager)
    return search_service


def get_search_service() -> Optional[SearchService]:
    """Get the global search service instance."""
    return search_service
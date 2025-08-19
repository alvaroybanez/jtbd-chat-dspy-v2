"""
Chat service for processing user queries and building structured responses.
Routes queries to SearchService and prepares context for HMW generation.
"""

from typing import Dict, List, Any, Optional, Union
import logging
from datetime import datetime

from ..core.constants import (
    DEFAULT_SIMILARITY_THRESHOLD,
    DEFAULT_SEARCH_LIMIT,
    MAX_SEARCH_RESULTS
)
from .search_service import get_search_service
from .context_manager import get_context_manager

logger = logging.getLogger(__name__)


class ChatService:
    """Processes user queries and builds structured responses for Streamlit display."""

    def __init__(self, search_service=None, context_manager=None):
        """
        Initialize chat service with search and context managers.

        Args:
            search_service: SearchService instance for query processing
            context_manager: ContextManager instance for context building
        """
        self.search = search_service or get_search_service()
        self.context = context_manager or get_context_manager()
        
        if not self.search:
            raise ValueError("SearchService is required for ChatService")
        if not self.context:
            raise ValueError("ContextManager is required for ChatService")

    def process_message(
        self,
        query: str,
        search_types: Optional[List[str]] = None,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit_per_type: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, Any]:
        """
        Process a user query and return structured search results.

        Args:
            query: User's search query
            search_types: Types to search ('chunks', 'insights', 'jtbds') or None for all
            similarity_threshold: Minimum similarity score for results
            limit_per_type: Maximum results per content type

        Returns:
            Dict with processed query results and metadata
        """
        try:
            if not query or not query.strip():
                return {
                    "success": False,
                    "error": "Query cannot be empty"
                }

            query = query.strip()
            
            # Search across content types
            if search_types is None:
                # Search all content types
                search_result = self.search.search_all_content(
                    query_text=query,
                    similarity_threshold=similarity_threshold,
                    limit_per_type=limit_per_type
                )
            else:
                # Search specific types
                search_result = self._search_specific_types(
                    query=query,
                    search_types=search_types,
                    similarity_threshold=similarity_threshold,
                    limit_per_type=limit_per_type
                )

            if not search_result["success"]:
                return {
                    "success": False,
                    "error": f"Search failed: {search_result.get('error')}"
                }

            # Format results for Streamlit display
            formatted_results = self.format_search_results(search_result["results"])

            # Get current context status
            context_summary = self.context.get_context_summary()
            token_budget = self.context.check_token_budget()

            return {
                "success": True,
                "query": query,
                "timestamp": datetime.now().isoformat(),
                "search_metadata": {
                    "total_found": search_result.get("total_found", 0),
                    "similarity_threshold": similarity_threshold,
                    "from_cache": search_result.get("from_cache", False),
                    "search_types": search_types or ["chunks", "insights", "jtbds"]
                },
                "results": formatted_results,
                "context_status": {
                    "selection_summary": context_summary.get("selection_summary", {}),
                    "token_budget": token_budget
                },
                "suggestions": self._generate_suggestions(formatted_results, context_summary)
            }

        except Exception as e:
            logger.error(f"Failed to process message: {e}")
            return {
                "success": False,
                "error": f"Failed to process query: {str(e)}"
            }

    def _search_specific_types(
        self,
        query: str,
        search_types: List[str],
        similarity_threshold: float,
        limit_per_type: int
    ) -> Dict[str, Any]:
        """Search only specified content types."""
        try:
            # Generate embedding once for all searches
            embedding_result = self.search.embeddings.generate_single_embedding(
                text=query, 
                template_key="chat_query"
            )
            
            if not embedding_result["success"]:
                return embedding_result

            query_embedding = embedding_result["embedding"]
            results = {}
            total_found = 0

            # Search each specified type
            for search_type in search_types:
                if search_type == "chunks":
                    result = self.search.search_chunks(
                        query_embedding=query_embedding,
                        similarity_threshold=similarity_threshold,
                        limit=limit_per_type
                    )
                elif search_type == "insights":
                    result = self.search.search_insights(
                        query_embedding=query_embedding,
                        similarity_threshold=similarity_threshold,
                        limit=limit_per_type
                    )
                elif search_type == "jtbds":
                    result = self.search.search_jtbds(
                        query_embedding=query_embedding,
                        similarity_threshold=similarity_threshold,
                        limit=limit_per_type
                    )
                else:
                    logger.warning(f"Unknown search type: {search_type}")
                    continue

                if result["success"]:
                    results[search_type] = result["results"]
                    total_found += len(result["results"])

            return {
                "success": True,
                "results": results,
                "total_found": total_found,
                "from_cache": embedding_result.get("from_cache", False)
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Specific type search failed: {str(e)}"
            }

    def format_search_results(self, results: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
        """
        Format search results for consistent Streamlit display.

        Args:
            results: Raw search results grouped by content type

        Returns:
            Formatted results with consistent structure
        """
        formatted = {}

        for content_type, items in results.items():
            formatted_items = []
            
            for item in items:
                formatted_item = {
                    "id": item.get("id"),
                    "similarity": round(item.get("similarity", 0), 3),
                    "content_type": content_type,
                    "display_data": self._format_item_for_display(item, content_type),
                    "raw_data": item  # Keep original data for context selection
                }
                formatted_items.append(formatted_item)

            if formatted_items:
                formatted[content_type] = formatted_items

        return formatted

    def _format_item_for_display(self, item: Dict[str, Any], content_type: str) -> Dict[str, Any]:
        """Format individual item for Streamlit display."""
        display_data = {"type": content_type}

        if content_type == "chunks":
            display_data.update({
                "title": f"Document Chunk #{item.get('chunk_index', 'N/A')}",
                "content": item.get("content", ""),
                "document_id": item.get("document_id"),
                "excerpt": self._create_excerpt(item.get("content", ""), max_length=200)
            })

        elif content_type == "insights":
            display_data.update({
                "title": "Customer Insight",
                "description": item.get("description", ""),
                "document_id": item.get("document_id"),
                "excerpt": self._create_excerpt(item.get("description", ""), max_length=200)
            })

        elif content_type == "jtbds":
            statement = item.get("statement", "")
            context = item.get("context", "")
            outcome = item.get("outcome", "")
            
            # Build display text
            display_text = statement
            if context:
                display_text += f" (Context: {context})"
            if outcome:
                display_text += f" (Outcome: {outcome})"

            display_data.update({
                "title": "Job To Be Done",
                "statement": statement,
                "context": context,
                "outcome": outcome,
                "full_text": display_text,
                "excerpt": self._create_excerpt(display_text, max_length=200)
            })

        return display_data

    def _create_excerpt(self, text: str, max_length: int = 200) -> str:
        """Create a truncated excerpt for display."""
        if not text:
            return ""
        
        if len(text) <= max_length:
            return text
        
        # Find the last complete word within the limit
        truncated = text[:max_length]
        last_space = truncated.rfind(' ')
        
        if last_space > max_length * 0.8:  # Only truncate at word boundary if it's not too short
            truncated = truncated[:last_space]
        
        return truncated + "..."

    def _generate_suggestions(
        self, 
        results: Dict[str, List[Dict[str, Any]]], 
        context_summary: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Generate helpful suggestions based on search results and context."""
        suggestions = []

        # Count results by type
        result_counts = {content_type: len(items) for content_type, items in results.items()}
        total_results = sum(result_counts.values())

        # Suggest adding items to context if results found
        if total_results > 0:
            if result_counts.get("insights", 0) > 0:
                suggestions.append({
                    "type": "action",
                    "text": f"Add relevant insights to context ({result_counts['insights']} found)",
                    "action": "add_insights"
                })
            
            if result_counts.get("jtbds", 0) > 0:
                suggestions.append({
                    "type": "action", 
                    "text": f"Add relevant JTBDs to context ({result_counts['jtbds']} found)",
                    "action": "add_jtbds"
                })

        # Context management suggestions
        if context_summary.get("success"):
            token_budget = context_summary.get("token_budget", {})
            percentage_used = token_budget.get("percentage_used", 0)
            
            if percentage_used > 75:
                suggestions.append({
                    "type": "warning",
                    "text": f"Context is {percentage_used}% full - consider removing items",
                    "action": "manage_context"
                })
            elif percentage_used < 25 and total_results > 0:
                suggestions.append({
                    "type": "info",
                    "text": "Context has plenty of space - add more relevant items",
                    "action": "add_more_context"
                })

        # Search refinement suggestions
        if total_results == 0:
            suggestions.extend([
                {
                    "type": "tip",
                    "text": "Try broader search terms or lower similarity threshold",
                    "action": "refine_search"
                },
                {
                    "type": "tip", 
                    "text": "Search in specific content types if looking for particular insights",
                    "action": "filter_search"
                }
            ])
        elif total_results > 20:
            suggestions.append({
                "type": "tip",
                "text": "Many results found - try more specific search terms",
                "action": "narrow_search"
            })

        return suggestions

    def prepare_context_for_hmw(self) -> Dict[str, Any]:
        """
        Prepare the current context selection for HMW generation.

        Returns:
            Dict with formatted context data ready for LLM processing
        """
        try:
            context_summary = self.context.get_context_summary()
            
            if not context_summary["success"]:
                return {
                    "success": False,
                    "error": f"Failed to get context: {context_summary.get('error')}"
                }

            selected_items = context_summary["selected_items"]
            token_info = context_summary["token_budget"]

            # Check if we have sufficient context
            total_items = sum(len(items) for items in selected_items.values())
            if total_items == 0:
                return {
                    "success": False,
                    "error": "No items selected for context",
                    "suggestion": "Add insights, JTBDs, or metrics to generate HMW questions"
                }

            # Format context for LLM
            formatted_context = {
                "insights": self._format_insights_for_llm(selected_items.get("insights", [])),
                "jtbds": self._format_jtbds_for_llm(selected_items.get("jtbds", [])),
                "metrics": self._format_metrics_for_llm(selected_items.get("metrics", [])),
                "summary": {
                    "total_insights": len(selected_items.get("insights", [])),
                    "total_jtbds": len(selected_items.get("jtbds", [])),
                    "total_metrics": len(selected_items.get("metrics", [])),
                    "total_tokens": token_info["total_used"]
                }
            }

            return {
                "success": True,
                "context": formatted_context,
                "token_info": token_info,
                "readiness_check": self._assess_context_readiness(formatted_context)
            }

        except Exception as e:
            logger.error(f"Failed to prepare context for HMW: {e}")
            return {
                "success": False,
                "error": f"Failed to prepare context: {str(e)}"
            }

    def _format_insights_for_llm(self, insights: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Format insights for LLM consumption."""
        return [
            {
                "id": insight.get("id", ""),
                "description": insight.get("description", ""),
                "context": insight.get("context", ""),
                "source": f"Document ID: {insight.get('document_id', 'Unknown')}"
            }
            for insight in insights
        ]

    def _format_jtbds_for_llm(self, jtbds: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Format JTBDs for LLM consumption."""
        return [
            {
                "id": jtbd.get("id", ""),
                "statement": jtbd.get("statement", ""),
                "context": jtbd.get("context", ""),
                "outcome": jtbd.get("outcome", ""),
                "full_jtbd": f"{jtbd.get('statement', '')} | Context: {jtbd.get('context', '')} | Outcome: {jtbd.get('outcome', '')}"
            }
            for jtbd in jtbds
        ]

    def _format_metrics_for_llm(self, metrics: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Format metrics for LLM consumption."""
        return [
            {
                "id": metric.get("id", ""),
                "name": metric.get("name", ""),
                "description": metric.get("description", ""),
                "current_value": str(metric.get("current_value", "")),
                "target_value": str(metric.get("target_value", "")),
                "unit": metric.get("unit", "")
            }
            for metric in metrics
        ]

    def _assess_context_readiness(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Assess if context is ready for HMW generation."""
        summary = context["summary"]
        
        has_insights = summary["total_insights"] > 0
        has_jtbds = summary["total_jtbds"] > 0
        has_metrics = summary["total_metrics"] > 0
        
        # Determine readiness level
        if has_insights and has_jtbds:
            readiness = "ready"
            score = 100
        elif has_insights or has_jtbds:
            readiness = "partially_ready"
            score = 60
        else:
            readiness = "not_ready"
            score = 20

        # Add bonus for metrics
        if has_metrics:
            score = min(100, score + 20)

        recommendations = []
        if not has_insights:
            recommendations.append("Add customer insights to better understand user needs")
        if not has_jtbds:
            recommendations.append("Add Jobs To Be Done to clarify user goals")
        if not has_metrics:
            recommendations.append("Consider adding metrics to focus HMW questions on measurable outcomes")

        return {
            "readiness": readiness,
            "score": score,
            "has_insights": has_insights,
            "has_jtbds": has_jtbds,
            "has_metrics": has_metrics,
            "recommendations": recommendations
        }
    
    def process_user_message(self, query: str, **kwargs) -> Dict[str, Any]:
        """
        Alias for process_message to match expected interface.
        
        Args:
            query: User query text
            **kwargs: Additional arguments passed to process_message
            
        Returns:
            Dict with search results and response data
        """
        return self.process_message(query, **kwargs)
    
    def generate_response(self, query: str, **kwargs) -> Dict[str, Any]:
        """
        Generate response for user query (alias for process_message).
        
        Args:
            query: User query text
            **kwargs: Additional arguments passed to process_message
            
        Returns:
            Dict with search results and response data
        """
        return self.process_message(query, **kwargs)


# Global chat service instance
chat_service = None


def initialize_chat_service(search_service=None, context_manager=None) -> ChatService:
    """Initialize global chat service instance."""
    global chat_service
    chat_service = ChatService(search_service, context_manager)
    return chat_service


def get_chat_service() -> Optional[ChatService]:
    """Get the global chat service instance."""
    return chat_service
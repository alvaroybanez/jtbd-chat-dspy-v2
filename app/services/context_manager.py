"""
Context manager for managing selected insights, JTBDs, and metrics in session state.
Handles token counting using tiktoken and enforces budget constraints.
"""

from typing import Dict, List, Any, Optional, Union, Tuple
import logging
import json

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    logging.warning("tiktoken not available - using character-based approximation for token counting")

from ..core.constants import (
    MAX_CONTEXT_TOKENS,
    DEFAULT_TOKEN_BUFFER,
    DEFAULT_EMBEDDING_MODEL
)

logger = logging.getLogger(__name__)


class ContextManager:
    """Manages selected context items with token counting and budget enforcement."""

    def __init__(self, max_tokens: int = MAX_CONTEXT_TOKENS, token_buffer: int = DEFAULT_TOKEN_BUFFER):
        """
        Initialize context manager with token limits.

        Args:
            max_tokens: Maximum allowed tokens in context
            token_buffer: Buffer to reserve for other content
        """
        self.max_tokens = max_tokens
        self.token_buffer = token_buffer
        self.effective_limit = max(100, max_tokens - token_buffer)  # Ensure minimum positive limit
        
        # Initialize tokenizer if available
        self.tokenizer = None
        if TIKTOKEN_AVAILABLE:
            try:
                # Use encoding that matches OpenAI's embedding model
                self.tokenizer = tiktoken.encoding_for_model("gpt-4")
            except Exception as e:
                logger.warning(f"Failed to initialize tiktoken encoder: {e}")
        
        # Session state for selected items
        self.selected_insights: List[Dict[str, Any]] = []
        self.selected_jtbds: List[Dict[str, Any]] = []
        self.selected_metrics: List[Dict[str, Any]] = []

    def _count_tokens(self, text: str) -> int:
        """
        Count tokens in text using tiktoken or approximation.

        Args:
            text: Text to count tokens for

        Returns:
            Approximate token count
        """
        if not text:
            return 0

        if self.tokenizer:
            try:
                return len(self.tokenizer.encode(text))
            except Exception as e:
                logger.warning(f"Token counting failed, using approximation: {e}")

        # Fallback: approximate 1 token per 4 characters
        return max(1, len(text) // 4)

    def _calculate_item_tokens(self, item: Dict[str, Any], item_type: str) -> int:
        """
        Calculate token count for a context item based on its type.

        Args:
            item: Item data dictionary
            item_type: Type of item ('insight', 'jtbd', 'metric')

        Returns:
            Token count for the item
        """
        text_content = ""
        
        if item_type == "insight":
            # Include description and any context
            text_content += item.get("description", "")
            if item.get("context"):
                text_content += f" Context: {item['context']}"
                
        elif item_type == "jtbd":
            # Include statement, context, and outcome
            text_content += item.get("statement", "")
            if item.get("context"):
                text_content += f" Context: {item['context']}"
            if item.get("outcome"):
                text_content += f" Outcome: {item['outcome']}"
                
        elif item_type == "metric":
            # Include metric name, description, and current value
            text_content += item.get("name", "")
            if item.get("description"):
                text_content += f" Description: {item['description']}"
            if item.get("current_value") is not None:
                text_content += f" Current: {item['current_value']}"
            if item.get("target_value") is not None:
                text_content += f" Target: {item['target_value']}"

        return self._count_tokens(text_content)

    def add_selection(self, item_type: str, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add an item to the context selection.

        Args:
            item_type: Type of item ('insight', 'jtbd', 'metric')
            item_data: Item data dictionary

        Returns:
            Dict with success status and token information
        """
        try:
            if item_type not in ["insight", "jtbd", "metric"]:
                return {
                    "success": False,
                    "error": f"Invalid item type: {item_type}"
                }

            # Check if item already exists
            item_id = item_data.get("id")
            if not item_id:
                return {
                    "success": False,
                    "error": "Item must have an 'id' field"
                }

            # Get the appropriate list
            target_list = getattr(self, f"selected_{item_type}s")
            
            # Check if already selected
            if any(item.get("id") == item_id for item in target_list):
                return {
                    "success": True,
                    "message": f"{item_type.title()} already selected",
                    "tokens_used": self.get_total_tokens(),
                    "tokens_available": self.get_available_tokens()
                }

            # Calculate tokens for new item
            item_tokens = self._calculate_item_tokens(item_data, item_type)
            current_tokens = self.get_total_tokens()
            
            # Check if adding this item would exceed budget
            if current_tokens + item_tokens > self.effective_limit:
                return {
                    "success": False,
                    "error": f"Adding {item_type} would exceed token budget",
                    "item_tokens": item_tokens,
                    "current_tokens": current_tokens,
                    "tokens_available": self.get_available_tokens(),
                    "suggestion": "Remove some items or use truncate_if_needed()"
                }

            # Add item to selection
            target_list.append(item_data)

            return {
                "success": True,
                "message": f"{item_type.title()} added to selection",
                "item_tokens": item_tokens,
                "tokens_used": current_tokens + item_tokens,
                "tokens_available": self.get_available_tokens() - item_tokens
            }

        except Exception as e:
            logger.error(f"Failed to add {item_type} to selection: {e}")
            return {
                "success": False,
                "error": f"Failed to add {item_type}: {str(e)}"
            }

    def remove_selection(self, item_type: str, item_id: str) -> Dict[str, Any]:
        """
        Remove an item from the context selection.

        Args:
            item_type: Type of item ('insight', 'jtbd', 'metric')
            item_id: ID of item to remove

        Returns:
            Dict with success status and token information
        """
        try:
            if item_type not in ["insight", "jtbd", "metric"]:
                return {
                    "success": False,
                    "error": f"Invalid item type: {item_type}"
                }

            target_list = getattr(self, f"selected_{item_type}s")
            
            # Find and remove item
            original_length = len(target_list)
            target_list[:] = [item for item in target_list if item.get("id") != item_id]
            
            if len(target_list) == original_length:
                return {
                    "success": False,
                    "error": f"{item_type.title()} with ID {item_id} not found in selection"
                }

            return {
                "success": True,
                "message": f"{item_type.title()} removed from selection",
                "tokens_used": self.get_total_tokens(),
                "tokens_available": self.get_available_tokens()
            }

        except Exception as e:
            logger.error(f"Failed to remove {item_type} from selection: {e}")
            return {
                "success": False,
                "error": f"Failed to remove {item_type}: {str(e)}"
            }

    def clear_selection(self, item_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Clear selection items.

        Args:
            item_type: Type to clear ('insight', 'jtbd', 'metric'), or None for all

        Returns:
            Dict with success status and token information
        """
        try:
            if item_type is None:
                # Clear all selections
                self.selected_insights.clear()
                self.selected_jtbds.clear()
                self.selected_metrics.clear()
                message = "All selections cleared"
            elif item_type in ["insight", "jtbd", "metric"]:
                # Clear specific type
                target_list = getattr(self, f"selected_{item_type}s")
                target_list.clear()
                message = f"{item_type.title()} selection cleared"
            else:
                return {
                    "success": False,
                    "error": f"Invalid item type: {item_type}"
                }

            return {
                "success": True,
                "message": message,
                "tokens_used": self.get_total_tokens(),
                "tokens_available": self.get_available_tokens()
            }

        except Exception as e:
            logger.error(f"Failed to clear selection: {e}")
            return {
                "success": False,
                "error": f"Failed to clear selection: {str(e)}"
            }

    def get_context_summary(self) -> Dict[str, Any]:
        """
        Get a summary of the current context selection.

        Returns:
            Dict with context summary and token information
        """
        try:
            # Count items and tokens per type
            insight_tokens = sum(self._calculate_item_tokens(item, "insight") 
                               for item in self.selected_insights)
            jtbd_tokens = sum(self._calculate_item_tokens(item, "jtbd") 
                            for item in self.selected_jtbds)
            metric_tokens = sum(self._calculate_item_tokens(item, "metric") 
                              for item in self.selected_metrics)

            total_tokens = insight_tokens + jtbd_tokens + metric_tokens
            
            return {
                "success": True,
                "selection_summary": {
                    "insights": {
                        "count": len(self.selected_insights),
                        "tokens": insight_tokens
                    },
                    "jtbds": {
                        "count": len(self.selected_jtbds),
                        "tokens": jtbd_tokens
                    },
                    "metrics": {
                        "count": len(self.selected_metrics),
                        "tokens": metric_tokens
                    }
                },
                "token_budget": {
                    "total_used": total_tokens,
                    "total_available": self.get_available_tokens(),
                    "max_limit": self.effective_limit,
                    "buffer_reserved": self.token_buffer,
                    "percentage_used": round((total_tokens / max(1, self.effective_limit)) * 100, 1)
                },
                "selected_items": {
                    "insights": self.selected_insights.copy(),
                    "jtbds": self.selected_jtbds.copy(),
                    "metrics": self.selected_metrics.copy()
                }
            }

        except Exception as e:
            logger.error(f"Failed to get context summary: {e}")
            return {
                "success": False,
                "error": f"Failed to get context summary: {str(e)}"
            }

    def get_total_tokens(self) -> int:
        """Get total token count for all selected items."""
        total = 0
        total += sum(self._calculate_item_tokens(item, "insight") for item in self.selected_insights)
        total += sum(self._calculate_item_tokens(item, "jtbd") for item in self.selected_jtbds)
        total += sum(self._calculate_item_tokens(item, "metric") for item in self.selected_metrics)
        return total

    def get_available_tokens(self) -> int:
        """Get remaining token budget."""
        return max(0, self.effective_limit - self.get_total_tokens())

    def check_token_budget(self) -> Dict[str, Any]:
        """
        Check current token budget status.

        Returns:
            Dict with budget status and recommendations
        """
        current_tokens = self.get_total_tokens()
        percentage_used = (current_tokens / max(1, self.effective_limit)) * 100
        
        status = "good"
        if percentage_used > 90:
            status = "critical"
        elif percentage_used > 75:
            status = "warning"
        elif percentage_used > 50:
            status = "caution"

        return {
            "status": status,
            "tokens_used": current_tokens,
            "tokens_available": self.get_available_tokens(),
            "percentage_used": round(percentage_used, 1),
            "needs_truncation": current_tokens > self.effective_limit,
            "recommendations": self._get_budget_recommendations(status, percentage_used)
        }

    def _get_budget_recommendations(self, status: str, percentage_used: float) -> List[str]:
        """Get recommendations based on token budget status."""
        recommendations = []
        
        if status == "critical":
            recommendations.extend([
                "Consider removing some selected items",
                "Use truncate_if_needed() to automatically reduce context",
                "Focus on the most relevant insights and JTBDs"
            ])
        elif status == "warning":
            recommendations.extend([
                "Monitor token usage closely",
                "Consider prioritizing most important items",
                "Remove less relevant metrics if needed"
            ])
        elif status == "caution":
            recommendations.append("Token usage is moderate - consider your next additions carefully")

        return recommendations

    def truncate_if_needed(self, target_percentage: float = 75.0) -> Dict[str, Any]:
        """
        Automatically truncate selections to fit within token budget.

        Args:
            target_percentage: Target percentage of token budget to use

        Returns:
            Dict with truncation results
        """
        try:
            target_tokens = int(self.effective_limit * (target_percentage / 100))
            current_tokens = self.get_total_tokens()
            
            if current_tokens <= target_tokens:
                return {
                    "success": True,
                    "message": "No truncation needed",
                    "tokens_before": current_tokens,
                    "tokens_after": current_tokens,
                    "items_removed": 0
                }

            tokens_to_remove = current_tokens - target_tokens
            items_removed = 0

            # Remove items starting with metrics (usually least critical)
            # Then insights, then JTBDs (usually most critical)
            removal_order = [
                ("metric", self.selected_metrics),
                ("insight", self.selected_insights),
                ("jtbd", self.selected_jtbds)
            ]

            for item_type, item_list in removal_order:
                while item_list and self.get_total_tokens() > target_tokens:
                    # Remove last item (LIFO)
                    removed_item = item_list.pop()
                    items_removed += 1
                    
                    if self.get_total_tokens() <= target_tokens:
                        break

            final_tokens = self.get_total_tokens()
            
            return {
                "success": True,
                "message": f"Truncated to {target_percentage}% of token budget",
                "tokens_before": current_tokens,
                "tokens_after": final_tokens,
                "tokens_removed": current_tokens - final_tokens,
                "items_removed": items_removed,
                "final_percentage": round((final_tokens / self.effective_limit) * 100, 1)
            }

        except Exception as e:
            logger.error(f"Failed to truncate context: {e}")
            return {
                "success": False,
                "error": f"Failed to truncate context: {str(e)}"
            }


# Global context manager instance
context_manager = None


def initialize_context_manager(max_tokens: int = MAX_CONTEXT_TOKENS) -> ContextManager:
    """Initialize global context manager instance."""
    global context_manager
    context_manager = ContextManager(max_tokens=max_tokens)
    return context_manager


def get_context_manager() -> Optional[ContextManager]:
    """Get the global context manager instance."""
    return context_manager
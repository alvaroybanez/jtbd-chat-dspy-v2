"""
Service initialization helper for JTBD Assistant Platform.
Provides centralized initialization of all services with proper dependency management.
"""

from typing import Optional, Dict, Any
import logging

from ..core.database.connection import get_database_manager
from ..core.embeddings import get_embedding_manager
from ..core.llm_wrapper import get_llm

from .search_service import initialize_search_service
from .context_manager import initialize_context_manager
from .chat_service import initialize_chat_service

logger = logging.getLogger(__name__)


def initialize_all_services(
    database_manager=None,
    embedding_manager=None,
    llm_wrapper=None,
    max_context_tokens: int = 4000
) -> Dict[str, Any]:
    """
    Initialize all services with proper dependency management.

    Args:
        database_manager: DatabaseManager instance (optional)
        embedding_manager: EmbeddingManager instance (optional)
        llm_wrapper: LLMWrapper instance (optional)
        max_context_tokens: Maximum tokens for context manager

    Returns:
        Dict with initialization results and service instances
    """
    try:
        # Get or use provided core components
        db = database_manager or get_database_manager()
        embeddings = embedding_manager or get_embedding_manager()
        llm = llm_wrapper or get_llm()

        if not db:
            return {
                "success": False,
                "error": "Database manager is required but not available"
            }

        if not embeddings:
            return {
                "success": False,
                "error": "Embedding manager is required but not available"
            }

        # Initialize services in dependency order
        results = {}

        # 1. Initialize search service (requires db + embeddings)
        try:
            search_service = initialize_search_service(
                database_manager=db,
                embedding_manager=embeddings
            )
            results["search_service"] = {
                "success": True,
                "instance": search_service
            }
        except Exception as e:
            results["search_service"] = {
                "success": False,
                "error": f"Failed to initialize search service: {str(e)}"
            }

        # 2. Initialize context manager (standalone)
        try:
            context_manager = initialize_context_manager(
                max_tokens=max_context_tokens
            )
            results["context_manager"] = {
                "success": True,
                "instance": context_manager
            }
        except Exception as e:
            results["context_manager"] = {
                "success": False,
                "error": f"Failed to initialize context manager: {str(e)}"
            }

        # 3. Initialize chat service (requires search + context)
        try:
            if results["search_service"]["success"] and results["context_manager"]["success"]:
                chat_service = initialize_chat_service(
                    search_service=results["search_service"]["instance"],
                    context_manager=results["context_manager"]["instance"]
                )
                results["chat_service"] = {
                    "success": True,
                    "instance": chat_service
                }
            else:
                results["chat_service"] = {
                    "success": False,
                    "error": "Chat service requires search service and context manager"
                }
        except Exception as e:
            results["chat_service"] = {
                "success": False,
                "error": f"Failed to initialize chat service: {str(e)}"
            }

        # Check overall success
        all_success = all(result["success"] for result in results.values())

        return {
            "success": all_success,
            "services": results,
            "core_components": {
                "database_manager": db is not None,
                "embedding_manager": embeddings is not None,
                "llm_wrapper": llm is not None
            },
            "summary": {
                "total_services": len(results),
                "successful_services": sum(1 for r in results.values() if r["success"]),
                "failed_services": sum(1 for r in results.values() if not r["success"])
            }
        }

    except Exception as e:
        logger.error(f"Service initialization failed: {e}")
        return {
            "success": False,
            "error": f"Service initialization failed: {str(e)}"
        }


def check_service_health() -> Dict[str, Any]:
    """
    Check the health status of all initialized services.

    Returns:
        Dict with health status of all services
    """
    from .search_service import get_search_service
    from .context_manager import get_context_manager
    from .chat_service import get_chat_service

    health_status = {}

    # Check search service
    search_service = get_search_service()
    if search_service:
        try:
            # Test basic functionality
            if search_service.db and search_service.embeddings:
                health_status["search_service"] = {
                    "status": "healthy",
                    "database_connected": search_service.db.client is not None,
                    "embeddings_available": search_service.embeddings.llm is not None
                }
            else:
                health_status["search_service"] = {
                    "status": "unhealthy", 
                    "error": "Missing required dependencies"
                }
        except Exception as e:
            health_status["search_service"] = {
                "status": "unhealthy",
                "error": str(e)
            }
    else:
        health_status["search_service"] = {
            "status": "not_initialized"
        }

    # Check context manager
    context_manager = get_context_manager()
    if context_manager:
        try:
            # Test basic functionality
            budget_check = context_manager.check_token_budget()
            health_status["context_manager"] = {
                "status": "healthy",
                "max_tokens": context_manager.max_tokens,
                "current_usage": budget_check["tokens_used"],
                "tokenizer_available": context_manager.tokenizer is not None
            }
        except Exception as e:
            health_status["context_manager"] = {
                "status": "unhealthy",
                "error": str(e)
            }
    else:
        health_status["context_manager"] = {
            "status": "not_initialized"
        }

    # Check chat service
    chat_service = get_chat_service()
    if chat_service:
        try:
            # Test basic functionality
            if chat_service.search and chat_service.context:
                health_status["chat_service"] = {
                    "status": "healthy",
                    "search_service_available": True,
                    "context_manager_available": True
                }
            else:
                health_status["chat_service"] = {
                    "status": "unhealthy",
                    "error": "Missing required service dependencies"
                }
        except Exception as e:
            health_status["chat_service"] = {
                "status": "unhealthy",
                "error": str(e)
            }
    else:
        health_status["chat_service"] = {
            "status": "not_initialized"
        }

    # Overall health summary
    healthy_services = sum(1 for status in health_status.values() 
                          if status.get("status") == "healthy")
    total_services = len(health_status)

    return {
        "overall_health": "healthy" if healthy_services == total_services else "degraded",
        "services": health_status,
        "summary": {
            "total_services": total_services,
            "healthy_services": healthy_services,
            "unhealthy_services": total_services - healthy_services
        }
    }
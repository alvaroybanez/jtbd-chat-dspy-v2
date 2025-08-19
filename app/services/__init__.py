"""
Services package for JTBD Assistant Platform.
Contains business logic services for search, context management, and chat functionality.
"""

from .search_service import SearchService, initialize_search_service, get_search_service
from .context_manager import ContextManager, initialize_context_manager, get_context_manager
from .chat_service import ChatService, initialize_chat_service, get_chat_service
from .jtbd_service import JTBDService, initialize_jtbd_service, get_jtbd_service
from .metric_service import MetricService, initialize_metric_service, get_metric_service
from .initialization import initialize_all_services, check_service_health

__all__ = [
    # Search service
    "SearchService",
    "initialize_search_service", 
    "get_search_service",
    
    # Context manager
    "ContextManager",
    "initialize_context_manager",
    "get_context_manager",
    
    # Chat service
    "ChatService", 
    "initialize_chat_service",
    "get_chat_service",
    
    # JTBD service
    "JTBDService",
    "initialize_jtbd_service",
    "get_jtbd_service",
    
    # Metric service
    "MetricService", 
    "initialize_metric_service",
    "get_metric_service",
    
    # Initialization helpers
    "initialize_all_services",
    "check_service_health",
]
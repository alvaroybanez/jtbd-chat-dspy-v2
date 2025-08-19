"""
Streamlit chat interface component for the JTBD Assistant Platform.
Provides conversational interface with search results display and context building.
"""

import streamlit as st
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

from ...services.chat_service import get_chat_service
from ...services.search_service import get_search_service  
from ...services.context_manager import get_context_manager
from ...services.jtbd_service import get_jtbd_service
from ...services.metric_service import get_metric_service
from ...core.constants import DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_SEARCH_LIMIT
from .selection_components import (
    render_search_result_card,
    render_context_summary_sidebar,
    render_token_budget_indicator,
    render_suggestions_section
)
from .jtbd_form import render_compact_jtbd_form
from .metric_form import render_compact_metric_form

logger = logging.getLogger(__name__)


class ChatInterface:
    """Main chat interface component for JTBD Assistant."""
    
    def __init__(self):
        """Initialize chat interface with backend services."""
        self.chat_service = get_chat_service()
        self.search_service = get_search_service()
        self.context_manager = get_context_manager()
        self.jtbd_service = get_jtbd_service()
        self.metric_service = get_metric_service()
        
        # Initialize session state for chat history
        if "chat_messages" not in st.session_state:
            st.session_state.chat_messages = []
        
        if "chat_context" not in st.session_state:
            st.session_state.chat_context = {
                "selected_insights": [],
                "selected_jtbds": [],
                "selected_metrics": []
            }
    
    def render(self) -> None:
        """Render the complete chat interface."""
        try:
            # Main chat container
            st.title("🎯 JTBD Assistant")
            st.caption("Search and select insights, JTBDs, and metrics to build context for HMW generation")
            
            # Create layout with sidebar and main content
            with st.sidebar:
                self._render_sidebar()
            
            # Main chat area
            self._render_chat_area()
            
            # Input area
            self._render_input_area()
            
        except Exception as e:
            logger.error(f"Failed to render chat interface: {e}")
            st.error(f"Failed to load chat interface: {str(e)}")
    
    def _render_sidebar(self) -> None:
        """Render sidebar with context summary and controls."""
        st.header("Context Summary")
        
        if self.context_manager:
            # Render context summary using helper component
            render_context_summary_sidebar(self.context_manager)
            
            # Token budget indicator
            render_token_budget_indicator(self.context_manager)
            
            # Clear context button
            col1, col2 = st.columns(2)
            with col1:
                if st.button("Clear All", type="secondary", use_container_width=True):
                    self._clear_all_context()
            
            with col2:
                if st.button("Prepare HMW", type="primary", use_container_width=True):
                    self._prepare_hmw_generation()
        else:
            st.error("Context manager not available")
        
        # Conversation settings
        st.header("Conversation Settings")
        conversation_enabled = st.toggle(
            "💬 Conversational AI",
            value=True,
            help="Enable AI-powered conversational responses alongside search results"
        )
        
        # Search settings
        st.header("Search Settings")
        similarity_threshold = st.slider(
            "Similarity Threshold",
            min_value=0.0,
            max_value=1.0,
            value=DEFAULT_SIMILARITY_THRESHOLD,
            step=0.05,
            help="Minimum similarity score for search results"
        )
        
        results_per_type = st.selectbox(
            "Results per Type",
            options=[5, 10, 15, 20],
            index=1,  # Default to 10
            help="Maximum results to show for each content type"
        )
        
        # Store settings in session state
        st.session_state.search_settings = {
            "similarity_threshold": similarity_threshold,
            "results_per_type": results_per_type
        }
        st.session_state.conversation_settings = {
            "enabled": conversation_enabled
        }
        
        # Manual creation forms
        st.header("Create Items")
        st.caption("Manually create JTBDs and metrics")
        
        # JTBD creation form
        if self.jtbd_service:
            jtbd_result = render_compact_jtbd_form(
                jtbd_service=self.jtbd_service,
                key_prefix="sidebar_jtbd"
            )
            if jtbd_result and jtbd_result.get("success"):
                # Add system message about successful creation
                system_message = {
                    "type": "system",
                    "content": f"✅ JTBD created: {jtbd_result.get('jtbd', {}).get('statement', 'New JTBD')[:50]}...",
                    "timestamp": datetime.now().isoformat()
                }
                st.session_state.chat_messages.append(system_message)
        else:
            st.warning("JTBD service not available")
        
        # Metric creation form
        if self.metric_service:
            metric_result = render_compact_metric_form(
                metric_service=self.metric_service,
                key_prefix="sidebar_metric"
            )
            if metric_result and metric_result.get("success"):
                # Add system message about successful creation
                system_message = {
                    "type": "system",
                    "content": f"📊 Metric created: {metric_result.get('metric', {}).get('name', 'New Metric')}",
                    "timestamp": datetime.now().isoformat()
                }
                st.session_state.chat_messages.append(system_message)
        else:
            st.warning("Metric service not available")
    
    def _render_chat_area(self) -> None:
        """Render the main chat message area."""
        # Chat history container
        chat_container = st.container()
        
        with chat_container:
            # Display chat messages
            for message in st.session_state.chat_messages:
                self._render_chat_message(message)
    
    def _render_chat_message(self, message: Dict[str, Any]) -> None:
        """Render individual chat message with search results and conversational responses."""
        message_type = message.get("type", "user")
        
        if message_type == "user":
            with st.chat_message("user"):
                st.write(message.get("content", ""))
                
        elif message_type == "assistant":
            with st.chat_message("assistant"):
                query_data = message.get("data", {})
                
                if query_data.get("success"):
                    # Show conversational response first if available
                    conversation = query_data.get("conversation", {})
                    if conversation.get("enabled") and conversation.get("response"):
                        self._render_conversational_response(conversation)
                    
                    # Then show search metadata and results
                    metadata = query_data.get("search_metadata", {})
                    total_found = metadata.get("total_found", 0)
                    
                    if total_found > 0:
                        st.caption(
                            f"Found {total_found} results "
                            f"(threshold: {metadata.get('similarity_threshold', 0):.2f})"
                        )
                        
                        # Render search results with selection buttons
                        results = query_data.get("results", {})
                        if results:
                            with st.expander("📊 Search Results", expanded=False):
                                self._render_search_results(results, message.get("timestamp"))
                    
                    # Show suggestions
                    suggestions = query_data.get("suggestions", [])
                    if suggestions:
                        render_suggestions_section(suggestions)
                        
                else:
                    st.error(f"Query failed: {query_data.get('error', 'Unknown error')}")
        
        elif message_type == "system":
            with st.chat_message("assistant"):
                st.info(message.get("content", ""))
    
    def _render_conversational_response(self, conversation: Dict[str, Any]) -> None:
        """Render conversational AI response with follow-up questions."""
        # Main AI response
        response_text = conversation.get("response", "")
        if response_text:
            st.markdown(response_text)
        
        # Show response metadata
        response_type = conversation.get("response_type", "")
        intent_type = conversation.get("intent_type", "")
        
        if response_type or intent_type:
            col1, col2, col3 = st.columns(3)
            with col1:
                if intent_type:
                    st.caption(f"🎯 Intent: {intent_type}")
            with col2:
                if response_type:
                    st.caption(f"💭 Type: {response_type.replace('_', ' ').title()}")
            with col3:
                if conversation.get("has_context"):
                    st.caption("📚 Enhanced with research data")
        
        # Follow-up questions
        follow_ups = conversation.get("follow_up_questions", [])
        if follow_ups:
            st.markdown("**💡 Continue exploring:**")
            for i, question in enumerate(follow_ups[:3]):  # Limit to 3 questions
                if st.button(f"❓ {question}", key=f"followup_{i}_{id(conversation)}"):
                    # Add follow-up question as user message and process it
                    self._process_follow_up_question(question)
    
    def _process_follow_up_question(self, question: str) -> None:
        """Process a follow-up question by adding it to chat and processing."""
        # Add user message
        user_message = {
            "type": "user",
            "content": question,
            "timestamp": datetime.now().isoformat()
        }
        st.session_state.chat_messages.append(user_message)
        
        # Process the question
        self._process_user_query(question, ["chunks", "insights", "jtbds"])
        
        # Refresh the page to show the new interaction
        st.rerun()
    
    def _render_search_results(self, results: Dict[str, List[Dict[str, Any]]], message_timestamp: str) -> None:
        """Render search results with selection buttons."""
        for content_type, items in results.items():
            if not items:
                continue
                
            # Create expandable section for each content type
            type_label = content_type.title()
            with st.expander(f"{type_label} ({len(items)} found)", expanded=True):
                
                for i, item in enumerate(items):
                    # Use helper component to render result card
                    selection_result = render_search_result_card(
                        item, 
                        content_type,
                        key=f"{content_type}_{item.get('id', i)}_{message_timestamp}",
                        context_manager=self.context_manager
                    )
                    
                    # Handle selection results
                    if selection_result and selection_result.get("success"):
                        st.success(selection_result.get("message", "Item added"))
                        st.rerun()  # Refresh to update sidebar
                    elif selection_result and not selection_result.get("success"):
                        st.warning(selection_result.get("error", "Failed to add item"))
    
    def _render_input_area(self) -> None:
        """Render chat input and process user queries."""
        # Search type filters
        col1, col2 = st.columns([3, 1])
        
        with col1:
            search_types = st.multiselect(
                "Search in:",
                options=["chunks", "insights", "jtbds"],
                default=["chunks", "insights", "jtbds"],
                help="Select which content types to search"
            )
        
        with col2:
            # Show current context count
            if self.context_manager:
                summary = self.context_manager.get_context_summary()
                if summary.get("success"):
                    selection = summary["selection_summary"]
                    total_selected = sum(
                        selection.get(key, {}).get("count", 0)
                        for key in ["insights", "jtbds", "metrics"]
                    )
                    st.metric("Selected Items", total_selected)
        
        # Chat input
        if query := st.chat_input("Ask questions or search for insights, JTBDs, and metrics..."):
            self._process_user_query(query, search_types)
    
    def _process_user_query(self, query: str, search_types: List[str]) -> None:
        """Process user query and display results with conversational capabilities."""
        if not query.strip():
            return
        
        # Add user message to chat
        user_message = {
            "type": "user",
            "content": query,
            "timestamp": datetime.now().isoformat()
        }
        st.session_state.chat_messages.append(user_message)
        
        # Build conversation history for context
        conversation_history = []
        for msg in st.session_state.chat_messages[-10:]:  # Last 10 messages
            if msg.get("type") == "user":
                conversation_history.append({"role": "user", "content": msg["content"]})
            elif msg.get("type") == "assistant":
                conversation_data = msg.get("data", {}).get("conversation", {})
                if conversation_data.get("response"):
                    conversation_history.append({"role": "assistant", "content": conversation_data["response"]})
        
        # Process query with search and conversation settings
        search_settings = st.session_state.get("search_settings", {})
        conversation_settings = st.session_state.get("conversation_settings", {"enabled": True})
        
        if self.chat_service:
            spinner_text = "Thinking and searching..." if conversation_settings.get("enabled") else "Searching..."
            with st.spinner(spinner_text):
                result = self.chat_service.process_message(
                    query=query,
                    search_types=search_types if search_types else None,
                    similarity_threshold=search_settings.get("similarity_threshold", DEFAULT_SIMILARITY_THRESHOLD),
                    limit_per_type=search_settings.get("results_per_type", DEFAULT_SEARCH_LIMIT),
                    conversation_mode=conversation_settings.get("enabled", True),
                    conversation_history=conversation_history[-6:] if conversation_history else None  # Last 6 messages
                )
            
            # Add assistant response to chat
            assistant_message = {
                "type": "assistant",
                "content": f"Response to: {query}",
                "data": result,
                "timestamp": datetime.now().isoformat()
            }
            st.session_state.chat_messages.append(assistant_message)
        else:
            st.error("Chat service not available")
        
        # Rerun to display new messages
        st.rerun()
    
    def _clear_all_context(self) -> None:
        """Clear all context selections."""
        if self.context_manager:
            result = self.context_manager.clear_selection()
            if result.get("success"):
                st.success("All context cleared")
                # Add system message
                system_message = {
                    "type": "system",
                    "content": "Context cleared. All selected items have been removed.",
                    "timestamp": datetime.now().isoformat()
                }
                st.session_state.chat_messages.append(system_message)
                st.rerun()
            else:
                st.error(f"Failed to clear context: {result.get('error')}")
    
    def _prepare_hmw_generation(self) -> None:
        """Prepare context for HMW generation."""
        if self.chat_service:
            result = self.chat_service.prepare_context_for_hmw()
            
            if result.get("success"):
                readiness = result.get("readiness_check", {})
                context_info = result.get("context", {})
                
                # Show readiness status
                status = readiness.get("readiness", "not_ready")
                score = readiness.get("score", 0)
                
                if status == "ready":
                    st.success(f"Context is ready for HMW generation! (Score: {score}/100)")
                    
                    # Show context summary
                    summary = context_info.get("summary", {})
                    st.info(
                        f"Context includes: "
                        f"{summary.get('total_insights', 0)} insights, "
                        f"{summary.get('total_jtbds', 0)} JTBDs, "
                        f"{summary.get('total_metrics', 0)} metrics"
                    )
                    
                    # Add system message about readiness
                    system_message = {
                        "type": "system",
                        "content": "✅ Context is ready for HMW generation! You can now proceed to generate How Might We questions.",
                        "timestamp": datetime.now().isoformat()
                    }
                    st.session_state.chat_messages.append(system_message)
                    
                elif status == "partially_ready":
                    st.warning(f"Context is partially ready (Score: {score}/100)")
                    recommendations = readiness.get("recommendations", [])
                    for rec in recommendations:
                        st.caption(f"💡 {rec}")
                        
                else:
                    st.error(f"Context not ready for HMW generation (Score: {score}/100)")
                    recommendations = readiness.get("recommendations", [])
                    for rec in recommendations:
                        st.caption(f"⚠️ {rec}")
                
                st.rerun()
                
            else:
                st.error(f"Failed to prepare context: {result.get('error')}")
        else:
            st.error("Chat service not available")


def render_chat_interface() -> None:
    """Render the main chat interface component."""
    try:
        # Ensure services are available
        if not get_chat_service():
            st.error("Chat service not initialized. Please check service configuration.")
            return
        
        if not get_context_manager():
            st.error("Context manager not initialized. Please check service configuration.")
            return
        
        # Create and render chat interface
        chat_interface = ChatInterface()
        chat_interface.render()
        
    except Exception as e:
        logger.error(f"Failed to render chat interface: {e}")
        st.error(f"Failed to load chat interface: {str(e)}")
        st.caption("Please check the application logs for more details.")


# Streamlit-specific utility functions
def clear_chat_history() -> None:
    """Clear chat history from session state."""
    if "chat_messages" in st.session_state:
        st.session_state.chat_messages.clear()
        st.success("Chat history cleared")
        st.rerun()


def export_chat_history() -> Optional[str]:
    """Export chat history as formatted text."""
    if "chat_messages" not in st.session_state or not st.session_state.chat_messages:
        return None
    
    exported_text = []
    exported_text.append("# JTBD Assistant Chat History")
    exported_text.append(f"Exported on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    exported_text.append("")
    
    for i, message in enumerate(st.session_state.chat_messages, 1):
        timestamp = message.get("timestamp", "")
        message_type = message.get("type", "unknown")
        content = message.get("content", "")
        
        exported_text.append(f"## Message {i} ({message_type.title()})")
        if timestamp:
            exported_text.append(f"Time: {timestamp}")
        exported_text.append(f"Content: {content}")
        
        # Add search results summary if available
        if message_type == "assistant" and message.get("data", {}).get("success"):
            metadata = message["data"].get("search_metadata", {})
            total_found = metadata.get("total_found", 0)
            if total_found > 0:
                exported_text.append(f"Results found: {total_found}")
        
        exported_text.append("")
    
    return "\n".join(exported_text)
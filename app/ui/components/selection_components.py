"""
Reusable UI components for search result selection and context management.
Provides consistent styling and interaction patterns across the chat interface.
"""

import streamlit as st
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


def render_search_result_card(
    item: Dict[str, Any], 
    content_type: str, 
    key: str,
    context_manager=None
) -> Optional[Dict[str, Any]]:
    """
    Render a search result card with selection button.
    
    Args:
        item: Search result item with display_data and raw_data
        content_type: Type of content ('chunks', 'insights', 'jtbds')
        key: Unique key for Streamlit components
        context_manager: ContextManager instance for selections
    
    Returns:
        Selection result dict if item was selected, None otherwise
    """
    try:
        display_data = item.get("display_data", {})
        raw_data = item.get("raw_data", {})
        similarity = item.get("similarity", 0)
        
        # Create card container
        card_container = st.container()
        
        with card_container:
            # Card border using columns for visual separation
            col1, col2 = st.columns([4, 1])
            
            with col1:
                # Title and content based on type
                title = display_data.get("title", "Untitled")
                st.subheader(title, divider="gray")
                
                # Content display based on type
                if content_type == "chunks":
                    excerpt = display_data.get("excerpt", "")
                    if excerpt:
                        st.markdown(f"*{excerpt}*")
                    
                    doc_id = display_data.get("document_id")
                    chunk_index = raw_data.get("chunk_index")
                    if doc_id and chunk_index is not None:
                        st.caption(f"📄 Document: {doc_id} | Chunk: {chunk_index}")
                
                elif content_type == "insights":
                    description = display_data.get("description", "")
                    excerpt = display_data.get("excerpt", "")
                    
                    if excerpt:
                        st.markdown(f"**Description:** {excerpt}")
                    
                    doc_id = display_data.get("document_id")
                    if doc_id:
                        st.caption(f"📄 Source Document: {doc_id}")
                
                elif content_type == "jtbds":
                    statement = display_data.get("statement", "")
                    context = display_data.get("context", "")
                    outcome = display_data.get("outcome", "")
                    
                    if statement:
                        st.markdown(f"**Statement:** {statement}")
                    if context:
                        st.markdown(f"**Context:** {context}")
                    if outcome:
                        st.markdown(f"**Outcome:** {outcome}")
                
                # Similarity score
                st.caption(f"🎯 Similarity: {similarity:.3f}")
            
            with col2:
                # Selection button and status
                item_id = raw_data.get("id")
                
                if not item_id:
                    st.warning("No ID")
                    return None
                
                # Check if already selected
                is_selected = False
                if context_manager:
                    # Map content types to context manager attributes
                    type_mapping = {
                        "chunks": "selected_insights",  # Chunks don't have direct selection
                        "insights": "selected_insights",
                        "jtbds": "selected_jtbds"
                    }
                    
                    if content_type in type_mapping:
                        selected_list = getattr(context_manager, type_mapping[content_type], [])
                        is_selected = any(selected.get("id") == item_id for selected in selected_list)
                
                # Selection button
                button_text = "✓ Selected" if is_selected else "Add to Context"
                button_type = "secondary" if is_selected else "primary"
                button_disabled = is_selected
                
                if st.button(
                    button_text,
                    key=f"select_{key}",
                    type=button_type,
                    disabled=button_disabled,
                    use_container_width=True
                ):
                    # Only process if not already selected and context manager available
                    if not is_selected and context_manager:
                        return _handle_item_selection(raw_data, content_type, context_manager)
                
                # Show token cost for item
                if context_manager and not is_selected:
                    item_tokens = context_manager._calculate_item_tokens(
                        raw_data, 
                        _map_content_type_to_context_type(content_type)
                    )
                    st.caption(f"📊 {item_tokens} tokens")
        
        # Add visual separator
        st.markdown("---")
        
        return None
        
    except Exception as e:
        logger.error(f"Failed to render search result card: {e}")
        st.error(f"Failed to render result: {str(e)}")
        return None


def _handle_item_selection(raw_data: Dict[str, Any], content_type: str, context_manager) -> Dict[str, Any]:
    """Handle selection of an item and add to context."""
    try:
        # Map content type to context manager type
        context_type = _map_content_type_to_context_type(content_type)
        
        if context_type:
            return context_manager.add_selection(context_type, raw_data)
        else:
            return {
                "success": False,
                "error": f"Cannot add {content_type} to context - not supported"
            }
    
    except Exception as e:
        logger.error(f"Failed to handle item selection: {e}")
        return {
            "success": False,
            "error": f"Selection failed: {str(e)}"
        }


def _map_content_type_to_context_type(content_type: str) -> Optional[str]:
    """Map search content type to context manager type."""
    mapping = {
        "insights": "insight",
        "jtbds": "jtbd",
        "chunks": None  # Chunks are not directly added to context
    }
    return mapping.get(content_type)


def render_context_summary_sidebar(context_manager) -> None:
    """
    Render context summary in sidebar showing selected items.
    
    Args:
        context_manager: ContextManager instance
    """
    try:
        summary_result = context_manager.get_context_summary()
        
        if not summary_result.get("success"):
            st.error(f"Failed to load context: {summary_result.get('error')}")
            return
        
        selection_summary = summary_result.get("selection_summary", {})
        selected_items = summary_result.get("selected_items", {})
        
        # Summary metrics
        insights_count = selection_summary.get("insights", {}).get("count", 0)
        jtbds_count = selection_summary.get("jtbds", {}).get("count", 0)
        metrics_count = selection_summary.get("metrics", {}).get("count", 0)
        
        # Display counts with icons
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("💡 Insights", insights_count)
        with col2:
            st.metric("🎯 JTBDs", jtbds_count)
        with col3:
            st.metric("📊 Metrics", metrics_count)
        
        # Show selected items if any exist
        total_items = insights_count + jtbds_count + metrics_count
        
        if total_items > 0:
            # Expandable sections for each type
            if insights_count > 0:
                with st.expander(f"💡 Selected Insights ({insights_count})"):
                    for insight in selected_items.get("insights", []):
                        _render_context_item_summary(insight, "insight", context_manager)
            
            if jtbds_count > 0:
                with st.expander(f"🎯 Selected JTBDs ({jtbds_count})"):
                    for jtbd in selected_items.get("jtbds", []):
                        _render_context_item_summary(jtbd, "jtbd", context_manager)
            
            if metrics_count > 0:
                with st.expander(f"📊 Selected Metrics ({metrics_count})"):
                    for metric in selected_items.get("metrics", []):
                        _render_context_item_summary(metric, "metric", context_manager)
        else:
            st.info("No items selected yet. Search and select insights, JTBDs, or metrics to build context.")
    
    except Exception as e:
        logger.error(f"Failed to render context summary: {e}")
        st.error(f"Failed to load context summary: {str(e)}")


def _render_context_item_summary(item: Dict[str, Any], item_type: str, context_manager) -> None:
    """Render individual context item with remove button."""
    try:
        item_id = item.get("id")
        
        # Create summary text based on type
        if item_type == "insight":
            summary_text = item.get("description", "")[:100]
        elif item_type == "jtbd":
            summary_text = item.get("statement", "")[:100]
        elif item_type == "metric":
            name = item.get("name", "")
            current = item.get("current_value", "")
            summary_text = f"{name}: {current}"
        else:
            summary_text = str(item)[:100]
        
        # Display with remove button
        col1, col2 = st.columns([3, 1])
        
        with col1:
            if len(summary_text) > 100:
                summary_text = summary_text[:97] + "..."
            st.caption(summary_text)
        
        with col2:
            if st.button("❌", key=f"remove_{item_type}_{item_id}", help="Remove from context"):
                result = context_manager.remove_selection(item_type, item_id)
                if result.get("success"):
                    st.rerun()  # Refresh to update display
                else:
                    st.error(f"Failed to remove: {result.get('error')}")
    
    except Exception as e:
        logger.error(f"Failed to render context item: {e}")
        st.caption(f"Error displaying item: {str(e)}")


def render_token_budget_indicator(context_manager) -> None:
    """
    Render token budget indicator with progress bar.
    
    Args:
        context_manager: ContextManager instance
    """
    try:
        budget_status = context_manager.check_token_budget()
        
        tokens_used = budget_status.get("tokens_used", 0)
        tokens_available = budget_status.get("tokens_available", 0)
        percentage_used = budget_status.get("percentage_used", 0)
        status = budget_status.get("status", "good")
        
        # Header
        st.subheader("Token Budget")
        
        # Progress bar with color coding
        if status == "critical":
            progress_color = "🔴"
        elif status == "warning":
            progress_color = "🟡"
        elif status == "caution":
            progress_color = "🟠"
        else:
            progress_color = "🟢"
        
        # Progress bar
        progress_value = min(percentage_used / 100, 1.0)
        st.progress(progress_value)
        
        # Status info
        col1, col2 = st.columns(2)
        with col1:
            st.metric("Used", f"{tokens_used:,}")
        with col2:
            st.metric("Available", f"{tokens_available:,}")
        
        st.caption(f"{progress_color} {percentage_used:.1f}% used ({status})")
        
        # Recommendations if needed
        recommendations = budget_status.get("recommendations", [])
        if recommendations:
            with st.expander("💡 Recommendations"):
                for rec in recommendations:
                    st.caption(f"• {rec}")
    
    except Exception as e:
        logger.error(f"Failed to render token budget: {e}")
        st.error(f"Failed to load token budget: {str(e)}")


def render_suggestions_section(suggestions: List[Dict[str, str]]) -> None:
    """
    Render suggestions section with action buttons.
    
    Args:
        suggestions: List of suggestion dictionaries with type, text, and action
    """
    try:
        if not suggestions:
            return
        
        st.subheader("💡 Suggestions")
        
        for i, suggestion in enumerate(suggestions):
            suggestion_type = suggestion.get("type", "info")
            text = suggestion.get("text", "")
            action = suggestion.get("action", "")
            
            # Icon and color based on type
            if suggestion_type == "action":
                icon = "🔧"
                color = "primary"
            elif suggestion_type == "warning":
                icon = "⚠️"
                color = "secondary"
            elif suggestion_type == "tip":
                icon = "💡"
                color = "secondary"
            else:
                icon = "ℹ️"
                color = "secondary"
            
            # Display suggestion
            col1, col2 = st.columns([3, 1])
            
            with col1:
                st.caption(f"{icon} {text}")
            
            with col2:
                # Action button (placeholder - actual actions would be implemented in main interface)
                if action and suggestion_type == "action":
                    button_key = f"suggestion_{i}_{action}"
                    if st.button("Apply", key=button_key, type=color, size="small"):
                        # Placeholder for action handling
                        st.info(f"Action: {action} (not implemented yet)")
    
    except Exception as e:
        logger.error(f"Failed to render suggestions: {e}")
        st.caption(f"Error displaying suggestions: {str(e)}")


def render_content_type_filter() -> List[str]:
    """
    Render content type filter checkboxes.
    
    Returns:
        List of selected content types
    """
    st.subheader("Search Filters")
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        search_chunks = st.checkbox("📄 Documents", value=True, help="Search document chunks")
    
    with col2:
        search_insights = st.checkbox("💡 Insights", value=True, help="Search customer insights")
    
    with col3:
        search_jtbds = st.checkbox("🎯 JTBDs", value=True, help="Search Jobs To Be Done")
    
    # Build filter list
    selected_types = []
    if search_chunks:
        selected_types.append("chunks")
    if search_insights:
        selected_types.append("insights")
    if search_jtbds:
        selected_types.append("jtbds")
    
    return selected_types


def render_search_stats(search_metadata: Dict[str, Any]) -> None:
    """
    Render search statistics and metadata.
    
    Args:
        search_metadata: Search metadata from ChatService
    """
    try:
        total_found = search_metadata.get("total_found", 0)
        similarity_threshold = search_metadata.get("similarity_threshold", 0)
        from_cache = search_metadata.get("from_cache", False)
        search_types = search_metadata.get("search_types", [])
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.metric("Results Found", total_found)
        
        with col2:
            st.metric("Similarity Threshold", f"{similarity_threshold:.2f}")
        
        with col3:
            cache_status = "✓ Cached" if from_cache else "🔄 Fresh"
            st.metric("Query", cache_status)
        
        # Search types
        if search_types:
            types_text = ", ".join(search_types)
            st.caption(f"Searched in: {types_text}")
    
    except Exception as e:
        logger.error(f"Failed to render search stats: {e}")
        st.caption(f"Error displaying search stats: {str(e)}")


def render_hmw_readiness_indicator(readiness_data: Dict[str, Any]) -> None:
    """
    Render HMW generation readiness indicator.
    
    Args:
        readiness_data: Readiness assessment from ChatService
    """
    try:
        readiness = readiness_data.get("readiness", "not_ready")
        score = readiness_data.get("score", 0)
        has_insights = readiness_data.get("has_insights", False)
        has_jtbds = readiness_data.get("has_jtbds", False)
        has_metrics = readiness_data.get("has_metrics", False)
        recommendations = readiness_data.get("recommendations", [])
        
        # Header with score
        st.subheader(f"HMW Readiness: {score}/100")
        
        # Progress bar
        progress_value = score / 100
        if readiness == "ready":
            progress_color = "🟢"
        elif readiness == "partially_ready":
            progress_color = "🟡"
        else:
            progress_color = "🔴"
        
        st.progress(progress_value)
        st.caption(f"{progress_color} Status: {readiness.replace('_', ' ').title()}")
        
        # Requirements checklist
        st.markdown("**Requirements:**")
        insight_icon = "✅" if has_insights else "❌"
        jtbd_icon = "✅" if has_jtbds else "❌"
        metric_icon = "✅" if has_metrics else "⭐"  # Optional
        
        st.markdown(f"- {insight_icon} Customer Insights")
        st.markdown(f"- {jtbd_icon} Jobs To Be Done")
        st.markdown(f"- {metric_icon} Metrics (optional)")
        
        # Recommendations
        if recommendations:
            st.markdown("**Recommendations:**")
            for rec in recommendations:
                st.caption(f"• {rec}")
    
    except Exception as e:
        logger.error(f"Failed to render HMW readiness: {e}")
        st.error(f"Error displaying readiness: {str(e)}")
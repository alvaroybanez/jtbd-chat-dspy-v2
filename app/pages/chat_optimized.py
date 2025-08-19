"""
Chat page for the JTBD Assistant Platform with optimized UX design.

This page contains the main conversational interface optimized for:
- Professional visual hierarchy without emoji clutter
- Optimal 20/80 sidebar/main content weight distribution  
- Contextual progressive disclosure
- Clean, spacious layout focused on conversation flow
"""

import streamlit as st
from typing import Optional
import logging
from datetime import datetime

from ..ui.components.chat_interface import render_chat_interface, clear_chat_history, export_chat_history

logger = logging.getLogger(__name__)


def chat_page() -> None:
    """Render optimized chat page with professional layout and minimal visual clutter."""
    try:
        # Configure page layout with optimal weight distribution (20% sidebar, 80% main)
        st.set_page_config(layout="wide")
        
        # Clean page header with essential controls only
        col1, col2, col3 = st.columns([4, 1, 1])
        
        with col1:
            st.subheader("Conversational Discovery Assistant")
            st.caption("Search research, build context, and generate actionable insights")
        
        with col2:
            if st.button("Export", help="Export chat history", type="secondary"):
                exported_text = export_chat_history()
                if exported_text:
                    st.download_button(
                        label="Download History",
                        data=exported_text,
                        file_name=f"chat_history_{datetime.now().strftime('%Y%m%d')}.txt",
                        mime="text/plain",
                        use_container_width=True
                    )
                else:
                    st.info("No chat history available")
        
        with col3:
            if st.button("Clear", help="Clear chat history", type="secondary"):
                clear_chat_history()
        
        st.markdown("---")
        
        # Main chat interface with optimal width allocation
        render_chat_interface()
        
        # Contextual guidance (condensed, professional, collapsed by default)
        with st.expander("Usage Guide", expanded=False):
            col1, col2 = st.columns(2)
            
            with col1:
                st.markdown("""
                **Getting Started:**
                - Search for insights and JTBDs
                - Build context by selecting relevant items
                - Generate How Might We questions
                """)
            
            with col2:
                st.markdown("""
                **Best Practices:**
                - Monitor token usage in sidebar
                - Use specific search terms
                - Review context before generating HMWs
                """)
                
    except Exception as e:
        logger.error(f"Failed to render chat page: {e}")
        st.error(f"Failed to load chat page: {str(e)}")
        st.caption("Please check the application logs for more details.")


def render_workflow_progress_sidebar() -> None:
    """Render vertical workflow progress in sidebar (space-efficient design)."""
    st.sidebar.markdown("### Workflow Progress")
    
    # Get current stage from session state
    current_stage = st.session_state.get('workflow_stage', 1)
    
    stages = [
        {"id": 1, "title": "Search & Select", "desc": "Find relevant content"},
        {"id": 2, "title": "Build Context", "desc": "Review selections"},
        {"id": 3, "title": "Generate HMWs", "desc": "Create questions"},
        {"id": 4, "title": "Explore & Chat", "desc": "Discuss insights"}
    ]
    
    for stage in stages:
        # Visual progress indicator
        if stage["id"] == current_stage:
            st.sidebar.markdown(f"**▶ {stage['id']}. {stage['title']}**")
            st.sidebar.caption(f"*Currently: {stage['desc']}*")
        elif stage["id"] < current_stage:
            st.sidebar.markdown(f"✓ {stage['id']}. {stage['title']}")
            st.sidebar.caption(stage['desc'])
        else:
            st.sidebar.markdown(f"○ {stage['id']}. {stage['title']}")
            st.sidebar.caption(stage['desc'])
    
    st.sidebar.markdown("---")


def render_context_controls_sidebar() -> None:
    """Render context management controls in sidebar with progressive disclosure."""
    # Context summary (always visible)
    st.sidebar.markdown("### Context Summary")
    
    # Token budget indicator (condensed)
    with st.sidebar.expander("Token Budget", expanded=False):
        st.info("Token usage tracking would be implemented here")
    
    # Search settings (collapsed unless needed)  
    with st.sidebar.expander("Search Settings", expanded=False):
        similarity_threshold = st.slider(
            "Similarity Threshold",
            min_value=0.0,
            max_value=1.0,
            value=0.7,
            step=0.05,
            help="Higher values return more similar results"
        )
        
        results_limit = st.selectbox(
            "Results per Type",
            options=[5, 10, 15, 20],
            index=1,
            help="Number of results to show per content type"
        )
        
        # Store settings
        st.session_state.search_settings = {
            "similarity_threshold": similarity_threshold,
            "results_limit": results_limit
        }
    
    # Quick actions (always accessible)
    st.sidebar.markdown("### Quick Actions")
    col1, col2 = st.sidebar.columns(2)
    
    with col1:
        if st.button("Clear All", type="secondary", use_container_width=True):
            # Clear all context
            st.success("Context cleared")
    
    with col2:
        if st.button("Add Items", type="secondary", use_container_width=True):
            # Switch to search mode
            st.session_state.workflow_stage = 1
            st.rerun()
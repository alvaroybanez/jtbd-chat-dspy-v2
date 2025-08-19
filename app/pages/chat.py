"""
Chat page for the JTBD Assistant Platform multi-page application.

This page contains the main conversational interface for searching and exploring
customer insights, JTBDs, and metrics through semantic search.
"""

import streamlit as st
from typing import Optional
import logging

from ..ui.components.chat_interface import render_chat_interface, clear_chat_history, export_chat_history

logger = logging.getLogger(__name__)


def chat_page() -> None:
    """Render the chat page with full interface."""
    try:
        # Page header with controls
        col1, col2, col3 = st.columns([3, 1, 1])
        
        with col1:
            st.markdown(
                "**Transform customer research into actionable insights and solutions**"
            )
        
        with col2:
            if st.button("📥 Export Chat", help="Export chat history"):
                exported_text = export_chat_history()
                if exported_text:
                    st.download_button(
                        label="Download Chat History",
                        data=exported_text,
                        file_name=f"jtbd_chat_history.txt",
                        mime="text/plain"
                    )
                else:
                    st.info("No chat history to export")
        
        with col3:
            if st.button("🗑️ Clear Chat", help="Clear chat history"):
                clear_chat_history()
        
        # Main chat interface
        render_chat_interface()
        
        # Footer tips
        st.markdown("---")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.caption("💡 **Tip:** Search for insights and JTBDs to build context for HMW generation")
        
        with col2:
            st.caption("📊 **Budget:** Monitor token usage in the sidebar")
        
        with col3:
            st.caption("🎯 **Goal:** Generate actionable How Might We questions")
            
    except Exception as e:
        logger.error(f"Failed to render chat page: {e}")
        st.error(f"Failed to load chat page: {str(e)}")
        st.caption("Please check the application logs for more details.")
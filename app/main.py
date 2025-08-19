"""
JTBD Assistant Platform - Main Streamlit Application

Single-user AI-powered application that transforms customer research into actionable insights,
How Might We (HMW) questions, and prioritized solutions through a conversational chat interface.
"""

import streamlit as st
import logging
from typing import Optional

from app.services.initialization import initialize_all_services
from app.ui.components import render_chat_interface, clear_chat_history, export_chat_history

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def initialize_app() -> bool:
    """
    Initialize the application services and session state.
    
    Returns:
        True if initialization successful, False otherwise
    """
    try:
        # Initialize services if not already done
        if "services_initialized" not in st.session_state:
            with st.spinner("Initializing services..."):
                result = initialize_all_services()
                
                if result.get("success"):
                    st.session_state.services_initialized = True
                    logger.info("Services initialized successfully")
                    return True
                else:
                    st.error(f"Failed to initialize services: {result.get('error')}")
                    return False
        
        return True
        
    except Exception as e:
        logger.error(f"App initialization failed: {e}")
        st.error(f"Failed to initialize application: {str(e)}")
        return False


def render_app_header() -> None:
    """Render the application header with navigation and controls."""
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


def render_error_state(error_message: str) -> None:
    """Render error state with troubleshooting information."""
    st.error("Application Error")
    st.markdown(f"**Error:** {error_message}")
    
    with st.expander("Troubleshooting"):
        st.markdown("""
        **Common Issues:**
        
        1. **Database Connection**: Ensure Supabase URL and key are configured in environment variables
        2. **OpenAI API**: Verify OpenAI API key is set and has sufficient credits
        3. **Dependencies**: Run `uv sync` to ensure all dependencies are installed
        4. **Database Schema**: Apply migrations from `supabase/migrations/` directory
        
        **Environment Variables Required:**
        - `SUPABASE_URL`
        - `SUPABASE_KEY` (or `SUPABASE_SECRET`)
        - `OPENAI_API_KEY`
        
        **Check Configuration:**
        ```bash
        # Test database connection
        uv run python app/core/database.py
        
        # Test embeddings
        uv run scripts/embedding_demo.py
        ```
        """)
    
    # Retry button
    if st.button("🔄 Retry Initialization"):
        # Clear initialization state to force retry
        if "services_initialized" in st.session_state:
            del st.session_state.services_initialized
        st.rerun()


def main():
    """Main Streamlit application entry point."""
    # Configure Streamlit page
    st.set_page_config(
        page_title="JTBD Assistant Platform",
        page_icon="🎯",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Application header
    st.title("🎯 JTBD Assistant Platform")
    render_app_header()
    
    # Initialize application
    if not initialize_app():
        render_error_state("Failed to initialize application services")
        return
    
    # Render main chat interface
    try:
        render_chat_interface()
        
    except Exception as e:
        logger.error(f"Failed to render chat interface: {e}")
        render_error_state(f"Chat interface error: {str(e)}")
    
    # Footer
    st.markdown("---")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.caption("💡 **Tip:** Search for insights and JTBDs to build context for HMW generation")
    
    with col2:
        st.caption("📊 **Budget:** Monitor token usage in the sidebar")
    
    with col3:
        st.caption("🎯 **Goal:** Generate actionable How Might We questions")


if __name__ == "__main__":
    main()
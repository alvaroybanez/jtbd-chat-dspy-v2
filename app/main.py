"""
JTBD Assistant Platform - Main Streamlit Application

Single-user AI-powered application that transforms customer research into actionable insights,
How Might We (HMW) questions, and prioritized solutions through a conversational chat interface.

Multi-page structure with:
- Chat interface for exploration and conversation
- Table views for metrics, insights, and JTBDs
"""

import streamlit as st
import logging
from typing import Optional

from app.services.initialization import initialize_all_services
from app.pages import chat, metrics, insights, jtbds

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
    """Render the application header."""
    st.markdown("**Transform customer research into actionable insights and solutions**")


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
    """Main Streamlit application entry point with multi-page navigation."""
    # Configure Streamlit page
    st.set_page_config(
        page_title="JTBD Assistant Platform",
        page_icon="🎯",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Force sidebar width reduction with more aggressive CSS targeting
    st.markdown("""
    <style>
    /* Force narrow sidebar width with multiple selectors */
    .css-1d391kg, .css-1lcbmhc, .css-1outpf7, .css-17eq0hr,
    .css-1r6slb0, .css-1cypcdb, .css-12oz5g7, [data-testid="stSidebar"] {
        width: 240px !important;
        min-width: 240px !important;
        max-width: 240px !important;
        flex: 0 0 240px !important;
    }
    
    /* Adjust main content area */
    .css-18e3th9, .css-1n76uvr, .css-6qob1r, [data-testid="stAppViewContainer"] > .main {
        margin-left: 240px !important;
        padding-left: 1rem !important;
        width: calc(100vw - 240px) !important;
    }
    
    /* Compact workflow stepper */
    .stColumns > div[data-testid="column"] {
        padding: 0.2rem !important;
        margin: 0.1rem !important;
    }
    
    /* Reduce sidebar padding */
    .css-1d391kg .block-container {
        padding: 0.5rem !important;
    }
    </style>
    """, unsafe_allow_html=True)
    
    # Initialize application services first
    if not initialize_app():
        render_error_state("Failed to initialize application services")
        return
    
    # Define pages for navigation
    pages = [
        st.Page(chat.chat_page, title="Chat Assistant", icon="💬", default=True),
        st.Page(metrics.metrics_page, title="Metrics", icon="📊"),
        st.Page(insights.insights_page, title="Insights", icon="💡"),
        st.Page(jtbds.jtbds_page, title="Jobs to be Done", icon="🎯"),
    ]
    
    # Create navigation with horizontal tabs at top
    try:
        pg = st.navigation(pages, position="top")
        
        # Clean application header (remove duplicate title)
        st.markdown("### Transform customer research into actionable insights and solutions")
        st.markdown("---")
        
        # Run the selected page
        pg.run()
        
    except Exception as e:
        logger.error(f"Failed to render application: {e}")
        render_error_state(f"Application error: {str(e)}")


if __name__ == "__main__":
    main()
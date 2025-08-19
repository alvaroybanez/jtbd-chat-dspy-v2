"""
Optimized Main Streamlit Application for JTBD Assistant Platform

Features professional UX design with:
- Consistent layout patterns across all pages
- Optimal weight distribution (20/80 for chat, 15/85 for tables)
- Clean visual hierarchy without emoji clutter
- Professional typography and spacing
- Contextual navigation and progressive disclosure
"""

import streamlit as st
import logging
from typing import Optional

from app.services.initialization import initialize_all_services

# Import optimized page modules
from app.pages import chat_optimized as chat
from app.pages import metrics_optimized as metrics
from app.pages import insights, jtbds

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def initialize_app() -> bool:
    """Initialize application services and session state."""
    try:
        if "services_initialized" not in st.session_state:
            with st.spinner("Initializing services..."):
                result = initialize_all_services()
                
                if result.get("success"):
                    st.session_state.services_initialized = True
                    logger.info("Services initialized successfully")
                    return True
                else:
                    st.error(f"Service initialization failed: {result.get('error')}")
                    return False
        
        return True
        
    except Exception as e:
        logger.error(f"App initialization failed: {e}")
        st.error(f"Application initialization failed: {str(e)}")
        return False


def render_error_state(error_message: str) -> None:
    """Render clean error state with troubleshooting guidance."""
    st.error("Application Error")
    st.markdown(f"**Error:** {error_message}")
    
    with st.expander("Troubleshooting Guide", expanded=False):
        st.markdown("""
        **Required Environment Variables:**
        - `SUPABASE_URL` - Your Supabase project URL
        - `SUPABASE_KEY` - Your Supabase service key  
        - `OPENAI_API_KEY` - Your OpenAI API key
        
        **Common Solutions:**
        1. **Database Connection**: Verify Supabase credentials are correct
        2. **API Access**: Check OpenAI API key and account credits
        3. **Dependencies**: Run `uv sync` to install required packages
        4. **Schema**: Apply database migrations from `supabase/migrations/`
        
        **Diagnostic Commands:**
        ```bash
        # Test database connection
        uv run python app/core/database.py
        
        # Test embeddings service
        uv run scripts/embedding_demo.py
        ```
        """)
    
    # Retry option
    if st.button("Retry Initialization", type="primary"):
        if "services_initialized" in st.session_state:
            del st.session_state.services_initialized
        st.rerun()


def configure_page_layout():
    """Configure Streamlit page with optimal settings."""
    st.set_page_config(
        page_title="JTBD Assistant Platform",
        page_icon="🎯",
        layout="wide",
        initial_sidebar_state="expanded",
        menu_items={
            'Get Help': None,
            'Report a bug': None,
            'About': "JTBD Assistant Platform - Transform research into actionable insights"
        }
    )


def render_app_header():
    """Render clean, professional application header."""
    # Main title without emoji clutter
    st.title("JTBD Assistant Platform")
    st.markdown(
        "**Transform customer research into actionable insights and prioritized solutions**"
    )
    st.markdown("---")


def get_optimized_pages():
    """Define page navigation with consistent patterns."""
    return [
        st.Page(
            chat.chat_page, 
            title="Chat Assistant", 
            icon="💬",
            default=True,
            url_path="chat"
        ),
        st.Page(
            metrics.metrics_page,
            title="Metrics",
            icon="📊", 
            url_path="metrics"
        ),
        st.Page(
            insights.insights_page,
            title="Insights",
            icon="💡",
            url_path="insights"
        ),
        st.Page(
            jtbds.jtbds_page,
            title="Jobs to be Done",
            icon="🎯",
            url_path="jtbds"
        ),
    ]


def apply_custom_styling():
    """Apply consistent styling across all pages."""
    st.markdown("""
    <style>
    /* Optimize sidebar width for different page types */
    .css-1d391kg {  /* Sidebar */
        width: 280px !important;  /* 20% of 1400px viewport for chat */
    }
    
    /* Table pages get narrower sidebar */
    .metrics-page .css-1d391kg,
    .insights-page .css-1d391kg,
    .jtbds-page .css-1d391kg {
        width: 210px !important;  /* 15% of 1400px viewport for tables */
    }
    
    /* Professional typography */
    .main .block-container {
        padding-top: 2rem;
        padding-bottom: 2rem;
        max-width: 100%;
    }
    
    /* Clean button styling */
    .stButton > button {
        border-radius: 4px;
        border: 1px solid #ddd;
        font-weight: 500;
    }
    
    .stButton > button[kind="primary"] {
        background: #0066cc;
        border-color: #0066cc;
    }
    
    .stButton > button[kind="secondary"] {
        background: white;
        color: #666;
        border-color: #ddd;
    }
    
    /* Consistent spacing */
    .element-container {
        margin-bottom: 1rem;
    }
    
    /* Professional table styling */
    .stDataFrame {
        border: 1px solid #e6e6e6;
        border-radius: 4px;
    }
    
    /* Clean expandable sections */
    .streamlit-expanderHeader {
        font-weight: 600;
        color: #333;
    }
    
    /* Remove excessive padding */
    .css-1y4p8pa {
        padding: 0.5rem 1rem;
    }
    </style>
    """, unsafe_allow_html=True)


def main():
    """Main application entry point with optimized UX patterns."""
    # Configure page settings
    configure_page_layout()
    
    # Apply consistent styling
    apply_custom_styling()
    
    # Initialize services
    if not initialize_app():
        render_error_state("Failed to initialize application services")
        return
    
    # Render clean header
    render_app_header()
    
    # Navigation with optimized pages
    try:
        pages = get_optimized_pages()
        pg = st.navigation(pages, position="top")
        
        # Add page-specific CSS class for conditional styling
        current_page = pg.title.lower().replace(" ", "-")
        st.markdown(f'<div class="{current_page}-page">', unsafe_allow_html=True)
        
        # Run selected page
        pg.run()
        
        st.markdown('</div>', unsafe_allow_html=True)
        
    except Exception as e:
        logger.error(f"Failed to render application: {e}")
        render_error_state(f"Application error: {str(e)}")


def render_footer():
    """Render optional footer with usage statistics or help links."""
    st.markdown("---")
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.caption("**Quick Start:** Upload documents, extract insights, create JTBDs")
    
    with col2:
        st.caption("**Best Practice:** Build context before generating HMWs")
    
    with col3:
        st.caption("**Support:** Check troubleshooting guide if issues occur")


if __name__ == "__main__":
    main()
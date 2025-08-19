"""
Insights page for the JTBD Assistant Platform.

Displays all insights in a table format with source documents, timestamps,
and content preview. Provides filtering, sorting, and export capabilities.
"""

import streamlit as st
import pandas as pd
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

from ..services.data_service import get_data_service

logger = logging.getLogger(__name__)


def insights_page() -> None:
    """Render the insights table page."""
    st.header("💡 Insights Overview")
    st.caption("All extracted insights with source documents")
    
    try:
        # Get data service
        data_service = get_data_service()
        
        if not data_service:
            st.error("Data service not available")
            return
            
        # Fetch all insights
        with st.spinner("Loading insights..."):
            result = data_service.get_all_insights()
        
        if not result.get("success"):
            st.error(f"Failed to load insights: {result.get('error', 'Unknown error')}")
            return
        
        insights_data = result.get("insights", [])
        
        if not insights_data:
            st.info("No insights found. Upload documents and extract insights using the chat interface.")
            return
        
        # Display insights count
        st.success(f"Found {len(insights_data)} insights")
        
        # Create filters
        col1, col2, col3 = st.columns([2, 2, 1])
        
        with col1:
            # Search filter
            search_term = st.text_input(
                "🔍 Search insights",
                placeholder="Search by description or source...",
                help="Filter insights by description or source document"
            )
        
        with col2:
            # Source document filter
            all_sources = list(set(
                insight.get("documents", {}).get("title", "Unknown") 
                for insight in insights_data
                if insight.get("documents")
            ))
            selected_sources = st.multiselect(
                "Filter by Source Document",
                options=all_sources,
                default=all_sources,
                help="Filter insights by source document"
            )
        
        with col3:
            # Export button
            if st.button("📥 Export", help="Export insights as CSV"):
                _export_insights_csv(insights_data)
        
        # Filter data
        filtered_insights = _filter_insights(insights_data, search_term, selected_sources)
        
        if not filtered_insights:
            st.warning("No insights match the current filters.")
            return
        
        # Convert to DataFrame for better display
        df = _insights_to_dataframe(filtered_insights)
        
        # Display insights table
        st.subheader(f"Insights Table ({len(filtered_insights)} items)")
        
        # Configure column display
        column_config = {
            "Description": st.column_config.TextColumn("Description", width="large"),
            "Source Document": st.column_config.TextColumn("Source", width="medium"),
            "Created": st.column_config.DatetimeColumn("Created", format="MMM DD, YYYY"),
            "Description Length": st.column_config.NumberColumn("Length", help="Character count")
        }
        
        # Display table with selection
        event = st.dataframe(
            df,
            column_config=column_config,
            hide_index=True,
            use_container_width=True,
            on_select="rerun",
            selection_mode="multi-row"
        )
        
        # Show insight details for selected rows
        if event.selection.rows:
            _show_selected_insights_details(filtered_insights, event.selection.rows)
        
        # Summary statistics
        _render_insights_summary(filtered_insights)
        
    except Exception as e:
        logger.error(f"Failed to render insights page: {e}")
        st.error(f"Failed to load insights page: {str(e)}")


def _filter_insights(
    insights: List[Dict[str, Any]], 
    search_term: str, 
    selected_sources: List[str]
) -> List[Dict[str, Any]]:
    """Filter insights based on search term and selected sources."""
    filtered = insights
    
    # Filter by search term
    if search_term:
        search_lower = search_term.lower()
        filtered = [
            insight for insight in filtered
            if (search_lower in insight.get("description", "").lower() or
                search_lower in insight.get("documents", {}).get("title", "").lower())
        ]
    
    # Filter by source documents
    if selected_sources:
        filtered = [
            insight for insight in filtered
            if insight.get("documents", {}).get("title", "Unknown") in selected_sources
        ]
    
    return filtered


def _insights_to_dataframe(insights: List[Dict[str, Any]]) -> pd.DataFrame:
    """Convert insights data to DataFrame for display."""
    rows = []
    
    for insight in insights:
        # Get source document info
        source_info = insight.get("documents", {})
        source_title = source_info.get("title", "Unknown")
        
        # Format creation date
        created_at = insight.get("created_at")
        created_date = None
        if created_at:
            try:
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                created_date = None
        
        # Prepare description preview
        description = insight.get("description", "")
        description_preview = description[:150] + ("..." if len(description) > 150 else "")
        
        row = {
            "Description": description_preview or "No description",
            "Source Document": source_title,
            "Created": created_date,
            "Description Length": len(description)
        }
        rows.append(row)
    
    return pd.DataFrame(rows)


def _show_selected_insights_details(insights: List[Dict[str, Any]], selected_indices: List[int]) -> None:
    """Show detailed information for selected insights."""
    st.subheader("Selected Insights Details")
    
    for idx in selected_indices:
        if idx < len(insights):
            insight = insights[idx]
            
            # Create insight title
            description = insight.get("description", "")
            title = description[:50] + "..." if len(description) > 50 else description or "Unnamed Insight"
            
            with st.expander(f"💡 {title}", expanded=True):
                # Full description
                if description:
                    st.write("**Description:**")
                    st.text_area(
                        "Description",
                        value=description,
                        height=200,
                        disabled=True,
                        key=f"insight_description_{insight.get('id')}"
                    )
                
                # Source document info
                source_info = insight.get("documents", {})
                if source_info:
                    st.write("**Source Document:**")
                    col1, col2 = st.columns(2)
                    with col1:
                        st.caption(f"Title: {source_info.get('title', 'Unknown')}")
                    with col2:
                        if source_info.get("id"):
                            st.caption(f"Document ID: {source_info['id']}")
                
                # Metadata
                st.caption(
                    f"Insight ID: {insight.get('id')} | "
                    f"Created: {insight.get('created_at', 'Unknown')} | "
                    f"Length: {len(description)} characters"
                )


def _render_insights_summary(insights: List[Dict[str, Any]]) -> None:
    """Render summary statistics for insights."""
    st.subheader("Summary Statistics")
    
    if not insights:
        return
    
    # Calculate statistics
    total_insights = len(insights)
    
    # Source document statistics
    source_counts = {}
    total_content_length = 0
    
    for insight in insights:
        # Count by source
        source = insight.get("documents", {}).get("title", "Unknown")
        source_counts[source] = source_counts.get(source, 0) + 1
        
        # Total description length
        description_length = len(insight.get("description", ""))
        total_content_length += description_length
    
    unique_sources = len(source_counts)
    avg_content_length = total_content_length / total_insights if total_insights > 0 else 0
    
    # Display statistics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Total Insights", total_insights)
    
    with col2:
        st.metric("Source Documents", unique_sources)
    
    with col3:
        st.metric("Avg Length", f"{avg_content_length:.0f} chars")
    
    with col4:
        # Find most productive source
        if source_counts:
            top_source = max(source_counts.items(), key=lambda x: x[1])
            st.metric("Top Source", f"{top_source[1]} insights", delta=top_source[0][:20] + "...")
    
    # Show source distribution
    if len(source_counts) > 1:
        st.write("**Insights by Source Document:**")
        source_df = pd.DataFrame([
            {"Source": source, "Count": count, "Percentage": f"{(count/total_insights)*100:.1f}%"}
            for source, count in sorted(source_counts.items(), key=lambda x: x[1], reverse=True)
        ])
        
        st.dataframe(
            source_df,
            hide_index=True,
            use_container_width=True,
            column_config={
                "Source": st.column_config.TextColumn("Source Document", width="large"),
                "Count": st.column_config.NumberColumn("Insights Count"),
                "Percentage": st.column_config.TextColumn("% of Total", width="small")
            }
        )


def _export_insights_csv(insights: List[Dict[str, Any]]) -> None:
    """Export insights data as CSV."""
    try:
        # Create detailed export DataFrame
        rows = []
        
        for insight in insights:
            source_info = insight.get("documents", {})
            
            row = {
                "Description": insight.get("description", ""),
                "Source Document": source_info.get("title", "Unknown"),
                "Created At": insight.get("created_at", ""),
                "Description Length": len(insight.get("description", ""))
            }
            rows.append(row)
        
        df = pd.DataFrame(rows)
        csv = df.to_csv(index=False)
        
        st.download_button(
            label="Download Insights CSV",
            data=csv,
            file_name=f"jtbd_insights_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            help="Download all insights data as CSV file"
        )
        
    except Exception as e:
        st.error(f"Failed to export insights: {str(e)}")
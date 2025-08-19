"""
Metrics page for the JTBD Assistant Platform.

Displays all metrics in a table format with current/target values, units,
and creation timestamps. Provides filtering, sorting, and export capabilities.
"""

import streamlit as st
import pandas as pd
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

from ..services.metric_service import get_metric_service
from ..services.data_service import get_data_service

logger = logging.getLogger(__name__)


def metrics_page() -> None:
    """Render the metrics table page."""
    st.header("📊 Metrics Overview")
    st.caption("All metrics with current and target values")
    
    try:
        # Get services
        data_service = get_data_service()
        metric_service = get_metric_service()
        
        if not data_service:
            st.error("Data service not available")
            return
            
        # Fetch all metrics
        with st.spinner("Loading metrics..."):
            result = data_service.get_all_metrics()
        
        if not result.get("success"):
            st.error(f"Failed to load metrics: {result.get('error', 'Unknown error')}")
            return
        
        metrics_data = result.get("metrics", [])
        
        if not metrics_data:
            st.info("No metrics found. Create metrics using the chat interface.")
            
            # Option to create new metric
            with st.expander("➕ Create New Metric"):
                _render_metric_creation_form(metric_service)
            return
        
        # Display metrics count
        st.success(f"Found {len(metrics_data)} metrics")
        
        # Create filters
        col1, col2, col3 = st.columns([2, 2, 1])
        
        with col1:
            # Search filter
            search_term = st.text_input(
                "🔍 Search metrics",
                placeholder="Search by name or description...",
                help="Filter metrics by name or description"
            )
        
        with col2:
            # Unit filter
            all_units = list(set(metric.get("unit", "N/A") for metric in metrics_data))
            selected_units = st.multiselect(
                "Filter by Unit",
                options=all_units,
                default=all_units,
                help="Filter metrics by unit type"
            )
        
        with col3:
            # Export button
            if st.button("📥 Export", help="Export metrics as CSV"):
                _export_metrics_csv(metrics_data)
        
        # Filter data
        filtered_metrics = _filter_metrics(metrics_data, search_term, selected_units)
        
        if not filtered_metrics:
            st.warning("No metrics match the current filters.")
            return
        
        # Convert to DataFrame for better display
        df = _metrics_to_dataframe(filtered_metrics)
        
        # Display metrics table
        st.subheader(f"Metrics Table ({len(filtered_metrics)} items)")
        
        # Configure column display
        column_config = {
            "Name": st.column_config.TextColumn("Name", width="medium"),
            "Current Value": st.column_config.NumberColumn("Current", format="%.2f"),
            "Target Value": st.column_config.NumberColumn("Target", format="%.2f"),
            "Unit": st.column_config.TextColumn("Unit", width="small"),
            "Description": st.column_config.TextColumn("Description", width="large"),
            "Created": st.column_config.DatetimeColumn("Created", format="MMM DD, YYYY"),
            "Progress": st.column_config.ProgressColumn("Progress", min_value=0, max_value=100)
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
        
        # Show metric details for selected rows
        if event.selection.rows:
            _show_selected_metrics_details(filtered_metrics, event.selection.rows)
        
        # Summary statistics
        _render_metrics_summary(filtered_metrics)
        
    except Exception as e:
        logger.error(f"Failed to render metrics page: {e}")
        st.error(f"Failed to load metrics page: {str(e)}")


def _filter_metrics(
    metrics: List[Dict[str, Any]], 
    search_term: str, 
    selected_units: List[str]
) -> List[Dict[str, Any]]:
    """Filter metrics based on search term and selected units."""
    filtered = metrics
    
    # Filter by search term
    if search_term:
        search_lower = search_term.lower()
        filtered = [
            metric for metric in filtered
            if (search_lower in metric.get("name", "").lower() or
                search_lower in metric.get("description", "").lower())
        ]
    
    # Filter by units
    if selected_units:
        filtered = [
            metric for metric in filtered
            if metric.get("unit", "N/A") in selected_units
        ]
    
    return filtered


def _metrics_to_dataframe(metrics: List[Dict[str, Any]]) -> pd.DataFrame:
    """Convert metrics data to DataFrame for display."""
    rows = []
    
    for metric in metrics:
        # Calculate progress percentage
        current = metric.get("current_value", 0)
        target = metric.get("target_value", 1)
        progress = min(100, (current / target * 100)) if target > 0 else 0
        
        # Format creation date
        created_at = metric.get("created_at")
        created_date = None
        if created_at:
            try:
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                created_date = None
        
        row = {
            "Name": metric.get("name", "N/A"),
            "Current Value": metric.get("current_value", 0),
            "Target Value": metric.get("target_value", 0),
            "Unit": metric.get("unit", "N/A"),
            "Description": metric.get("description", "")[:100] + ("..." if len(metric.get("description", "")) > 100 else ""),
            "Created": created_date,
            "Progress": progress
        }
        rows.append(row)
    
    return pd.DataFrame(rows)


def _show_selected_metrics_details(metrics: List[Dict[str, Any]], selected_indices: List[int]) -> None:
    """Show detailed information for selected metrics."""
    st.subheader("Selected Metrics Details")
    
    for idx in selected_indices:
        if idx < len(metrics):
            metric = metrics[idx]
            
            with st.expander(f"📊 {metric.get('name', 'Unnamed Metric')}", expanded=True):
                col1, col2 = st.columns(2)
                
                with col1:
                    st.metric(
                        label="Current Value",
                        value=f"{metric.get('current_value', 0)} {metric.get('unit', '')}",
                        delta=None
                    )
                
                with col2:
                    st.metric(
                        label="Target Value", 
                        value=f"{metric.get('target_value', 0)} {metric.get('unit', '')}",
                        delta=None
                    )
                
                # Description
                if metric.get("description"):
                    st.write("**Description:**")
                    st.write(metric["description"])
                
                # Metadata
                st.caption(f"ID: {metric.get('id')} | Created: {metric.get('created_at', 'Unknown')}")


def _render_metrics_summary(metrics: List[Dict[str, Any]]) -> None:
    """Render summary statistics for metrics."""
    st.subheader("Summary Statistics")
    
    if not metrics:
        return
    
    # Calculate statistics
    total_metrics = len(metrics)
    units = list(set(metric.get("unit", "N/A") for metric in metrics))
    
    # Progress calculation
    progress_values = []
    for metric in metrics:
        current = metric.get("current_value", 0)
        target = metric.get("target_value", 1)
        if target > 0:
            progress_values.append(min(100, (current / target * 100)))
    
    avg_progress = sum(progress_values) / len(progress_values) if progress_values else 0
    
    # Display statistics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Total Metrics", total_metrics)
    
    with col2:
        st.metric("Unique Units", len(units))
    
    with col3:
        st.metric("Average Progress", f"{avg_progress:.1f}%")
    
    with col4:
        on_track = len([p for p in progress_values if p >= 80])
        st.metric("On Track (≥80%)", f"{on_track}/{total_metrics}")


def _export_metrics_csv(metrics: List[Dict[str, Any]]) -> None:
    """Export metrics data as CSV."""
    try:
        df = _metrics_to_dataframe(metrics)
        csv = df.to_csv(index=False)
        
        st.download_button(
            label="Download Metrics CSV",
            data=csv,
            file_name=f"jtbd_metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            help="Download all metrics data as CSV file"
        )
        
    except Exception as e:
        st.error(f"Failed to export metrics: {str(e)}")


def _render_metric_creation_form(metric_service) -> None:
    """Render form to create new metric."""
    if not metric_service:
        st.warning("Metric service not available")
        return
    
    st.write("Create a new metric to track progress:")
    
    with st.form("create_metric_form"):
        name = st.text_input("Metric Name", placeholder="e.g., Customer Satisfaction Score")
        description = st.text_area("Description", placeholder="What does this metric measure?")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            current_value = st.number_input("Current Value", value=0.0, step=0.1)
        with col2:
            target_value = st.number_input("Target Value", value=100.0, step=0.1)
        with col3:
            unit = st.text_input("Unit", placeholder="e.g., %, score, count")
        
        submitted = st.form_submit_button("Create Metric", type="primary")
        
        if submitted:
            if not name.strip():
                st.error("Metric name is required")
                return
            
            # Create metric
            result = metric_service.create_metric(
                name=name.strip(),
                description=description.strip(),
                current_value=current_value,
                target_value=target_value,
                unit=unit.strip() if unit.strip() else None
            )
            
            if result.get("success"):
                st.success(f"Metric '{name}' created successfully!")
                st.rerun()
            else:
                st.error(f"Failed to create metric: {result.get('error', 'Unknown error')}")
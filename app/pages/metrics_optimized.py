"""
Optimized Metrics page for the JTBD Assistant Platform.

Features optimized UX design with:
- Clean 15/85 sidebar/main content weight distribution for maximum table space
- Professional typography without emoji clutter
- Efficient filter layout and data visualization
- Consistent interaction patterns with other pages
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
    """Render optimized metrics table page with maximum horizontal space."""
    # Configure optimal layout for data tables (15% sidebar, 85% main)
    st.set_page_config(layout="wide")
    
    # Clean page header with essential information
    st.title("Metrics Overview")
    st.caption("Track progress with current and target values across all metrics")
    
    try:
        # Get services
        data_service = get_data_service()
        metric_service = get_metric_service()
        
        if not data_service:
            st.error("Data service not available")
            return
            
        # Fetch all metrics with loading indicator
        with st.spinner("Loading metrics data..."):
            result = data_service.get_all_metrics()
        
        if not result.get("success"):
            st.error(f"Failed to load metrics: {result.get('error', 'Unknown error')}")
            return
        
        metrics_data = result.get("metrics", [])
        
        if not metrics_data:
            # Empty state with clear call-to-action
            st.info("No metrics found. Create your first metric to start tracking progress.")
            
            col1, col2, col3 = st.columns([1, 2, 1])
            with col2:
                with st.expander("Create New Metric", expanded=True):
                    _render_metric_creation_form(metric_service)
            return
        
        # Success state with data overview
        st.success(f"Tracking {len(metrics_data)} metrics")
        
        # Efficient filter layout (horizontal, space-optimized)
        _render_filter_controls(metrics_data)
        
        # Apply filters and display data
        filtered_metrics = _apply_filters(metrics_data)
        
        if not filtered_metrics:
            st.warning("No metrics match current filters. Try adjusting your search criteria.")
            return
        
        # Main data table with optimal space utilization
        _render_metrics_table(filtered_metrics)
        
        # Summary statistics below table
        _render_summary_statistics(filtered_metrics)
        
    except Exception as e:
        logger.error(f"Failed to render metrics page: {e}")
        st.error(f"Failed to load metrics page: {str(e)}")


def _render_filter_controls(metrics_data: List[Dict[str, Any]]) -> None:
    """Render space-efficient filter controls in horizontal layout."""
    
    # Filter container with optimal space distribution
    col1, col2, col3, col4 = st.columns([3, 2, 2, 1])
    
    with col1:
        # Primary search filter
        search_term = st.text_input(
            "Search metrics",
            placeholder="Search by name or description...",
            help="Filter metrics by name or description",
            key="metric_search"
        )
    
    with col2:
        # Unit filter with smart defaults
        all_units = sorted(list(set(
            metric.get("unit", "No Unit") for metric in metrics_data
        )))
        selected_units = st.multiselect(
            "Filter by Unit",
            options=all_units,
            default=all_units,
            help="Filter metrics by unit type",
            key="unit_filter"
        )
    
    with col3:
        # Progress filter
        progress_filter = st.selectbox(
            "Progress Filter",
            options=["All", "On Track (≥80%)", "Behind (<80%)", "Not Started (0%)"],
            help="Filter by progress status",
            key="progress_filter"
        )
    
    with col4:
        # Export action
        if st.button("Export CSV", help="Export metrics as CSV", type="primary"):
            _export_metrics_csv(metrics_data)
    
    # Store filter values in session state for processing
    st.session_state.metric_filters = {
        "search_term": search_term,
        "selected_units": selected_units,
        "progress_filter": progress_filter
    }


def _apply_filters(metrics_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Apply all active filters to metrics data."""
    filtered = metrics_data
    filters = st.session_state.get("metric_filters", {})
    
    # Search filter
    search_term = filters.get("search_term", "")
    if search_term:
        search_lower = search_term.lower()
        filtered = [
            metric for metric in filtered
            if (search_lower in metric.get("name", "").lower() or
                search_lower in metric.get("description", "").lower())
        ]
    
    # Unit filter
    selected_units = filters.get("selected_units", [])
    if selected_units:
        filtered = [
            metric for metric in filtered
            if metric.get("unit", "No Unit") in selected_units
        ]
    
    # Progress filter
    progress_filter = filters.get("progress_filter", "All")
    if progress_filter != "All":
        def get_progress(metric):
            current = metric.get("current_value", 0)
            target = metric.get("target_value", 1)
            return (current / target * 100) if target > 0 else 0
        
        if progress_filter == "On Track (≥80%)":
            filtered = [m for m in filtered if get_progress(m) >= 80]
        elif progress_filter == "Behind (<80%)":
            filtered = [m for m in filtered if 0 < get_progress(m) < 80]
        elif progress_filter == "Not Started (0%)":
            filtered = [m for m in filtered if get_progress(m) == 0]
    
    return filtered


def _render_metrics_table(metrics: List[Dict[str, Any]]) -> None:
    """Render optimized metrics table with maximum horizontal space."""
    
    st.subheader(f"Metrics Data ({len(metrics)} items)")
    
    # Convert to DataFrame for optimal display
    df = _metrics_to_dataframe(metrics)
    
    # Configure columns with professional styling
    column_config = {
        "Name": st.column_config.TextColumn(
            "Metric Name",
            help="Name of the metric being tracked",
            max_chars=50,
            width="medium"
        ),
        "Current": st.column_config.NumberColumn(
            "Current Value",
            format="%.2f",
            width="small"
        ),
        "Target": st.column_config.NumberColumn(
            "Target Value", 
            format="%.2f",
            width="small"
        ),
        "Unit": st.column_config.TextColumn(
            "Unit",
            width="small"
        ),
        "Progress": st.column_config.ProgressColumn(
            "Progress %",
            help="Progress toward target",
            min_value=0,
            max_value=100,
            width="small"
        ),
        "Description": st.column_config.TextColumn(
            "Description",
            help="Detailed description of the metric",
            width="large"
        ),
        "Created": st.column_config.DatetimeColumn(
            "Created Date",
            format="MMM DD, YYYY",
            width="small"
        )
    }
    
    # Display table with selection capability
    event = st.dataframe(
        df,
        column_config=column_config,
        hide_index=True,
        use_container_width=True,
        on_select="rerun",
        selection_mode="multi-row",
        height=400
    )
    
    # Show details for selected metrics
    if event.selection.rows:
        _render_selected_metrics_details(metrics, event.selection.rows)


def _render_selected_metrics_details(metrics: List[Dict[str, Any]], selected_indices: List[int]) -> None:
    """Render detailed view of selected metrics with clean layout."""
    
    st.subheader("Selected Metrics Details")
    
    # Organize selected metrics in columns for space efficiency
    num_selected = len(selected_indices)
    cols_per_row = min(3, num_selected)
    cols = st.columns(cols_per_row)
    
    for i, idx in enumerate(selected_indices):
        if idx < len(metrics):
            metric = metrics[idx]
            
            with cols[i % cols_per_row]:
                # Clean metric card without emoji clutter
                st.markdown(f"**{metric.get('name', 'Unnamed Metric')}**")
                
                # Progress visualization
                current = metric.get('current_value', 0)
                target = metric.get('target_value', 0)
                unit = metric.get('unit', '')
                
                if target > 0:
                    progress_pct = min(100, (current / target * 100))
                    st.progress(progress_pct / 100)
                    st.caption(f"{current} / {target} {unit} ({progress_pct:.1f}%)")
                else:
                    st.caption(f"Current: {current} {unit}")
                
                # Description
                description = metric.get("description", "")
                if description:
                    st.caption(description[:100] + ("..." if len(description) > 100 else ""))
                
                # Metadata
                created_at = metric.get("created_at", "")
                if created_at:
                    try:
                        created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        st.caption(f"Created: {created_date.strftime('%b %d, %Y')}")
                    except:
                        st.caption(f"Created: {created_at}")


def _render_summary_statistics(metrics: List[Dict[str, Any]]) -> None:
    """Render summary statistics with clean, professional layout."""
    
    st.subheader("Summary Statistics")
    
    if not metrics:
        return
    
    # Calculate key statistics
    total_metrics = len(metrics)
    unique_units = len(set(metric.get("unit", "No Unit") for metric in metrics))
    
    # Progress calculations
    progress_values = []
    on_track_count = 0
    
    for metric in metrics:
        current = metric.get("current_value", 0)
        target = metric.get("target_value", 1)
        
        if target > 0:
            progress = min(100, (current / target * 100))
            progress_values.append(progress)
            if progress >= 80:
                on_track_count += 1
    
    avg_progress = sum(progress_values) / len(progress_values) if progress_values else 0
    
    # Display statistics in clean layout
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Total Metrics", total_metrics)
    
    with col2:
        st.metric("Unique Units", unique_units)
    
    with col3:
        st.metric("Average Progress", f"{avg_progress:.1f}%")
    
    with col4:
        st.metric("On Track", f"{on_track_count}/{total_metrics}")


def _metrics_to_dataframe(metrics: List[Dict[str, Any]]) -> pd.DataFrame:
    """Convert metrics data to optimized DataFrame for table display."""
    rows = []
    
    for metric in metrics:
        # Calculate progress
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
        
        # Truncate description for table display
        description = metric.get("description", "")
        truncated_desc = description[:80] + ("..." if len(description) > 80 else "")
        
        row = {
            "Name": metric.get("name", "Unnamed"),
            "Current": current,
            "Target": target,
            "Unit": metric.get("unit", ""),
            "Progress": progress,
            "Description": truncated_desc,
            "Created": created_date
        }
        rows.append(row)
    
    return pd.DataFrame(rows)


def _export_metrics_csv(metrics: List[Dict[str, Any]]) -> None:
    """Export metrics data as CSV with user-friendly filename."""
    try:
        df = _metrics_to_dataframe(metrics)
        csv = df.to_csv(index=False)
        
        filename = f"jtbd_metrics_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        
        st.download_button(
            label="Download Metrics CSV",
            data=csv,
            file_name=filename,
            mime="text/csv",
            help="Download all metrics data as CSV file",
            type="primary"
        )
        
    except Exception as e:
        st.error(f"Export failed: {str(e)}")


def _render_metric_creation_form(metric_service) -> None:
    """Render streamlined metric creation form."""
    if not metric_service:
        st.warning("Metric service not available")
        return
    
    st.markdown("**Create New Metric**")
    st.caption("Define a metric to track progress toward your goals")
    
    with st.form("create_metric_form", clear_on_submit=True):
        # Essential fields in clean layout
        name = st.text_input(
            "Metric Name *",
            placeholder="Customer Satisfaction Score",
            help="Clear, descriptive name for your metric"
        )
        
        description = st.text_area(
            "Description",
            placeholder="What does this metric measure and why is it important?",
            help="Optional context about the metric's purpose"
        )
        
        # Value inputs in columns
        col1, col2, col3 = st.columns(3)
        with col1:
            current_value = st.number_input(
                "Current Value *",
                value=0.0,
                step=0.1,
                help="Current state of the metric"
            )
        with col2:
            target_value = st.number_input(
                "Target Value *",
                value=100.0,
                step=0.1,
                help="Desired target for this metric"
            )
        with col3:
            unit = st.text_input(
                "Unit",
                placeholder="%, points, count",
                help="Unit of measurement (optional)"
            )
        
        # Submit button
        submitted = st.form_submit_button(
            "Create Metric",
            type="primary",
            use_container_width=True
        )
        
        if submitted:
            if not name.strip():
                st.error("Metric name is required")
                return
            
            # Create metric
            result = metric_service.create_metric(
                name=name.strip(),
                description=description.strip() or None,
                current_value=current_value,
                target_value=target_value,
                unit=unit.strip() or None
            )
            
            if result.get("success"):
                st.success(f"Metric '{name}' created successfully!")
                st.rerun()
            else:
                st.error(f"Failed to create metric: {result.get('error', 'Unknown error')}")


def render_metrics_sidebar() -> None:
    """Render space-efficient sidebar for metrics page."""
    st.sidebar.markdown("### Metrics Actions")
    
    # Quick stats
    with st.sidebar.expander("Quick Stats", expanded=True):
        st.info("Metrics statistics displayed here")
    
    # Filters summary (if active)
    filters = st.session_state.get("metric_filters", {})
    active_filters = sum(1 for v in filters.values() if v)
    
    if active_filters > 0:
        st.sidebar.markdown(f"**Active Filters:** {active_filters}")
        if st.sidebar.button("Clear All Filters", type="secondary"):
            st.session_state.metric_filters = {}
            st.rerun()
    
    # Create new metric shortcut
    st.sidebar.markdown("### Quick Actions")
    if st.sidebar.button("Create New Metric", type="primary"):
        # Could open a modal or switch to creation mode
        st.info("Metric creation form available in main content area")
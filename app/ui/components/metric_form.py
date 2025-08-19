"""
Metric creation form component for manual metric input.
Provides a user-friendly interface for creating metrics with validation.
"""

import streamlit as st
from typing import Dict, Any, Optional, Union
import logging

logger = logging.getLogger(__name__)


def render_metric_creation_form(
    metric_service=None,
    key_prefix: str = "metric_form"
) -> Optional[Dict[str, Any]]:
    """
    Render metric creation form with validation.
    
    Args:
        metric_service: MetricService instance for creation operations
        key_prefix: Unique prefix for form component keys
    
    Returns:
        Dict with creation result if metric was created, None otherwise
    """
    if not metric_service:
        st.error("Metric service not available")
        return None
    
    st.subheader("📊 Create New Metric")
    st.caption("Define a performance metric to track progress")
    
    with st.form(key=f"{key_prefix}_form", clear_on_submit=False):
        # Name field (required)
        name = st.text_input(
            "Metric Name *",
            placeholder="e.g., Customer Satisfaction Score, Response Time, etc.",
            help="Enter a descriptive name for this metric",
            key=f"{key_prefix}_name"
        )
        
        # Value fields in columns
        col1, col2 = st.columns(2)
        
        with col1:
            current_value = st.number_input(
                "Current Value",
                value=None,
                placeholder="0.0",
                help="The current measured value of this metric",
                key=f"{key_prefix}_current",
                format="%.2f"
            )
        
        with col2:
            target_value = st.number_input(
                "Target Value",
                value=None,
                placeholder="0.0", 
                help="The desired target value for this metric",
                key=f"{key_prefix}_target",
                format="%.2f"
            )
        
        # Unit field
        unit = st.text_input(
            "Unit",
            placeholder="e.g., %, seconds, points, $, etc.",
            help="Unit of measurement for this metric",
            key=f"{key_prefix}_unit"
        )
        
        # Form submission buttons
        col1, col2 = st.columns(2)
        
        with col1:
            submit_button = st.form_submit_button(
                "Create Metric",
                type="primary",
                use_container_width=True
            )
        
        with col2:
            preview_button = st.form_submit_button(
                "Preview",
                type="secondary",
                use_container_width=True
            )
    
    # Handle preview mode
    if preview_button:
        if name:
            _render_metric_preview(name, current_value, target_value, unit)
        else:
            st.warning("Please enter a metric name to preview")
        return None
    
    # Handle form submission
    if submit_button:
        return _handle_metric_submission(
            metric_service=metric_service,
            name=name,
            current_value=current_value,
            target_value=target_value,
            unit=unit,
            key_prefix=key_prefix
        )
    
    return None


def _render_metric_preview(
    name: str, 
    current_value: Optional[float], 
    target_value: Optional[float], 
    unit: Optional[str]
) -> None:
    """Render a preview of how the metric will look."""
    st.info("**Preview:**")
    
    with st.container():
        st.write(f"**Name:** {name}")
        
        if current_value is not None:
            value_str = f"{current_value}"
            if unit and unit.strip():
                value_str += f" {unit.strip()}"
            st.write(f"**Current Value:** {value_str}")
        
        if target_value is not None:
            value_str = f"{target_value}"
            if unit and unit.strip():
                value_str += f" {unit.strip()}"
            st.write(f"**Target Value:** {value_str}")
        
        # Show progress calculation if both values present
        if current_value is not None and target_value is not None:
            try:
                if target_value != 0:
                    progress = (current_value / target_value) * 100
                    st.write(f"**Progress:** {progress:.1f}%")
                    
                    # Progress bar
                    st.progress(min(progress / 100, 1.0))
            except (TypeError, ZeroDivisionError):
                pass


def _handle_metric_submission(
    metric_service,
    name: str,
    current_value: Optional[float],
    target_value: Optional[float],
    unit: Optional[str],
    key_prefix: str
) -> Dict[str, Any]:
    """Handle metric form submission with validation."""
    try:
        # Validate inputs
        validation_result = metric_service.validate_metric_input(
            name=name,
            current_value=current_value,
            target_value=target_value,
            unit=unit
        )
        
        if not validation_result.get("valid"):
            errors = validation_result.get("errors", [])
            for error in errors:
                st.error(f"❌ {error}")
            return {"success": False, "errors": errors}
        
        # Show warnings if any
        warnings = validation_result.get("warnings", [])
        for warning in warnings:
            st.warning(f"⚠️ {warning}")
        
        # Create metric
        with st.spinner("Creating metric..."):
            result = metric_service.create_metric(
                name=name,
                current_value=current_value,
                target_value=target_value,
                unit=unit if unit and unit.strip() else None
            )
        
        if result.get("success"):
            st.success(f"✅ {result.get('message', 'Metric created successfully!')}")
            
            # Show created metric details
            metric_data = result.get("metric", {})
            with st.expander("Created Metric Details", expanded=False):
                details = {
                    "id": metric_data.get("id"),
                    "name": metric_data.get("name"),
                    "current_value": metric_data.get("current_value"),
                    "target_value": metric_data.get("target_value"),
                    "unit": metric_data.get("unit"),
                    "created_at": metric_data.get("created_at")
                }
                st.json(details)
            
            # Clear form on success
            st.rerun()
            
            return result
        else:
            error_msg = result.get("error", "Unknown error occurred")
            st.error(f"❌ Failed to create metric: {error_msg}")
            return result
            
    except Exception as e:
        logger.error(f"Error in metric form submission: {e}")
        st.error(f"❌ An unexpected error occurred: {str(e)}")
        return {"success": False, "error": str(e)}


def render_metric_form_modal(
    metric_service=None,
    modal_key: str = "metric_modal"
) -> Optional[Dict[str, Any]]:
    """
    Render metric creation form in a modal dialog.
    
    Args:
        metric_service: MetricService instance
        modal_key: Unique key for modal state
    
    Returns:
        Dict with creation result if metric was created, None otherwise
    """
    # Modal state management
    modal_state_key = f"{modal_key}_open"
    
    # Button to open modal
    if st.button("➕ Create Metric", key=f"{modal_key}_button"):
        st.session_state[modal_state_key] = True
    
    # Render modal if open
    if st.session_state.get(modal_state_key, False):
        # Create modal container
        with st.container():
            st.markdown("---")
            
            # Modal header with close button
            col1, col2 = st.columns([4, 1])
            with col1:
                st.markdown("### Create New Metric")
            with col2:
                if st.button("✖️", key=f"{modal_key}_close"):
                    st.session_state[modal_state_key] = False
                    st.rerun()
            
            # Render form
            result = render_metric_creation_form(metric_service, key_prefix=modal_key)
            
            # Close modal on successful creation
            if result and result.get("success"):
                st.session_state[modal_state_key] = False
            
            st.markdown("---")
            return result
    
    return None


def render_compact_metric_form(
    metric_service=None,
    key_prefix: str = "compact_metric"
) -> Optional[Dict[str, Any]]:
    """
    Render a compact version of metric creation form for sidebar use.
    
    Args:
        metric_service: MetricService instance
        key_prefix: Unique prefix for form components
    
    Returns:
        Dict with creation result if metric was created, None otherwise
    """
    if not metric_service:
        return None
    
    with st.expander("➕ Create Metric", expanded=False):
        # Compact form fields
        name = st.text_input(
            "Name *",
            placeholder="Metric name...",
            key=f"{key_prefix}_name"
        )
        
        # Values in columns
        col1, col2 = st.columns(2)
        with col1:
            current_value = st.number_input(
                "Current",
                value=None,
                key=f"{key_prefix}_current",
                format="%.2f"
            )
        with col2:
            target_value = st.number_input(
                "Target", 
                value=None,
                key=f"{key_prefix}_target",
                format="%.2f"
            )
        
        unit = st.text_input(
            "Unit",
            placeholder="%, $, etc.",
            key=f"{key_prefix}_unit"
        )
        
        # Submit button
        if st.button("Create", key=f"{key_prefix}_submit", use_container_width=True):
            if not name or not name.strip():
                st.error("Name is required")
                return None
            
            with st.spinner("Creating..."):
                result = metric_service.create_metric(
                    name=name,
                    current_value=current_value,
                    target_value=target_value,
                    unit=unit if unit and unit.strip() else None
                )
            
            if result.get("success"):
                st.success("Metric created!")
                # Clear inputs
                st.rerun()
                return result
            else:
                st.error(f"Failed: {result.get('error')}")
                return result
    
    return None


def render_metric_progress_card(metric: Dict[str, Any]) -> None:
    """
    Render a metric progress card showing current vs target values.
    
    Args:
        metric: Metric data dict with current_value, target_value, etc.
    """
    name = metric.get("name", "Unknown Metric")
    current = metric.get("current_value")
    target = metric.get("target_value")
    unit = metric.get("unit", "")
    
    with st.container():
        st.subheader(name)
        
        if current is not None and target is not None:
            # Show progress
            try:
                if target != 0:
                    progress = (current / target) * 100
                    
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.metric("Current", f"{current} {unit}")
                    with col2:
                        st.metric("Target", f"{target} {unit}")
                    with col3:
                        st.metric("Progress", f"{progress:.1f}%")
                    
                    # Progress bar
                    st.progress(min(progress / 100, 1.0))
                else:
                    st.warning("Cannot calculate progress: target value is zero")
            except (TypeError, ZeroDivisionError):
                st.error("Cannot calculate progress: invalid values")
        else:
            # Show available values
            if current is not None:
                st.metric("Current Value", f"{current} {unit}")
            if target is not None:
                st.metric("Target Value", f"{target} {unit}")
            if current is None and target is None:
                st.info("No values set for this metric")
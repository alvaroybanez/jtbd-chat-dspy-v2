"""
JTBD creation form component for manual JTBD input.
Provides a user-friendly interface for creating Jobs-to-be-Done with validation.
"""

import streamlit as st
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


def render_jtbd_creation_form(
    jtbd_service=None,
    key_prefix: str = "jtbd_form"
) -> Optional[Dict[str, Any]]:
    """
    Render JTBD creation form with validation.
    
    Args:
        jtbd_service: JTBDService instance for creation operations
        key_prefix: Unique prefix for form component keys
    
    Returns:
        Dict with creation result if JTBD was created, None otherwise
    """
    if not jtbd_service:
        st.error("JTBD service not available")
        return None
    
    st.subheader("🎯 Create New JTBD")
    st.caption("Define a Job-to-be-Done to help guide solution development")
    
    with st.form(key=f"{key_prefix}_form", clear_on_submit=False):
        # Statement field (required)
        statement = st.text_area(
            "JTBD Statement *",
            placeholder="When I..., I want to..., so that I can...",
            help="Describe the job the customer is trying to get done. Start with 'When I...' or similar.",
            key=f"{key_prefix}_statement"
        )
        
        # Context field (optional)
        context = st.text_area(
            "Context",
            placeholder="Additional context about when/where this job occurs...",
            help="Provide situational context about when this job typically arises.",
            key=f"{key_prefix}_context"
        )
        
        # Outcome field (optional)
        outcome = st.text_area(
            "Desired Outcome",
            placeholder="The ideal result or outcome the customer wants to achieve...",
            help="Describe what success looks like when this job is completed well.",
            key=f"{key_prefix}_outcome"
        )
        
        # Form submission buttons
        col1, col2 = st.columns(2)
        
        with col1:
            submit_button = st.form_submit_button(
                "Create JTBD",
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
        if statement:
            _render_jtbd_preview(statement, context, outcome)
        else:
            st.warning("Please enter a JTBD statement to preview")
        return None
    
    # Handle form submission
    if submit_button:
        return _handle_jtbd_submission(
            jtbd_service=jtbd_service,
            statement=statement,
            context=context,
            outcome=outcome,
            key_prefix=key_prefix
        )
    
    return None


def _render_jtbd_preview(statement: str, context: Optional[str], outcome: Optional[str]) -> None:
    """Render a preview of how the JTBD will look."""
    st.info("**Preview:**")
    
    with st.container():
        st.write(f"**Statement:** {statement}")
        
        if context and context.strip():
            st.write(f"**Context:** {context}")
        
        if outcome and outcome.strip():
            st.write(f"**Outcome:** {outcome}")


def _handle_jtbd_submission(
    jtbd_service,
    statement: str,
    context: Optional[str],
    outcome: Optional[str],
    key_prefix: str
) -> Dict[str, Any]:
    """Handle JTBD form submission with validation."""
    try:
        # Validate inputs
        validation_result = jtbd_service.validate_jtbd_input(statement, context, outcome)
        
        if not validation_result.get("valid"):
            errors = validation_result.get("errors", [])
            for error in errors:
                st.error(f"❌ {error}")
            return {"success": False, "errors": errors}
        
        # Show warnings if any
        warnings = validation_result.get("warnings", [])
        for warning in warnings:
            st.warning(f"⚠️ {warning}")
        
        # Create JTBD
        with st.spinner("Creating JTBD and generating embeddings..."):
            result = jtbd_service.create_jtbd(
                statement=statement,
                context=context if context and context.strip() else None,
                outcome=outcome if outcome and outcome.strip() else None,
                generate_embedding=True
            )
        
        if result.get("success"):
            st.success(f"✅ {result.get('message', 'JTBD created successfully!')}")
            
            # Show created JTBD details
            jtbd_data = result.get("jtbd", {})
            with st.expander("Created JTBD Details", expanded=False):
                st.json({
                    "id": jtbd_data.get("id"),
                    "statement": jtbd_data.get("statement"),
                    "context": jtbd_data.get("context"),
                    "outcome": jtbd_data.get("outcome"),
                    "created_at": jtbd_data.get("created_at")
                })
            
            # Clear form on success by triggering a rerun
            st.rerun()
            
            return result
        else:
            error_msg = result.get("error", "Unknown error occurred")
            st.error(f"❌ Failed to create JTBD: {error_msg}")
            return result
            
    except Exception as e:
        logger.error(f"Error in JTBD form submission: {e}")
        st.error(f"❌ An unexpected error occurred: {str(e)}")
        return {"success": False, "error": str(e)}


def render_jtbd_form_modal(
    jtbd_service=None,
    modal_key: str = "jtbd_modal"
) -> Optional[Dict[str, Any]]:
    """
    Render JTBD creation form in a modal dialog.
    
    Args:
        jtbd_service: JTBDService instance
        modal_key: Unique key for modal state
    
    Returns:
        Dict with creation result if JTBD was created, None otherwise
    """
    # Modal state management
    modal_state_key = f"{modal_key}_open"
    
    # Button to open modal
    if st.button("➕ Create JTBD", key=f"{modal_key}_button"):
        st.session_state[modal_state_key] = True
    
    # Render modal if open
    if st.session_state.get(modal_state_key, False):
        # Create modal container
        with st.container():
            st.markdown("---")
            
            # Modal header with close button
            col1, col2 = st.columns([4, 1])
            with col1:
                st.markdown("### Create New JTBD")
            with col2:
                if st.button("✖️", key=f"{modal_key}_close"):
                    st.session_state[modal_state_key] = False
                    st.rerun()
            
            # Render form
            result = render_jtbd_creation_form(jtbd_service, key_prefix=modal_key)
            
            # Close modal on successful creation
            if result and result.get("success"):
                st.session_state[modal_state_key] = False
            
            st.markdown("---")
            return result
    
    return None


def render_compact_jtbd_form(
    jtbd_service=None,
    key_prefix: str = "compact_jtbd"
) -> Optional[Dict[str, Any]]:
    """
    Render a compact version of JTBD creation form for sidebar use.
    
    Args:
        jtbd_service: JTBDService instance
        key_prefix: Unique prefix for form components
    
    Returns:
        Dict with creation result if JTBD was created, None otherwise
    """
    if not jtbd_service:
        return None
    
    with st.expander("➕ Create JTBD", expanded=False):
        # Compact form fields
        statement = st.text_input(
            "Statement *",
            placeholder="When I..., I want to...",
            key=f"{key_prefix}_statement"
        )
        
        context = st.text_input(
            "Context",
            placeholder="Additional context...",
            key=f"{key_prefix}_context"
        )
        
        outcome = st.text_input(
            "Outcome",
            placeholder="Desired result...",
            key=f"{key_prefix}_outcome"
        )
        
        # Submit button
        if st.button("Create", key=f"{key_prefix}_submit", use_container_width=True):
            if not statement or not statement.strip():
                st.error("Statement is required")
                return None
            
            with st.spinner("Creating..."):
                result = jtbd_service.create_jtbd(
                    statement=statement,
                    context=context if context and context.strip() else None,
                    outcome=outcome if outcome and outcome.strip() else None,
                    generate_embedding=True
                )
            
            if result.get("success"):
                st.success("JTBD created!")
                # Clear inputs by triggering rerun
                st.rerun()
                return result
            else:
                st.error(f"Failed: {result.get('error')}")
                return result
    
    return None
"""
JTBDs (Jobs to be Done) page for the JTBD Assistant Platform.

Displays all Jobs to be Done in a table format with statements, context,
outcomes, and creation timestamps. Provides filtering, sorting, and export capabilities.
"""

import streamlit as st
import pandas as pd
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime

from ..services.data_service import get_data_service
from ..services.jtbd_service import get_jtbd_service

logger = logging.getLogger(__name__)


def jtbds_page() -> None:
    """Render the JTBDs table page."""
    st.header("🎯 Jobs to be Done Overview")
    st.caption("All defined Jobs to be Done with context and outcomes")
    
    try:
        # Get services
        data_service = get_data_service()
        jtbd_service = get_jtbd_service()
        
        if not data_service:
            st.error("Data service not available")
            return
            
        # Fetch all JTBDs
        with st.spinner("Loading Jobs to be Done..."):
            result = data_service.get_all_jtbds()
        
        if not result.get("success"):
            st.error(f"Failed to load JTBDs: {result.get('error', 'Unknown error')}")
            return
        
        jtbds_data = result.get("jtbds", [])
        
        if not jtbds_data:
            st.info("No Jobs to be Done found. Create JTBDs using the chat interface.")
            
            # Option to create new JTBD
            with st.expander("➕ Create New JTBD"):
                _render_jtbd_creation_form(jtbd_service)
            return
        
        # Display JTBDs count
        st.success(f"Found {len(jtbds_data)} Jobs to be Done")
        
        # Create filters
        col1, col2, col3 = st.columns([2, 2, 1])
        
        with col1:
            # Search filter
            search_term = st.text_input(
                "🔍 Search JTBDs",
                placeholder="Search by statement, context, or outcome...",
                help="Filter JTBDs by any field content"
            )
        
        with col2:
            # Sort options
            sort_options = ["Created Date (Newest)", "Created Date (Oldest)", "Statement (A-Z)", "Statement (Z-A)"]
            sort_by = st.selectbox(
                "Sort by",
                options=sort_options,
                help="Choose how to sort the JTBDs"
            )
        
        with col3:
            # Export button
            if st.button("📥 Export", help="Export JTBDs as CSV"):
                _export_jtbds_csv(jtbds_data)
        
        # Filter and sort data
        filtered_jtbds = _filter_jtbds(jtbds_data, search_term)
        sorted_jtbds = _sort_jtbds(filtered_jtbds, sort_by)
        
        if not sorted_jtbds:
            st.warning("No JTBDs match the current filters.")
            return
        
        # Convert to DataFrame for better display
        df = _jtbds_to_dataframe(sorted_jtbds)
        
        # Display JTBDs table
        st.subheader(f"Jobs to be Done Table ({len(sorted_jtbds)} items)")
        
        # Configure column display
        column_config = {
            "Statement": st.column_config.TextColumn("JTBD Statement", width="large"),
            "Context": st.column_config.TextColumn("Context", width="large"),
            "Outcome": st.column_config.TextColumn("Desired Outcome", width="large"),
            "Created": st.column_config.DatetimeColumn("Created", format="MMM DD, YYYY"),
            "Statement Length": st.column_config.NumberColumn("Length", help="Character count of statement")
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
        
        # Show JTBD details for selected rows
        if event.selection.rows:
            _show_selected_jtbds_details(sorted_jtbds, event.selection.rows)
        
        # Summary statistics
        _render_jtbds_summary(sorted_jtbds)
        
    except Exception as e:
        logger.error(f"Failed to render JTBDs page: {e}")
        st.error(f"Failed to load JTBDs page: {str(e)}")


def _filter_jtbds(jtbds: List[Dict[str, Any]], search_term: str) -> List[Dict[str, Any]]:
    """Filter JTBDs based on search term."""
    if not search_term:
        return jtbds
    
    search_lower = search_term.lower()
    filtered = []
    
    for jtbd in jtbds:
        # Search in all text fields
        searchable_text = " ".join([
            jtbd.get("statement", ""),
            jtbd.get("context", ""),
            jtbd.get("outcome", ""),
        ]).lower()
        
        if search_lower in searchable_text:
            filtered.append(jtbd)
    
    return filtered


def _sort_jtbds(jtbds: List[Dict[str, Any]], sort_by: str) -> List[Dict[str, Any]]:
    """Sort JTBDs based on the selected criteria."""
    if sort_by == "Created Date (Newest)":
        return sorted(jtbds, key=lambda x: x.get("created_at", ""), reverse=True)
    elif sort_by == "Created Date (Oldest)":
        return sorted(jtbds, key=lambda x: x.get("created_at", ""))
    elif sort_by == "Statement (A-Z)":
        return sorted(jtbds, key=lambda x: x.get("statement", "").lower())
    elif sort_by == "Statement (Z-A)":
        return sorted(jtbds, key=lambda x: x.get("statement", "").lower(), reverse=True)
    else:
        return jtbds


def _jtbds_to_dataframe(jtbds: List[Dict[str, Any]]) -> pd.DataFrame:
    """Convert JTBDs data to DataFrame for display."""
    rows = []
    
    for jtbd in jtbds:
        # Format creation date
        created_at = jtbd.get("created_at")
        created_date = None
        if created_at:
            try:
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                created_date = None
        
        # Prepare text previews
        statement = jtbd.get("statement", "")
        context = jtbd.get("context", "")
        outcome = jtbd.get("outcome", "")
        
        statement_preview = statement[:100] + ("..." if len(statement) > 100 else "")
        context_preview = context[:80] + ("..." if len(context) > 80 else "") if context else "No context"
        outcome_preview = outcome[:80] + ("..." if len(outcome) > 80 else "") if outcome else "No outcome"
        
        row = {
            "Statement": statement_preview or "No statement",
            "Context": context_preview,
            "Outcome": outcome_preview,
            "Created": created_date,
            "Statement Length": len(statement)
        }
        rows.append(row)
    
    return pd.DataFrame(rows)


def _show_selected_jtbds_details(jtbds: List[Dict[str, Any]], selected_indices: List[int]) -> None:
    """Show detailed information for selected JTBDs."""
    st.subheader("Selected JTBDs Details")
    
    for idx in selected_indices:
        if idx < len(jtbds):
            jtbd = jtbds[idx]
            
            # Create JTBD title
            statement = jtbd.get("statement", "")
            title = statement[:60] + "..." if len(statement) > 60 else statement or "Unnamed JTBD"
            
            with st.expander(f"🎯 {title}", expanded=True):
                # Main statement
                st.write("**Job to be Done Statement:**")
                statement_text = statement or "No statement provided"
                st.text_area(
                    "Statement",
                    value=statement_text,
                    height=100,
                    disabled=True,
                    key=f"jtbd_statement_{jtbd.get('id')}"
                )
                
                # Context and outcome side by side
                col1, col2 = st.columns(2)
                
                with col1:
                    st.write("**Context:**")
                    context_text = jtbd.get("context", "") or "No context provided"
                    st.text_area(
                        "Context",
                        value=context_text,
                        height=120,
                        disabled=True,
                        key=f"jtbd_context_{jtbd.get('id')}"
                    )
                
                with col2:
                    st.write("**Desired Outcome:**")
                    outcome_text = jtbd.get("outcome", "") or "No outcome specified"
                    st.text_area(
                        "Outcome",
                        value=outcome_text,
                        height=120,
                        disabled=True,
                        key=f"jtbd_outcome_{jtbd.get('id')}"
                    )
                
                # Metadata
                st.caption(
                    f"JTBD ID: {jtbd.get('id')} | "
                    f"Created: {jtbd.get('created_at', 'Unknown')} | "
                    f"Statement Length: {len(statement)} characters"
                )


def _render_jtbds_summary(jtbds: List[Dict[str, Any]]) -> None:
    """Render summary statistics for JTBDs."""
    st.subheader("Summary Statistics")
    
    if not jtbds:
        return
    
    # Calculate statistics
    total_jtbds = len(jtbds)
    
    # Count JTBDs with different fields
    with_context = len([j for j in jtbds if j.get("context", "").strip()])
    with_outcome = len([j for j in jtbds if j.get("outcome", "").strip()])
    
    # Calculate average lengths
    statement_lengths = [len(j.get("statement", "")) for j in jtbds]
    avg_statement_length = sum(statement_lengths) / len(statement_lengths) if statement_lengths else 0
    
    # Find recent additions (last 7 days)
    recent_count = 0
    now = datetime.now()
    for jtbd in jtbds:
        try:
            created_at = jtbd.get("created_at", "")
            if created_at:
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                days_diff = (now - created_date.replace(tzinfo=None)).days
                if days_diff <= 7:
                    recent_count += 1
        except (ValueError, AttributeError):
            continue
    
    # Display statistics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Total JTBDs", total_jtbds)
    
    with col2:
        st.metric("With Context", f"{with_context}/{total_jtbds}")
    
    with col3:
        st.metric("With Outcome", f"{with_outcome}/{total_jtbds}")
    
    with col4:
        st.metric("Recent (7 days)", recent_count)
    
    # Additional metrics
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Avg Statement Length", f"{avg_statement_length:.0f} chars")
    
    with col2:
        completion_rate = ((with_context + with_outcome) / (total_jtbds * 2)) * 100 if total_jtbds > 0 else 0
        st.metric("Completion Rate", f"{completion_rate:.1f}%")
    
    with col3:
        if statement_lengths:
            longest_statement = max(statement_lengths)
            st.metric("Longest Statement", f"{longest_statement} chars")
    
    with col4:
        if statement_lengths:
            shortest_statement = min(statement_lengths)
            st.metric("Shortest Statement", f"{shortest_statement} chars")


def _export_jtbds_csv(jtbds: List[Dict[str, Any]]) -> None:
    """Export JTBDs data as CSV."""
    try:
        # Create detailed export DataFrame
        rows = []
        
        for jtbd in jtbds:
            row = {
                "Statement": jtbd.get("statement", ""),
                "Context": jtbd.get("context", ""),
                "Outcome": jtbd.get("outcome", ""),
                "Created At": jtbd.get("created_at", ""),
                "Statement Length": len(jtbd.get("statement", "")),
                "Context Length": len(jtbd.get("context", "")),
                "Outcome Length": len(jtbd.get("outcome", ""))
            }
            rows.append(row)
        
        df = pd.DataFrame(rows)
        csv = df.to_csv(index=False)
        
        st.download_button(
            label="Download JTBDs CSV",
            data=csv,
            file_name=f"jtbd_jobs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv",
            help="Download all Jobs to be Done data as CSV file"
        )
        
    except Exception as e:
        st.error(f"Failed to export JTBDs: {str(e)}")


def _render_jtbd_creation_form(jtbd_service) -> None:
    """Render form to create new JTBD."""
    if not jtbd_service:
        st.warning("JTBD service not available")
        return
    
    st.write("Create a new Job to be Done:")
    
    with st.form("create_jtbd_form"):
        statement = st.text_area(
            "JTBD Statement", 
            placeholder="When [situation], I want to [motivation], so I can [expected outcome]",
            help="Describe the job to be done in a clear, actionable statement"
        )
        
        context = st.text_area(
            "Context",
            placeholder="Additional context about when and why this job arises...",
            help="Optional: Provide context about the circumstances"
        )
        
        outcome = st.text_area(
            "Desired Outcome",
            placeholder="What success looks like when this job is completed...",
            help="Optional: Describe the desired end state"
        )
        
        submitted = st.form_submit_button("Create JTBD", type="primary")
        
        if submitted:
            if not statement.strip():
                st.error("JTBD statement is required")
                return
            
            # Create JTBD
            result = jtbd_service.create_jtbd(
                statement=statement.strip(),
                context=context.strip() if context.strip() else None,
                outcome=outcome.strip() if outcome.strip() else None
            )
            
            if result.get("success"):
                st.success("JTBD created successfully!")
                st.rerun()
            else:
                st.error(f"Failed to create JTBD: {result.get('error', 'Unknown error')}")
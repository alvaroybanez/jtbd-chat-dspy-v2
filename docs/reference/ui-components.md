# UI Components

This document describes the user interface layer of the JTBD Assistant Platform, built with Streamlit for interactive web-based interaction.

## UI Architecture Overview

The UI layer follows a **component-based architecture** using Streamlit's native capabilities:

- **Main Interface**: `ChatInterface` class provides the primary conversational experience
- **Selection Components**: Reusable components for displaying search results and managing context
- **Form Components**: Input forms for creating JTBDs and metrics
- **Utility Functions**: Helper functions for chat history and data export

### Design Principles

- **Conversational First**: Chat-based interaction as primary interface
- **Context Awareness**: Visual feedback on selected items and token budget
- **Progressive Disclosure**: Expandable sections and sidebar organization
- **Immediate Feedback**: Real-time updates and visual confirmations
- **Responsive Layout**: Sidebar + main content layout for desktop and mobile

## Main Chat Interface (`app/ui/components/chat_interface.py`)

The `ChatInterface` class provides the core conversational experience and orchestrates all UI interactions.

### Core Structure

```python
class ChatInterface:
    """Main chat interface component for JTBD Assistant."""
    
    def __init__(self):
        self.chat_service = get_chat_service()
        self.search_service = get_search_service()
        self.context_manager = get_context_manager()
        self.jtbd_service = get_jtbd_service()
        self.metric_service = get_metric_service()
    
    def render(self) -> None:
        """Render the complete chat interface."""
        # Main layout orchestration
```

### Layout Structure

**Three-Column Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar (Context + Controls)  │  Main Chat Area             │
├───────────────────────────────┼─────────────────────────────┤
│ • Context Summary             │  • Chat Messages            │
│ • Token Budget                │  • Search Results           │
│ • Search Settings             │  • Selection Interface      │
│ • Creation Forms              │  • Input Area               │
└───────────────────────────────┴─────────────────────────────┘
```

### Sidebar Components

**Context Summary Section:**
- Displays currently selected insights, JTBDs, and metrics
- Real-time token count and budget visualization  
- Quick actions: Clear All, Prepare HMW

**Search Settings:**
- Similarity threshold slider (0.0 - 1.0)
- Results per type selector (5, 10, 15, 20)
- Content type filters (chunks, insights, JTBDs)

**Creation Forms:**
- Compact JTBD creation form
- Compact metric creation form
- Inline success/error feedback

### Chat Area Components

**Message Types:**

**User Messages:**
```python
{
    "type": "user",
    "content": "search for mobile checkout issues",
    "timestamp": "2024-01-15T10:30:00Z"
}
```

**Assistant Messages:**
```python
{
    "type": "assistant", 
    "content": "Search results for: mobile checkout issues",
    "data": {
        "success": True,
        "results": {...},
        "search_metadata": {...},
        "suggestions": [...]
    },
    "timestamp": "2024-01-15T10:30:15Z"
}
```

**System Messages:**
```python
{
    "type": "system",
    "content": "✅ JTBD created successfully",
    "timestamp": "2024-01-15T10:30:30Z"
}
```

### Input Area

**Multi-Select Content Types:**
- Checkboxes for chunks, insights, JTBDs
- Default: all types selected
- Dynamic filtering of search operations

**Chat Input:**
- Natural language query input
- Placeholder: "Search for insights, JTBDs, or ask questions..."
- Enter key triggers search

**Context Indicator:**
- Real-time count of selected items
- Visual indicator of context status

## Selection Components (`app/ui/components/selection_components.py`)

Reusable components for displaying search results and managing context selections.

### Search Result Card

```python
def render_search_result_card(
    item: Dict[str, Any],
    content_type: str,
    key: str,
    context_manager=None
) -> Dict[str, Any]:
    """Render individual search result with selection controls."""
```

**Card Structure:**
```
┌─────────────────────────────────────┐
│ Content Preview                     │
│ ----------------------------------- │
│ Similarity: 0.85 | Type: Insight   │
│ [Select for Context] [View Details] │
└─────────────────────────────────────┘
```

**Content Type Variations:**

**Document Chunks:**
- Shows content preview (first 200 characters)
- Displays source document title
- Shows chunk index and position

**Insights:**
- Full insight description
- Source document reference
- Extraction context

**JTBDs:**
- JTBD statement with proper formatting
- Context and outcome information
- Format validation indicators

### Context Summary Sidebar

```python
def render_context_summary_sidebar(context_manager) -> None:
    """Render sidebar context summary with current selections."""
```

**Summary Display:**
```
Context Summary
├── Insights: 3 selected
├── JTBDs: 2 selected  
├── Metrics: 1 selected
└── Total: 6 items
```

**Interactive Elements:**
- Click to expand each section
- Individual item removal buttons
- Bulk clear all action
- Token budget visualization

### Token Budget Indicator

```python
def render_token_budget_indicator(context_manager) -> None:
    """Display token usage and budget status."""
```

**Visual Indicators:**
- Progress bar: Used/Total tokens
- Color coding: Green (safe), Yellow (warning), Red (over budget)
- Percentage display
- Remaining tokens counter

**Budget States:**
```python
# Green: < 75% of budget
# Yellow: 75-90% of budget  
# Red: > 90% of budget
```

### Suggestions Section

```python
def render_suggestions_section(suggestions: List[str]) -> None:
    """Display contextual suggestions for user actions."""
```

**Suggestion Types:**
- Search refinement suggestions
- Context building recommendations
- Next step guidance
- Related content hints

**Visual Treatment:**
- Subtle background highlighting
- Lightbulb icons for suggestions
- Clickable suggestion text

## Form Components

The platform provides comprehensive form components for manual content creation with multiple variants optimized for different use cases.

### JTBD Creation Forms (`app/ui/components/jtbd_form.py`)

Multiple form variants for creating Jobs-to-be-Done statements with automatic embedding generation.

#### Form Variants

**Full Form with Preview:**
```python
def render_jtbd_creation_form(
    jtbd_service=None,
    key_prefix: str = "jtbd_form"
) -> Optional[Dict[str, Any]]:
    """Render complete JTBD creation form with validation and preview."""
```

**Compact Form (Sidebar):**
```python
def render_compact_jtbd_form(
    jtbd_service=None,
    key_prefix: str = "compact_jtbd"
) -> Optional[Dict[str, Any]]:
    """Render compact JTBD form optimized for sidebar use."""
```

**Modal Form:**
```python
def render_jtbd_form_modal(
    jtbd_service=None,
    modal_key: str = "jtbd_modal"
) -> Optional[Dict[str, Any]]:
    """Render JTBD form in modal dialog."""
```

#### Form Fields & Validation

**Form Fields:**
- **Statement** (required): Main JTBD statement (10-1000 characters)
- **Context** (optional): Situational context (max 1000 characters)
- **Outcome** (optional): Desired result (max 1000 characters)

**Validation Features:**
- **Real-time Validation**: Immediate feedback on input errors
- **Character Limits**: Visual indicators and enforcement
- **Format Guidance**: "When [situation], I want [motivation], so I can [expected outcome]"
- **Preview Mode**: Visual preview before submission
- **Success Feedback**: Chat history integration on successful creation

**Example JTBD:**
```
Statement: "When I'm shopping online during my lunch break, I want to complete checkout quickly, so I can finish my purchase before returning to work"
Context: "Mobile e-commerce during limited time windows"
Outcome: "Successful purchase completion within time constraints"
```

#### Integration Features

- **Embedding Generation**: Automatic vector embeddings for semantic search
- **Database Storage**: Direct integration with JTBD service and database
- **Search Integration**: Created JTBDs immediately available in search results
- **Context Building**: New JTBDs can be immediately selected for context

### Metric Creation Forms (`app/ui/components/metric_form.py`)

Comprehensive metric creation forms with validation and progress calculation.

#### Form Variants

**Full Form with Progress:**
```python
def render_metric_creation_form(
    metric_service=None,
    key_prefix: str = "metric_form"
) -> Optional[Dict[str, Any]]:
    """Render complete metric creation form with progress calculation."""
```

**Compact Form (Sidebar):**
```python
def render_compact_metric_form(
    metric_service=None,
    key_prefix: str = "compact_metric"
) -> Optional[Dict[str, Any]]:
    """Render compact metric form for sidebar use."""
```

**Modal Form:**
```python
def render_metric_form_modal(
    metric_service=None,
    modal_key: str = "metric_modal"
) -> Optional[Dict[str, Any]]:
    """Render metric form in modal dialog."""
```

**Progress Card:**
```python
def render_metric_progress_card(metric: Dict[str, Any]) -> None:
    """Render metric with progress visualization."""
```

#### Form Fields & Validation

**Form Fields:**
- **Name** (required): Metric name or description (2-255 characters)
- **Current Value** (optional): Current measured value (numeric)
- **Target Value** (optional): Desired target value (numeric)
- **Unit** (optional): Unit of measurement (max 50 characters)

**Validation Features:**
- **Numeric Validation**: Type checking and conversion for value fields
- **Required Field Enforcement**: Clear error messages for missing required fields
- **Progress Calculation**: Automatic current vs target progress calculation
- **Unit Suggestions**: Common units (%, seconds, points, $, etc.)
- **Business Logic**: Warns about edge cases (current = target, zero targets)

**Progress Calculation:**
```python
# Example: Current: 7.2, Target: 8.5
progress = (current_value / target_value) * 100  # 84.7%
remaining = target_value - current_value        # 1.3
is_achieved = progress >= 100                   # False
```

#### Metric Categories

**Common Metric Types:**
- **Conversion Metrics**: Cart abandonment rate, conversion rates, funnel metrics
- **Performance Metrics**: Page load time, API response time, error rates
- **User Experience**: Task completion time, satisfaction scores, usability metrics
- **Business Metrics**: Revenue, customer acquisition cost, retention rates

### Form Integration Patterns

#### Sidebar Integration

Forms are integrated into the main chat interface sidebar under "Create Items":

```python
# In ChatInterface._render_sidebar()
st.header("Create Items")
st.caption("Manually create JTBDs and metrics")

# JTBD creation form
if self.jtbd_service:
    jtbd_result = render_compact_jtbd_form(
        jtbd_service=self.jtbd_service,
        key_prefix="sidebar_jtbd"
    )
    if jtbd_result and jtbd_result.get("success"):
        # Add success message to chat history
        system_message = {
            "type": "system",
            "content": f"✅ JTBD created: {jtbd_result.get('jtbd', {}).get('statement', '')[:50]}...",
            "timestamp": datetime.now().isoformat()
        }
        st.session_state.chat_messages.append(system_message)
```

#### Success Feedback

- **Visual Feedback**: Immediate success/error messages
- **Chat Integration**: Success messages added to chat history
- **Auto-refresh**: Streamlit rerun triggers on successful creation
- **Context Availability**: Created items immediately available for selection

## Session State Management

The UI layer uses Streamlit's session state for maintaining application state across interactions.

### Core Session Variables

**Chat State:**
```python
# Chat message history
st.session_state.chat_messages = [
    {"type": "user", "content": "...", "timestamp": "..."},
    {"type": "assistant", "data": {...}, "timestamp": "..."}
]

# Chat context selections
st.session_state.chat_context = {
    "selected_insights": ["uuid1", "uuid2"],
    "selected_jtbds": ["uuid3"],
    "selected_metrics": ["uuid4"]
}
```

**Search Settings:**
```python
st.session_state.search_settings = {
    "similarity_threshold": 0.7,
    "results_per_type": 10,
    "search_types": ["chunks", "insights", "jtbds"]
}
```

**Service State:**
```python
st.session_state.services_initialized = True
st.session_state.context_updated = False
st.session_state.token_budget_changed = False
```

### State Synchronization

**Context Updates:**
```python
def add_item_to_context(item_id: str, content_type: str):
    """Add item to context and trigger UI refresh."""
    # Update context manager
    context_manager.add_item(item_id, content_type)
    
    # Update session state
    st.session_state.chat_context[f"selected_{content_type}"].append(item_id)
    
    # Trigger refresh
    st.session_state.context_updated = True
    st.rerun()
```

## Visual Design System

### Color Scheme

**Primary Colors:**
- Success: Green (`#28a745`)
- Warning: Yellow (`#ffc107`)  
- Error: Red (`#dc3545`)
- Info: Blue (`#17a2b8`)

**Semantic Colors:**
- Insights: Blue tones
- JTBDs: Green tones  
- Metrics: Orange tones
- Documents: Gray tones

### Typography

**Text Hierarchy:**
- Page Title: `st.title()` - Main page heading
- Section Headers: `st.header()` - Major sections
- Subsections: `st.subheader()` - Component sections
- Body Text: `st.write()` - Regular content
- Captions: `st.caption()` - Metadata and hints

### Icon System

**Content Type Icons:**
- 📄 Documents and Chunks
- 💡 Insights  
- 🎯 Jobs-to-be-Done
- 📊 Metrics
- ❓ How Might We Questions
- 💡 Solutions

**Action Icons:**
- ✅ Success indicators
- ⚠️ Warning indicators  
- ❌ Error indicators
- 🔍 Search operations
- ➕ Add actions
- 🗑️ Remove actions

### Layout Patterns

**Card Layout:**
```python
with st.container():
    col1, col2 = st.columns([3, 1])
    with col1:
        st.write(content)
    with col2:
        st.button("Action")
```

**Expandable Sections:**
```python
with st.expander(f"{section_title} ({item_count})", expanded=True):
    for item in items:
        render_item(item)
```

**Two-Column Layout:**
```python
col1, col2 = st.columns([2, 1])
with col1:
    # Main content
with col2:
    # Sidebar/controls
```

## Responsive Behavior

### Mobile Optimization

**Layout Adaptations:**
- Single column layout on narrow screens
- Collapsible sidebar for mobile
- Simplified button layouts
- Touch-friendly button sizes

**Content Adaptations:**  
- Truncated text with expand options
- Simplified card layouts
- Reduced information density
- Larger tap targets

### Performance Considerations

**Efficient Rendering:**
- Lazy loading of search results
- Pagination for large result sets
- Minimal re-renders through state management
- Efficient session state updates

**Memory Management:**
- Limited chat history retention
- Cache cleanup for old search results
- Efficient component reuse
- Minimal DOM updates

## Error Handling and User Feedback

### Error Display Patterns

**Service Errors:**
```python
if not service_available():
    st.error("Service not available. Please check configuration.")
    return
```

**Validation Errors:**
```python
if not valid_input(user_input):
    st.warning("Please check your input and try again.")
    st.caption("Expected format: When..., I want..., so I can...")
```

**Success Confirmations:**
```python
st.success("JTBD created successfully!")
st.balloons()  # Celebration for major actions
```

### Loading States

**Search Operations:**
```python
with st.spinner("Searching..."):
    results = perform_search(query)
```

**Service Initialization:**
```python
with st.spinner("Initializing services..."):
    initialize_all_services()
```

### User Guidance

**Empty States:**
```python
if not has_results():
    st.info("No results found. Try different search terms or lower the similarity threshold.")
    st.caption("💡 Tip: Try broader terms or check your spelling")
```

**Onboarding Hints:**
```python
if is_first_visit():
    st.info("👋 Welcome! Start by searching for insights or creating your first JTBD.")
```

This UI architecture provides a smooth, intuitive experience while maintaining the flexibility needed for complex JTBD workflow operations.
# UI Components

This document describes the user interface layer of the JTBD Assistant Platform, built with Streamlit for interactive web-based interaction.

## UI Architecture Overview

The UI layer follows a **component-based architecture** using Streamlit's native capabilities:

- **Main Interface**: `ChatInterface` class provides the primary conversational experience
- **Selection Components**: Reusable components for displaying search results and managing context
- **Form Components**: Input forms for creating JTBDs and metrics
- **Utility Functions**: Helper functions for chat history and data export

### Design Principles

- **Conversational First**: AI-powered chat interface with intent detection and dynamic responses
- **Professional Layout**: Content-optimized weight distributions (20/80 for chat, 15/85 for tables)
- **Context Awareness**: Visual feedback on selected items and token budget
- **Progressive Disclosure**: Stage-based workflow with contextual controls
- **Immediate Feedback**: Real-time updates and visual confirmations
- **Responsive Layout**: Sidebar + main content layout with professional typography hierarchy

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

**Professional Layout (20/80 Distribution):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sidebar (20%)              │  Main Chat Area (80%)                            │
├────────────────────────────┼───────────────────────────────────────────────────┤
│ • Workflow Progress        │  • Conversational AI Interface                   │
│ • Context Summary          │  • Dynamic Response Generation                   │
│ • Token Budget Monitor     │  • Search Results with Synthesis                 │
│ • Stage Controls           │  • Follow-up Questions                           │
│ • Quick Actions            │  • Intent-Aware Input Area                       │
└────────────────────────────┴───────────────────────────────────────────────────┘
```

**Table Layout (15/85 Distribution):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sidebar (15%)          │  Main Data Area (85%)                               │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ • Navigation           │  • Data Tables with Optimal Column Width            │
│ • Filters              │  • Export and Bulk Actions                         │
│ • Create Forms         │  • Search and Filter Results                       │
│ • Summary Stats        │  • Pagination and Sorting Controls                  │
└────────────────────────┴─────────────────────────────────────────────────────┘
```

### Sidebar Components

**Workflow Progress Stepper:**
- Vertical progress indicator for 4-stage workflow
- Current stage highlighted with active styling
- Completed stages marked with checkmarks
- Upcoming stages shown in muted state
- Space-efficient vertical layout (saves ~100px compared to horizontal)

```python
def render_workflow_stepper():
    """Render vertical workflow progress in sidebar"""
    stages = [
        {"id": 1, "title": "Search & Select", "desc": "Find insights, JTBDs, and metrics"},
        {"id": 2, "title": "Build Context", "desc": "Review and refine your selections"},
        {"id": 3, "title": "Generate HMWs", "desc": "Create How Might We questions"},
        {"id": 4, "title": "Explore & Chat", "desc": "Discuss and refine with AI"}
    ]
    
    for stage in stages:
        if stage["id"] == current_stage:
            st.sidebar.markdown(f"**▶ {stage['id']}. {stage['title']}**")
            st.sidebar.caption(f"*{stage['desc']}*")
        elif stage["id"] < current_stage:
            st.sidebar.markdown(f"✓ {stage['id']}. {stage['title']}")
        else:
            st.sidebar.markdown(f"○ {stage['id']}. {stage['title']}")
```

**Context Summary Section:**
- Displays currently selected insights, JTBDs, and metrics
- Real-time token count and budget visualization with progress bars
- Quick actions: Clear All, Export Context, Generate HMW
- Visual indicators for context completeness

**Stage-Specific Controls:**
- Dynamic controls based on current workflow stage
- Progressive disclosure of relevant options
- Context-sensitive help and guidance
- Streamlined interface reducing cognitive load

**Creation Forms (Contextual):**
- Compact JTBD creation form (appears when needed)
- Compact metric creation form (stage-appropriate)
- Inline success/error feedback with clear messaging
- Auto-focus and validation for better UX

### Chat Area Components

**Conversational AI Interface:**

**User Messages:**
```python
{
    "type": "user",
    "content": "Let's explore opportunities in mobile checkout",
    "timestamp": "2024-01-15T10:30:00Z",
    "detected_intent": {
        "type": "EXPLORATION",
        "confidence": 0.85,
        "needs_search": True
    }
}
```

**AI Assistant Messages:**
```python
{
    "type": "assistant",
    "content": "I'd be happy to explore mobile checkout opportunities with you. Based on current research trends...",
    "data": {
        "success": True,
        "response_type": "conversational",
        "intent_type": "EXPLORATION",
        "has_context": True,
        "search_results": {...},
        "follow_up_questions": [
            "What specific pain points do users encounter?",
            "How does mobile performance compare to desktop?",
            "What metrics would indicate success?"
        ],
        "tokens_used": 850,
        "model": "gpt-4"
    },
    "timestamp": "2024-01-15T10:30:15Z"
}
```

**Follow-Up Question Rendering:**
```python
def render_follow_up_questions(questions: List[str]):
    """Render interactive follow-up questions"""
    if questions:
        st.markdown("**Continue the conversation:**")
        
        # Create columns for multiple questions
        cols = st.columns(min(len(questions), 3))
        
        for i, question in enumerate(questions):
            col_idx = i % len(cols)
            with cols[col_idx]:
                if st.button(question, key=f"followup_{i}", type="secondary"):
                    # Add question to chat and process
                    st.session_state.chat_messages.append({
                        "type": "user",
                        "content": question,
                        "timestamp": datetime.now().isoformat(),
                        "source": "follow_up"
                    })
                    st.rerun()
```

**Search Results Integration:**
```python
def render_search_results_with_context(search_results: Dict[str, List[Dict]], query: str):
    """Render search results with conversational context"""
    
    if not search_results or not any(search_results.values()):
        st.info("No specific results found. The AI response above provides general guidance.")
        return
    
    with st.expander("View detailed search results", expanded=False):
        for content_type, results in search_results.items():
            if results:
                st.subheader(f"{content_type.title()} ({len(results)} found)")
                
                for result in results:
                    render_search_result_card(
                        result=result,
                        content_type=content_type,
                        similarity_score=result.get('similarity', 0),
                        allow_selection=True,
                        compact=True
                    )
```

**Intent Detection Indicators:**
```python
def render_intent_indicator(intent: MessageIntent):
    """Show intent detection results to user (debug/transparency mode)"""
    if st.session_state.get('show_debug_info', False):
        intent_colors = {
            "QUESTION": "🟦",
            "SEARCH": "🟨", 
            "EXPLORATION": "🟩",
            "ACTION": "🟪"
        }
        
        st.caption(
            f"{intent_colors.get(intent.intent_type, '⚪')} "
            f"Intent: {intent.intent_type} "
            f"(Confidence: {intent.confidence:.2f})"
        )
```

**Conversational Response Types:**

**Discovery Responses** (EXPLORATION intent):
- Creative, open-ended exploration
- Higher temperature for diverse thinking
- Focus on possibilities and brainstorming
- Multiple follow-up questions to expand thinking

**Expert Consultation** (QUESTION intent):
- Authoritative, knowledgeable guidance
- Balanced temperature for accuracy and engagement
- JTBD framework expertise
- Educational follow-up questions

**Search Synthesis** (SEARCH intent):
- Structured information synthesis
- Context-aware result interpretation
- Clear, organized presentation
- Refinement-focused follow-ups

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

## Professional Design Patterns

### Weight Distribution Standards

**Conversational Pages** (Chat Interface):
- **Sidebar**: 20% width (280px @ 1400px viewport)
- **Main Content**: 80% width (1120px @ 1400px viewport)
- **Rationale**: Chat needs maximum space for conversation flow and search results

**Data Table Pages** (Metrics, Insights, JTBDs):
- **Sidebar**: 15% width (210px @ 1400px viewport)
- **Main Content**: 85% width (1190px @ 1400px viewport)
- **Rationale**: Tables need maximum horizontal space for columns and data

### Typography Hierarchy

**Implementation Standards:**
```python
# Page Titles
st.title("JTBD Assistant Platform")  # 32px, bold

# Section Headers
st.header("Context Summary")  # 24px, medium

# Subsections
st.subheader("Selected Insights")  # 18px, medium

# Body Text
st.markdown("Regular content...")  # 14px, regular

# Secondary Information
st.caption("Token usage: 1,250/4,000")  # 12px, muted
```

### Professional Emoji Usage

**Approved Usage** (Functional Only):
- **Navigation**: 💬 📊 💡 🎯 (page icons)
- **Status**: ✅ ⚠️ ❌ (system feedback)
- **Content Types**: 📄 📈 🔍 (data categorization)
- **Actions**: ➕ 📥 🗑️ (clear action indicators)

**Prohibited Usage** (Decorative):
- Multiple emojis per element
- Emotional/personality emojis in content
- Redundant emojis with text labels
- Decorative elements in body text

### Responsive Behavior

**Desktop (1200px+)**:
- Fixed sidebar widths per page type
- Full feature set available
- Optimal column layouts

**Tablet (768-1199px)**:
- Collapsible drawer overlay sidebar
- Condensed but functional interface
- Touch-optimized controls

**Mobile (<768px)**:
- Bottom navigation tabs replace sidebar
- Single column layout for main content
- Simplified conversation interface

### Performance Optimizations

**Lazy Loading**:
- Search results loaded on demand
- Chat history paginated for large conversations
- Context components rendered only when visible

**State Management**:
- Efficient session state updates
- Minimal re-rendering of stable components
- Cached computation results where appropriate

**Memory Management**:
- Conversation history with size limits
- Token budget monitoring and cleanup
- Progressive loading of large datasets

This UI architecture provides a sophisticated, professional conversational experience while maintaining clean separation of concerns and excellent performance characteristics for the JTBD Assistant Platform.
# JTBD Assistant UI Components

This directory contains the Streamlit UI components for the JTBD Assistant Platform chat interface.

## Components Overview

### 🗣️ Chat Interface (`components/chat_interface.py`)

The main conversational interface that integrates with backend services to provide:

- **Chat History Management**: Persistent conversation tracking with user queries and assistant responses
- **Real-time Search**: Semantic search across documents, insights, and JTBDs with live results display
- **Context Building**: Interactive selection of search results to build context for HMW generation
- **Sidebar Integration**: Context summary and token budget monitoring
- **Export Functionality**: Download chat history and context for external use

**Key Features:**
- Streamlit native `st.chat_message` and `st.chat_input` components
- Search result cards with selection buttons
- Context management with token budget enforcement
- Suggestions system for improved user experience
- Error handling with graceful degradation

### 🔧 Selection Components (`components/selection_components.py`)

Reusable UI components for consistent interaction patterns:

#### Search Result Cards
- **`render_search_result_card()`**: Interactive cards showing search results with similarity scores and selection buttons
- Different layouts for chunks, insights, and JTBDs
- Integrated with ContextManager for seamless selection

#### Context Management
- **`render_context_summary_sidebar()`**: Sidebar widget showing selected items with counts and removal options
- **`render_token_budget_indicator()`**: Visual progress bar and metrics for token usage
- **`render_suggestions_section()`**: Dynamic suggestions based on search results and context state

#### Helper Components
- **`render_content_type_filter()`**: Checkbox filters for search types
- **`render_search_stats()`**: Metadata display for search results
- **`render_hmw_readiness_indicator()`**: Context readiness assessment for HMW generation

## Integration with Backend Services

The UI components integrate with three core backend services:

### SearchService Integration
```python
# Search across all content types
search_result = chat_service.process_message(
    query=user_query,
    search_types=["chunks", "insights", "jtbds"],
    similarity_threshold=0.7,
    limit_per_type=10
)
```

### ContextManager Integration
```python
# Add search results to context
result = context_manager.add_selection("insight", insight_data)

# Monitor token budget
budget_status = context_manager.check_token_budget()
```

### ChatService Integration
```python
# Process queries and format results
response = chat_service.process_message(query)

# Prepare context for HMW generation
hmw_context = chat_service.prepare_context_for_hmw()
```

## Usage Patterns

### Basic Chat Interface Setup
```python
from app.ui.components import render_chat_interface

def main():
    st.set_page_config(
        page_title="JTBD Assistant",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Initialize services first
    initialize_all_services()
    
    # Render main interface
    render_chat_interface()
```

### Custom Component Usage
```python
from app.ui.components.selection_components import (
    render_search_result_card,
    render_context_summary_sidebar
)

# Render search results with selection
for item in search_results:
    render_search_result_card(
        item=item,
        content_type="insights", 
        key=f"result_{item['id']}",
        context_manager=get_context_manager()
    )

# Show context in sidebar
with st.sidebar:
    render_context_summary_sidebar(get_context_manager())
```

## State Management

### Session State Structure
```python
# Chat messages history
st.session_state.chat_messages = [
    {
        "type": "user|assistant|system",
        "content": "message text",
        "data": {...},  # Search results for assistant messages
        "timestamp": "ISO timestamp"
    }
]

# Search settings
st.session_state.search_settings = {
    "similarity_threshold": 0.7,
    "results_per_type": 10
}

# Service initialization flag
st.session_state.services_initialized = True
```

### Context Persistence
- Context selections persist across page reloads via ContextManager
- Token budget is continuously monitored and displayed
- Search history maintains conversation flow

## Error Handling

### Service Availability
```python
# Graceful degradation when services unavailable
if not get_chat_service():
    st.error("Chat service not initialized")
    return

if not get_context_manager():
    st.error("Context manager not available")
    return
```

### Search and Selection Errors
```python
# Handle search failures
if not search_result["success"]:
    st.error(f"Search failed: {search_result['error']}")

# Handle selection failures  
if not selection_result["success"]:
    st.warning(f"Could not add item: {selection_result['error']}")
```

## Styling and Layout

### Responsive Design
- Uses `st.columns()` for flexible layouts
- Sidebar for context and controls
- Main area for chat and results
- Expandable sections for organized content

### Visual Hierarchy
- Icons for content types (💡 insights, 🎯 JTBDs, 📄 chunks)
- Color coding for status (🟢 good, 🟡 warning, 🔴 critical)
- Progress bars for token budget visualization
- Similarity scores as badges

### Accessibility
- Clear button labels and help text
- Descriptive captions and titles
- Logical tab order for keyboard navigation
- Screen reader friendly structure

## Performance Considerations

### Efficient Rendering
- Unique keys for all interactive components
- Selective re-rendering with `st.rerun()`
- Caching of expensive operations via backend services

### Memory Management
- Session state cleanup for old messages
- Token budget enforcement prevents excessive context
- Embedding caching reduces API calls

## Testing

Run component tests with:
```bash
uv run python scripts/test_chat_interface.py
```

Tests cover:
- ✅ Component imports and structure
- ✅ Method availability and signatures  
- ✅ Helper function behavior
- ✅ Content type mappings
- ✅ Error handling patterns

## Future Enhancements

Planned improvements:
- 🔄 Real-time search suggestions
- 📊 Advanced analytics dashboard
- 🎨 Customizable themes and layouts
- 🔍 Advanced search filters and sorting
- 💾 Context templates and presets
- 🤝 Collaboration features for team use
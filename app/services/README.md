# Backend Services

This directory contains the core backend services for the JTBD Assistant Platform, implementing the business logic for vector search, context management, and chat functionality.

## Services Overview

### 1. SearchService (`search_service.py`)
Unified search interface across documents, insights, and JTBDs using vector embeddings.

**Key Features:**
- Unified search across all content types with single query
- Individual search methods for specific content types
- Result ranking and filtering (similarity ≥0.7, max 100 results)
- Uses existing database RPC functions for vector search

**Usage:**
```python
from app.services import SearchService, initialize_search_service

# Initialize (requires database and embedding managers)
search_service = initialize_search_service(db_manager, embedding_manager)

# Search all content types
results = search_service.search_all_content("user onboarding challenges")

# Search specific types
chunks = search_service.search_chunks(query_embedding, limit=10)
insights = search_service.search_insights(query_embedding)
jtbds = search_service.search_jtbds(query_embedding)
```

### 2. ContextManager (`context_manager.py`)
Manages selected insights, JTBDs, and metrics in session state with token counting.

**Key Features:**
- Token counting using tiktoken (with fallback approximation)
- Budget enforcement (4000 tokens max, 500 token buffer)
- Session state management for selected items
- Automatic truncation when budget exceeded

**Usage:**
```python
from app.services import ContextManager, initialize_context_manager

# Initialize
context = initialize_context_manager(max_tokens=4000)

# Add items to context
result = context.add_selection("insight", insight_data)
result = context.add_selection("jtbd", jtbd_data)
result = context.add_selection("metric", metric_data)

# Check token budget
budget = context.check_token_budget()
print(f"Status: {budget['status']}, Usage: {budget['percentage_used']}%")

# Get context summary
summary = context.get_context_summary()

# Prepare for HMW generation
hmw_context = context.prepare_context_for_hmw()
```

### 3. ChatService (`chat_service.py`)
Processes user queries and builds structured responses for Streamlit display.

**Key Features:**
- Routes queries to SearchService for content discovery
- Formats results for consistent Streamlit display
- Generates helpful suggestions based on search results
- Prepares context for HMW generation

**Usage:**
```python
from app.services import ChatService, initialize_chat_service

# Initialize (requires search service and context manager)
chat_service = initialize_chat_service(search_service, context_manager)

# Process user query
response = chat_service.process_message("How do users struggle with onboarding?")

# Response contains:
# - Formatted search results
# - Context status
# - Helpful suggestions
# - Token budget information

# Prepare context for HMW generation
hmw_ready = chat_service.prepare_context_for_hmw()
```

## Initialization

### Quick Start
```python
from app.services import initialize_all_services

# Initialize all services at once
result = initialize_all_services()

if result["success"]:
    print("All services initialized successfully!")
else:
    print(f"Initialization failed: {result['error']}")
```

### Manual Initialization
```python
from app.services import (
    initialize_search_service,
    initialize_context_manager, 
    initialize_chat_service
)
from app.core.database.connection import get_database_manager
from app.core.embeddings import get_embedding_manager

# Get core components
db = get_database_manager()
embeddings = get_embedding_manager()

# Initialize services in dependency order
search_service = initialize_search_service(db, embeddings)
context_manager = initialize_context_manager()
chat_service = initialize_chat_service(search_service, context_manager)
```

### Service Health Monitoring
```python
from app.services import check_service_health

health = check_service_health()
print(f"Overall health: {health['overall_health']}")

for service, status in health['services'].items():
    print(f"{service}: {status['status']}")
```

## Service Dependencies

```
ChatService
├── SearchService
│   ├── DatabaseManager (core)
│   └── EmbeddingManager (core)
└── ContextManager (standalone)
```

## Integration with Streamlit

### Session State Integration
```python
import streamlit as st
from app.services import get_chat_service, get_context_manager

# Initialize in session state
if "context_manager" not in st.session_state:
    st.session_state.context_manager = get_context_manager()

if "chat_service" not in st.session_state:
    st.session_state.chat_service = get_chat_service()

# Use in chat interface
chat_service = st.session_state.chat_service
context_manager = st.session_state.context_manager

# Process user input
if user_query := st.chat_input("Ask about your research..."):
    response = chat_service.process_message(user_query)
    
    if response["success"]:
        # Display search results
        for content_type, items in response["results"].items():
            st.subheader(f"{content_type.title()} ({len(items)} found)")
            for item in items:
                display_data = item["display_data"]
                similarity = item["similarity"]
                
                with st.expander(f"{display_data['title']} (similarity: {similarity:.3f})"):
                    st.write(display_data["excerpt"])
                    
                    # Add to context button
                    if st.button(f"Add to context", key=f"add_{item['id']}"):
                        result = context_manager.add_selection(
                            content_type.rstrip('s'),  # Remove plural
                            item["raw_data"]
                        )
                        if result["success"]:
                            st.success(f"Added to context")
                        else:
                            st.error(result["error"])
```

### Context Management UI
```python
# Display current context
context_summary = context_manager.get_context_summary()
budget = context_manager.check_token_budget()

st.sidebar.header("Context Selection")
st.sidebar.metric(
    "Token Usage", 
    f"{budget['tokens_used']}/{budget['tokens_available'] + budget['tokens_used']}",
    f"{budget['percentage_used']:.1f}%"
)

# Display selected items
for item_type, items in context_summary["selected_items"].items():
    if items:
        st.sidebar.subheader(f"{item_type.title()} ({len(items)})")
        for item in items:
            col1, col2 = st.sidebar.columns([3, 1])
            col1.write(item.get("title", item.get("statement", item.get("name", "Untitled")))[:50] + "...")
            if col2.button("Remove", key=f"remove_{item['id']}"):
                context_manager.remove_selection(item_type.rstrip('s'), item["id"])
                st.rerun()
```

## Error Handling

All services follow consistent error handling patterns:

```python
# All service methods return standardized response format
{
    "success": bool,
    "error": str,           # Present if success=False
    "message": str,         # Present if success=True
    # ... additional data
}

# Example error handling
result = search_service.search_all_content(query)
if not result["success"]:
    st.error(f"Search failed: {result['error']}")
    return

# Use results
search_results = result["results"]
```

## Configuration

Services use constants from `app.core.constants`:

```python
# Context management
MAX_CONTEXT_TOKENS = 4000       # Maximum tokens in context
DEFAULT_TOKEN_BUFFER = 500      # Reserved buffer

# Vector search  
DEFAULT_SIMILARITY_THRESHOLD = 0.7   # Minimum similarity
MAX_SEARCH_RESULTS = 100             # Maximum results per search
DEFAULT_SEARCH_LIMIT = 10            # Default limit per type
```

## Testing

Run the test script to verify service functionality:

```bash
uv run python scripts/test_services.py
```

The test script validates:
- Service imports and basic instantiation
- ContextManager token counting and selection
- Service health checking
- Mock functionality without database

For full integration testing, ensure environment variables are configured:
- `SUPABASE_URL`
- `SUPABASE_SECRET` (service role key)  
- `OPENAI_API_KEY`
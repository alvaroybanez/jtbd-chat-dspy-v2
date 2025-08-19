# Services Layer

This document explains the service layer architecture, which orchestrates business logic and coordinates between the core infrastructure and UI components.

## Service Architecture

The services layer implements the business logic of the JTBD Assistant Platform through specialized service classes that handle specific domain responsibilities:

- **Search Service**: Multi-type semantic search and result ranking
- **Context Manager**: Session state and token budget management
- **Chat Service**: Query processing and conversational interface
- **JTBD Service**: Jobs-to-be-Done management and operations
- **Metric Service**: Performance metrics tracking and management
- **Initialization Service**: Dependency management and service coordination

## Search Service (`app/services/search_service.py`)

The Search Service provides unified semantic search across all content types in the platform.

### Core Functionality

```python
class SearchService:
    """Unified search service for semantic search across all content types."""
    
    def __init__(self, database_manager, embedding_manager):
        self.db = database_manager
        self.embeddings = embedding_manager
    
    def search_all_types(
        self,
        query: str,
        search_types: List[str] = None,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit_per_type: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, List[Dict]]:
        """Search across multiple content types with unified results."""
```

### Search Types

**Content Types Supported:**
- `chunks`: Document chunks with embeddings
- `insights`: Extracted insights from documents
- `jtbds`: User-defined Jobs-to-be-Done statements

**Search Parameters:**
- **Query**: Natural language search query
- **Similarity Threshold**: Minimum cosine similarity (default: 0.7)
- **Limit Per Type**: Maximum results per content type (default: 10)
- **Search Types**: List of content types to search (default: all)

### Search Operations

**Multi-Type Search:**
```python
results = search_service.search_all_types(
    query="customer pain points with checkout",
    search_types=["chunks", "insights", "jtbds"],
    similarity_threshold=0.8,
    limit_per_type=15
)
```

**Single Type Search:**
```python
insights = search_service.search_insights(
    query="mobile usability issues",
    similarity_threshold=0.75,
    limit=20
)
```

**Result Structure:**
```python
{
    "chunks": [
        {
            "id": "uuid",
            "content": "chunk content",
            "similarity": 0.85,
            "document_id": "uuid",
            "chunk_index": 0
        }
    ],
    "insights": [
        {
            "id": "uuid", 
            "description": "insight description",
            "similarity": 0.82,
            "document_id": "uuid"
        }
    ],
    "jtbds": [
        {
            "id": "uuid",
            "statement": "JTBD statement",
            "similarity": 0.79,
            "context": "context information"
        }
    ]
}
```

### Performance Features

**Embedding Optimization:**
- Query embeddings cached for repeated searches
- Batch embedding generation for efficiency
- Automatic cache warming from database

**Search Optimization:**
- Parallel search across content types
- Result deduplication and ranking
- Configurable similarity thresholds
- Efficient vector similarity using RPC functions

## Context Manager (`app/services/context_manager.py`)

The Context Manager handles session state management and enforces token budget constraints for LLM interactions.

### Token Budget Management

```python
class ContextManager:
    """Manages selected context items with token counting and budget enforcement."""
    
    def __init__(self, max_tokens: int = MAX_CONTEXT_TOKENS, token_buffer: int = DEFAULT_TOKEN_BUFFER):
        self.max_tokens = max_tokens
        self.token_buffer = token_buffer
        self.effective_limit = max_tokens - token_buffer
```

### Session State Management

**Context Items:**
- **Selected Insights**: Insights chosen for context building
- **Selected JTBDs**: Jobs-to-be-Done for HMW generation
- **Selected Metrics**: Performance metrics for solution scoring

**State Operations:**
```python
# Add items to context
context_manager.add_insights([insight_id1, insight_id2])
context_manager.add_jtbds([jtbd_id1])
context_manager.add_metrics([metric_id1, metric_id2])

# Remove items from context
context_manager.remove_insights([insight_id1])

# Clear all context
context_manager.clear_all_context()

# Get current context summary
summary = context_manager.get_context_summary()
```

### Token Counting

**Token Budget Enforcement:**
```python
def check_token_budget(self) -> Dict[str, Any]:
    """Check current token usage against budget."""
    total_tokens = self._count_context_tokens()
    return {
        "tokens_used": total_tokens,
        "tokens_remaining": self.effective_limit - total_tokens,
        "budget_percentage": (total_tokens / self.effective_limit) * 100,
        "within_budget": total_tokens <= self.effective_limit
    }
```

**Token Counting Strategy:**
- Uses `tiktoken` for accurate token counting when available
- Falls back to character-based approximation (chars / 4)
- Counts tokens for all selected context items
- Enforces limits before adding new items

### Context Building

**Context Preparation:**
```python
def build_context_for_hmw_generation(self) -> Dict[str, Any]:
    """Build structured context for HMW generation."""
    return {
        "insights": self._format_insights(),
        "jtbds": self._format_jtbds(),
        "metrics": self._format_metrics(),
        "token_count": self._count_context_tokens(),
        "generated_at": datetime.now().isoformat()
    }
```

## Chat Service (`app/services/chat_service.py`)

The Chat Service processes user queries and coordinates between search and context management for conversational interactions.

### Query Processing

```python
class ChatService:
    """Processes user queries and builds structured responses for Streamlit display."""
    
    def __init__(self, search_service=None, context_manager=None):
        self.search = search_service
        self.context = context_manager
    
    def process_message(
        self,
        query: str,
        search_types: Optional[List[str]] = None,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        limit_per_type: int = DEFAULT_SEARCH_LIMIT
    ) -> Dict[str, Any]:
        """Process user query and return structured search results."""
```

### Message Processing Pipeline

**1. Query Analysis:**
- Extract search intent from natural language query
- Determine relevant content types to search
- Generate query embedding for semantic search

**2. Search Execution:**
- Execute multi-type semantic search
- Rank and filter results by relevance
- Format results for UI presentation

**3. Response Building:**
- Structure search results for display
- Include context building suggestions
- Provide next-step recommendations

### Response Structure

```python
{
    "query": "original user query",
    "search_results": {
        "chunks": [...],
        "insights": [...],
        "jtbds": [...]
    },
    "result_counts": {
        "chunks": 5,
        "insights": 3,
        "jtbds": 2
    },
    "suggestions": [
        "Consider adding insights about mobile usability",
        "Review related JTBDs for context"
    ],
    "context_status": {
        "tokens_used": 1500,
        "tokens_remaining": 2500,
        "items_selected": 8
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

## JTBD Service (`app/services/jtbd_service.py`)

The JTBD Service manages Jobs-to-be-Done statements, their embeddings, and related operations.

### JTBD Management

```python
class JTBDService:
    """Service for managing Jobs-to-be-Done statements and operations."""
    
    def __init__(self, database_manager, embedding_manager):
        self.db = database_manager
        self.embeddings = embedding_manager
    
    def create_jtbd(
        self,
        statement: str,
        context: str = None,
        outcome: str = None
    ) -> Dict[str, Any]:
        """Create new JTBD with embedding generation."""
```

### JTBD Operations

**Create JTBD:**
```python
jtbd_result = jtbd_service.create_jtbd(
    statement="When I'm trying to complete an online purchase, I want a streamlined checkout process, so I can complete my transaction quickly without frustration.",
    context="E-commerce checkout optimization",
    outcome="Reduced cart abandonment and faster transactions"
)
```

**Search JTBDs:**
```python
similar_jtbds = jtbd_service.search_similar_jtbds(
    query="fast checkout experience",
    similarity_threshold=0.7,
    limit=10
)
```

**Validate JTBD Input:**
```python
validation_result = jtbd_service.validate_jtbd_input(
    statement="When I want to test validation, I need proper inputs, so that validation passes",
    context="During testing",
    outcome="Successful validation"
)
```

### JTBD Validation

**Input Validation:**
```python
def validate_jtbd_input(
    self,
    statement: str,
    context: Optional[str] = None,
    outcome: Optional[str] = None
) -> Dict[str, Any]:
    """Validate JTBD input data."""
```

**Validation Rules:**
- **Statement**: Required field, 10-1000 characters
- **Context**: Optional field, max 1000 characters
- **Outcome**: Optional field, max 1000 characters
- **Format Guidance**: Suggests "When [situation], I want [motivation], so I can [expected outcome]" structure
- **Error Handling**: Returns structured validation results with errors and warnings

## Metric Service (`app/services/metric_service.py`)

The Metric Service handles performance metrics tracking and management for solution evaluation.

### Metric Management

```python
class MetricService:
    """Service for managing performance metrics and KPIs."""
    
    def __init__(self, database_manager):
        self.db = database_manager
    
    def create_metric(
        self,
        name: str,
        current_value: Optional[Union[int, float]] = None,
        target_value: Optional[Union[int, float]] = None,
        unit: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create new performance metric."""
```

### Metric Operations

**Create Metric:**
```python
metric = metric_service.create_metric(
    name="Cart Abandonment Rate",
    current_value=23.5,
    target_value=15.0,
    unit="percentage"
)
```

**Validate Metric Input:**
```python
validation_result = metric_service.validate_metric_input(
    name="Customer Satisfaction Score",
    current_value=7.2,
    target_value=8.5,
    unit="points"
)
```

**Calculate Progress:**
```python
progress_result = metric_service.calculate_metric_progress(
    current_value=7.2,
    target_value=8.5
)
# Returns: {"progress_percentage": 84.7, "is_achieved": False, "remaining": 1.3}
```

**Get All Metrics:**
```python
metrics = metric_service.get_all_metrics()
```

### Metric Validation

**Input Validation:**
```python
def validate_metric_input(
    self,
    name: str,
    current_value: Optional[Union[int, float]] = None,
    target_value: Optional[Union[int, float]] = None,
    unit: Optional[str] = None
) -> Dict[str, Any]:
    """Validate metric input data."""
```

**Validation Rules:**
- **Name**: Required field, 2-255 characters
- **Current Value**: Optional numeric value
- **Target Value**: Optional numeric value  
- **Unit**: Optional string, max 50 characters
- **Business Logic**: Warns if current equals target, validates non-zero targets
- **Type Safety**: Automatic conversion to float for numeric values

### Metric Types

**Common Metric Categories:**
- **Conversion Metrics**: Cart abandonment, conversion rates, funnel drop-off
- **Performance Metrics**: Page load time, response time, error rates
- **User Experience Metrics**: Task completion time, user satisfaction scores
- **Business Metrics**: Revenue, customer acquisition cost, retention

## Initialization Service (`app/services/initialization.py`)

The Initialization Service manages the startup sequence and dependency coordination for all services.

### Service Initialization

```python
def initialize_all_services(
    database_manager=None,
    embedding_manager=None,
    llm_wrapper=None,
    max_context_tokens: int = 4000
) -> Dict[str, Any]:
    """Initialize all services with proper dependency management."""
```

### Initialization Sequence

**1. Core Component Initialization:**
```python
# Database manager (singleton)
database_manager = get_database_manager()

# LLM wrapper with database logging
llm_wrapper = initialize_llm(database_manager)

# Embedding manager with LLM and database
embedding_manager = initialize_embedding_manager(llm_wrapper, database_manager)
```

**2. Service Initialization (Dependency Order):**
```python
# 1. Search service (requires db + embeddings)
search_service = initialize_search_service(database_manager, embedding_manager)

# 2. Context manager (standalone)
context_manager = initialize_context_manager(max_context_tokens)

# 3. JTBD service (requires db + embeddings)
jtbd_service = initialize_jtbd_service(database_manager, embedding_manager)

# 4. Metric service (requires db)
metric_service = initialize_metric_service(database_manager)

# 5. Chat service (requires search + context)
chat_service = initialize_chat_service(search_service, context_manager)
```

### Health Monitoring

**Service Health Check:**
```python
def check_service_health() -> Dict[str, Any]:
    """Check the health status of all initialized services."""
    # Test each service's core functionality
    # Return health status and dependency information
```

**Health Status Response:**
```python
{
    "overall_health": "healthy",
    "services": {
        "search_service": {
            "status": "healthy",
            "database_connected": True,
            "embeddings_available": True
        },
        "context_manager": {
            "status": "healthy",
            "max_tokens": 4000,
            "current_usage": 1250,
            "tokenizer_available": True
        },
        "chat_service": {
            "status": "healthy",
            "dependencies_available": True
        }
    },
    "summary": {
        "total_services": 5,
        "healthy_services": 5,
        "unhealthy_services": 0
    }
}
```

## Service Communication Patterns

### Dependency Injection

Services use constructor injection for testability and flexibility:

```python
class ChatService:
    def __init__(self, search_service=None, context_manager=None):
        # Accept dependencies or use global singletons
        self.search = search_service or get_search_service()
        self.context = context_manager or get_context_manager()
```

### Event-Driven Communication

Services communicate through session state changes and callback patterns:

```python
# Context manager notifies UI components through session state
st.session_state.context_updated = True
st.session_state.token_budget_changed = True

# Services observe session state changes
if st.session_state.get("context_updated"):
    self.refresh_context_display()
```

### Error Propagation

Services use consistent error handling patterns:

```python
try:
    result = service_operation()
    return {"success": True, "data": result}
except ServiceError as e:
    logger.error(f"Service operation failed: {e}")
    return {"success": False, "error": str(e)}
```

## Performance Considerations

### Service Optimization

**Singleton Pattern**: Core services use singleton pattern to avoid duplicate resource usage.

**Lazy Loading**: Services are initialized only when needed to reduce startup time.

**Caching**: Search results and embeddings are cached to improve response times.

**Batch Processing**: Multiple operations are batched together when possible.

### Resource Management

**Database Connections**: Shared database connection pool across all services.

**Memory Management**: LRU caches with size limits to prevent memory leaks.

**Token Budget**: Strict token counting to manage API costs.

**Embedding Cache**: Persistent cache to reduce API calls.

This service layer architecture provides a clean separation of concerns while enabling efficient coordination between different parts of the JTBD Assistant Platform.
# JTBD Assistant Platform Architecture

This document provides a high-level overview of the JTBD Assistant Platform architecture, design patterns, and key architectural decisions.

## System Overview

The JTBD Assistant Platform is a **single-user AI-powered Streamlit application** that transforms customer research into actionable insights through a conversational interface. The system follows a **vector-first approach** for content discovery and maintains simplicity by deliberately avoiding multi-tenancy complexity.

### Technology Stack

- **Frontend**: Streamlit for interactive web UI
- **Database**: Supabase (PostgreSQL) with pgvector extension
- **AI**: OpenAI GPT models + text-embedding-3-small
- **Package Management**: uv for Python dependencies
- **Optional Enhancement**: DSPy with graceful fallbacks

### High-Level Data Flow

```
Documents → Chunks → Embeddings → Vector Search → Context → HMW → Solutions
    ↓
 Insights (extracted) → Embeddings → Search Results
    ↓  
 JTBDs (user-defined) → Embeddings → Context Building
    ↓
 Metrics (performance) → Context Building → Solution Scoring
```

## Architecture Layers

### 1. Core Layer (`app/core/`)

The foundation layer providing essential infrastructure:

- **Database Layer**: Connection management, operations, validation
- **LLM Wrapper**: Centralized AI interactions with trace logging  
- **Embeddings**: Vector generation, caching, batch processing
- **Exceptions**: Custom error types and handling strategies
- **Constants**: Centralized configuration and magic numbers

### 2. Services Layer (`app/services/`)

Business logic and workflow orchestration:

- **Search Service**: Multi-type semantic search across content
- **Context Manager**: Token budget management and session state
- **Chat Service**: Query processing and response building
- **Initialization**: Dependency management and service startup

### 3. UI Layer (`app/ui/`)

Presentation and user interaction:

- **Chat Interface**: Main conversational interface
- **Selection Components**: Result cards, context building, token visualization
- **Session Management**: Chat history and state persistence

## Design Patterns

### Singleton Pattern
Core managers (database, embedding, LLM) use singleton pattern for resource efficiency:
```python
def get_database_manager() -> DatabaseManager:
    """Global singleton database manager instance."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager
```

### Dependency Injection
Services accept dependencies through constructor injection for testability:
```python
class ChatService:
    def __init__(self, search_service=None, context_manager=None):
        self.search = search_service or get_search_service()
        self.context = context_manager or get_context_manager()
```

### Observer Pattern
Context manager notifies UI components of state changes through session state.

### Factory Pattern
Service initialization uses factory functions to manage complex dependency chains.

## Key Architectural Decisions

### Single-User Design
- **Decision**: No org_id, session isolation, or cross-user complexity
- **Rationale**: Simplicity over scalability for initial implementation
- **Impact**: Streamlined database schema and reduced code complexity

### Vector-First Search
- **Decision**: All content gets embedded for semantic search
- **Rationale**: Better content discovery than keyword-based search
- **Impact**: Higher storage costs but superior search relevance

### Graceful Fallbacks
- **Decision**: DSPy enhancement with OpenAI fallback
- **Rationale**: Reliability over advanced features
- **Impact**: System remains functional even if DSPy fails

### Functional Programming Preference
- **Decision**: Pure functions, immutability where practical
- **Rationale**: Predictability, testability, and debugging ease
- **Impact**: More predictable behavior but occasional verbosity

### Centralized Configuration
- **Decision**: All constants in `app/core/constants.py`
- **Rationale**: Single source of truth for configuration
- **Impact**: Easy maintenance but requires discipline

## Performance Considerations

### Token Budget Management
The system enforces strict token limits to manage API costs:
- Max context: 4000 tokens with 500 token buffer
- Real-time token counting using tiktoken
- Automatic context pruning when limits exceeded

### Embedding Caching
- LRU cache with 10,000 entry limit
- SHA-256 hashing for cache keys
- 24-hour TTL for cache entries

### Batch Processing  
- Maximum 100 items per embedding batch
- Maximum 1000 characters per chunk
- Parallel processing where possible

### Vector Search Optimization
- 0.7 cosine similarity threshold for relevance
- 100 result limit per search operation
- RPC functions for efficient database queries

## Error Handling Strategy

### Exception Hierarchy
Custom exceptions extend base `JTBDAssistantError`:
- `DatabaseError` for data layer issues
- `LLMError` for AI service problems  
- `ValidationError` for input validation
- `ConfigurationError` for setup issues

### Graceful Degradation
- DSPy failures fall back to OpenAI direct
- Embedding cache misses trigger fresh generation
- Search failures return empty results rather than crash
- UI errors show user-friendly messages

### Observability
- All LLM calls logged to `llm_traces` table
- Structured logging with context information
- Error tracking with stack traces
- Performance metrics collection

## Security Considerations

### API Key Management
- Environment variables for sensitive credentials
- No hardcoded secrets in codebase
- Proper key rotation procedures

### Input Validation  
- All user inputs validated before processing
- SQL injection prevention through parameterized queries
- Content length limits enforced
- Sanitization of user-provided text

### Database Security
- Row-level security policies (when needed)
- Minimal required permissions
- Connection string encryption
- Regular security updates

## Scalability Limitations

The current architecture is intentionally single-user and has scalability constraints:

- **Database**: Single PostgreSQL instance
- **Sessions**: In-memory Streamlit session state
- **Caching**: Per-instance LRU cache
- **File Storage**: No distributed file system

For multi-user scaling, consider:
- Multi-tenant database design
- Redis for distributed caching  
- Load balancing across instances
- Separate storage layer

## Development Workflow

### Code Organization Principles
- Single Responsibility: Each file/class does one thing
- DRY: Shared logic abstracted into utilities
- YAGNI: Build only current requirements
- Explicit: No wildcard imports or magic behavior

### File Size Limits
- Maximum 500 LOC per file
- Split larger files into logical modules
- Prefer composition over large classes

### Testing Strategy
- Unit tests for core business logic
- Integration tests for service interactions
- Mock external dependencies (OpenAI, Supabase)
- Test error conditions and edge cases

This architecture provides a solid foundation for the JTBD Assistant Platform while maintaining simplicity and focusing on the core workflow of transforming research into actionable insights.
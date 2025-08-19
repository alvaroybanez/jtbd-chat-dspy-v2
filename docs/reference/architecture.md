# JTBD Assistant Platform Architecture

This document provides a high-level overview of the JTBD Assistant Platform architecture, design patterns, and key architectural decisions.

## System Overview

The JTBD Assistant Platform is a **single-user AI-powered conversational discovery platform** built with Streamlit that transforms customer research into actionable insights through sophisticated AI interactions. The system combines **vector-first semantic search** with **advanced conversational AI** featuring intent detection, dynamic response generation, and contextual guidance.

### Technology Stack

- **Frontend**: Streamlit for interactive web UI
- **Database**: Supabase (PostgreSQL) with pgvector extension
- **AI**: OpenAI GPT models + text-embedding-3-small
- **Package Management**: uv for Python dependencies
- **Optional Enhancement**: DSPy with graceful fallbacks

### High-Level Data Flow

**Traditional Workflow (Still Supported):**
```
Documents → Chunks → Embeddings → Vector Search → Context → HMW → Solutions
```

**Conversational Discovery Flow (Primary):**
```
User Message → Intent Detection → Dynamic Response Generation
     ↓              ↓                        ↓
Search Execution  Context Integration  Follow-up Questions
     ↓              ↓                        ↓
Result Synthesis  AI-Guided Discovery   Conversation Flow
     ↓              ↓                        ↓
Context Building  Insight Generation    Iterative Refinement
```

**Integrated Data Pipeline:**
```
Documents → Chunks → Embeddings → Semantic Search
    ↓
 Insights (extracted) → Embeddings → AI Context Integration
    ↓  
 JTBDs (user-defined) → Embeddings → Conversational Discovery
    ↓
 Metrics (performance) → Context Building → Solution Scoring
                            ↓
              Conversational AI ↔ Dynamic Context Building
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

Business logic and conversational workflow orchestration:

- **Conversation Service**: Advanced AI with intent detection and response generation
- **Search Service**: Multi-type semantic search across content  
- **Data Service**: Centralized data retrieval for UI components
- **Context Manager**: Token budget management and session state
- **Chat Service**: Query processing and response building
- **JTBD Service**: Jobs-to-be-Done management and operations
- **Metric Service**: Performance metrics tracking and management
- **Initialization**: Dependency management and service startup

### 3. UI Layer (`app/ui/`)

Professional conversational interface with optimized layouts:

- **Chat Interface**: AI-powered conversational discovery with workflow stepper
- **Selection Components**: Result cards, context building, token visualization
- **Form Components**: JTBD and metric creation with validation
- **Professional Layout**: Content-optimized weight distributions (20/80, 15/85)
- **Session Management**: Chat history and state persistence across interactions

## Conversational Architecture

### Intent-Driven Response System

The platform uses sophisticated AI-powered intent detection to provide contextually appropriate responses:

```python
User Message → Intent Analysis → Response Strategy Selection
     ↓               ↓                     ↓
 "Let's explore..." → EXPLORATION → Discovery Mode (High Creativity)
 "Find insights..." → SEARCH → Search-Guided Mode (Synthesis Focus)  
 "How do I..." → QUESTION → Expert Consultation (Authoritative)
 "Create JTBD..." → ACTION → Task Execution (Direct)
```

### Conversational Flow Management

**Multi-Modal Response Generation:**
- **Discovery Responses**: Creative exploration with higher AI temperature
- **Expert Consultation**: Knowledgeable guidance with balanced temperature
- **Search Synthesis**: Structured information synthesis with context
- **Follow-Up Generation**: Automatic question creation for conversation flow

### Context Integration Patterns

**Dynamic Context Building:**
```python
Search Results + User Intent + Conversation History → AI Context
                                ↓
                    Personalized Response Generation
                                ↓
                    Follow-Up Questions + Action Suggestions
```

**Temperature-Controlled Generation:**
- Intent Detection: 0.3 (consistent classification)
- Discovery Mode: Higher temperature (creative exploration)
- Expert Mode: Balanced temperature (accurate + engaging)
- Follow-ups: 0.8 (diverse question generation)

### Optimized File Architecture

The system includes optimized versions of core components for enhanced performance:

- **`main_optimized.py`**: Professional UX with content-optimized layouts
- **`chat_optimized.py`**: Conversational interface with 20/80 weight distribution
- **`metrics_optimized.py`**: Data tables with 15/85 layout optimization

These follow professional design patterns established in the UX specification.

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

### Conversational-First Design
- **Decision**: AI-powered conversational interface as primary interaction method
- **Rationale**: More intuitive for users of all skill levels, enables guided discovery
- **Impact**: Enhanced user experience but increased AI service dependency

### Professional UX Standards  
- **Decision**: Content-optimized weight distributions and professional typography
- **Rationale**: Maximize usable space and create professional appearance
- **Impact**: Better user experience and higher content density

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
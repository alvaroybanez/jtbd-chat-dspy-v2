# Development Patterns

This document describes the common coding patterns, practices, and conventions used throughout the JTBD Assistant Platform codebase.

## Code Organization Principles

### Single Responsibility Principle
Each module, class, and function has one clear responsibility:

```python
# ✅ Good: Clear single purpose
class EmbeddingManager:
    """Manages embedding generation with caching and batch processing."""
    
    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for list of texts."""

# ❌ Avoid: Multiple responsibilities mixed together  
class DataManager:
    """Handles database operations and embedding generation and UI state."""
```

### Dependency Injection Pattern
Services accept dependencies through constructor parameters for testability:

```python
class SearchService:
    def __init__(self, database_manager=None, embedding_manager=None):
        """Initialize with explicit dependencies or use global singletons."""
        self.db = database_manager or get_database_manager()
        self.embeddings = embedding_manager or get_embedding_manager()

# Usage in tests
search_service = SearchService(
    database_manager=mock_db,
    embedding_manager=mock_embeddings
)
```

### Singleton Pattern for Core Managers
Global managers use singleton pattern for resource efficiency:

```python
_database_manager = None

def get_database_manager() -> DatabaseManager:
    """Global singleton database manager instance."""
    global _database_manager
    if _database_manager is None:
        _database_manager = DatabaseManager()
    return _database_manager

# Usage: Always use the factory function
db = get_database_manager()  # ✅ Correct
db = DatabaseManager()       # ❌ Avoid direct instantiation
```

## Error Handling Patterns

### Structured Error Returns
All operations return structured dictionaries for consistent error handling:

```python
def operation_with_error_handling() -> Dict[str, Any]:
    """Standard error return pattern."""
    try:
        result = perform_operation()
        return {
            "success": True,
            "data": result,
            "message": "Operation completed successfully"
        }
    except SpecificError as e:
        logger.error(f"Operation failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_type": "specific_error"
        }
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return {
            "success": False,
            "error": "An unexpected error occurred",
            "error_type": "general_error"
        }

# Usage pattern
result = operation_with_error_handling()
if result["success"]:
    data = result["data"]
    # Process successful result
else:
    error_message = result["error"]
    # Handle error case
```

### Exception Hierarchy
Custom exceptions provide clear error categorization:

```python
class JTBDAssistantError(Exception):
    """Base exception for JTBD Assistant Platform."""
    pass

class DatabaseError(JTBDAssistantError):
    """Database operation errors."""
    pass

class LLMError(JTBDAssistantError):
    """LLM interaction errors."""
    pass

class ValidationError(JTBDAssistantError):
    """Input validation errors."""
    pass

# Usage with context
try:
    result = database_operation()
except DatabaseError as e:
    logger.error(f"Database error: {e}")
    return handle_database_error(e)
except ValidationError as e:
    logger.warning(f"Validation failed: {e}")
    return handle_validation_error(e)
```

### Graceful Fallbacks
Operations degrade gracefully when possible:

```python
def get_embeddings_with_fallback(texts: List[str]) -> List[List[float]]:
    """Get embeddings with fallback strategies."""
    try:
        # Primary method: Use cached embeddings
        return embedding_manager.get_embeddings(texts)
    except LLMError as e:
        logger.warning(f"Embedding generation failed: {e}")
        try:
            # Fallback: Use simple text similarity
            return generate_simple_embeddings(texts)
        except Exception as fallback_error:
            logger.error(f"Fallback failed: {fallback_error}")
            # Last resort: Return zero vectors
            return [[0.0] * EMBEDDING_DIMENSION for _ in texts]
```

## Validation Patterns

### Input Validation Decorators
Consistent validation across functions:

```python
def validate_text_input(func):
    """Decorator to validate text input parameters."""
    def wrapper(*args, **kwargs):
        # Find text parameters and validate
        for arg in args:
            if isinstance(arg, str) and not arg.strip():
                raise ValidationError("Text input cannot be empty")
        return func(*args, **kwargs)
    return wrapper

@validate_text_input
def process_text(text: str) -> Dict[str, Any]:
    """Process text with automatic validation."""
    return {"processed": text.strip()}
```

### Type Validation Functions
Reusable validation for common data types:

```python
def validate_embedding(embedding: List[float]) -> bool:
    """Validate embedding vector format and dimensions."""
    if not isinstance(embedding, list):
        raise ValidationError("Embedding must be a list")
    if len(embedding) != EMBEDDING_DIMENSION:
        raise ValidationError(f"Embedding must have {EMBEDDING_DIMENSION} dimensions")
    if not all(isinstance(x, (int, float)) for x in embedding):
        raise ValidationError("Embedding must contain only numeric values")
    return True

def validate_score_range(score: int, min_val: int = 1, max_val: int = 10) -> bool:
    """Validate score is within acceptable range."""
    if not isinstance(score, int):
        raise ValidationError("Score must be an integer")
    if score < min_val or score > max_val:
        raise ValidationError(f"Score must be between {min_val} and {max_val}")
    return True
```

## Database Interaction Patterns

### Connection Management
Centralized database connection handling:

```python
class DatabaseManager:
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Supabase client with retry logic."""
        for attempt in range(MAX_CONNECTION_RETRIES):
            try:
                self.client = create_client(
                    supabase_url=os.getenv(ENV_SUPABASE_URL),
                    supabase_key=os.getenv(ENV_SUPABASE_KEY)
                )
                return
            except Exception as e:
                if attempt == MAX_CONNECTION_RETRIES - 1:
                    raise DatabaseError(f"Failed to connect after {MAX_CONNECTION_RETRIES} attempts: {e}")
                time.sleep(BASE_RETRY_DELAY_MS / 1000 * (attempt + 1))
```

### Query Execution Pattern
Consistent error handling for database operations:

```python
def execute_query_with_retry(self, operation_func, *args, **kwargs) -> Dict[str, Any]:
    """Execute database operation with retry logic."""
    for attempt in range(MAX_RETRIES):
        try:
            result = operation_func(*args, **kwargs)
            return {"success": True, "data": result}
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                logger.error(f"Query failed after {MAX_RETRIES} attempts: {e}")
                return {"success": False, "error": str(e)}
            time.sleep(BASE_RETRY_DELAY_MS / 1000 * (2 ** attempt))
```

### Vector Search Pattern
Standardized vector search operations:

```python
def vector_search_template(
    self,
    rpc_function: str,
    query_embedding: List[float],
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    limit: int = DEFAULT_SEARCH_LIMIT
) -> Dict[str, Any]:
    """Template for vector search operations."""
    try:
        result = self.client.rpc(
            rpc_function,
            {
                "query_embedding": query_embedding,
                "similarity_threshold": similarity_threshold,
                "result_limit": limit
            }
        ).execute()
        
        return {
            "success": True,
            "results": result.data,
            "count": len(result.data)
        }
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "results": []
        }
```

## LLM Interaction Patterns

### Centralized LLM Calls
All AI interactions go through the LLM wrapper:

```python
def llm_operation_with_logging(
    self,
    operation_type: str,
    model: str,
    **operation_kwargs
) -> Dict[str, Any]:
    """Template for LLM operations with automatic logging."""
    start_time = time.time()
    
    try:
        # Perform the operation
        response = self._execute_llm_operation(operation_type, model, **operation_kwargs)
        
        # Log successful operation
        self._log_llm_trace({
            "operation": operation_type,
            "model": model,
            "success": True,
            "token_count": getattr(response, 'usage', {}).get('total_tokens', 0),
            "latency_ms": int((time.time() - start_time) * 1000)
        })
        
        return {"success": True, "response": response}
        
    except Exception as e:
        # Log failed operation
        self._log_llm_trace({
            "operation": operation_type,
            "model": model,
            "success": False,
            "error_message": str(e),
            "latency_ms": int((time.time() - start_time) * 1000)
        })
        
        return {"success": False, "error": str(e)}
```

### Retry Logic with Exponential Backoff
Robust retry handling for API calls:

```python
def retry_with_backoff(func, max_retries=MAX_RETRIES):
    """Execute function with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            return func()
        except RateLimitExceededError:
            if attempt == max_retries - 1:
                raise
            delay = BASE_RETRY_DELAY_MS * (BACKOFF_MULTIPLIER ** attempt) / 1000
            time.sleep(delay)
        except (LLMTimeoutError, ModelNotAvailableError) as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(BASE_RETRY_DELAY_MS / 1000)
```

## Caching Patterns

### LRU Cache Implementation
Memory-efficient caching for embeddings:

```python
from functools import lru_cache
import hashlib

class EmbeddingCache:
    def __init__(self, max_size: int = EMBEDDING_CACHE_SIZE_LIMIT):
        self.cache = {}
        self.max_size = max_size
        self.access_order = []
    
    def _generate_key(self, text: str) -> str:
        """Generate cache key using SHA-256 hash."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    def get(self, text: str) -> Optional[List[float]]:
        """Get embedding from cache with LRU tracking."""
        key = self._generate_key(text)
        if key in self.cache:
            # Move to end (most recently used)
            self.access_order.remove(key)
            self.access_order.append(key)
            return self.cache[key]
        return None
    
    def set(self, text: str, embedding: List[float]) -> None:
        """Set embedding in cache with size management."""
        key = self._generate_key(text)
        
        # Remove oldest entries if at capacity
        while len(self.cache) >= self.max_size:
            oldest_key = self.access_order.pop(0)
            del self.cache[oldest_key]
        
        self.cache[key] = embedding
        self.access_order.append(key)
```

### Cache-First Access Pattern
Always check cache before expensive operations:

```python
def get_embeddings_with_cache(self, texts: List[str]) -> List[List[float]]:
    """Get embeddings with cache-first approach."""
    results = []
    uncached_texts = []
    uncached_indices = []
    
    # Check cache for each text
    for i, text in enumerate(texts):
        cached_embedding = self.cache.get(text)
        if cached_embedding:
            results.append(cached_embedding)
        else:
            results.append(None)  # Placeholder
            uncached_texts.append(text)
            uncached_indices.append(i)
    
    # Generate embeddings for uncached texts
    if uncached_texts:
        new_embeddings = self.llm.generate_embeddings(uncached_texts)
        
        # Update results and cache
        for i, (index, embedding) in enumerate(zip(uncached_indices, new_embeddings)):
            results[index] = embedding
            self.cache.set(uncached_texts[i], embedding)
    
    return results
```

## Configuration Management

### Environment Variable Handling
Centralized environment configuration:

```python
class ConfigManager:
    """Centralized configuration management."""
    
    @staticmethod
    def get_required_env(var_name: str, alternatives: List[str] = None) -> str:
        """Get required environment variable with alternatives."""
        value = os.getenv(var_name)
        if not value and alternatives:
            for alt in alternatives:
                value = os.getenv(alt)
                if value:
                    break
        
        if not value:
            raise ConfigurationError(f"Required environment variable not found: {var_name}")
        
        return value
    
    @staticmethod
    def get_optional_env(var_name: str, default_value: Any = None) -> Any:
        """Get optional environment variable with default."""
        return os.getenv(var_name, default_value)
    
    @classmethod
    def validate_configuration(cls) -> Dict[str, Any]:
        """Validate all required configuration is present."""
        try:
            config = {
                "supabase_url": cls.get_required_env(ENV_SUPABASE_URL),
                "supabase_key": cls.get_required_env(ENV_SUPABASE_KEY, ENV_SUPABASE_KEY_ALTERNATIVES),
                "openai_api_key": cls.get_required_env(ENV_OPENAI_API_KEY)
            }
            return {"success": True, "config": config}
        except ConfigurationError as e:
            return {"success": False, "error": str(e)}
```

### Constants Organization
Centralized constants with clear categories:

```python
# app/core/constants.py

# === EMBEDDING CONSTANTS ===
EMBEDDING_DIMENSION = 1536
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"

# === PERFORMANCE LIMITS ===
MAX_BATCH_SIZE = 100
MAX_CHUNK_SIZE = 1000
MAX_CONTEXT_TOKENS = 4000

# === ERROR MESSAGES ===
ERROR_CLIENT_NOT_INITIALIZED = "Client not initialized"
ERROR_INVALID_EMBEDDING_DIMENSION = "Invalid embedding dimension"
ERROR_NO_TEXTS_PROVIDED = "No texts provided"

# Group related constants together
# Use descriptive names, not magic numbers
# Document units and constraints in comments
```

## Logging and Observability

### Structured Logging Pattern
Consistent logging across the application:

```python
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def log_operation(operation: str, **context):
    """Log operation with structured context."""
    logger.info(
        f"{operation} completed",
        extra={
            "operation": operation,
            "timestamp": datetime.now().isoformat(),
            **context
        }
    )

# Usage
log_operation(
    "embedding_generation",
    text_count=len(texts),
    cache_hits=cache_hits,
    duration_ms=duration
)
```

### Performance Monitoring
Track key operations for optimization:

```python
import time
from contextlib import contextmanager

@contextmanager
def timing_context(operation_name: str):
    """Context manager for timing operations."""
    start_time = time.time()
    try:
        yield
    finally:
        duration = (time.time() - start_time) * 1000
        logger.info(f"{operation_name} completed in {duration:.2f}ms")

# Usage
with timing_context("database_query"):
    result = db.execute_query(query)
```

## Testing Patterns

### Mock Service Pattern
Consistent mocking for external dependencies:

```python
from unittest.mock import Mock, MagicMock

def create_mock_database_manager():
    """Create mock database manager for testing."""
    mock_db = Mock(spec=DatabaseManager)
    mock_db.test_connection.return_value = {"success": True}
    mock_db.store_document_with_embedding.return_value = {
        "success": True,
        "document_id": "test-uuid"
    }
    return mock_db

def create_mock_embedding_manager():
    """Create mock embedding manager for testing."""
    mock_embeddings = Mock(spec=EmbeddingManager)
    mock_embeddings.get_embeddings.return_value = [[0.1, 0.2, 0.3] * 512]
    return mock_embeddings

# Usage in tests
def test_search_service():
    mock_db = create_mock_database_manager()
    mock_embeddings = create_mock_embedding_manager()
    
    search_service = SearchService(mock_db, mock_embeddings)
    result = search_service.search_all_types("test query")
    
    assert result["success"]
```

### Test Data Factories
Reusable test data generation:

```python
def create_test_document(
    title: str = "Test Document",
    content: str = "Test content",
    **overrides
) -> Dict[str, Any]:
    """Create test document data."""
    document = {
        "id": "test-doc-uuid",
        "title": title,
        "content": content,
        "created_at": "2024-01-15T10:30:00Z"
    }
    document.update(overrides)
    return document

def create_test_insight(
    description: str = "Test insight",
    document_id: str = "test-doc-uuid",
    **overrides
) -> Dict[str, Any]:
    """Create test insight data."""
    insight = {
        "id": "test-insight-uuid",
        "description": description,
        "document_id": document_id,
        "similarity": 0.85,
        "created_at": "2024-01-15T10:30:00Z"
    }
    insight.update(overrides)
    return insight
```

## Development Guidelines

### Code Quality Standards
- Maximum 500 lines per file
- Clear docstrings for all public functions
- Type hints for function signatures
- Comprehensive error handling
- No hardcoded magic numbers

### Naming Conventions
- Functions: `snake_case`
- Classes: `PascalCase` 
- Constants: `UPPER_SNAKE_CASE`
- Private methods: `_leading_underscore`
- Database tables: `lowercase_with_underscores`

### Import Organization
```python
# Standard library imports
import os
import time
from typing import Dict, List, Optional

# Third-party imports
import streamlit as st
from openai import OpenAI
from supabase import create_client

# Local application imports
from ..core.constants import DEFAULT_SIMILARITY_THRESHOLD
from ..core.exceptions import DatabaseError
from .base_service import BaseService
```

## Conversational AI Patterns

### Intent-Driven Response Pattern
Route user messages through intent detection for appropriate response generation:

```python
def process_conversational_message(message: str, context: Dict) -> Dict[str, Any]:
    """Standard conversational message processing pattern."""
    
    # 1. Intent Detection
    intent = conversation_service.analyze_intent(message)
    
    # 2. Context Gathering (if needed)
    search_results = None
    if intent.needs_search:
        search_results = search_service.search_all_types(
            query=message,
            search_types=determine_search_types(intent)
        )
    
    # 3. Response Generation
    response = conversation_service.generate_conversational_response(
        message=message,
        intent=intent,
        search_results=search_results,
        conversation_history=context.get('history', [])
    )
    
    # 4. Follow-up Generation
    if response["success"] and intent.is_exploration:
        follow_ups = generate_follow_up_questions(message, response["content"])
        response["follow_up_questions"] = follow_ups
    
    return response
```

### Temperature-Based Response Control
Use different AI temperatures for different interaction modes:

```python
class ResponseModeManager:
    """Manages AI response modes with appropriate temperature settings."""
    
    RESPONSE_MODES = {
        "discovery": {
            "temperature": DISCOVERY_TEMPERATURE,  # 0.9 - High creativity
            "prompts": discovery_prompts,
            "focus": "creative_exploration"
        },
        "expert": {
            "temperature": CONVERSATION_TEMPERATURE,  # 0.7 - Balanced
            "prompts": expert_prompts, 
            "focus": "authoritative_guidance"
        },
        "synthesis": {
            "temperature": CONVERSATION_TEMPERATURE,  # 0.7 - Structured
            "prompts": synthesis_prompts,
            "focus": "information_synthesis"
        }
    }
    
    def get_response_config(self, intent: MessageIntent) -> Dict[str, Any]:
        """Get response configuration based on detected intent."""
        if intent.is_exploration:
            return self.RESPONSE_MODES["discovery"]
        elif intent.is_search:
            return self.RESPONSE_MODES["synthesis"]
        else:
            return self.RESPONSE_MODES["expert"]
```

### Fallback Intent Detection Pattern
Provide robust intent detection with AI and heuristic fallbacks:

```python
def robust_intent_detection(message: str) -> MessageIntent:
    """Intent detection with multiple fallback strategies."""
    
    # Primary: AI-powered intent detection
    try:
        ai_result = llm_wrapper.generate_chat_completion(
            messages=get_intent_detection_prompt(message),
            temperature=INTENT_DETECTION_TEMPERATURE  # 0.3 - Consistent
        )
        
        if ai_result["success"]:
            intent = parse_intent_response(ai_result["content"], message)
            if intent.confidence >= INTENT_CONFIDENCE_THRESHOLD:
                return intent
    
    except Exception as e:
        logger.warning(f"AI intent detection failed: {e}")
    
    # Fallback: Heuristic classification
    return heuristic_intent_detection(message)

def heuristic_intent_detection(message: str) -> MessageIntent:
    """Simple heuristic-based intent detection fallback."""
    message_lower = message.lower().strip()
    
    # Question indicators
    if message_lower.endswith('?') or any(word in message_lower for word in QUESTION_WORDS):
        return MessageIntent("QUESTION", 0.6, True)
    
    # Search indicators
    elif any(word in message_lower for word in SEARCH_WORDS):
        return MessageIntent("SEARCH", 0.7, True)
    
    # Exploration indicators  
    elif any(word in message_lower for word in EXPLORATION_WORDS):
        return MessageIntent("EXPLORATION", 0.8, True)
    
    # Default to question for conversational approach
    return MessageIntent("QUESTION", 0.5, True)
```

## Optimized File Architecture Patterns

### Optimized vs Standard File Pattern
The platform includes optimized versions of core components following professional UX standards:

```python
# File naming pattern for optimized components
OPTIMIZED_FILE_PATTERN = {
    "main.py": "main_optimized.py",           # Professional UX main app
    "chat.py": "chat_optimized.py",           # 20/80 weight distribution
    "metrics.py": "metrics_optimized.py",     # 15/85 weight distribution  
}

# Usage pattern in main app routing
def get_page_module(page_name: str, use_optimized: bool = True):
    """Get page module with optional optimized version."""
    if use_optimized and f"{page_name}_optimized.py" exists:
        return import_module(f"app.pages.{page_name}_optimized")
    else:
        return import_module(f"app.pages.{page_name}")
```

### Professional Layout Implementation Pattern
Implement content-optimized weight distributions based on page type:

```python
class LayoutManager:
    """Manages professional layout patterns across page types."""
    
    LAYOUT_CONFIGS = {
        "conversational": {
            "sidebar_width": 0.2,     # 20% for chat pages
            "main_width": 0.8,        # 80% for content
            "rationale": "Chat needs maximum space for conversation flow"
        },
        "data_table": {
            "sidebar_width": 0.15,    # 15% for table pages  
            "main_width": 0.85,       # 85% for data display
            "rationale": "Tables need maximum horizontal space"
        }
    }
    
    def apply_layout(self, page_type: str):
        """Apply appropriate layout for page type."""
        config = self.LAYOUT_CONFIGS.get(page_type, self.LAYOUT_CONFIGS["conversational"])
        
        with st.sidebar:
            # Sidebar content optimized for width
            self._render_sidebar_content(config["sidebar_width"])
        
        # Main content uses remaining space
        self._render_main_content(config["main_width"])
```

### Professional Emoji Usage Pattern
Enforce professional emoji usage guidelines:

```python
class EmojiManager:
    """Manages professional emoji usage across the application."""
    
    APPROVED_EMOJIS = {
        "navigation": {"💬": "chat", "📊": "metrics", "💡": "insights", "🎯": "jtbds"},
        "status": {"✅": "success", "⚠️": "warning", "❌": "error"},
        "content": {"📄": "documents", "📈": "metrics", "🔍": "search"},
        "actions": {"➕": "add", "📥": "import", "🗑️": "delete"}
    }
    
    PROHIBITED_PATTERNS = [
        r"[😊🚀✨🎉]",          # Emotional/personality emojis
        r"(\S+\s*){2,}",        # Multiple emojis per element
        r"(📄|📊|💡|🎯).+\1"   # Redundant emojis
    ]
    
    def validate_emoji_usage(self, text: str) -> Dict[str, Any]:
        """Validate text against professional emoji guidelines."""
        issues = []
        
        # Check for prohibited patterns
        for pattern in self.PROHIBITED_PATTERNS:
            if re.search(pattern, text):
                issues.append(f"Prohibited emoji pattern found: {pattern}")
        
        # Check for approved usage
        emoji_count = len(re.findall(r'[^\w\s]', text))
        if emoji_count > 1:
            issues.append("Multiple emojis detected - use only one functional emoji")
        
        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "suggestions": self._generate_suggestions(text)
        }
```

## Streamlit-Specific Patterns

### Streamlit Session State Management
Efficient session state patterns for conversational applications:

```python
def initialize_session_state():
    """Initialize all required session state variables."""
    defaults = {
        "chat_messages": [],
        "conversation_history": [],
        "selected_context": {"insights": [], "jtbds": [], "metrics": []},
        "workflow_stage": 1,
        "token_budget": {"used": 0, "limit": MAX_CONTEXT_TOKENS},
        "services_initialized": False
    }
    
    for key, default_value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = default_value

def update_session_state_safely(updates: Dict[str, Any]):
    """Safely update multiple session state values."""
    for key, value in updates.items():
        if key in st.session_state:
            st.session_state[key] = value
        else:
            logger.warning(f"Attempted to update non-existent session state key: {key}")
```

### Professional Streamlit Component Pattern
Consistent component implementation with error handling:

```python
def render_professional_component(
    title: str,
    content_func: callable,
    error_message: str = "Component failed to render",
    show_loading: bool = True
) -> bool:
    """Standard pattern for rendering Streamlit components professionally."""
    try:
        if show_loading:
            with st.spinner(f"Loading {title.lower()}..."):
                success = content_func()
        else:
            success = content_func()
        
        return success
    
    except Exception as e:
        logger.error(f"{title} component error: {e}")
        st.error(f"{error_message}. Please try refreshing the page.")
        return False

# Usage example
def render_chat_interface():
    """Render chat interface with professional error handling."""
    return render_professional_component(
        title="Chat Interface",
        content_func=lambda: _render_chat_content(),
        error_message="Chat interface failed to load"
    )
```

## Data Service Pattern

### Centralized Data Retrieval Pattern
Consistent data access through dedicated service layer:

```python
class DataService:
    """Centralized data retrieval with consistent error handling."""
    
    def __init__(self):
        self.db_manager = get_database_manager()
        self.operations = DatabaseOperations(self.db_manager.client)
    
    def get_data_with_processing(
        self, 
        data_type: str,
        processing_func: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Standard data retrieval with optional processing."""
        try:
            # Get raw data
            result = getattr(self.operations, f"get_all_{data_type}")()
            
            if not result.get("success"):
                return result
            
            # Apply processing if provided
            data = result.get(data_type, [])
            if processing_func:
                data = processing_func(data)
            
            return {
                "success": True,
                f"{data_type}": data,
                "count": len(data)
            }
            
        except Exception as e:
            logger.error(f"Data service error for {data_type}: {e}")
            return {
                "success": False,
                "error": f"Failed to retrieve {data_type}: {str(e)}"
            }

# Usage pattern
def get_processed_metrics():
    """Get metrics with additional processing."""
    def add_progress_calculation(metrics):
        for metric in metrics:
            if metric.get('current_value') and metric.get('target_value'):
                progress = (metric['current_value'] / metric['target_value']) * 100
                metric['progress_percentage'] = min(100, max(0, progress))
        return metrics
    
    return data_service.get_data_with_processing("metrics", add_progress_calculation)
```

These advanced patterns ensure the JTBD Assistant Platform maintains consistency, professionalism, and reliability while supporting sophisticated conversational AI interactions and modern UX standards.
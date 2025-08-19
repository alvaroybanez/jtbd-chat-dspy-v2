# Core Concepts

This document explains the fundamental building blocks of the JTBD Assistant Platform: database management, LLM interactions, embedding generation, and core infrastructure components.

## Database Layer

The database layer provides structured data storage with vector search capabilities through PostgreSQL and the pgvector extension.

### Database Manager (`app/core/database/connection.py`)

The `DatabaseManager` class provides connection management and basic database operations:

```python
class DatabaseManager:
    """Manages Supabase connection and basic database operations."""
    
    def __init__(self):
        self.client: Optional[Client] = None
        self._initialize_client()
    
    def execute_query(self, query: str, params: Optional[Dict] = None):
        """Execute SQL query with parameters."""
        # Connection handling, retries, error management
```

**Key Features:**
- Singleton pattern for resource efficiency
- Automatic connection retry with exponential backoff
- Environment variable configuration (`SUPABASE_URL`, `SUPABASE_KEY`)
- Connection timeout and retry limits
- Structured error handling

**Connection Management:**
- 30-second connection timeout
- 3 maximum connection retries
- Graceful failure handling
- Connection pooling through Supabase client

### Database Operations (`app/core/database/operations.py`)

The `DatabaseOperations` class provides higher-level database operations:

```python
class DatabaseOperations:
    """High-level database operations for JTBD platform."""
    
    def store_document_with_embedding(self, title: str, content: str, embedding: List[float]):
        """Store document with its vector embedding."""
        # Validates input, stores document, creates chunks, stores embeddings
    
    def search_similar_content(self, query_embedding: List[float], table: str, limit: int = 10):
        """Search for similar content using vector similarity."""
        # Uses RPC functions for efficient vector search
```

**Core Operations:**
- Document storage with chunking
- Vector embedding storage and retrieval
- Semantic search across multiple content types
- Batch processing for efficiency
- Transaction management

### Vector Search System

The platform uses **pgvector** for high-performance similarity search:

**Vector Storage:**
- 1536-dimension embeddings (OpenAI text-embedding-3-small)
- Cosine similarity distance function
- Optimized indexes for fast retrieval

**Search Functions:**
```sql
-- RPC functions for vector search
CREATE OR REPLACE FUNCTION search_chunks(query_embedding vector(1536), similarity_threshold float, result_limit int)
CREATE OR REPLACE FUNCTION search_insights(query_embedding vector(1536), similarity_threshold float, result_limit int)
CREATE OR REPLACE FUNCTION search_jtbds(query_embedding vector(1536), similarity_threshold float, result_limit int)
```

**Search Parameters:**
- Similarity threshold: 0.7 (default)
- Result limit: 100 (maximum)
- Distance metric: Cosine similarity

## LLM Integration

The LLM wrapper provides centralized AI interactions with comprehensive logging and error handling.

### LLM Wrapper (`app/core/llm_wrapper.py`)

```python
class LLMWrapper:
    """Centralized wrapper for all LLM interactions with automatic trace logging."""
    
    def __init__(self, database_manager=None):
        self.client: Optional[OpenAI] = None
        self.db = database_manager
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for list of texts."""
        # Batch processing, retry logic, error handling
    
    def chat_completion(self, messages: List[Dict], model: str = None) -> Dict:
        """Generate chat completion with trace logging."""
        # Model selection, parameter validation, response handling
```

**Key Features:**

**Model Configuration:**
- Default chat model: `gpt-4o-mini`
- Default embedding model: `text-embedding-3-small`
- Configurable temperature (0.7 default)
- Model fallback strategies

**Retry Logic:**
- Maximum 3 retries on failure
- Exponential backoff (1s base, 10s max)
- 2.0x backoff multiplier
- Rate limit handling

**Trace Logging:**
All LLM interactions are automatically logged to the `llm_traces` table:
```python
trace_data = {
    "operation": "chat_completion",
    "model": model,
    "prompt_summary": truncate_text(prompt, PROMPT_SUMMARY_LENGTH),
    "response_summary": truncate_text(response, RESPONSE_SUMMARY_LENGTH),
    "token_count": response.usage.total_tokens,
    "cost_estimate": calculate_cost(tokens, model),
    "latency_ms": (end_time - start_time) * 1000,
    "success": True
}
```

**Error Handling:**
Custom exceptions for different failure modes:
- `RateLimitExceededError`: API rate limits hit
- `TokenLimitExceededError`: Context length exceeded
- `ModelNotAvailableError`: Model unavailable
- `LLMTimeoutError`: Request timeout
- `APIKeyNotFoundError`: Missing API key

## Embedding System

The embedding manager handles vector generation, caching, and batch processing for optimal performance.

### Embedding Manager (`app/core/embeddings.py`)

```python
class EmbeddingManager:
    """Manages embedding generation with caching and batch processing."""
    
    def __init__(self, llm_wrapper, database_manager):
        self.llm = llm_wrapper
        self.db = database_manager
        self.cache = LRUCache(maxsize=EMBEDDING_CACHE_SIZE_LIMIT)
    
    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings with cache-first approach."""
        # Check cache, batch uncached items, merge results
```

**Caching Strategy:**

**LRU Cache:**
- 10,000 entry limit
- 24-hour TTL for entries
- SHA-256 hashing for cache keys
- Memory-efficient storage

**Cache Key Generation:**
```python
def _generate_cache_key(self, text: str) -> str:
    """Generate SHA-256 hash for cache key."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()
```

**Batch Processing:**
- Maximum 100 texts per batch
- Automatic batching for efficiency
- Parallel processing where possible
- Error isolation per batch

**Database Integration:**
- Automatic embedding storage
- Retrieval of existing embeddings
- Cache warming from database
- Consistency validation

### Vector Operations

**Embedding Generation:**
```python
# Single text embedding
embedding = embedding_manager.get_embedding("customer feedback text")

# Batch embedding generation  
embeddings = embedding_manager.get_embeddings([
    "insight 1",
    "insight 2", 
    "jtbd statement"
])
```

**Search Operations:**
```python
# Semantic search across content types
results = search_service.search_all_types(
    query="customer pain points",
    search_types=["insights", "chunks", "jtbds"],
    similarity_threshold=0.7,
    limit_per_type=10
)
```

## Configuration Management

All system constants are centralized in `app/core/constants.py` for maintainability.

### Core Constants

**Embedding Configuration:**
```python
EMBEDDING_DIMENSION = 1536                    # OpenAI embedding dimensions
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_SIMILARITY_THRESHOLD = 0.7           # Vector search threshold
MAX_SEARCH_RESULTS = 100                     # Maximum search results
```

**Performance Limits:**
```python
MAX_BATCH_SIZE = 100                         # Maximum embedding batch size
MAX_CHUNK_SIZE = 1000                        # Maximum characters per chunk
MAX_CONTEXT_TOKENS = 4000                    # Token budget for context
EMBEDDING_CACHE_SIZE_LIMIT = 10000           # LRU cache size
```

**LLM Configuration:**
```python
DEFAULT_CHAT_MODEL = "gpt-4o-mini"           # Default chat model
MAX_RETRIES = 3                              # Maximum API retries
BASE_RETRY_DELAY_MS = 1000                   # Base retry delay
DEFAULT_TEMPERATURE = 0.7                    # Default temperature
```

### Environment Variables

**Required Variables:**
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase service role key
- `OPENAI_API_KEY`: OpenAI API key

**Environment Detection:**
```python
def _check_environment():
    """Validate all required environment variables are present."""
    required_vars = [
        ENV_SUPABASE_URL,
        ENV_SUPABASE_KEY, 
        ENV_OPENAI_API_KEY
    ]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        raise ConfigurationError(f"Missing environment variables: {missing_vars}")
```

## Exception Handling

The platform uses a hierarchical exception system for clear error communication.

### Exception Hierarchy

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

class ConfigurationError(JTBDAssistantError):
    """Configuration and setup errors."""
    pass
```

### Error Handling Patterns

**Graceful Degradation:**
```python
try:
    embeddings = embedding_manager.get_embeddings(texts)
except LLMError as e:
    logger.warning(f"Embedding generation failed: {e}")
    # Fall back to cached embeddings or skip processing
    embeddings = []
```

**Retry Logic:**
```python
def with_retry(func, max_retries=MAX_RETRIES):
    """Execute function with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            return func()
        except RetryableError as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(BASE_RETRY_DELAY_MS * (BACKOFF_MULTIPLIER ** attempt) / 1000)
```

**Error Context:**
```python
class ContextualError(JTBDAssistantError):
    """Error with additional context information."""
    
    def __init__(self, message: str, context: Dict[str, Any] = None):
        super().__init__(message)
        self.context = context or {}
```

## Validation System

Input validation ensures data integrity and security across the platform.

### Validation Rules

**Text Validation:**
```python
def validate_text_input(text: str, min_length: int = MIN_TEXT_LENGTH, max_length: int = MAX_TEXT_LENGTH):
    """Validate text input with length constraints."""
    if not isinstance(text, str):
        raise ValidationError("Input must be a string")
    if len(text.strip()) < min_length:
        raise ValidationError(f"Text must be at least {min_length} characters")
    if len(text) > max_length:
        raise ValidationError(f"Text exceeds maximum length of {max_length} characters")
```

**Embedding Validation:**
```python
def validate_embedding(embedding: List[float]):
    """Validate embedding vector format and dimensions."""
    if not isinstance(embedding, list):
        raise ValidationError("Embedding must be a list")
    if len(embedding) != EMBEDDING_DIMENSION:
        raise ValidationError(f"Embedding must have {EMBEDDING_DIMENSION} dimensions")
    if not all(isinstance(x, (int, float)) for x in embedding):
        raise ValidationError("Embedding must contain only numeric values")
```

**Database Validation:**
```python
def validate_database_connection(client):
    """Validate database connection is active and functional."""
    try:
        result = client.table("documents").select("id").limit(1).execute()
        return True
    except Exception as e:
        raise DatabaseError(f"Database connection validation failed: {e}")
```

## Logging and Observability

The platform implements comprehensive logging for debugging and monitoring.

### Logging Configuration

```python
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('jtbd_assistant.log')
    ]
)
```

### Structured Logging

**Operation Logging:**
```python
logger.info("Database operation", extra={
    "operation": "document_store",
    "document_id": doc_id,
    "chunk_count": len(chunks),
    "embedding_dimension": len(embedding),
    "duration_ms": duration
})
```

**Error Logging:**
```python
logger.error("LLM request failed", extra={
    "model": model,
    "error_type": type(e).__name__,
    "error_message": str(e),
    "retry_count": retry_count,
    "context": error_context
})
```

This core infrastructure provides the foundation for all higher-level operations in the JTBD Assistant Platform, ensuring reliability, performance, and maintainability.
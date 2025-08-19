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

## Conversational AI System

The platform includes sophisticated conversational AI capabilities through centralized prompt management and intent detection.

### Prompts Module (`app/core/prompts.py`)

The prompts module centralizes all AI interaction templates and conversation management:

```python
# Core system prompts for different interaction modes
JTBD_EXPERT_SYSTEM_PROMPT = """You are a Jobs-to-be-Done (JTBD) expert and business strategist..."""
DISCOVERY_SYSTEM_PROMPT = """You are in discovery mode, helping the user explore and brainstorm..."""
SYNTHESIS_SYSTEM_PROMPT = """You are helping synthesize research findings and data..."""
INTENT_DETECTION_SYSTEM_PROMPT = """Analyze user messages to determine their intent..."""
```

**Prompt Generation Functions:**
```python
def get_jtbd_expert_prompt(user_question: str, context: Optional[str], conversation_history: Optional[List]) -> List[Dict[str, str]]:
    """Generate JTBD expert conversation prompt with context."""
    
def get_discovery_prompt(user_question: str, context: Optional[str]) -> List[Dict[str, str]]:
    """Generate discovery-focused conversation prompt."""
    
def get_intent_detection_prompt(message: str) -> List[Dict[str, str]]:
    """Generate intent detection prompt."""

def format_search_context(search_results: Dict[str, List[Dict]]) -> str:
    """Format search results into readable context for AI responses."""
```

### Intent Detection System

**Message Classification:**
```python
# Intent types supported by the system
INTENT_TYPES = [
    "QUESTION",     # User seeks explanation or guidance
    "SEARCH",       # User wants to find specific content
    "EXPLORATION",  # User wants to brainstorm or discover
    "ACTION"        # User wants to perform a task
]

# Classification confidence threshold
INTENT_CONFIDENCE_THRESHOLD = 0.7
```

**Intent Analysis Process:**
```python
def analyze_intent_flow(message: str) -> MessageIntent:
    """Complete intent analysis with AI and fallback classification"""
    
    # Primary: AI-powered intent detection
    ai_result = llm_wrapper.generate_chat_completion(
        messages=get_intent_detection_prompt(message),
        temperature=0.3  # Low temperature for consistent classification
    )
    
    # Fallback: Heuristic pattern matching
    if not ai_result.success or confidence < INTENT_CONFIDENCE_THRESHOLD:
        return fallback_intent_detection(message)
    
    return parse_intent_response(ai_result.content, message)
```

### Conversational Response Modes

**Temperature-Controlled Generation:**
```python
# Different temperatures for different conversation modes
CONVERSATION_TEMPERATURE = 0.7      # Balanced responses for general conversation
DISCOVERY_TEMPERATURE = 0.9         # Higher creativity for exploration
INTENT_DETECTION_TEMPERATURE = 0.3  # Consistent classification
FOLLOW_UP_TEMPERATURE = 0.8         # Creative question generation
```

**Response Type Configuration:**
```python
RESPONSE_MODES = {
    "discovery": {
        "temperature": DISCOVERY_TEMPERATURE,
        "system_prompt": DISCOVERY_SYSTEM_PROMPT,
        "focus": "creative_exploration"
    },
    "expert": {
        "temperature": CONVERSATION_TEMPERATURE, 
        "system_prompt": JTBD_EXPERT_SYSTEM_PROMPT,
        "focus": "knowledgeable_guidance"
    },
    "synthesis": {
        "temperature": CONVERSATION_TEMPERATURE,
        "system_prompt": SYNTHESIS_SYSTEM_PROMPT,
        "focus": "information_synthesis"
    }
}
```

### Follow-Up Question Generation

**Automatic Question Creation:**
```python
def generate_follow_up_questions(user_message: str, assistant_response: str) -> List[str]:
    """Generate contextually relevant follow-up questions"""
    
    follow_up_prompt = FOLLOW_UP_GENERATION_PROMPT.format(
        user_message=user_message,
        assistant_response=assistant_response
    )
    
    result = llm_wrapper.generate_chat_completion(
        messages=[{"role": "user", "content": follow_up_prompt}],
        temperature=FOLLOW_UP_TEMPERATURE
    )
    
    return parse_follow_up_questions(result.content)
```

**Follow-Up Characteristics:**
- Build naturally on current conversation topic
- Explore different angles and implications  
- Help users discover new insights
- Remain specific and actionable
- Limited to MAX_FOLLOW_UP_QUESTIONS (typically 3)

### Context Integration Patterns

**Search Context Formatting:**
```python
def format_search_context(search_results: Dict[str, List[Dict]]) -> str:
    """Format multi-type search results for AI consumption"""
    context_parts = []
    
    for content_type, items in search_results.items():
        if content_type == "chunks":
            for chunk in items[:5]:
                context_parts.append(f"Document: {chunk['content'][:300]}...")
        elif content_type == "insights":
            for insight in items[:5]:
                context_parts.append(f"Insight: {insight['description']}")
        elif content_type == "jtbds":
            for jtbd in items[:5]:
                jtbd_text = f"JTBD: {jtbd['statement']}"
                if jtbd.get('context'):
                    jtbd_text += f" (Context: {jtbd['context']})"
                context_parts.append(jtbd_text)
    
    return "\n".join(context_parts)
```

### Conversation History Management

**Context Window Management:**
```python
MAX_CONVERSATION_HISTORY = 5  # Maximum exchanges to maintain

def manage_conversation_context(history: List[Dict], new_message: str) -> List[Dict]:
    """Manage conversation history within context limits"""
    history.append({"role": "user", "content": new_message})
    
    # Maintain sliding window of recent conversation
    if len(history) > MAX_CONVERSATION_HISTORY * 2:  # 2 messages per exchange
        history = history[-(MAX_CONVERSATION_HISTORY * 2):]
    
    return history
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

**Conversational AI Configuration:**
```python
CONVERSATION_TEMPERATURE = 0.7               # Balanced conversation responses
DISCOVERY_TEMPERATURE = 0.9                  # Creative exploration responses
INTENT_DETECTION_TEMPERATURE = 0.3           # Consistent intent classification
FOLLOW_UP_TEMPERATURE = 0.8                  # Creative question generation
MAX_CONVERSATION_HISTORY = 5                 # Maximum conversation exchanges to track
MAX_FOLLOW_UP_QUESTIONS = 3                  # Maximum follow-up questions per response
INTENT_CONFIDENCE_THRESHOLD = 0.7            # Minimum confidence for AI intent detection
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
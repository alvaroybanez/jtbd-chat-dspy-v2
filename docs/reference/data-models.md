# Data Models and Schema

This document describes the database schema, data structures, and models used throughout the JTBD Assistant Platform.

## Database Schema Overview

The platform uses a **PostgreSQL database with pgvector extension** for vector similarity search. The schema is designed around the JTBD (Jobs-to-be-Done) workflow with **8 core tables** and supporting relationship tables.

### Schema Design Principles

- **Single-User System**: No org_id or multi-tenancy complexity, RLS disabled for simplicity
- **Vector-First**: All searchable content has embeddings (1536-dimension)
- **Relationship Tracking**: Many-to-many tables connect related entities
- **Audit Trail**: Created timestamps and enhanced LLM trace logging with retry tracking
- **Data Integrity**: Foreign keys, check constraints, and validation
- **Conversational Support**: Enhanced schema supports conversational AI workflows

## Core Tables

### Documents (`documents`)

Primary content storage for uploaded documents and research materials.

```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255),
    content TEXT,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique document identifier (UUID)
- `title`: Document title or filename
- `content`: Full document text content
- `embedding`: Vector embedding of the full document (1536-dim)
- `created_at`: Document creation timestamp

**Usage Pattern:**
```python
document = {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Customer Feedback Survey Results Q4 2023", 
    "content": "Executive Summary: Our Q4 customer feedback...",
    "embedding": [0.123, -0.456, 0.789, ...],  # 1536 dimensions
    "created_at": "2024-01-15T10:30:00Z"
}
```

### Document Chunks (`document_chunks`)

Chunked portions of documents optimized for semantic search and context building.

```sql
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique chunk identifier
- `document_id`: Parent document reference
- `chunk_index`: Sequential position within document (0-based)
- `content`: Chunk text content (max ~1000 characters)
- `embedding`: Vector embedding of the chunk content
- `created_at`: Chunk creation timestamp

**Chunking Strategy:**
- Maximum 1000 characters per chunk
- Overlap between chunks for context preservation
- Maintains paragraph and sentence boundaries
- Indexed for efficient vector search

### Insights (`insights`)

Extracted insights from documents representing key findings, pain points, and opportunities.

```sql
CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique insight identifier
- `description`: Insight description or finding
- `document_id`: Source document reference
- `embedding`: Vector embedding of the insight description
- `created_at`: Insight extraction timestamp

**Example Insights:**
- "Users struggle with the complex checkout process on mobile devices"
- "Customer satisfaction drops significantly when support response time exceeds 2 hours"
- "Feature requests for dark mode appear in 60% of user feedback"

### Jobs-to-be-Done (`jtbds`)

User-defined Jobs-to-be-Done statements following the JTBD framework structure.

```sql
CREATE TABLE jtbds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    statement TEXT NOT NULL,
    context TEXT,
    outcome TEXT,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique JTBD identifier
- `statement`: Full JTBD statement following format
- `context`: Additional context about the job
- `outcome`: Expected outcome or success metric
- `embedding`: Vector embedding of the JTBD statement
- `created_at`: JTBD creation timestamp

**JTBD Statement Format:**
```
"When [situation], I want [motivation], so I can [expected outcome]"
```

**Example:**
```python
jtbd = {
    "statement": "When I'm shopping online during my lunch break, I want to complete checkout in under 2 minutes, so I can finish my purchase before returning to work",
    "context": "Mobile e-commerce optimization for time-constrained users",
    "outcome": "Reduced checkout abandonment and increased conversion rates"
}
```

### Performance Metrics (`metrics`)

Key performance indicators and metrics used for solution evaluation and prioritization.

```sql
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    current_value NUMERIC,
    target_value NUMERIC,
    unit VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique metric identifier
- `name`: Metric name or description
- `current_value`: Current measured value
- `target_value`: Desired target value
- `unit`: Unit of measurement (percentage, seconds, etc.)
- `created_at`: Metric creation timestamp

**Metric Categories:**
```python
conversion_metrics = {
    "name": "Cart Abandonment Rate",
    "current_value": 23.5,
    "target_value": 15.0,
    "unit": "percentage"
}

performance_metrics = {
    "name": "Average Page Load Time",
    "current_value": 3.2,
    "target_value": 2.0,
    "unit": "seconds"
}

satisfaction_metrics = {
    "name": "Net Promoter Score",
    "current_value": 6.8,
    "target_value": 8.5,
    "unit": "score"
}
```

### How Might We Questions (`hmws`)

Generated "How Might We" questions created from selected context (insights, JTBDs, metrics).

```sql
CREATE TABLE hmws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL CHECK (question LIKE 'How might we%'),
    priority FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique HMW identifier
- `question`: HMW question (must start with "How might we")
- `priority`: Priority score for ranking (0-100)
- `created_at`: HMW generation timestamp

**Validation Rule:**
- All HMW questions must start with "How might we"
- Database constraint enforces this format

**Example HMWs:**
- "How might we simplify the mobile checkout process to reduce abandonment?"
- "How might we provide faster support responses without increasing costs?"
- "How might we make the interface more accessible for users with visual impairments?"

### Solutions (`solutions`)

Proposed solutions addressing HMW questions with impact/effort scoring.

```sql
CREATE TABLE solutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    customer_benefit TEXT,
    user_journey TEXT,
    impact_score INT CHECK (impact_score >= 1 AND impact_score <= 10),
    effort_score INT CHECK (effort_score >= 1 AND effort_score <= 10),
    final_score FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique solution identifier
- `title`: Solution title or name
- `description`: Detailed solution description
- `customer_benefit`: Clear customer benefit statement
- `user_journey`: Description of improved user journey
- `impact_score`: Expected impact (1-10, higher = more impact)
- `effort_score`: Implementation effort (1-10, higher = more effort)
- `final_score`: Calculated priority score
- `created_at`: Solution creation timestamp

**Scoring Formula:**
```python
final_score = (impact_score * 0.6) + ((10 - effort_score) * 0.4)
# Weights: 60% impact, 40% ease of implementation
```

**Solution Example:**
```python
solution = {
    "title": "One-Click Mobile Checkout",
    "description": "Implement streamlined one-click checkout with saved payment methods",
    "customer_benefit": "Complete purchases 3x faster with single tap",
    "user_journey": "User selects item → taps 'Buy Now' → confirms with biometric → order complete",
    "impact_score": 9,  # High impact on conversion
    "effort_score": 6,  # Moderate development effort
    "final_score": 6.8  # Calculated: (9 * 0.6) + ((10-6) * 0.4)
}
```

### LLM Traces (`llm_traces`)

Audit trail of all AI/LLM interactions for debugging and monitoring.

```sql
CREATE TABLE llm_traces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_summary TEXT,
    response_summary TEXT,
    token_count INT,
    cost_estimate NUMERIC(10,6),
    latency_ms INT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique trace identifier
- `operation`: Type of LLM operation (embedding, chat_completion, intent_detection, follow_up_generation, etc.)
- `model`: AI model used (gpt-4o-mini, text-embedding-3-small)
- `prompt_summary`: Truncated prompt for debugging
- `response_summary`: Truncated response content
- `token_count`: Total tokens consumed
- `cost_estimate`: Estimated API cost
- `latency_ms`: Response time in milliseconds
- `success`: Operation success status
- `error_message`: Error details if failed
- `retry_count`: Number of retry attempts made (added for enhanced error tracking)
- `created_at`: Operation timestamp

**Enhanced Conversational AI Tracking:**
The `operation` field now includes conversational AI operations:
- `intent_detection`: User message intent classification
- `conversation_response`: Conversational AI response generation
- `follow_up_generation`: Automatic follow-up question creation
- `context_synthesis`: Search result synthesis into conversation context

## Relationship Tables

### HMW-JTBD Relationships (`hmws_jtbds`)

Many-to-many relationship between HMW questions and JTBDs.

```sql
CREATE TABLE hmws_jtbds (
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    jtbd_id UUID REFERENCES jtbds(id) ON DELETE CASCADE,
    PRIMARY KEY (hmw_id, jtbd_id)
);
```

**Usage:** Track which JTBDs influenced specific HMW questions.

### HMW-Metric Relationships (`hmws_metrics`)

Connection between HMW questions and relevant performance metrics.

```sql
CREATE TABLE hmws_metrics (
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    metric_id UUID REFERENCES metrics(id) ON DELETE CASCADE,
    PRIMARY KEY (hmw_id, metric_id)
);
```

**Usage:** Associate metrics with HMW questions for context and success measurement.

### HMW-Insight Relationships (`hmws_insights`)

Links HMW questions to the insights that informed them.

```sql
CREATE TABLE hmws_insights (
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    insight_id UUID REFERENCES insights(id) ON DELETE CASCADE,
    PRIMARY KEY (hmw_id, insight_id)
);
```

**Usage:** Maintain traceability from insights to generated questions.

### Solution-HMW Relationships (`solutions_hmws`)

Connection between solutions and the HMW questions they address.

```sql
CREATE TABLE solutions_hmws (
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    PRIMARY KEY (solution_id, hmw_id)
);
```

**Usage:** Track which HMW questions each solution addresses.

## Vector Search Functions

PostgreSQL RPC functions for efficient similarity search operations.

### Search Document Chunks

```sql
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1536),
    similarity_threshold float DEFAULT 0.7,
    result_limit int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    content text,
    similarity float,
    document_id uuid,
    chunk_index int
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.content,
        1 - (c.embedding <=> query_embedding) as similarity,
        c.document_id,
        c.chunk_index
    FROM document_chunks c
    WHERE 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

### Search Insights

```sql
CREATE OR REPLACE FUNCTION search_insights(
    query_embedding vector(1536),
    similarity_threshold float DEFAULT 0.7,
    result_limit int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    description text,
    similarity float,
    document_id uuid
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.description,
        1 - (i.embedding <=> query_embedding) as similarity,
        i.document_id
    FROM insights i
    WHERE 1 - (i.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY i.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

### Search JTBDs

```sql
CREATE OR REPLACE FUNCTION search_jtbds(
    query_embedding vector(1536),
    similarity_threshold float DEFAULT 0.7,
    result_limit int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    statement text,
    similarity float,
    context text,
    outcome text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.id,
        j.statement,
        1 - (j.embedding <=> query_embedding) as similarity,
        j.context,
        j.outcome
    FROM jtbds j
    WHERE 1 - (j.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY j.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

## Data Validation Rules

### Input Validation

**Text Length Constraints:**
```python
MIN_TEXT_LENGTH = 1
MAX_TEXT_LENGTH = 100000
MAX_TITLE_LENGTH = 500
MAX_DESCRIPTION_LENGTH = 10000

def validate_text_input(text: str, max_length: int = MAX_TEXT_LENGTH):
    if not text or len(text.strip()) < MIN_TEXT_LENGTH:
        raise ValidationError("Text cannot be empty")
    if len(text) > max_length:
        raise ValidationError(f"Text exceeds maximum length of {max_length}")
```

**Score Validation:**
```python
def validate_score(score: int, min_val: int = 1, max_val: int = 10):
    if not isinstance(score, int):
        raise ValidationError("Score must be an integer")
    if score < min_val or score > max_val:
        raise ValidationError(f"Score must be between {min_val} and {max_val}")
```

**JTBD Format Validation:**
```python
def validate_jtbd_statement(statement: str) -> bool:
    """Validate JTBD follows proper format structure."""
    required_phrases = ["when", "i want", "so i can"]
    statement_lower = statement.lower()
    return all(phrase in statement_lower for phrase in required_phrases)
```

### Embedding Validation

**Dimension Validation:**
```python
def validate_embedding(embedding: List[float]):
    if not isinstance(embedding, list):
        raise ValidationError("Embedding must be a list")
    if len(embedding) != EMBEDDING_DIMENSION:
        raise ValidationError(f"Embedding must have {EMBEDDING_DIMENSION} dimensions")
    if not all(isinstance(x, (int, float)) for x in embedding):
        raise ValidationError("Embedding must contain only numeric values")
```

## Data Access Patterns

### Document Processing Pipeline

```python
# 1. Store document
document_id = db.store_document(title, content, embedding)

# 2. Create chunks
chunks = text_processor.create_chunks(content)
for i, chunk in enumerate(chunks):
    chunk_embedding = embedding_manager.get_embedding(chunk)
    db.store_chunk(document_id, i, chunk, chunk_embedding)

# 3. Extract insights (manual or AI-powered)
insights = extract_insights(content)
for insight in insights:
    insight_embedding = embedding_manager.get_embedding(insight)
    db.store_insight(insight, document_id, insight_embedding)
```

### Search and Context Building

```python
# 1. Generate query embedding
query_embedding = embedding_manager.get_embedding(query)

# 2. Multi-type search
results = {
    "chunks": db.search_chunks(query_embedding, threshold, limit),
    "insights": db.search_insights(query_embedding, threshold, limit),
    "jtbds": db.search_jtbds(query_embedding, threshold, limit)
}

# 3. Build context for HMW generation
selected_items = context_manager.get_selected_items()
context = build_hmw_context(selected_items)
```

### Solution Scoring

```python
def calculate_solution_score(impact: int, effort: int) -> float:
    """Calculate final solution score using weighted formula."""
    return (impact * 0.6) + ((10 - effort) * 0.4)

# Store solution with calculated score
solution_data = {
    "impact_score": impact,
    "effort_score": effort,
    "final_score": calculate_solution_score(impact, effort)
}
```

## Database Indexes and Optimization

### Vector Indexes

```sql
-- Vector similarity indexes for fast search
CREATE INDEX idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_insights_embedding ON insights USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_jtbds_embedding ON jtbds USING ivfflat (embedding vector_cosine_ops);
```

### Standard Indexes

```sql
-- Foreign key indexes
CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_insights_document_id ON insights(document_id);

-- Timestamp indexes for sorting
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_solutions_final_score ON solutions(final_score DESC);

-- Search optimization
CREATE INDEX idx_solutions_impact_effort ON solutions(impact_score DESC, effort_score ASC);
```

This data model provides a solid foundation for the JTBD workflow while maintaining flexibility for future enhancements and ensuring efficient search and retrieval operations.
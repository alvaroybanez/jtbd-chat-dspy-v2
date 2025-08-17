# Database Schema Reference

Complete database schema for the JTBD Assistant Platform using Supabase PostgreSQL with pgvector extension.

## Overview

The database stores documents, extracts insights, manages user-defined metrics and JTBDs, and generates HMW questions and solutions with intelligent relationships and vector search capabilities.

## Core Tables

### documents
User-uploaded files with content and metadata.

```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash prevents duplicates
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 1048576), -- Max 1MB
    file_type TEXT NOT NULL CHECK (file_type IN ('md', 'txt')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Constraints**:
- File size limited to 1MB
- Only `.md` and `.txt` files allowed
- Content hash prevents duplicate uploads

### document_chunks
Text chunks with 1536-dimension embeddings for vector search.

```sql
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    token_count INTEGER NOT NULL CHECK (token_count > 0 AND token_count <= 1000),
    embedding vector(1536), -- OpenAI text-embedding-3-small
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(document_id, chunk_index) -- Ensures proper chunk ordering
);
```

**Features**:
- Automatic chunking with 500-1000 tokens per chunk
- 1536-dimension embeddings from OpenAI text-embedding-3-small
- Unique ordering per document

### insights
Auto-generated insights from documents with embeddings for similarity search.

```sql
CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536), -- For similarity search
    source_chunk_ids UUID[] DEFAULT '{}', -- References to document_chunks
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features**:
- Links to source chunks that generated the insight
- Confidence scoring for insight quality
- Vector embeddings for context retrieval

### metrics
User-defined KPIs with current and target values.

```sql
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    current_value DECIMAL(12,2),
    target_value DECIMAL(12,2),
    unit TEXT NOT NULL, -- e.g., 'percentage', 'dollars', 'count'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, name) -- Unique metric names per user
);
```

**Features**:
- Flexible numeric values with 2 decimal precision
- Unit tracking for proper display
- Unique names per user

### jtbds
Jobs-to-be-Done statements with embeddings for similarity search.

```sql
CREATE TABLE jtbds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    statement TEXT NOT NULL,
    context TEXT, -- Optional additional context
    embedding vector(1536), -- For similarity search
    priority INTEGER CHECK (priority >= 1 AND priority <= 5), -- 1=highest
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features**:
- Priority ranking system (1-5 scale)
- Optional context for additional details
- Vector embeddings for HMW generation context

## Generated Content Tables

### hmws
Generated "How Might We" questions with relationship tracking.

```sql
CREATE TABLE hmws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    question TEXT NOT NULL,
    score DECIMAL(4,2) CHECK (score >= 0.0 AND score <= 10.0), -- DSPy relevance score
    
    -- Relationship arrays
    jtbd_ids UUID[] DEFAULT '{}', -- Related JTBDs
    metric_ids UUID[] DEFAULT '{}', -- Related metrics
    insight_ids UUID[] DEFAULT '{}', -- Source insights
    
    generation_method TEXT DEFAULT 'dspy' CHECK (generation_method IN ('dspy', 'fallback')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure proper HMW format
    CONSTRAINT hmw_question_format CHECK (LOWER(TRIM(question)) LIKE 'how might we%')
);
```

**Features**:
- Automatic "How might we" prefix validation
- DSPy relevance scoring (0-10 scale)
- Relationship arrays to track source context
- Generation method tracking (DSPy vs fallback)

### solutions
Prioritized solutions with intelligent metric assignment and scoring.

```sql
CREATE TABLE solutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Scoring system
    impact_score INTEGER NOT NULL CHECK (impact_score >= 1 AND impact_score <= 10),
    effort_score INTEGER NOT NULL CHECK (effort_score >= 1 AND effort_score <= 10),
    final_score DECIMAL(4,2), -- Auto-calculated: impact_score / effort_score
    
    -- Relationship arrays (metric_ids is required)
    metric_ids UUID[] NOT NULL CHECK (array_length(metric_ids, 1) >= 1),
    hmw_ids UUID[] DEFAULT '{}', -- Source HMWs
    jtbd_ids UUID[] DEFAULT '{}', -- Related JTBDs
    insight_ids UUID[] DEFAULT '{}', -- Supporting insights
    
    generation_method TEXT DEFAULT 'dspy' CHECK (generation_method IN ('dspy', 'fallback')),
    status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'in_progress', 'completed', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Features**:
- Automatic final score calculation (impact/effort ratio)
- Required metric assignment (at least 1 metric)
- Solution status tracking
- Comprehensive relationship tracking

## Chat Persistence Tables

### chats
Chat sessions for conversation persistence.

```sql
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### messages
Individual chat messages with metadata and context tracking.

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    
    -- Context and processing metadata
    intent TEXT, -- Detected intent
    context_items JSONB, -- Selected context for this message
    processing_time_ms INTEGER,
    token_count INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Vector Search Functions

### search_insights
Vector similarity search for insights.

```sql
CREATE OR REPLACE FUNCTION search_insights(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    content text,
    document_id uuid,
    confidence_score decimal,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.content,
        i.document_id,
        i.confidence_score,
        (1 - (i.embedding <=> query_embedding)) as similarity
    FROM insights i
    WHERE (1 - (i.embedding <=> query_embedding)) > match_threshold
    ORDER BY i.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

Similar functions exist for:
- `search_metrics()` - Search user metrics
- `search_jtbds()` - Search Jobs-to-be-Done
- `search_documents()` - Search document chunks

## Database Constraints & Business Rules

### Data Integrity
1. **Solutions must have metrics**: `CHECK (array_length(metric_ids, 1) >= 1)`
2. **HMW format validation**: Questions must start with "How might we"
3. **File size limits**: Documents limited to 1MB
4. **Scoring ranges**: All scores use 1-10 scales with appropriate checks

### Automatic Calculations
1. **Final Score**: Auto-calculated as `impact_score / effort_score`
2. **Updated Timestamps**: Automatic `updated_at` triggers on relevant tables
3. **Metric Validation**: Ensures metric IDs exist and belong to user

### Relationship Integrity
- All relationship arrays default to `'{}'` (empty array) not `NULL`
- Foreign key constraints ensure referential integrity
- GIN indexes on arrays for efficient relationship queries

## Vector Search Performance

### Indexes
- **ivfflat indexes** on all embedding columns using cosine similarity
- **GIN indexes** on relationship arrays for efficient queries
- **Standard B-tree indexes** on frequently queried columns

### Configuration
- **Similarity threshold**: 0.7 (configurable)
- **Match limit**: 100 items max per search
- **Embedding dimensions**: 1536 (OpenAI text-embedding-3-small)

## Migration Files

1. `20240101000001_enable_extensions.sql` - pgvector extension
2. `20240101000002_create_base_tables.sql` - Core tables
3. `20240101000003_create_hmw_solution_tables.sql` - HMW and solutions
4. `20240101000004_create_vector_indexes.sql` - Vector indexes
5. `20240101000005_create_chat_tables.sql` - Chat persistence
6. `20240101000005_create_search_functions.sql` - RPC search functions
7. `20240101000006_seed_default_data.sql` - Default data
8. `20240101000007_create_helper_functions.sql` - Utility functions

---
*Schema supports the complete JTBD Assistant Platform workflow from document upload to solution generation.*
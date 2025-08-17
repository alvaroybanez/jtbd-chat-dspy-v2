-- Create RPC functions for vector similarity search
-- These functions enable the TypeScript service to perform semantic search across different content types

-- Function to search document chunks by embedding similarity
CREATE OR REPLACE FUNCTION search_document_chunks(
    query_embedding vector(1536),
    similarity_threshold decimal DEFAULT 0.7,
    max_results integer DEFAULT 100,
    target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    token_count integer,
    similarity decimal,
    created_at timestamptz,
    document_filename text
) 
LANGUAGE sql
STABLE
AS $$
    SELECT 
        dc.id,
        dc.document_id,
        dc.content,
        dc.chunk_index,
        dc.token_count,
        ROUND((1 - (dc.embedding <=> query_embedding))::decimal, 4) as similarity,
        dc.created_at,
        d.filename as document_filename
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 
        (target_user_id IS NULL OR d.user_id = target_user_id)
        AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT max_results;
$$;

-- Function to search insights by embedding similarity
CREATE OR REPLACE FUNCTION search_insights(
    query_embedding vector(1536),
    similarity_threshold decimal DEFAULT 0.7,
    max_results integer DEFAULT 100,
    target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    content text,
    similarity decimal,
    confidence_score decimal,
    source_chunk_ids uuid[],
    created_at timestamptz,
    document_filename text
) 
LANGUAGE sql
STABLE
AS $$
    SELECT 
        i.id,
        i.document_id,
        i.content,
        ROUND((1 - (i.embedding <=> query_embedding))::decimal, 4) as similarity,
        i.confidence_score,
        i.source_chunk_ids,
        i.created_at,
        d.filename as document_filename
    FROM insights i
    JOIN documents d ON i.document_id = d.id
    WHERE 
        (target_user_id IS NULL OR i.user_id = target_user_id)
        AND (1 - (i.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY i.embedding <=> query_embedding
    LIMIT max_results;
$$;

-- Function to search JTBDs by embedding similarity
CREATE OR REPLACE FUNCTION search_jtbds(
    query_embedding vector(1536),
    similarity_threshold decimal DEFAULT 0.7,
    max_results integer DEFAULT 100,
    target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    statement text,
    context text,
    similarity decimal,
    priority integer,
    created_at timestamptz
) 
LANGUAGE sql
STABLE
AS $$
    SELECT 
        j.id,
        j.statement,
        j.context,
        ROUND((1 - (j.embedding <=> query_embedding))::decimal, 4) as similarity,
        j.priority,
        j.created_at
    FROM jtbds j
    WHERE 
        (target_user_id IS NULL OR j.user_id = target_user_id)
        AND (1 - (j.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY j.embedding <=> query_embedding
    LIMIT max_results;
$$;

-- Function to search across all content types (combined search)
CREATE OR REPLACE FUNCTION search_combined_context(
    query_embedding vector(1536),
    similarity_threshold decimal DEFAULT 0.7,
    max_results integer DEFAULT 100,
    target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    content_type text,
    id uuid,
    content text,
    similarity decimal,
    metadata jsonb,
    created_at timestamptz
) 
LANGUAGE sql
STABLE
AS $$
    -- Combine results from all searchable content types
    (
        SELECT 
            'document_chunk' as content_type,
            dc.id,
            dc.content,
            ROUND((1 - (dc.embedding <=> query_embedding))::decimal, 4) as similarity,
            jsonb_build_object(
                'document_id', dc.document_id,
                'document_filename', d.filename,
                'chunk_index', dc.chunk_index,
                'token_count', dc.token_count
            ) as metadata,
            dc.created_at
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE 
            (target_user_id IS NULL OR d.user_id = target_user_id)
            AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    )
    UNION ALL
    (
        SELECT 
            'insight' as content_type,
            i.id,
            i.content,
            ROUND((1 - (i.embedding <=> query_embedding))::decimal, 4) as similarity,
            jsonb_build_object(
                'document_id', i.document_id,
                'document_filename', d.filename,
                'confidence_score', i.confidence_score,
                'source_chunk_ids', i.source_chunk_ids
            ) as metadata,
            i.created_at
        FROM insights i
        JOIN documents d ON i.document_id = d.id
        WHERE 
            (target_user_id IS NULL OR i.user_id = target_user_id)
            AND (1 - (i.embedding <=> query_embedding)) >= similarity_threshold
    )
    UNION ALL
    (
        SELECT 
            'jtbd' as content_type,
            j.id,
            j.statement as content,
            ROUND((1 - (j.embedding <=> query_embedding))::decimal, 4) as similarity,
            jsonb_build_object(
                'context', j.context,
                'priority', j.priority
            ) as metadata,
            j.created_at
        FROM jtbds j
        WHERE 
            (target_user_id IS NULL OR j.user_id = target_user_id)
            AND (1 - (j.embedding <=> query_embedding)) >= similarity_threshold
    )
    ORDER BY similarity DESC
    LIMIT max_results;
$$;

-- Function to get metrics for a user (not vector search, but commonly used with search results)
CREATE OR REPLACE FUNCTION get_user_metrics(
    target_user_id uuid,
    max_results integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    name text,
    description text,
    current_value decimal,
    target_value decimal,
    unit text,
    created_at timestamptz,
    updated_at timestamptz
) 
LANGUAGE sql
STABLE
AS $$
    SELECT 
        m.id,
        m.name,
        m.description,
        m.current_value,
        m.target_value,
        m.unit,
        m.created_at,
        m.updated_at
    FROM metrics m
    WHERE m.user_id = target_user_id
    ORDER BY m.updated_at DESC
    LIMIT max_results;
$$;

-- Function to find related content by ID arrays (for relationship lookups)
CREATE OR REPLACE FUNCTION get_related_content(
    insight_ids uuid[] DEFAULT '{}',
    metric_ids uuid[] DEFAULT '{}',
    jtbd_ids uuid[] DEFAULT '{}',
    target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    content_type text,
    id uuid,
    content text,
    metadata jsonb
) 
LANGUAGE sql
STABLE
AS $$
    -- Get insights
    (
        SELECT 
            'insight' as content_type,
            i.id,
            i.content,
            jsonb_build_object(
                'document_id', i.document_id,
                'confidence_score', i.confidence_score
            ) as metadata
        FROM insights i
        WHERE 
            i.id = ANY(insight_ids)
            AND (target_user_id IS NULL OR i.user_id = target_user_id)
    )
    UNION ALL
    -- Get metrics
    (
        SELECT 
            'metric' as content_type,
            m.id,
            m.name as content,
            jsonb_build_object(
                'description', m.description,
                'current_value', m.current_value,
                'target_value', m.target_value,
                'unit', m.unit
            ) as metadata
        FROM metrics m
        WHERE 
            m.id = ANY(metric_ids)
            AND (target_user_id IS NULL OR m.user_id = target_user_id)
    )
    UNION ALL
    -- Get JTBDs
    (
        SELECT 
            'jtbd' as content_type,
            j.id,
            j.statement as content,
            jsonb_build_object(
                'context', j.context,
                'priority', j.priority
            ) as metadata
        FROM jtbds j
        WHERE 
            j.id = ANY(jtbd_ids)
            AND (target_user_id IS NULL OR j.user_id = target_user_id)
    );
$$;

-- Add comments for documentation
COMMENT ON FUNCTION search_document_chunks IS 'Search document chunks using cosine similarity with configurable threshold';
COMMENT ON FUNCTION search_insights IS 'Search insights using cosine similarity with confidence scores';
COMMENT ON FUNCTION search_jtbds IS 'Search Jobs-to-be-Done using cosine similarity with priority';
COMMENT ON FUNCTION search_combined_context IS 'Search across all content types and return unified results';
COMMENT ON FUNCTION get_user_metrics IS 'Retrieve all metrics for a user, commonly used with search results';
COMMENT ON FUNCTION get_related_content IS 'Lookup content by ID arrays for relationship exploration';
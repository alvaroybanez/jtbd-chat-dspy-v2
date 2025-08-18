-- Initial schema for JTBD Assistant Platform
-- Single-user simplified version without org_id/session complexity

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255),
    content TEXT,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Document chunks for vector search
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Extracted insights from documents
CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- User-defined Jobs-to-be-Done
CREATE TABLE jtbds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    statement TEXT NOT NULL,
    context TEXT,
    outcome TEXT,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance metrics
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    current_value NUMERIC,
    target_value NUMERIC,
    unit VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Generated How Might We questions
CREATE TABLE hmws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL CHECK (question LIKE 'How might we%'),
    priority FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Generated solutions
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

-- Relationship tables for many-to-many connections
CREATE TABLE hmws_jtbds (
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    jtbd_id UUID REFERENCES jtbds(id) ON DELETE CASCADE,
    PRIMARY KEY (hmw_id, jtbd_id)
);

CREATE TABLE hmws_metrics (
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    metric_id UUID REFERENCES metrics(id) ON DELETE CASCADE,
    PRIMARY KEY (hmw_id, metric_id)
);

CREATE TABLE hmws_insights (
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    insight_id UUID REFERENCES insights(id) ON DELETE CASCADE,
    PRIMARY KEY (hmw_id, insight_id)
);

CREATE TABLE solutions_hmws (
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    hmw_id UUID REFERENCES hmws(id) ON DELETE CASCADE,
    PRIMARY KEY (solution_id, hmw_id)
);

CREATE TABLE solutions_metrics (
    solution_id UUID REFERENCES solutions(id) ON DELETE CASCADE,
    metric_id UUID REFERENCES metrics(id) ON DELETE CASCADE,
    PRIMARY KEY (solution_id, metric_id)
);

-- LLM traces for observability
CREATE TABLE llm_traces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key TEXT,
    model TEXT,
    prompt TEXT,
    response TEXT,
    tokens_used INT,
    latency_ms INT,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Vector indexes for performance
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON insights USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON jtbds USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Additional indexes for common queries
CREATE INDEX ON document_chunks(document_id);
CREATE INDEX ON insights(document_id);
CREATE INDEX ON solutions(final_score DESC);
CREATE INDEX ON llm_traces(template_key, created_at);

-- Simple vector search function
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1536),
    match_count INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.document_id,
        dc.content,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE 
        dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function to search insights
CREATE OR REPLACE FUNCTION search_insights(
    query_embedding vector(1536),
    match_count INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (
    id UUID,
    description TEXT,
    document_id UUID,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.description,
        i.document_id,
        1 - (i.embedding <=> query_embedding) AS similarity
    FROM insights i
    WHERE 
        i.embedding IS NOT NULL
        AND 1 - (i.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY i.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function to search JTBDs
CREATE OR REPLACE FUNCTION search_jtbds(
    query_embedding vector(1536),
    match_count INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (
    id UUID,
    statement TEXT,
    context TEXT,
    outcome TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.id,
        j.statement,
        j.context,
        j.outcome,
        1 - (j.embedding <=> query_embedding) AS similarity
    FROM jtbds j
    WHERE 
        j.embedding IS NOT NULL
        AND 1 - (j.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY j.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
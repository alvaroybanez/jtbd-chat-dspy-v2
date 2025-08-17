-- Create base tables for JTBD Assistant Platform
-- Includes documents, chunks, insights, metrics, and JTBDs

-- Create documents table for uploaded files
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- References auth.users if using Supabase Auth
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash to prevent duplicate uploads
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 1048576), -- Max 1MB
    file_type TEXT NOT NULL CHECK (file_type IN ('md', 'txt')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create document_chunks table for text chunks with embeddings
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    token_count INTEGER NOT NULL CHECK (token_count > 0 AND token_count <= 1000),
    embedding vector(1536), -- OpenAI text-embedding-3-small dimensions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique chunk ordering per document
    UNIQUE(document_id, chunk_index)
);

-- Create insights table for auto-extracted insights
CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Same as document.user_id
    content TEXT NOT NULL,
    embedding vector(1536), -- For similarity search
    source_chunk_ids UUID[] DEFAULT '{}', -- References to document_chunks
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create metrics table for user-defined KPIs
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
    
    -- Ensure unique metric names per user
    UNIQUE(user_id, name)
);

-- Create jtbds table for Jobs-to-be-Done statements
CREATE TABLE jtbds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    statement TEXT NOT NULL,
    context TEXT, -- Optional additional context
    embedding vector(1536), -- For similarity search
    priority INTEGER CHECK (priority >= 1 AND priority <= 5), -- 1=highest, 5=lowest
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_metrics_updated_at 
    BEFORE UPDATE ON metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jtbds_updated_at 
    BEFORE UPDATE ON jtbds 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE documents IS 'User-uploaded files with content and metadata';
COMMENT ON TABLE document_chunks IS 'Text chunks with 1536-dimension embeddings for vector search';
COMMENT ON TABLE insights IS 'Auto-generated insights from documents with embeddings';
COMMENT ON TABLE metrics IS 'User-created metrics (name, current/target values, unit)';
COMMENT ON TABLE jtbds IS 'User-created Jobs-to-be-Done with embeddings';

COMMENT ON COLUMN documents.content_hash IS 'SHA-256 hash to prevent duplicate uploads';
COMMENT ON COLUMN document_chunks.embedding IS 'OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON COLUMN insights.embedding IS 'Used for similarity search and context retrieval';
COMMENT ON COLUMN jtbds.embedding IS 'Used for similarity search and HMW generation context';
-- Create optimized indexes for JTBD Assistant Platform
-- Includes vector indexes for similarity search and B-tree indexes for performance

-- Vector indexes using IVFFlat for optimal similarity search performance
-- IVFFlat with 100 lists provides good balance of performance and accuracy for our scale

-- Index for document chunks similarity search
CREATE INDEX idx_document_chunks_embedding 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Index for insights similarity search  
CREATE INDEX idx_insights_embedding 
ON insights 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Index for JTBDs similarity search
CREATE INDEX idx_jtbds_embedding 
ON jtbds 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- B-tree indexes for frequently queried columns and performance optimization

-- Documents table indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_file_type ON documents(file_type);
CREATE INDEX idx_documents_content_hash ON documents(content_hash); -- Already unique, but explicit index

-- Document chunks table indexes
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_created_at ON document_chunks(created_at DESC);
CREATE INDEX idx_document_chunks_token_count ON document_chunks(token_count);

-- Composite index for chunk ordering queries
CREATE INDEX idx_document_chunks_doc_chunk_idx ON document_chunks(document_id, chunk_index);

-- Insights table indexes
CREATE INDEX idx_insights_user_id ON insights(user_id);
CREATE INDEX idx_insights_document_id ON insights(document_id);
CREATE INDEX idx_insights_created_at ON insights(created_at DESC);
CREATE INDEX idx_insights_confidence_score ON insights(confidence_score DESC);

-- GIN index for source_chunk_ids array searches
CREATE INDEX idx_insights_source_chunk_ids ON insights USING GIN(source_chunk_ids);

-- Metrics table indexes
CREATE INDEX idx_metrics_user_id ON metrics(user_id);
CREATE INDEX idx_metrics_created_at ON metrics(created_at DESC);
CREATE INDEX idx_metrics_updated_at ON metrics(updated_at DESC);

-- Composite index for unique constraint optimization
CREATE INDEX idx_metrics_user_name ON metrics(user_id, name);

-- JTBDs table indexes  
CREATE INDEX idx_jtbds_user_id ON jtbds(user_id);
CREATE INDEX idx_jtbds_created_at ON jtbds(created_at DESC);
CREATE INDEX idx_jtbds_priority ON jtbds(priority);
CREATE INDEX idx_jtbds_updated_at ON jtbds(updated_at DESC);

-- Text search indexes using pg_trgm for fuzzy matching
CREATE INDEX idx_documents_filename_trgm ON documents USING GIN(filename gin_trgm_ops);
CREATE INDEX idx_documents_content_trgm ON documents USING GIN(content gin_trgm_ops);
CREATE INDEX idx_metrics_name_trgm ON metrics USING GIN(name gin_trgm_ops);
CREATE INDEX idx_jtbds_statement_trgm ON jtbds USING GIN(statement gin_trgm_ops);

-- Partial indexes for active/recent records to improve query performance
CREATE INDEX idx_documents_recent 
ON documents(created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';

CREATE INDEX idx_insights_recent 
ON insights(created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';

CREATE INDEX idx_hmws_recent 
ON hmws(created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';

CREATE INDEX idx_solutions_active 
ON solutions(final_score DESC) 
WHERE status IN ('proposed', 'approved', 'in_progress');

-- Functional indexes for computed values
CREATE INDEX idx_solutions_score_ratio 
ON solutions((impact_score::DECIMAL / effort_score::DECIMAL) DESC);

-- Multi-column indexes for common query patterns
CREATE INDEX idx_documents_user_type_date ON documents(user_id, file_type, created_at DESC);
CREATE INDEX idx_insights_user_doc_date ON insights(user_id, document_id, created_at DESC);
CREATE INDEX idx_hmws_user_score ON hmws(user_id, score DESC);
CREATE INDEX idx_solutions_user_score_status ON solutions(user_id, final_score DESC, status);

-- Analyze tables to update statistics for query planner
ANALYZE documents;
ANALYZE document_chunks;
ANALYZE insights;
ANALYZE metrics;
ANALYZE jtbds;
ANALYZE hmws;
ANALYZE solutions;

-- Add comments explaining index choices
COMMENT ON INDEX idx_document_chunks_embedding IS 'IVFFlat index for cosine similarity search of document chunks';
COMMENT ON INDEX idx_insights_embedding IS 'IVFFlat index for cosine similarity search of insights';
COMMENT ON INDEX idx_jtbds_embedding IS 'IVFFlat index for cosine similarity search of JTBDs';

COMMENT ON INDEX idx_documents_content_trgm IS 'Trigram index for fuzzy text search in document content';
COMMENT ON INDEX idx_solutions_active IS 'Partial index for active solutions to improve dashboard queries';
COMMENT ON INDEX idx_solutions_score_ratio IS 'Functional index for impact/effort ratio calculations';
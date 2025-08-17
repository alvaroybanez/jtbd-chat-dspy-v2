-- Enable required PostgreSQL extensions for JTBD Assistant Platform
-- This migration enables pgvector for embeddings, uuid-ossp for UUIDs, and pg_trgm for text search

-- Enable pgvector extension for vector similarity search
-- This allows us to store and search 1536-dimensional embeddings from OpenAI
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation functions
-- Used for generating unique identifiers for all our entities
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable trigram similarity extension for improved text search
-- Helps with fuzzy text matching and search optimization
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extensions are enabled
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension failed to install';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        RAISE EXCEPTION 'uuid-ossp extension failed to install';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        RAISE EXCEPTION 'pg_trgm extension failed to install';
    END IF;
    
    RAISE NOTICE 'All required extensions enabled successfully';
END $$;
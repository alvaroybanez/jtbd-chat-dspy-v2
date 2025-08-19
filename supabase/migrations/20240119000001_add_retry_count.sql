-- Add retry_count column to llm_traces table
-- Required for LLM wrapper trace logging functionality

ALTER TABLE llm_traces ADD COLUMN retry_count INTEGER DEFAULT 0;
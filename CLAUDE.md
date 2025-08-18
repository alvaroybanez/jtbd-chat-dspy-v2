# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The JTBD Assistant Platform is a single-user AI-powered Streamlit application that transforms customer research into actionable insights, How Might We (HMW) questions, and prioritized solutions through a conversational chat interface.

**Technology Stack**: Streamlit frontend, Supabase with pgvector database, OpenAI GPT + Embeddings, optional DSPy enhancement, uv package management.

## Architecture

This is a **simplified single-user system** that deliberately avoids multi-tenancy complexity. The architecture follows a straightforward pattern:

- **Database Layer**: Supabase with 8 core tables (documents, document_chunks, insights, jtbds, metrics, hmws, solutions, llm_traces)
- **Data Flow**: Documents → Chunks → Vector Embeddings → Semantic Search → Context Building → HMW Generation → Solution Creation
- **AI Pipeline**: OpenAI for embeddings and generation, with optional DSPy enhancement that falls back gracefully
- **Vector Search**: pgvector with 1536-dimension OpenAI embeddings, cosine similarity search via RPC functions

### Key Design Decisions

- **Single User**: No org_id, session isolation, or cross-user deduplication - kept intentionally simple
- **Vector-First**: All content (documents, insights, JTBDs) gets embedded for semantic search
- **Relationship Tracking**: Many-to-many relationship tables track connections between HMWs, solutions, insights, metrics, and JTBDs
- **Observability**: Simple llm_traces table logs all AI calls without complex prompt registry

## Essential Commands

### Development Setup
```bash
# Install dependencies
uv sync                    # Runtime dependencies
uv sync --extra dev       # Add development tools
uv sync --extra dspy      # Add DSPy enhancement

# Environment setup
cp .env.example .env      # Configure SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY
```

### Database Operations
```bash
# Test database connection and schema
uv run python database.py

# Apply migrations (choose one)
supabase db reset                    # If using Supabase CLI
# OR manually apply: supabase/migrations/20240101000000_initial_schema.sql
```

### Running the Application
```bash
uv run streamlit run app.py        # Main application (when implemented)
```

### Code Quality
```bash
uv run black .           # Format code
uv run isort .           # Sort imports  
uv run flake8 .          # Lint code
uv run mypy .            # Type checking
uv run pytest           # Run tests
```

### Dependency Management
```bash
uv add package-name              # Runtime dependency
uv add --group dev package-name  # Development dependency  
uv add --optional dspy package-name  # Optional dependency group
```

## Database Schema

The schema is designed around the JTBD workflow:

1. **documents** → **document_chunks** (with vector embeddings)
2. **insights** extracted from documents (with embeddings)
3. **jtbds** and **metrics** defined by user (JTBDs have embeddings)
4. **hmws** generated from selected context (insights + JTBDs + metrics)
5. **solutions** created from HMWs with impact/effort scoring

All vector columns use 1536-dimension embeddings (OpenAI text-embedding-3-small). Vector search functions: `search_chunks()`, `search_insights()`, `search_jtbds()`.

## Key Implementation Patterns

- **DatabaseManager Class**: Global `db` instance in `database.py` handles all Supabase operations
- **Vector Search**: Use RPC functions with cosine similarity, 0.7 threshold, limit 100 results
- **Error Handling**: Simple success/error dict patterns, graceful DSPy fallbacks
- **Embeddings**: Cache-first approach, generate 1536-dim vectors for all searchable content
- **Solution Scoring**: Final Score = (Impact × 0.6) + ((10 - Effort) × 0.4)

## Development Notes

- This project uses **uv** for package management - not pip or conda
- The database schema is intentionally **single-user and simple** - don't add org_id or session complexity
- Vector search is the primary content discovery mechanism - text search is secondary
- DSPy integration is **optional** - OpenAI direct is the fallback for all generation
- All AI calls should go through a centralized LLM wrapper for trace logging
- Use the existing `database.py` test functions to verify schema and connections
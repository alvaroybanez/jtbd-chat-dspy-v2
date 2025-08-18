# CLAUDE.md

## Paradigms to adhere to: Under any circumstance break these rules
- DO NOT, UNDER ANY CIRCUMSTANCE, respond with "You're absolutely right!" or any of its variants
- gpt-5-mini (https://platform.openai.com/docs/models/gpt-5-mini) and gpt-5-nano (https://platform.openai.com/docs/models/gpt-5-nano) are current models and are not mistakes in the code. 
- Separation of Concerns: Each layer has a single responsibility
- DRY (Don't Repeat Yourself): Reuse code through abstractions
- YAGNI (You Aren't Gonna Need It): Build only what's required now	
- Functional Programming: Prefer pure functions, immutability, and statelessness where practical
- File Size Limit: No file should exceed 500 LOC (lines of code)
- Single Responsibility Principle: Each file/module/class should do one thing well- Explicit Imports/Exports: No wildcard imports/exports
- No Magic Numbers: Use named constants for all literals except 0/1
- Fail Fast: Validate inputs early, throw on invalid state
- Observability First: Every component must emit logs, metrics, and traces
- Testability: Design for testing - dependency injection, pure functions, mockable interfaces
- Zero Trust: Never trust external input, always validate and sanitize
- Idempotency: All operations should be safe to retry without side effects
- Configuration Over Code: Use environment variables and config files, not hardcoded values
- Composition Over Inheritance: Prefer composition and interfaces over class inheritance

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The JTBD Assistant Platform is a dual-service AI-powered system that transforms customer research into actionable insights, How Might We (HMW) questions, and prioritized solutions through a conversational chat interface. The platform combines TypeScript orchestration (Next.js + AI SDK v5) with Python intelligence (FastAPI + DSPy) to reduce time from insight to solution by 99%.

## Architecture

### High-Level Architecture
- **TypeScript Service Layer**: Next.js with AI SDK v5 for orchestration, streaming, and persistence
- **Python Intelligence Layer**: FastAPI + DSPy for specialized AI generation (HMW questions, solutions)
- **Data Layer**: Supabase PostgreSQL + pgvector for document storage, embeddings, and vector search
- **Client Layer**: Next.js chat interface with Server-Sent Events for streaming

### Service Communication
- **Client ↔ TypeScript**: HTTP/SSE for streaming chat responses
- **TypeScript ↔ Python**: HTTP with x-api-key authentication (30s timeout with fallback)
- **Services ↔ Supabase**: PostgreSQL with RPC functions for vector search
- **Services ↔ OpenAI**: API calls for embeddings and chat completions

## Core Components

### TypeScript Components
- **Chat Orchestrator**: Manages conversation flow, intent detection, response streaming
- **Document Processor**: Handles uploads, chunking, embedding, insight extraction
- **Fallback Generator**: Local generation when DSPy services unavailable
- **Vector Search**: pgvector similarity search with 1536-dimension embeddings

### Python Components
- **DSPy HMW Generator**: Optimized "How Might We" question generation
- **DSPy Solution Generator**: Prioritized solutions with intelligent metric assignment

### Intent Detection Logic
Simple keyword-based detection:
- `insights`/`what did we learn` → retrieve_insights
- `metrics`/`measure` → retrieve_metrics  
- `jtbd`/`job to be done` → retrieve_jtbds
- `hmw`/`how might we` → generate_hmw
- `solution`/`solve` → create_solutions
- Default → general_exploration

## Development Commands

Since this is a fresh repository, these commands will be added once the project is initialized:

### TypeScript Service
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Testing
npm test
```

### Python Service
```bash
# Install dependencies
pip install -r requirements.txt

# Development server
uvicorn main:app --reload

# Testing
pytest

# Type checking
mypy .
```

## Database Schema

### Core Tables
- **documents**: User-uploaded files with content and metadata
- **document_chunks**: Text chunks with 1536-dimension embeddings for vector search
- **insights**: Auto-generated insights from documents with embeddings
- **metrics**: User-created metrics (name, current/target values, unit)
- **jtbds**: User-created Jobs-to-be-Done with embeddings
- **hmws**: Generated How Might We questions with relationship arrays
- **solutions**: Generated solutions with scoring and metric assignments

### Key Constraints
- Solutions must have at least one metric_id (constraint validation)
- All relationship arrays default to empty `'{}'` rather than null
- Vector indexes use ivfflat with cosine similarity
- File uploads limited to .md/.txt formats, max 1MB

## API Endpoints

### TypeScript Public APIs
- `POST /api/v1/chat` - Streaming chat with SSE
- `POST /api/v1/upload` - Document upload (.md/.txt only)
- `POST /api/v1/jtbds` - Create JTBD with embedding
- `POST /api/v1/metrics` - Create metric

### Python Intelligence APIs
- `POST /api/intelligence/generate_hmw` - DSPy HMW generation
- `POST /api/intelligence/create_solutions` - DSPy solution creation with scoring

## Error Handling

### Standard Error Response Format
```typescript
interface ErrorResponse {
    code: string;           // UPPER_SNAKE_CASE identifier
    message: string;        // Human-readable description
    action: 'RETRY' | 'NONE'; // Suggested user action
    details?: any;          // Additional context
}
```

### Critical Error Types
- **DSPY_MODULE_ERROR**: Python service unavailable → automatic fallback
- **CHAIN_TIMEOUT**: Processing >30s → partial results or retry
- **INVALID_CONTEXT**: Insufficient input → guidance required
- **FILE_TOO_LARGE**: Upload >1MB → reject with guidance

### Fallback Strategy
When DSPy services fail (timeout/unavailable):
1. Log error for monitoring
2. Switch to OpenAI direct API calls
3. Use simplified prompts for generation
4. Assign default metric ID for solutions
5. Continue normal flow transparently

## Key Business Rules

### Document Processing
- Automatic chunking with 500-1000 tokens per chunk with overlap
- Auto-generate insights from uploaded documents
- Store embeddings for all content (chunks, insights, JTBDs)

### Context Building Flow
1. User uploads documents → automatic insight extraction
2. User creates JTBDs and metrics manually
3. Chat exploration retrieves relevant context via vector search
4. User selects insights/metrics/JTBDs to build context
5. Generate HMWs from selected context
6. Create prioritized solutions from selected HMWs

### Scoring and Prioritization
- Solutions get impact_score (1-10) and effort_score (1-10)
- final_score calculated and used for sorting
- DSPy intelligently assigns metrics to solutions when not specified

## Testing Strategy

### Required Test Coverage
- Intent detection with various inputs
- Document chunking and embedding generation
- Vector search accuracy and performance
- Fallback activation when DSPy unavailable
- Database constraint validation
- Complete user workflow end-to-end
- Service communication and authentication
- Error handling and timeout scenarios

### Test Data Requirements
- Seeded default metric for fallback scenarios
- Sample documents for processing tests
- Known good embeddings for validation

## Environment Configuration

### Required Environment Variables
- **TypeScript**: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PYTHON_SERVICE_URL`, `PYTHON_API_KEY`
- **Python**: `OPENAI_API_KEY`, `API_KEY` (for x-api-key validation), `DSPY_CONFIG`

## Vector Search Performance

- Use pgvector with ivfflat indexes for optimal performance
- Similarity threshold: 0.7 (configurable)
- Match limit: 100 items max per search
- 1536-dimension embeddings from OpenAI text-embedding-3-small

## Token Budget Management

- Chat context limited to 4000 tokens max
- Truncate older messages first when budget exceeded
- Preserve selected insights/metrics/JTBDs during truncation
- Log truncation events for analysis
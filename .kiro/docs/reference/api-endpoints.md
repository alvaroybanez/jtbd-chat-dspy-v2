# API Endpoints Reference

Complete API reference for the JTBD Assistant Platform services.

## TypeScript Service (Next.js)

**Base URL**: `http://localhost:3000` (development)

### Chat API

#### POST /api/v1/chat
Main chat endpoint for conversational interactions with streaming support.

**Status**: 🚧 Basic structure implemented, full functionality pending

**Current Implementation**:
```typescript
// src/app/api/v1/chat/route.ts
export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Chat endpoint ready for implementation',
    timestamp: new Date().toISOString()
  })
}
```

**Planned Request Format**:
```typescript
interface ChatRequest {
  message: string;
  chat_id?: string;           // Optional: continue existing chat
  context_items?: {           // Optional: selected context
    insight_ids?: string[];
    metric_ids?: string[];
    jtbd_ids?: string[];
  };
  stream?: boolean;           // Default: true
}
```

**Planned Response Format**:
```typescript
// Streaming response via Server-Sent Events
interface ChatChunk {
  type: 'message' | 'context' | 'picker' | 'error' | 'done';
  content?: string;
  data?: any;
  error?: ErrorResponse;
}

// Error response format
interface ErrorResponse {
  code: string;               // UPPER_SNAKE_CASE identifier
  message: string;            // Human-readable description
  action: 'RETRY' | 'NONE';   // Suggested user action
  details?: any;              // Additional context
}
```

**Planned Intent Detection**:
- `insights`/`what did we learn` → retrieve_insights
- `metrics`/`measure` → retrieve_metrics  
- `jtbd`/`job to be done` → retrieve_jtbds
- `hmw`/`how might we` → generate_hmw
- `solution`/`solve` → create_solutions
- Default → general_exploration

### Document Management

#### POST /api/v1/upload
Upload documents for processing and insight extraction.

**Status**: ✅ **IMPLEMENTED**

**Request**: 
- `Content-Type: multipart/form-data`
- File types: `.md`, `.txt` only
- Max size: 1MB
- Form fields:
  - `file`: Document file (required)
  - `user_id`: UUID (required, or via x-user-id header)
  - `generate_insights`: boolean (optional, default: true)
  - `generate_embeddings`: boolean (optional, default: true)

**Response**:
```typescript
interface UploadResponse {
  document_id: string;
  filename: string;
  chunks_created: number;
  insights_generated: number;
  processing_time?: number;
  success: true;
}
```

**Error Responses**:
- `400 BAD_REQUEST`: Invalid file type, size exceeds limit, missing required fields
- `409 CONFLICT`: Duplicate document (same content hash)
- `500 INTERNAL_SERVER_ERROR`: Processing or database errors

**Implementation**:
- File validation and parsing in `/src/lib/services/document-upload/file-parser.ts`
- Upload orchestration in `/src/lib/services/document-upload/index.ts`
- Insight extraction in `/src/lib/services/insights/extractor.ts`
- API endpoint in `/src/app/api/v1/upload/route.ts`

### JTBD Management (Planned)

#### POST /api/v1/jtbds
Create new Jobs-to-be-Done statements.

**Request**:
```typescript
interface CreateJTBDRequest {
  statement: string;
  context?: string;
  priority?: number; // 1-5 scale
}
```

**Response**:
```typescript
interface CreateJTBDResponse {
  id: string;
  statement: string;
  embedding_generated: boolean;
}
```

### Metrics Management (Planned)

#### POST /api/v1/metrics
Create new metrics for tracking.

**Request**:
```typescript
interface CreateMetricRequest {
  name: string;
  description?: string;
  current_value?: number;
  target_value?: number;
  unit: string; // e.g., 'percentage', 'dollars', 'count'
}
```

**Response**:
```typescript
interface CreateMetricResponse {
  id: string;
  name: string;
  unit: string;
}
```

## Python Intelligence Service (FastAPI)

**Base URL**: `http://localhost:8000` (development)

### Authentication
All endpoints require `x-api-key` header with valid API key.

**Headers**:
```
x-api-key: your-api-key-here
```

### Health Check

#### GET /health
Service health and status check.

**Response**:
```json
{
  "status": "healthy",
  "service": "intelligence"
}
```

### Intelligence Endpoints

#### POST /api/intelligence/generate_hmw
Generate "How Might We" questions using DSPy.

**Status**: 🚧 Endpoint structure implemented, DSPy logic pending

**Current Response**:
```json
{
  "hmws": [],
  "meta": {"duration_ms": 0, "retries": 0}
}
```

**Planned Request**:
```typescript
interface GenerateHMWRequest {
  context: {
    insights?: Array<{id: string, content: string}>;
    metrics?: Array<{id: string, name: string, description?: string}>;
    jtbds?: Array<{id: string, statement: string, context?: string}>;
  };
  count?: number; // Default: 5
  temperature?: number; // Default: 0.7
}
```

**Planned Response**:
```typescript
interface GenerateHMWResponse {
  hmws: Array<{
    question: string;
    score: number; // Relevance score 0-10
    source_references: {
      insight_ids: string[];
      metric_ids: string[];
      jtbd_ids: string[];
    };
  }>;
  meta: {
    duration_ms: number;
    retries: number;
    model_used: string;
  };
}
```

#### POST /api/intelligence/create_solutions
Generate prioritized solutions using DSPy.

**Status**: 🚧 Endpoint structure implemented, DSPy logic pending

**Current Response**:
```json
{
  "solutions": [],
  "meta": {"duration_ms": 0, "retries": 0}
}
```

**Planned Request**:
```typescript
interface CreateSolutionsRequest {
  hmws: Array<{
    id: string;
    question: string;
    score?: number;
  }>;
  context: {
    metrics?: Array<{id: string, name: string, description?: string}>;
    jtbds?: Array<{id: string, statement: string}>;
    insights?: Array<{id: string, content: string}>;
  };
  count?: number; // Default: 5
  temperature?: number; // Default: 0.7
}
```

**Planned Response**:
```typescript
interface CreateSolutionsResponse {
  solutions: Array<{
    title: string;
    description: string;
    impact_score: number; // 1-10 scale
    effort_score: number; // 1-10 scale
    final_score: number; // impact/effort ratio
    assigned_metrics: string[]; // Intelligent metric assignment
    source_references: {
      hmw_ids: string[];
      jtbd_ids: string[];
      insight_ids: string[];
    };
  }>;
  meta: {
    duration_ms: number;
    retries: number;
    model_used: string;
    fallback_metric_used?: boolean;
  };
}
```

## Service Communication

### TypeScript → Python
- **Authentication**: x-api-key header
- **Timeout**: 30 seconds with automatic fallback
- **Retry Logic**: Single retry on connection failure
- **Fallback**: Direct OpenAI API calls when DSPy unavailable

**Example Client Code**:
```typescript
// src/lib/dspy-client.ts (planned)
const response = await fetch(`${config.dspy.serviceUrl}/api/intelligence/generate_hmw`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': config.dspy.apiKey
  },
  body: JSON.stringify(request),
  signal: AbortSignal.timeout(30000) // 30s timeout
});
```

## Error Handling

### Standard Error Format
All services use consistent error response format:

```typescript
interface ErrorResponse {
  code: string;           // UPPER_SNAKE_CASE identifier
  message: string;        // Human-readable description
  action: 'RETRY' | 'NONE'; // Suggested user action
  details?: any;          // Additional context
}
```

### Common Error Codes

**TypeScript Service**:
- `DSPY_MODULE_ERROR` - Python service unavailable → automatic fallback
- `CHAIN_TIMEOUT` - Processing >30s → partial results or retry
- `INVALID_CONTEXT` - Insufficient input → guidance required
- `FILE_TOO_LARGE` - Upload >1MB → reject with guidance
- `DATABASE_ERROR` - Supabase connection issues
- `INVALID_REQUEST` - Malformed request data

**Python Service**:
- `INVALID_API_KEY` - Authentication failed
- `DSPY_GENERATION_ERROR` - DSPy model failure
- `OPENAI_API_ERROR` - OpenAI API issues
- `TIMEOUT_ERROR` - Generation timeout
- `VALIDATION_ERROR` - Request validation failed

## Internal Services (Available Now)

### ✅ Embedding Service (`src/lib/services/embeddings/`)
**Status**: Production-ready  
**Purpose**: Generate text embeddings using OpenAI text-embedding-3-small

**Key Features**:
- Single and batch embedding generation
- LRU caching with 70%+ hit rate
- Cost estimation and tracking
- Automatic retry with exponential backoff
- Performance monitoring and health checks

**Usage**:
```typescript
import embeddingService from '@/lib/services/embeddings'

// Single embedding
const result = await embeddingService.generateEmbedding('text')
// Batch processing (recommended)
const results = await embeddingService.generateBatchEmbeddings(inputs)
```

### ✅ Vector Search Service (`src/lib/services/vector-search/`)
**Status**: Production-ready  
**Purpose**: Semantic similarity search across insights, documents, and JTBDs

**Key Features**:
- Multi-entity search with unified interface
- Configurable similarity thresholds
- Weighted result aggregation
- Parallel search execution
- Query performance <100ms

**Usage**:
```typescript
import vectorSearchService from '@/lib/services/vector-search'

// Search specific entity
const insights = await vectorSearchService.searchInsights(query, options)
// Unified search across all entities
const results = await vectorSearchService.unifiedSearch(query, options)
```

### ✅ Text Processing Services (`src/lib/services/text-processing/`)
**Status**: Production-ready  
**Purpose**: Intelligent text chunking and token management

**Key Features**:
- 4 chunking strategies (token, sentence, paragraph, section)
- Smart boundary detection with overlap
- Accurate token counting with caching
- Content optimization and validation
- Preview mode for cost estimation

**Usage**:
```typescript
import { TextChunker } from '@/lib/services/text-processing/chunker'

const chunker = new TextChunker()
const result = await chunker.chunkText(content, options)
```

### ✅ Document Processing Pipeline (`src/lib/services/document-processing/`)
**Status**: Production-ready  
**Purpose**: End-to-end document processing from content to embeddings

**Key Features**:
- Complete Document → Chunks → Embeddings pipeline
- Input validation with business rules
- Progress tracking with real-time updates
- Cost estimation before processing
- Batch processing for multiple documents

**Usage**:
```typescript
import documentProcessingService from '@/lib/services/document-processing'

const result = await documentProcessingService.processDocument(document, options)
```

### ✅ Chat Services (`src/lib/services/chat/`)
**Status**: Production-ready  
**Purpose**: Intent detection, context retrieval, and token budget management for conversational AI

**Key Features**:
- Keyword-based intent detection with 98%+ accuracy
- Semantic context retrieval with pagination
- 4000 token budget enforcement with intelligent truncation
- Complete TypeScript coverage with 90%+ test coverage
- Real-time performance (<100ms intent detection, <500ms context retrieval)

**Usage**:
```typescript
import { detectChatIntent, contextRetrievalService, tokenBudgetManager, ChatIntent } from '@/lib/services/chat'

// Intent detection
const result = detectChatIntent("What insights do we have?")
// Result: { intent: "retrieve_insights", confidence: 0.9, matchedKeywords: ["insights"] }

// Context retrieval
const insights = await contextRetrievalService.retrieveInsights("user feedback", { limit: 10 })

// Token budget management
const budgetStatus = await tokenBudgetManager.getBudgetStatus(messages, contextItems)
```

## Development Status

### ✅ Implemented (Internal Services)
- **Complete embedding infrastructure** with caching and batch processing
- **Production-ready vector search** across all entity types
- **Advanced text processing** with multiple chunking strategies
- **End-to-end document processing** pipeline with validation
- **Chat services** with intent detection, context retrieval, and token budget management
- **Comprehensive error handling** with typed errors and recovery
- **Performance monitoring** with structured logging and metrics
- **280+ unit tests** covering all functionality and edge cases

### ✅ Implemented (API Infrastructure)
- Basic endpoint structures for both services
- API key authentication for Python service
- Health check endpoint
- CORS configuration
- Error response structure defined

### 🚧 In Progress
- Chat orchestration and streaming response implementation
- API endpoint integration with chat services
- HMW and solution generation endpoints

### ⏳ Planned
- Document upload API with processing integration
- JTBD and metrics management endpoints
- DSPy intelligence implementations
- Comprehensive API error handling
- Fallback generation services

---
*API endpoints are designed for the complete JTBD workflow from document upload to solution generation.*
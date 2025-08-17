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

### Document Management (Planned)

#### POST /api/v1/upload
Upload documents for processing and insight extraction.

**Request**: 
- `Content-Type: multipart/form-data`
- File types: `.md`, `.txt` only
- Max size: 1MB

**Response**:
```typescript
interface UploadResponse {
  document_id: string;
  filename: string;
  chunks_created: number;
  insights_generated: number;
}
```

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

## Development Status

### ✅ Implemented
- Basic endpoint structures for both services
- API key authentication for Python service
- Health check endpoint
- CORS configuration
- Error response structure defined

### 🚧 In Progress
- Chat orchestration and intent detection
- Streaming response implementation
- Vector search integration

### ⏳ Planned
- Document upload and processing
- JTBD and metrics management
- DSPy intelligence implementations
- Comprehensive error handling
- Fallback generation services

---
*API endpoints are designed for the complete JTBD workflow from document upload to solution generation.*
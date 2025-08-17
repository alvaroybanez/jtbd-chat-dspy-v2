# Services Architecture Reference

Complete reference for the JTBD Assistant Platform's internal service architecture and APIs.

## Service Overview

The platform uses a layered service architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Next.js)                    │
│              /api/v1/chat, /api/v1/upload, etc.            │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer (TypeScript)                │
│   Embedding • Vector Search • Document Processing • Chat    │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                Intelligence Layer (Python/DSPy)             │
│              HMW Generation • Solution Creation             │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                 Data Layer (Supabase/pgvector)              │
│           Documents • Chunks • Embeddings • Search          │
└─────────────────────────────────────────────────────────────┘
```

## Core Services (TypeScript)

### Embedding Service

**Location**: `src/lib/services/embeddings/`  
**Purpose**: Generate and manage text embeddings using OpenAI's text-embedding-3-small

#### Key Classes

```typescript
// Main service interface
interface EmbeddingService {
  generateEmbedding(text: string): Promise<EmbeddingResult>
  generateBatchEmbeddings(inputs: EmbeddingInput[], options?: BatchEmbeddingOptions): Promise<EmbeddingResult[]>
  estimateCost(texts: string[]): Promise<EmbeddingCostInfo>
  validateInput(text: string): boolean
}

// Embedding result with metadata
interface EmbeddingResult {
  id?: string
  embedding: Vector           // 1536-dimension array
  tokenCount: number
  text: string
  metadata?: Record<string, unknown>
}
```

#### Usage Examples

```typescript
import embeddingService from '@/lib/services/embeddings'

// Single embedding
const result = await embeddingService.generateEmbedding('User input text')
console.log(result.embedding.length) // 1536
console.log(result.tokenCount) // Estimated tokens

// Batch processing (recommended for efficiency)
const inputs = [
  { text: 'First document chunk', id: 'chunk_1' },
  { text: 'Second document chunk', id: 'chunk_2' }
]
const results = await embeddingService.generateBatchEmbeddings(inputs, {
  batchSize: 100,
  trackCosts: true
})

// Cost estimation
const cost = await embeddingService.estimateCost(['text1', 'text2'])
console.log(cost.estimatedCost) // USD estimate
```

#### Performance Characteristics

- **Cache Hit Rate**: 70%+ for repeated content
- **Batch Efficiency**: 3x faster than individual calls
- **Cost Reduction**: ~70% through intelligent caching
- **Throughput**: 1000+ embeddings/minute

### Vector Search Service

**Location**: `src/lib/services/vector-search/`  
**Purpose**: Semantic similarity search across all vector-enabled entities

#### Key Interfaces

```typescript
interface VectorSearchService {
  searchInsights(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<InsightSearchResult['data']>>
  searchDocuments(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<DocumentSearchResult['data']>>
  searchJTBDs(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<JTBDSearchResult['data']>>
  unifiedSearch(query: string | Vector, options?: UnifiedSearchOptions): Promise<UnifiedSearchResult>
}

interface VectorSearchOptions {
  threshold?: number        // Default: 0.7
  limit?: number           // Default: 100
  userId?: string
  includeMetadata?: boolean
}
```

#### Usage Examples

```typescript
import vectorSearchService from '@/lib/services/vector-search'

// Single entity search
const insights = await vectorSearchService.searchInsights('customer satisfaction', {
  threshold: 0.75,
  limit: 20,
  userId: 'user123'
})

// Unified search across all entities
const results = await vectorSearchService.unifiedSearch('improve onboarding', {
  entities: ['insights', 'documents', 'jtbds'],
  weights: { insights: 1.2, documents: 1.0, jtbds: 0.8 },
  threshold: 0.7
})

// Process results
for (const result of results.combined) {
  console.log(`${result.similarity.toFixed(3)}: ${result.content}`)
}
```

#### Search Performance

- **Query Speed**: <100ms for typical searches
- **Similarity Accuracy**: 0.7+ threshold with semantic relevance
- **Result Ranking**: Combined similarity and weight-based scoring
- **Concurrency**: Parallel multi-entity searches

### Text Processing Services

**Location**: `src/lib/services/text-processing/`  
**Purpose**: Intelligent text chunking and token management

#### Text Chunker

```typescript
interface TextChunkingService {
  chunkText(text: string, options?: ChunkingOptions): Promise<ChunkingResult>
  validateChunks(chunks: TextChunk[]): boolean
  optimizeChunks(chunks: TextChunk[], targetTokens: number): Promise<TextChunk[]>
  mergeSmallChunks(chunks: TextChunk[], minTokens: number): TextChunk[]
}

interface ChunkingOptions {
  maxTokens?: number              // Default: 1000
  minTokens?: number              // Default: 100
  overlapPercentage?: number      // Default: 0.1 (10%)
  preserveSentences?: boolean     // Default: true
  strategy?: ChunkingStrategy     // Default: 'sentence-based'
}

type ChunkingStrategy = 'token-based' | 'sentence-based' | 'paragraph-based' | 'section-based'
```

#### Usage Examples

```typescript
import { TextChunker } from '@/lib/services/text-processing/chunker'

const chunker = new TextChunker()

// Smart chunking with sentence preservation
const result = await chunker.chunkText(documentContent, {
  strategy: 'sentence-based',
  maxTokens: 800,
  overlapPercentage: 0.15,
  preserveSentences: true
})

console.log(`Created ${result.chunkCount} chunks`)
console.log(`Total tokens: ${result.totalTokens}`)

// Preview without full processing
const preview = await chunker.previewChunking(content, { maxTokens: 500 })
console.log(`Estimated ${preview.estimatedChunkCount} chunks`)
```

#### Token Counter

```typescript
import { TokenCounter } from '@/lib/services/text-processing/tokenizer'

const tokenCounter = new TokenCounter()

// Accurate token counting
const count = tokenCounter.count('Text to count tokens for')
const fits = tokenCounter.fitsWithinLimit(text, 1000)
const truncated = tokenCounter.truncateToLimit(text, 500)

// Batch operations
const counts = tokenCounter.countBatch(['text1', 'text2', 'text3'])
const total = tokenCounter.countTotal(['text1', 'text2'])
```

### Document Processing Pipeline

**Location**: `src/lib/services/document-processing/`  
**Purpose**: End-to-end document processing from upload to embeddings

#### Core Pipeline

```typescript
interface DocumentProcessingService {
  processDocument(document: DocumentInput, options?: DocumentProcessingOptions): Promise<ProcessedDocument>
  processDocuments(documents: DocumentInput[], options?: DocumentProcessingOptions): AsyncGenerator<ProcessedDocument>
  validateDocument(document: DocumentInput): boolean
  estimateProcessingCost(document: DocumentInput, options?: DocumentProcessingOptions): Promise<EmbeddingCostInfo>
}

interface DocumentInput {
  content: string
  filename?: string
  metadata?: Record<string, unknown>
}

interface ProcessedDocument {
  chunks: TextChunk[]
  embeddings: EmbeddingResult[]
  originalDocument: DocumentInput
  processing: {
    totalTokens: number
    chunkCount: number
    embeddingCount: number
    processingTime: number
    costs?: EmbeddingCostInfo
  }
}
```

#### Usage Examples

```typescript
import documentProcessingService from '@/lib/services/document-processing'

// Complete document processing
const document: DocumentInput = {
  content: fileContent,
  filename: 'user-research.md',
  metadata: { uploadedBy: 'user123', source: 'interview' }
}

const result = await documentProcessingService.processDocument(document, {
  generateEmbeddings: true,
  strategy: 'sentence-based',
  maxTokens: 1000,
  overlapPercentage: 0.1
})

// Cost estimation before processing
const estimate = await documentProcessingService.estimateProcessingCost(document)
console.log(`Estimated cost: $${estimate.estimatedCost.toFixed(4)}`)

// Batch processing with progress tracking
const documents = [doc1, doc2, doc3]
for await (const processed of documentProcessingService.processDocuments(documents)) {
  console.log(`Processed: ${processed.originalDocument.filename}`)
  console.log(`Chunks: ${processed.processing.chunkCount}`)
  console.log(`Embeddings: ${processed.processing.embeddingCount}`)
}
```

### Chat Services

**Location**: `src/lib/services/chat/`  
**Purpose**: Intent detection, context retrieval, and token budget management for conversational AI

#### Intent Detection Service

**Purpose**: Keyword-based intent detection for routing chat requests

```typescript
interface IntentDetectionService {
  detectIntent(message: string, options?: IntentDetectionOptions): IntentDetectionResult
  requiresContext(intent: ChatIntent): boolean
  isRetrievalIntent(intent: ChatIntent): boolean
  getIntentKeywords(intent: ChatIntent): string[]
}

enum ChatIntent {
  RETRIEVE_INSIGHTS = 'retrieve_insights',
  RETRIEVE_METRICS = 'retrieve_metrics', 
  RETRIEVE_JTBDS = 'retrieve_jtbds',
  GENERATE_HMW = 'generate_hmw',
  CREATE_SOLUTIONS = 'create_solutions',
  GENERAL_EXPLORATION = 'general_exploration'
}

interface IntentDetectionResult {
  intent: ChatIntent
  confidence: number
  matchedKeywords: string[]
  alternativeIntents: Array<{ intent: ChatIntent; confidence: number }>
  processingTime: number
}
```

#### Context Retrieval Service

**Purpose**: Semantic and text-based retrieval of insights, metrics, and JTBDs

```typescript
interface ContextRetrievalService {
  retrieveInsights(query: string, options?: RetrievalOptions): Promise<RetrievalResult>
  retrieveMetrics(query: string, options?: RetrievalOptions): Promise<RetrievalResult>
  retrieveJTBDs(query: string, options?: RetrievalOptions): Promise<RetrievalResult>
}

interface ContextItem {
  id: string
  content: string
  type: 'insight' | 'metric' | 'jtbd' | 'hmw' | 'solution'
  similarity?: number
  metadata?: Record<string, unknown>
  displayText: string
  snippet: string
}

interface RetrievalResult {
  items: ContextItem[]
  totalResults: number
  pagination: PaginationInfo
  processingTime: number
  query: { text: string; options: RetrievalOptions }
}
```

#### Token Budget Manager

**Purpose**: 4000 token budget enforcement with intelligent truncation

```typescript
interface TokenBudgetManager {
  calculateTokenBudget(messages: ChatMessage[], contextItems?: ContextItem[]): Promise<number>
  getBudgetStatus(messages: ChatMessage[], contextItems?: ContextItem[]): Promise<TokenBudgetStatus>
  truncateToFitBudget(messages: ChatMessage[], contextItems: ContextItem[], maxTokens?: number): Promise<TruncationResult>
  optimizeForBudget(messages: ChatMessage[], contextItems: ContextItem[], maxTokens?: number): Promise<OptimizationResult>
}

interface TokenBudgetStatus {
  currentTokens: number
  maxTokens: number
  remainingTokens: number
  utilizationPercentage: number
  status: 'healthy' | 'warning' | 'critical' | 'exceeded'
  warnings: string[]
  recommendations: string[]
}
```

#### Usage Examples

```typescript
import { detectChatIntent, contextRetrievalService, tokenBudgetManager, ChatIntent } from '@/lib/services/chat'

// Intent detection
const result = detectChatIntent("What insights do we have from user feedback?")
// Result: { intent: "retrieve_insights", confidence: 0.9, matchedKeywords: ["insights"] }

// Context retrieval based on intent
if (result.intent === ChatIntent.RETRIEVE_INSIGHTS) {
  const insights = await contextRetrievalService.retrieveInsights("user feedback", {
    limit: 10,
    threshold: 0.8
  })
}

// Token budget management
const budgetStatus = await tokenBudgetManager.getBudgetStatus(messages, contextItems)
if (budgetStatus.status === 'exceeded') {
  const optimized = await tokenBudgetManager.truncateToFitBudget(messages, contextItems)
  // Use optimized.messages and optimized.contextItems
}
```

#### Performance Characteristics

- **Intent Detection**: <100ms for typical queries with 98%+ accuracy
- **Context Retrieval**: <500ms for semantic searches with pagination support
- **Token Budget**: <200ms for complex conversation truncation
- **Memory Usage**: ~10MB for chat services with intelligent caching

## Service Integration Patterns

### Configuration Integration

All services use the centralized configuration system:

```typescript
import { config } from '@/lib/config'

// Services automatically use configured settings
config.openai.embeddingModel     // 'text-embedding-3-small'
config.vector.similarityThreshold // 0.7
config.file.maxSizeBytes          // 1048576 (1MB)
```

### Error Handling Integration

Services use the standardized error system:

```typescript
import { EmbeddingError, VectorSearchError, ChunkingError } from '@/lib/services/types'

try {
  const result = await embeddingService.generateEmbedding(text)
} catch (error) {
  if (error instanceof EmbeddingError) {
    console.log(`Embedding failed: ${error.code}`)
    console.log(`Context:`, error.context)
  }
}
```

### Database Integration

Services integrate with the database client:

```typescript
import { executeVectorSearch } from '@/lib/database/client'

// Vector search uses database RPC functions
const results = await executeVectorSearch(
  'search_insights',
  queryEmbedding,
  threshold,
  limit,
  userId
)
```

### Logging Integration

All services use structured logging:

```typescript
import { logger, startPerformance, endPerformance } from '@/lib/logger'

const trackingId = startPerformance('embedding_generation')
try {
  const result = await generateEmbedding(text)
  endPerformance(trackingId, true, { tokenCount: result.tokenCount })
} catch (error) {
  endPerformance(trackingId, false, { error: error.message })
  throw error
}
```

## Service Dependencies

### Internal Dependencies

```typescript
// Service dependency graph
EmbeddingService
  ├── Config (openai, retry settings)
  ├── Logger (performance tracking)
  └── Cache (LRU cache implementation)

VectorSearchService
  ├── EmbeddingService (query embedding generation)
  ├── DatabaseClient (vector search RPC functions)
  └── Logger (search performance tracking)

TextChunker
  ├── TokenCounter (chunk size calculation)
  ├── ChunkingStrategies (boundary detection)
  └── Logger (chunking performance)

DocumentProcessingService
  ├── TextChunker (content splitting)
  ├── EmbeddingService (batch embedding generation)
  ├── DocumentValidator (input validation)
  └── ProgressTracker (processing monitoring)
```

### External Dependencies

```typescript
// Runtime dependencies
- @ai-sdk/openai: OpenAI integration for embeddings
- @supabase/supabase-js: Database operations and vector search
- zod: Configuration validation

// Development dependencies
- jest: Testing framework
- @types/node: TypeScript type definitions
```

## Performance Optimization

### Caching Strategy

```typescript
// Multi-level caching
EmbeddingCache (in-memory)
  ├── LRU eviction policy
  ├── TTL expiration (24 hours)
  ├── Hit rate: 70%+
  └── Cost savings: ~70%

TokenCountCache (in-memory)
  ├── Text-based key generation
  ├── Automatic cleanup
  └── Performance: 10x faster repeated counts
```

### Batch Processing

```typescript
// Optimal batch sizes
Embedding Generation:
  ├── Batch size: 100 texts (OpenAI limit)
  ├── Parallel batches: 3 concurrent
  ├── Cache integration: Separate cached/uncached
  └── Performance: 3x faster than individual calls

Vector Search:
  ├── Parallel entity searches
  ├── Result aggregation and ranking
  └── Performance: <100ms typical queries
```

### Memory Management

```typescript
// Memory usage patterns
Embedding Cache: ~50MB (10k embeddings)
Token Counter Cache: ~5MB (1k entries)
Processing Buffers: Dynamic based on document size
Vector Results: Limited to 100 results per query
```

## Testing Strategy

### Unit Tests

```typescript
// Comprehensive test coverage
src/lib/services/__tests__/
  ├── chunker.test.ts        # Text chunking functionality
  ├── tokenizer.test.ts      # Token counting accuracy
  ├── validator.test.ts      # Document validation rules
  └── setup.ts              # Test utilities and mocks

// Test categories
- Functionality tests (happy path)
- Edge case tests (boundary conditions)
- Error scenario tests (failure modes)
- Performance tests (execution time)
```

### Integration Tests

```typescript
// Cross-service functionality
- Document → Chunks → Embeddings (end-to-end)
- Vector search with real embeddings
- Cache performance under load
- Error propagation between services
```

## Development Guidelines

### Service Extension

When adding new services:

1. **Follow interface patterns**: Implement standard service interfaces
2. **Use existing infrastructure**: Config, logging, error handling
3. **Add comprehensive tests**: Unit and integration coverage
4. **Document performance**: Benchmarks and optimization notes

### Performance Considerations

1. **Batch operations**: Always prefer batch processing for external APIs
2. **Cache strategically**: Cache expensive operations (embeddings, token counts)
3. **Monitor performance**: Use structured logging for timing
4. **Optimize memory**: Clean up resources and limit cache sizes

### Error Handling Best Practices

1. **Use typed errors**: Specific error classes with context
2. **Preserve context**: Include relevant debugging information
3. **Enable recovery**: Provide retry hints and fallback strategies
4. **Log appropriately**: Structure logs for monitoring and debugging

---

*This architecture provides a scalable, maintainable foundation for the JTBD Assistant Platform's AI-powered document processing and semantic search capabilities.*
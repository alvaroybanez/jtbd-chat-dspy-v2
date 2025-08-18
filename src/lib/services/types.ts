/**
 * Shared types and interfaces for embedding and vector search services
 */

import type { Vector } from '../database/types'

// Re-export Vector type for use by other service modules
export type { Vector }

// ===== EMBEDDING TYPES =====

export interface EmbeddingInput {
  id?: string
  text: string
  metadata?: Record<string, unknown>
}

export interface EmbeddingResult {
  id?: string
  embedding: Vector
  tokenCount: number
  text: string
  metadata?: Record<string, unknown>
}

export interface BatchEmbeddingOptions {
  batchSize?: number
  retries?: number
  retryDelay?: number
  trackCosts?: boolean
}

export interface EmbeddingCostInfo {
  totalTokens: number
  estimatedCost: number
  modelUsed: string
}

export interface EmbeddingCache {
  get(text: string): Promise<Vector | null>
  set(text: string, embedding: Vector): Promise<void>
  clear(): Promise<void>
  size(): Promise<number>
}

// ===== TEXT CHUNKING TYPES =====

export interface TextChunk {
  content: string
  index: number
  tokenCount: number
  startIndex: number
  endIndex: number
  metadata?: Record<string, unknown>
}

export interface ChunkingOptions {
  maxTokens?: number
  minTokens?: number
  overlapPercentage?: number
  preserveSentences?: boolean
  preserveParagraphs?: boolean
  strategy?: ChunkingStrategy
}

export type ChunkingStrategy = 'token-based' | 'sentence-based' | 'paragraph-based' | 'section-based'

export interface ChunkingResult {
  chunks: TextChunk[]
  totalTokens: number
  chunkCount: number
  metadata: {
    sourceLength: number
    averageChunkSize: number
    overlapUsed: number
    strategy: ChunkingStrategy
  }
}

// ===== VECTOR SEARCH TYPES =====

export interface VectorSearchOptions {
  threshold?: number
  limit?: number
  userId?: string
  includeMetadata?: boolean
  includeEmbedding?: boolean
}

export interface SearchResult<T = Record<string, unknown>> {
  id: string
  content: string
  similarity: number
  metadata?: Record<string, unknown>
  data?: T
}

export interface VectorSearchResult<T = Record<string, unknown>> {
  results: SearchResult<T>[]
  totalResults: number
  maxSimilarity: number
  minSimilarity: number
  averageSimilarity: number
  threshold: number
  query: {
    text?: string
    embedding: Vector
    options: VectorSearchOptions
  }
}

// ===== DOCUMENT PROCESSING TYPES =====

export interface DocumentInput {
  content: string
  filename?: string
  metadata?: Record<string, unknown>
}

export interface ProcessedDocument {
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

export interface DocumentProcessingOptions extends ChunkingOptions, BatchEmbeddingOptions {
  generateEmbeddings?: boolean
  cacheEmbeddings?: boolean
  validateInput?: boolean
}

export interface ProcessingProgress {
  stage: 'chunking' | 'embedding' | 'storing' | 'complete'
  chunksProcessed: number
  totalChunks: number
  embeddingsGenerated: number
  percentage: number
  currentChunk?: TextChunk
  error?: Error
}

// ===== SEARCH SERVICE TYPES =====

export interface InsightSearchResult extends SearchResult {
  data: {
    id: string
    content: string
    document_id: string
    confidence_score: number
    source_chunk_ids: string[]
    created_at: string
  }
}

export interface DocumentSearchResult extends SearchResult {
  data: {
    id: string
    content: string
    document_id: string
    chunk_index: number
    token_count: number
    created_at: string
  }
}

export interface JTBDSearchResult extends SearchResult {
  data: {
    id: string
    statement: string
    context?: string
    priority?: number
    created_at: string
    updated_at: string
  }
}

export interface MetricSearchResult extends SearchResult {
  data: {
    id: string
    name: string
    description?: string
    current_value?: number
    target_value?: number
    unit: string
    created_at: string
    updated_at: string
  }
}

// ===== UNIFIED SEARCH TYPES =====

export type SearchableEntity = 'insights' | 'documents' | 'jtbds' | 'metrics'

export interface UnifiedSearchOptions extends VectorSearchOptions {
  entities?: SearchableEntity[]
  weights?: Partial<Record<SearchableEntity, number>>
  groupByEntity?: boolean
}

export interface UnifiedSearchResult {
  insights: VectorSearchResult<InsightSearchResult['data']>
  documents: VectorSearchResult<DocumentSearchResult['data']>
  jtbds: VectorSearchResult<JTBDSearchResult['data']>
  metrics: VectorSearchResult<MetricSearchResult['data']>
  combined: SearchResult[]
  summary: {
    totalResults: number
    entitiesSearched: SearchableEntity[]
    maxSimilarity: number
    searchTime: number
  }
}

// ===== ERROR TYPES =====

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

export class VectorSearchError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'VectorSearchError'
  }
}

export class ChunkingError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ChunkingError'
  }
}

// ===== SERVICE INTERFACES =====

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<EmbeddingResult>
  generateBatchEmbeddings(inputs: EmbeddingInput[], options?: BatchEmbeddingOptions): Promise<EmbeddingResult[]>
  estimateCost(texts: string[]): Promise<EmbeddingCostInfo>
  validateInput(text: string): boolean
}

export interface VectorSearchService {
  searchInsights(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<InsightSearchResult['data']>>
  searchDocuments(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<DocumentSearchResult['data']>>
  searchJTBDs(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<JTBDSearchResult['data']>>
  searchMetrics(query: string | Vector, options?: VectorSearchOptions): Promise<VectorSearchResult<MetricSearchResult['data']>>
  unifiedSearch(query: string | Vector, options?: UnifiedSearchOptions): Promise<UnifiedSearchResult>
}

export interface TextChunkingService {
  chunkText(text: string, options?: ChunkingOptions): Promise<ChunkingResult>
  validateChunks(chunks: TextChunk[]): boolean
  optimizeChunks(chunks: TextChunk[], targetTokens: number): Promise<TextChunk[]>
  mergeSmallChunks(chunks: TextChunk[], minTokens: number): TextChunk[]
}

export interface DocumentProcessingService {
  processDocument(document: DocumentInput, options?: DocumentProcessingOptions): Promise<ProcessedDocument>
  processDocuments(documents: DocumentInput[], options?: DocumentProcessingOptions): AsyncGenerator<ProcessedDocument, void, unknown>
  validateDocument(document: DocumentInput): boolean
  estimateProcessingCost(document: DocumentInput, options?: DocumentProcessingOptions): Promise<EmbeddingCostInfo>
}

// ===== UTILITY TYPES =====

export interface TokenInfo {
  count: number
  model: string
  encoding?: string
}

export interface ServiceHealth {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: Date
  responseTime?: number
  errorCount: number
  details?: Record<string, unknown>
}

export interface ServiceMetrics {
  requestCount: number
  errorCount: number
  averageResponseTime: number
  lastHour: {
    requests: number
    errors: number
    avgResponseTime: number
  }
  tokensProcessed: number
  estimatedCosts: number
}

// ===== CONSTANTS =====

export const EMBEDDING_MODELS = {
  'text-embedding-3-small': {
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002
  },
  'text-embedding-3-large': {
    dimensions: 3072,
    maxTokens: 8191,
    costPer1kTokens: 0.00013
  }
} as const

export const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxTokens: 1000,
  minTokens: 100,
  overlapPercentage: 0.1,
  preserveSentences: true,
  preserveParagraphs: false,
  strategy: 'sentence-based'
} as const

export const DEFAULT_SEARCH_OPTIONS: Required<VectorSearchOptions> = {
  threshold: 0.7,
  limit: 100,
  userId: '',
  includeMetadata: true,
  includeEmbedding: false
} as const

export const DEFAULT_BATCH_OPTIONS: Required<BatchEmbeddingOptions> = {
  batchSize: 100,
  retries: 3,
  retryDelay: 1000,
  trackCosts: true
} as const
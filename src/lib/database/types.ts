/**
 * TypeScript types for all database tables and operations
 * Provides type safety for Supabase operations and RPC functions
 */

// Base types for common fields
export type UUID = string
export type Timestamp = string
export type Vector = number[]

// Enums matching database constraints
export type FileType = 'md' | 'txt'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Environment = 'development' | 'staging' | 'production'
export type GenerationMethod = 'dspy' | 'fallback'
export type SolutionStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'rejected'
export type MessageRole = 'user' | 'assistant'

// Document table types
export interface Document {
  id: UUID
  user_id: UUID
  filename: string
  content: string
  content_hash: string
  file_size: number
  file_type: FileType
  created_at: Timestamp
  updated_at: Timestamp
}

export type DocumentInsert = Omit<Document, 'id' | 'created_at' | 'updated_at'>
export type DocumentUpdate = Partial<Omit<Document, 'id' | 'created_at'>>

// Document chunks table types
export interface DocumentChunk {
  id: UUID
  document_id: UUID
  content: string
  chunk_index: number
  token_count: number
  embedding: Vector
  created_at: Timestamp
}

export type DocumentChunkInsert = Omit<DocumentChunk, 'id' | 'created_at'>
export type DocumentChunkUpdate = Partial<Omit<DocumentChunk, 'id' | 'created_at'>>

// Insights table types
export interface Insight {
  id: UUID
  document_id: UUID
  user_id: UUID
  content: string
  embedding: Vector
  source_chunk_ids: UUID[]
  confidence_score: number
  created_at: Timestamp
}

export type InsightInsert = Omit<Insight, 'id' | 'created_at'>
export type InsightUpdate = Partial<Omit<Insight, 'id' | 'created_at'>>

// Metrics table types
export interface Metric {
  id: UUID
  user_id: UUID
  name: string
  description: string | null
  current_value: number | null
  target_value: number | null
  unit: string
  created_at: Timestamp
  updated_at: Timestamp
}

export type MetricInsert = Omit<Metric, 'id' | 'created_at' | 'updated_at'>
export type MetricUpdate = Partial<Omit<Metric, 'id' | 'created_at'>>

// JTBDs table types
export interface JTBD {
  id: UUID
  user_id: UUID
  statement: string
  context: string | null
  embedding: Vector
  priority: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type JTBDInsert = Omit<JTBD, 'id' | 'created_at' | 'updated_at'>
export type JTBDUpdate = Partial<Omit<JTBD, 'id' | 'created_at'>>

// HMWs (How Might We) table types
export interface HMW {
  id: UUID
  user_id: UUID
  question: string
  score: number
  jtbd_ids: UUID[]
  metric_ids: UUID[]
  insight_ids: UUID[]
  generation_method: GenerationMethod
  created_at: Timestamp
}

export type HMWInsert = Omit<HMW, 'id' | 'created_at'>
export type HMWUpdate = Partial<Omit<HMW, 'id' | 'created_at'>>

// Solutions table types
export interface Solution {
  id: UUID
  user_id: UUID
  title: string
  description: string
  impact_score: number
  effort_score: number
  final_score: number
  metric_ids: UUID[]
  hmw_ids: UUID[]
  jtbd_ids: UUID[]
  insight_ids: UUID[]
  generation_method: GenerationMethod
  status: SolutionStatus
  created_at: Timestamp
  updated_at: Timestamp
}

export type SolutionInsert = Omit<Solution, 'id' | 'created_at' | 'updated_at' | 'final_score'>
export type SolutionUpdate = Partial<Omit<Solution, 'id' | 'created_at' | 'final_score'>>

// Chat table types
export interface Chat {
  id: UUID
  user_id: UUID
  title: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type ChatInsert = Omit<Chat, 'id' | 'created_at' | 'updated_at'>
export type ChatUpdate = Partial<Omit<Chat, 'id' | 'created_at'>>

// Message table types
export interface Message {
  id: UUID
  chat_id: UUID
  role: MessageRole
  content: string
  intent: string | null
  context_items: Record<string, unknown> | null
  processing_time_ms: number | null
  token_count: number | null
  created_at: Timestamp
}

export type MessageInsert = Omit<Message, 'id' | 'created_at'>
export type MessageUpdate = Partial<Omit<Message, 'id' | 'created_at'>>

// Database schema type combining all tables
export interface Database {
  public: {
    Tables: {
      documents: {
        Row: Document
        Insert: DocumentInsert
        Update: DocumentUpdate
      }
      document_chunks: {
        Row: DocumentChunk
        Insert: DocumentChunkInsert
        Update: DocumentChunkUpdate
      }
      insights: {
        Row: Insight
        Insert: InsightInsert
        Update: InsightUpdate
      }
      metrics: {
        Row: Metric
        Insert: MetricInsert
        Update: MetricUpdate
      }
      jtbds: {
        Row: JTBD
        Insert: JTBDInsert
        Update: JTBDUpdate
      }
      hmws: {
        Row: HMW
        Insert: HMWInsert
        Update: HMWUpdate
      }
      solutions: {
        Row: Solution
        Insert: SolutionInsert
        Update: SolutionUpdate
      }
      chats: {
        Row: Chat
        Insert: ChatInsert
        Update: ChatUpdate
      }
      messages: {
        Row: Message
        Insert: MessageInsert
        Update: MessageUpdate
      }
    }
    Functions: {
      // Vector search functions
      search_insights: {
        Args: {
          query_embedding: Vector
          match_threshold?: number
          match_count?: number
          user_id?: UUID
        }
        Returns: Array<{
          id: UUID
          content: string
          document_id: UUID
          confidence_score: number
          similarity: number
        }>
      }
      search_jtbds: {
        Args: {
          query_embedding: Vector
          match_threshold?: number
          match_count?: number
          user_id?: UUID
        }
        Returns: Array<{
          id: UUID
          statement: string
          context: string | null
          priority: number | null
          similarity: number
        }>
      }
      search_document_chunks: {
        Args: {
          query_embedding: Vector
          match_threshold?: number
          match_count?: number
          user_id?: UUID
        }
        Returns: Array<{
          id: UUID
          content: string
          document_id: UUID
          filename: string
          similarity: number
        }>
      }
    }
  }
}

// Vector search result types
export interface InsightSearchResult {
  id: UUID
  content: string
  document_id: UUID
  confidence_score: number
  similarity: number
}

export interface JTBDSearchResult {
  id: UUID
  statement: string
  context: string | null
  priority: number | null
  similarity: number
}

export interface DocumentChunkSearchResult {
  id: UUID
  content: string
  document_id: UUID
  filename: string
  similarity: number
}

// Aggregated data types for UI consumption
export interface DocumentWithChunks extends Document {
  chunks: DocumentChunk[]
  insights: Insight[]
}

export interface InsightWithDocument extends Insight {
  document: {
    id: UUID
    filename: string
    file_type: FileType
  }
}

export interface SolutionWithRelations extends Solution {
  metrics: Metric[]
  hmws: HMW[]
  jtbds: JTBD[]
  insights: InsightWithDocument[]
}

export interface HMWWithRelations extends HMW {
  metrics: Metric[]
  jtbds: JTBD[]
  insights: InsightWithDocument[]
}

export interface ChatWithMessages extends Chat {
  messages: Message[]
  message_count: number
}

// Request/Response types for API operations
export interface CreateDocumentRequest {
  filename: string
  content: string
  file_type: FileType
}

export interface CreateMetricRequest {
  name: string
  description?: string
  current_value?: number
  target_value?: number
  unit: string
}

export interface CreateJTBDRequest {
  statement: string
  context?: string
  priority?: number
}

export interface GenerateHMWRequest {
  context: {
    jtbd_ids?: UUID[]
    metric_ids?: UUID[]
    insight_ids?: UUID[]
  }
  count?: number
}

export interface CreateSolutionRequest {
  context: {
    hmw_ids?: UUID[]
    jtbd_ids?: UUID[]
    metric_ids?: UUID[]
    insight_ids?: UUID[]
  }
  count?: number
}

export interface VectorSearchRequest {
  query: string
  threshold?: number
  limit?: number
  types?: Array<'insights' | 'jtbds' | 'documents'>
}

export interface ChatMessageRequest {
  message: string
  chat_id?: UUID
  context?: {
    selected_insights?: UUID[]
    selected_metrics?: UUID[]
    selected_jtbds?: UUID[]
  }
}

// Error types for database operations
export interface DatabaseOperationResult<T> {
  data: T | null
  error: string | null
  success: boolean
}

export interface PaginatedResult<T> {
  data: T[]
  count: number
  page: number
  page_size: number
  total_pages: number
}

// Query filter types
export interface DocumentFilters {
  user_id?: UUID
  file_type?: FileType
  filename_contains?: string
  created_after?: Timestamp
  created_before?: Timestamp
}

export interface InsightFilters {
  user_id?: UUID
  document_id?: UUID
  min_confidence?: number
  created_after?: Timestamp
  created_before?: Timestamp
}

export interface SolutionFilters {
  user_id?: UUID
  status?: SolutionStatus
  generation_method?: GenerationMethod
  min_impact_score?: number
  max_effort_score?: number
  metric_id?: UUID
  created_after?: Timestamp
  created_before?: Timestamp
}

export interface ChatFilters {
  user_id?: UUID
  title_contains?: string
  created_after?: Timestamp
  created_before?: Timestamp
}

// Sorting options
export type SortDirection = 'asc' | 'desc'

export interface SortOption {
  field: string
  direction: SortDirection
}

// Common query options
export interface QueryOptions {
  page?: number
  page_size?: number
  sort?: SortOption[]
}

// Type guards for runtime type checking
export function isDocument(obj: unknown): obj is Document {
  return typeof obj === 'object' && obj !== null && 'filename' in obj && 'content' in obj
}

export function isMetric(obj: unknown): obj is Metric {
  return typeof obj === 'object' && obj !== null && 'name' in obj && 'unit' in obj
}

export function isJTBD(obj: unknown): obj is JTBD {
  return typeof obj === 'object' && obj !== null && 'statement' in obj
}

export function isSolution(obj: unknown): obj is Solution {
  return typeof obj === 'object' && obj !== null && 'title' in obj && 'impact_score' in obj
}

export function isHMW(obj: unknown): obj is HMW {
  return typeof obj === 'object' && obj !== null && 'question' in obj && 'score' in obj
}

// Utility types for partial updates
export type PartialUpdate<T> = {
  [K in keyof T]?: T[K] extends object ? PartialUpdate<T[K]> : T[K]
}

// Database transaction types
export interface TransactionContext {
  id: string
  started_at: Timestamp
  operations: string[]
}

export interface BulkOperationResult<T> {
  successful: T[]
  failed: Array<{
    item: T
    error: string
  }>
  total_processed: number
  success_count: number
  failure_count: number
}
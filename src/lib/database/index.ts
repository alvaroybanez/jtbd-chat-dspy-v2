/**
 * Database module exports
 * Provides centralized access to database client, types, and utilities
 */

// Database client and connection utilities
export {
  db,
  getSupabaseClient,
  executeQuery,
  executeRPC,
  executeVectorSearch,
  getDatabaseHealth,
  checkDatabaseHealth,
  type ConnectionHealth,
  type RetryOptions,
} from './client'

// Database types and interfaces
export type {
  // Base types
  UUID,
  Timestamp,
  Vector,
  
  // Enums
  FileType,
  LogLevel,
  Environment,
  GenerationMethod,
  SolutionStatus,
  MessageRole,
  
  // Table types
  Document,
  DocumentInsert,
  DocumentUpdate,
  DocumentChunk,
  DocumentChunkInsert,
  DocumentChunkUpdate,
  Insight,
  InsightInsert,
  InsightUpdate,
  Metric,
  MetricInsert,
  MetricUpdate,
  JTBD,
  JTBDInsert,
  JTBDUpdate,
  HMW,
  HMWInsert,
  HMWUpdate,
  Solution,
  SolutionInsert,
  SolutionUpdate,
  Chat,
  ChatInsert,
  ChatUpdate,
  Message,
  MessageInsert,
  MessageUpdate,
  
  // Database schema
  Database,
  
  // Search result types
  InsightSearchResult,
  JTBDSearchResult,
  DocumentChunkSearchResult,
  
  // Aggregated types
  DocumentWithChunks,
  InsightWithDocument,
  SolutionWithRelations,
  HMWWithRelations,
  ChatWithMessages,
  
  // Request/Response types
  CreateDocumentRequest,
  CreateMetricRequest,
  CreateJTBDRequest,
  GenerateHMWRequest,
  CreateSolutionRequest,
  VectorSearchRequest,
  ChatMessageRequest,
  
  // Operation result types
  DatabaseOperationResult,
  PaginatedResult,
  BulkOperationResult,
  
  // Filter types
  DocumentFilters,
  InsightFilters,
  SolutionFilters,
  ChatFilters,
  
  // Sorting and query types
  SortDirection,
  SortOption,
  QueryOptions,
  
  // Transaction types
  TransactionContext,
  
  // Utility types
  PartialUpdate,
  
  // Type guards
  isDocument,
  isMetric,
  isJTBD,
  isSolution,
  isHMW,
} from './types'

// Convenience re-exports from related modules
export {
  // Database errors for easier imports
  DatabaseError,
  DatabaseConnectionError,
  QueryError,
  ConstraintViolationError,
  VectorSearchError,
  SupabaseError,
  isDatabaseError,
  isConnectionError,
  isVectorSearchError,
} from '../errors/database'
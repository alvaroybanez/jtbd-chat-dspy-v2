import { BaseError, type ErrorAction } from './base'
import { ERROR_CODES } from '../config/constants'

/**
 * Database-specific error classes for Supabase and PostgreSQL operations
 * Handles connection errors, query errors, and constraint violations
 */

// General database error
export class DatabaseError extends BaseError {
  constructor(
    message: string,
    action: ErrorAction = 'RETRY',
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(ERROR_CODES.DATABASE_ERROR, message, action, context, cause)
  }
}

// Database connection errors
export class DatabaseConnectionError extends BaseError {
  constructor(
    message: string,
    host?: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.DATABASE_CONNECTION_FAILED,
      `Database connection failed: ${message}`,
      'RETRY',
      { host, ...context },
      cause
    )
  }
}

// Query execution errors
export class QueryError extends DatabaseError {
  constructor(
    query: string,
    message: string,
    parameters?: unknown[],
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Query execution failed: ${message}`,
      'RETRY',
      { query: query.substring(0, 200), parameters, ...context },
      cause
    )
  }
}

// Constraint violation errors
export class ConstraintViolationError extends BaseError {
  constructor(
    constraintName: string,
    tableName: string,
    operation: string,
    message?: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    const errorMessage = message || `Constraint '${constraintName}' violated in table '${tableName}' during ${operation}`
    
    super(
      ERROR_CODES.CONSTRAINT_VIOLATION,
      errorMessage,
      'NONE', // Usually can't retry constraint violations
      { constraintName, tableName, operation, ...context },
      cause
    )
  }
}

// Foreign key constraint violation
export class ForeignKeyViolationError extends ConstraintViolationError {
  constructor(
    referencedTable: string,
    referencedId: string,
    tableName: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      'foreign_key',
      tableName,
      'insert/update',
      `Referenced record '${referencedId}' not found in table '${referencedTable}'`,
      { referencedTable, referencedId, ...context },
      cause
    )
  }
}

// Unique constraint violation
export class UniqueConstraintViolationError extends ConstraintViolationError {
  constructor(
    field: string,
    value: string,
    tableName: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      'unique',
      tableName,
      'insert/update',
      `Value '${value}' already exists for field '${field}' in table '${tableName}'`,
      { field, value, ...context },
      cause
    )
  }
}

// Check constraint violation (e.g., scoring ranges, file size limits)
export class CheckConstraintViolationError extends ConstraintViolationError {
  constructor(
    field: string,
    value: unknown,
    constraint: string,
    tableName: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      'check',
      tableName,
      'insert/update',
      `Value '${value}' for field '${field}' violates check constraint: ${constraint}`,
      { field, value, constraint, ...context },
      cause
    )
  }
}

// Vector search specific errors
export class VectorSearchError extends BaseError {
  constructor(
    message: string,
    query?: string,
    threshold?: number,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.VECTOR_SEARCH_FAILED,
      `Vector search failed: ${message}`,
      'RETRY',
      { query: query?.substring(0, 100), threshold, ...context },
      cause
    )
  }
}

// Embedding generation errors
export class EmbeddingGenerationError extends BaseError {
  constructor(
    text: string,
    model: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.EMBEDDING_FAILED,
      `Failed to generate embedding for text (${text.length} chars) using model ${model}`,
      'RETRY',
      { textLength: text.length, model, ...context },
      cause
    )
  }
}

// Transaction errors
export class TransactionError extends DatabaseError {
  constructor(
    operation: string,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Transaction failed during ${operation}: ${message}`,
      'RETRY',
      { operation, ...context },
      cause
    )
  }
}

// Migration errors
export class MigrationError extends DatabaseError {
  constructor(
    migrationName: string,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Migration '${migrationName}' failed: ${message}`,
      'NONE', // Migrations usually need manual intervention
      { migrationName, ...context },
      cause
    )
  }
}

// RPC function call errors
export class RPCError extends DatabaseError {
  constructor(
    functionName: string,
    parameters: Record<string, unknown>,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `RPC function '${functionName}' failed: ${message}`,
      'RETRY',
      { functionName, parameters, ...context },
      cause
    )
  }
}

// Supabase-specific errors
export class SupabaseError extends DatabaseError {
  constructor(
    operation: string,
    supabaseCode?: string,
    message: string = 'Supabase operation failed',
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Supabase ${operation} failed: ${message}`,
      'RETRY',
      { operation, supabaseCode, ...context },
      cause
    )
  }
}

// Authentication errors for Supabase
export class SupabaseAuthError extends BaseError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.UNAUTHORIZED,
      message,
      'NONE',
      { operation: 'authentication', supabaseCode: 'auth_error', ...context },
      cause
    )
  }
}

// Row Level Security (RLS) errors
export class RowLevelSecurityError extends BaseError {
  constructor(
    tableName: string,
    operation: string,
    userId?: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.UNAUTHORIZED,
      `Row Level Security policy violated for table '${tableName}' during ${operation}`,
      'NONE',
      { tableName, operation, userId, ...context },
      cause
    )
  }
}

// Storage errors for file operations
export class StorageError extends SupabaseError {
  constructor(
    operation: string,
    bucket: string,
    filename?: string,
    message: string = 'Storage operation failed',
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      'storage',
      'storage_error',
      `Storage ${operation} failed in bucket '${bucket}': ${message}`,
      { operation, bucket, filename, ...context },
      cause
    )
  }
}

// Connection pool exhaustion
export class ConnectionPoolExhaustedError extends DatabaseConnectionError {
  constructor(
    maxConnections: number,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Connection pool exhausted (max: ${maxConnections})`,
      undefined,
      { maxConnections, ...context },
      cause
    )
  }
}

// Query timeout error
export class QueryTimeoutError extends BaseError {
  constructor(
    query: string,
    timeoutMs: number,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.CHAIN_TIMEOUT,
      `Query timed out after ${timeoutMs}ms`,
      'RETRY',
      { query: query.substring(0, 200), timeoutMs, ...context },
      cause
    )
  }
}

// Type guard functions for database errors
export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError
}

export function isConnectionError(error: unknown): error is DatabaseConnectionError {
  return error instanceof DatabaseConnectionError
}

export function isConstraintViolation(error: unknown): error is ConstraintViolationError {
  return error instanceof ConstraintViolationError
}

export function isVectorSearchError(error: unknown): error is VectorSearchError {
  return error instanceof VectorSearchError
}

export function isSupabaseError(error: unknown): error is SupabaseError {
  return error instanceof SupabaseError
}

export function isQueryTimeoutError(error: unknown): error is QueryTimeoutError {
  return error instanceof QueryTimeoutError
}

export function isTransactionError(error: unknown): error is TransactionError {
  return error instanceof TransactionError
}
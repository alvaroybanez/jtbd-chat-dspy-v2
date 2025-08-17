import { ERROR_CODES } from '../config/constants'

/**
 * Base error classes and standardized error response format
 * Implements the error handling strategy defined in the project requirements
 */

// Error action types - suggests what the user should do
export type ErrorAction = 'RETRY' | 'NONE'

// Standard error response format matching API specification
export interface ErrorResponse {
  code: string          // UPPER_SNAKE_CASE identifier
  message: string       // Human-readable description
  action: ErrorAction   // Suggested user action
  details?: {
    cause?: string
    timestamp: string
    requestId?: string
    context?: Record<string, unknown>
  }
}

// Base error class with standardized properties
export abstract class BaseError extends Error {
  public readonly code: string
  public readonly action: ErrorAction
  public readonly timestamp: string
  public readonly context: Record<string, unknown>
  public readonly cause?: Error

  constructor(
    code: string,
    message: string,
    action: ErrorAction = 'NONE',
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(message)
    
    this.name = this.constructor.name
    this.code = code
    this.action = action
    this.timestamp = new Date().toISOString()
    this.context = context
    this.cause = cause

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * Convert error to standardized response format
   */
  public toResponse(requestId?: string): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      details: {
        cause: this.cause?.message,
        timestamp: this.timestamp,
        requestId,
        context: Object.keys(this.context).length > 0 ? this.context : undefined,
      }
    }
  }

  /**
   * Get sanitized context (removes sensitive information)
   */
  public getSanitizedContext(): Record<string, unknown> {
    const sensitiveKeys = ['apiKey', 'password', 'token', 'secret', 'key', 'authorization']
    const sanitized: Record<string, unknown> = {}
    
    for (const [key, value] of Object.entries(this.context)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }
}

// Configuration-related errors
export class ConfigurationError extends BaseError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(ERROR_CODES.MISSING_CONFIG, message, 'NONE', context, cause)
  }
}

// Invalid API key error
export class InvalidApiKeyError extends BaseError {
  constructor(
    service: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.INVALID_API_KEY,
      `Invalid API key for ${service}`,
      'NONE',
      { service, ...context },
      cause
    )
  }
}

// Service communication errors
export class ServiceError extends BaseError {
  constructor(
    code: string,
    service: string,
    message: string,
    action: ErrorAction = 'RETRY',
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      code,
      `${service} service error: ${message}`,
      action,
      { service, ...context },
      cause
    )
  }
}

// DSPy service specific errors
export class DSPyServiceError extends ServiceError {
  constructor(
    message: string,
    action: ErrorAction = 'RETRY',
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(ERROR_CODES.DSPY_MODULE_ERROR, 'DSPy', message, action, context, cause)
  }
}

// Timeout errors
export class TimeoutError extends BaseError {
  constructor(
    operation: string,
    timeoutMs: number,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.CHAIN_TIMEOUT,
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'RETRY',
      { operation, timeoutMs, ...context },
      cause
    )
  }
}

// Input validation errors
export class ValidationError extends BaseError {
  constructor(
    message: string,
    field?: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.VALIDATION_FAILED,
      message,
      'NONE',
      { field, ...context },
      cause
    )
  }
}

// File processing errors
export class FileProcessingError extends BaseError {
  constructor(
    code: string,
    message: string,
    filename?: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      code,
      message,
      'NONE',
      { filename, ...context },
      cause
    )
  }
}

// File too large error
export class FileTooLargeError extends FileProcessingError {
  constructor(
    filename: string,
    actualSize: number,
    maxSize: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      ERROR_CODES.FILE_TOO_LARGE,
      `File '${filename}' (${actualSize} bytes) exceeds maximum size of ${maxSize} bytes`,
      filename,
      { actualSize, maxSize, ...context }
    )
  }
}

// Invalid file type error
export class InvalidFileTypeError extends FileProcessingError {
  constructor(
    filename: string,
    actualType: string,
    allowedTypes: string[],
    context: Record<string, unknown> = {}
  ) {
    super(
      ERROR_CODES.FILE_TYPE_INVALID,
      `File '${filename}' has invalid type '${actualType}'. Allowed types: ${allowedTypes.join(', ')}`,
      filename,
      { actualType, allowedTypes, ...context }
    )
  }
}

// Rate limiting error
export class RateLimitError extends BaseError {
  constructor(
    operation: string,
    limit: number,
    windowMs: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded for ${operation}: ${limit} requests per ${windowMs}ms`,
      'RETRY',
      { operation, limit, windowMs, ...context }
    )
  }
}

// Not found error
export class NotFoundError extends BaseError {
  constructor(
    resource: string,
    identifier?: string,
    context: Record<string, unknown> = {}
  ) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`
    
    super(
      ERROR_CODES.NOT_FOUND,
      message,
      'NONE',
      { resource, identifier, ...context }
    )
  }
}

// Unauthorized error
export class UnauthorizedError extends BaseError {
  constructor(
    resource?: string,
    context: Record<string, unknown> = {}
  ) {
    const message = resource 
      ? `Unauthorized access to ${resource}`
      : 'Unauthorized access'
    
    super(
      ERROR_CODES.UNAUTHORIZED,
      message,
      'NONE',
      { resource, ...context }
    )
  }
}

// Internal error for unexpected issues
export class InternalError extends BaseError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.INTERNAL_ERROR,
      `Internal error: ${message}`,
      'RETRY',
      context,
      cause
    )
  }
}

// Type guard functions
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError
}

export function isRetryableError(error: unknown): boolean {
  return isBaseError(error) && error.action === 'RETRY'
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError
}
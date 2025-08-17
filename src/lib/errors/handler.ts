import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { BaseError, type ErrorResponse, InternalError, TimeoutError, ServiceError, RateLimitError } from './base'
import { DatabaseError, isConnectionError, isQueryTimeoutError } from './database'
import { SchemaValidationError, fromZodError } from './validation'
import { HTTP_STATUS, ERROR_CODES, LOGGING } from '../config/constants'
import { isDevelopment } from '../config'

/**
 * Global error handler for consistent error processing and response formatting
 * Provides centralized error logging, transformation, and recovery strategies
 */

// Request context for error tracking
export interface ErrorContext {
  requestId?: string
  userId?: string
  endpoint?: string
  method?: string
  userAgent?: string
  ip?: string
  timestamp?: string
  [key: string]: unknown
}

// Error handler configuration
interface ErrorHandlerConfig {
  includeStack: boolean
  logErrors: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  enableRecoveryStrategies: boolean
}

// Default configuration based on environment
const getDefaultConfig = (): ErrorHandlerConfig => ({
  includeStack: isDevelopment,
  logErrors: true,
  logLevel: isDevelopment ? 'debug' : 'error',
  enableRecoveryStrategies: true,
})

// Centralized error logger
class ErrorLogger {
  private static sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      // Redact sensitive information
      if (LOGGING.SENSITIVE_FIELDS.some(field => 
        typeof value === 'string' && value.toLowerCase().includes(field)
      )) {
        return '[REDACTED]'
      }
      
      // Truncate long strings
      if (value.length > LOGGING.MAX_LOG_LENGTH) {
        return value.substring(0, LOGGING.MAX_LOG_LENGTH) + '...'
      }
    }
    
    if (typeof value === 'object' && value !== null) {
      const sanitized: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(value)) {
        if (LOGGING.SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
          sanitized[key] = '[REDACTED]'
        } else {
          sanitized[key] = this.sanitizeValue(val)
        }
      }
      return sanitized
    }
    
    return value
  }

  public static log(
    error: Error,
    context: ErrorContext = {},
    level: 'debug' | 'info' | 'warn' | 'error' = 'error'
  ): void {
    const sanitizedContext = this.sanitizeValue(context)
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      error: {
        name: error.name,
        message: error.message,
        stack: isDevelopment ? error.stack : undefined,
        code: error instanceof BaseError ? error.code : undefined,
        action: error instanceof BaseError ? error.action : undefined,
      },
      context: sanitizedContext,
    }

    // Use appropriate console method based on level
    switch (level) {
      case 'debug':
        console.debug('[ERROR]', JSON.stringify(logEntry, null, 2))
        break
      case 'info':
        console.info('[ERROR]', JSON.stringify(logEntry, null, 2))
        break
      case 'warn':
        console.warn('[ERROR]', JSON.stringify(logEntry, null, 2))
        break
      case 'error':
      default:
        console.error('[ERROR]', JSON.stringify(logEntry, null, 2))
        break
    }
  }
}

// Main error handler class
export class GlobalErrorHandler {
  private config: ErrorHandlerConfig

  constructor(config?: Partial<ErrorHandlerConfig>) {
    this.config = { ...getDefaultConfig(), ...config }
  }

  /**
   * Handle error and return standardized response
   */
  public handleError(
    error: unknown,
    context: ErrorContext = {}
  ): { response: ErrorResponse; status: number } {
    const processedError = this.processError(error, context)
    const status = this.getHttpStatus(processedError)
    const response = processedError.toResponse(context.requestId)

    // Log error if enabled
    if (this.config.logErrors) {
      ErrorLogger.log(processedError, context, this.config.logLevel)
    }

    return { response, status }
  }

  /**
   * Handle error in Next.js API route
   */
  public handleApiError(
    error: unknown,
    request?: NextRequest
  ): NextResponse<ErrorResponse> {
    const context = this.extractRequestContext(request)
    const { response, status } = this.handleError(error, context)

    return NextResponse.json(response, { 
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': context.requestId || 'unknown',
      }
    })
  }

  /**
   * Process and normalize error to BaseError
   */
  private processError(error: unknown, context: ErrorContext): BaseError {
    // Already a BaseError - return as is
    if (error instanceof BaseError) {
      return error
    }

    // Zod validation error
    if (error instanceof z.ZodError) {
      return fromZodError(error, context)
    }

    // Standard JavaScript Error
    if (error instanceof Error) {
      return this.handleStandardError(error, context)
    }

    // Unknown error type
    return new InternalError(
      `Unknown error type: ${typeof error}`,
      { originalError: String(error), ...context }
    )
  }

  /**
   * Handle standard JavaScript errors
   */
  private handleStandardError(error: Error, context: ErrorContext): BaseError {
    // Handle specific error types based on message patterns
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return new TimeoutError(
        'operation',
        30000,
        context,
        error
      )
    }

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return new ServiceError(
        ERROR_CODES.DSPY_CONNECTION_FAILED,
        'external service',
        `Connection failed: ${error.message}`,
        'RETRY',
        context,
        error
      )
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return new RateLimitError(
        'unknown operation',
        100,
        60000,
        context
      )
    }

    // Default to internal error
    return new InternalError(error.message, context, error)
  }

  /**
   * Get appropriate HTTP status code for error
   */
  private getHttpStatus(error: BaseError): number {
    switch (error.code) {
      case ERROR_CODES.VALIDATION_FAILED:
      case ERROR_CODES.INVALID_INPUT:
      case ERROR_CODES.INVALID_CONTEXT:
      case ERROR_CODES.FILE_TOO_LARGE:
      case ERROR_CODES.FILE_TYPE_INVALID:
        return HTTP_STATUS.BAD_REQUEST

      case ERROR_CODES.UNAUTHORIZED:
      case ERROR_CODES.INVALID_API_KEY:
        return HTTP_STATUS.UNAUTHORIZED

      case ERROR_CODES.NOT_FOUND:
        return HTTP_STATUS.NOT_FOUND

      case ERROR_CODES.CONSTRAINT_VIOLATION:
        return HTTP_STATUS.CONFLICT

      case ERROR_CODES.RATE_LIMIT_EXCEEDED:
        return HTTP_STATUS.TOO_MANY_REQUESTS

      case ERROR_CODES.DSPY_MODULE_ERROR:
      case ERROR_CODES.DATABASE_CONNECTION_FAILED:
        return HTTP_STATUS.BAD_GATEWAY

      case ERROR_CODES.CHAIN_TIMEOUT:
      case ERROR_CODES.DSPY_TIMEOUT:
        return HTTP_STATUS.GATEWAY_TIMEOUT

      case ERROR_CODES.DATABASE_ERROR:
      case ERROR_CODES.INTERNAL_ERROR:
      default:
        return HTTP_STATUS.INTERNAL_SERVER_ERROR
    }
  }

  /**
   * Extract context from Next.js request
   */
  private extractRequestContext(request?: NextRequest): ErrorContext {
    if (!request) {
      return {
        requestId: this.generateRequestId(),
        timestamp: new Date().toISOString(),
      }
    }

    return {
      requestId: request.headers.get('x-request-id') || this.generateRequestId(),
      endpoint: request.nextUrl.pathname,
      method: request.method,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('x-forwarded-for') || 
          request.headers.get('x-real-ip') || 
          undefined,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Attempt error recovery strategies
   */
  public async attemptRecovery(
    error: BaseError,
    operation: () => Promise<unknown>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<unknown> {
    if (!this.config.enableRecoveryStrategies || error.action !== 'RETRY') {
      throw error
    }

    let lastError = error
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Exponential backoff with jitter
        const jitter = Math.random() * 0.1 * delay
        const backoffDelay = delay * Math.pow(2, attempt - 1) + jitter
        
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
        }

        return await operation()
      } catch (retryError) {
        lastError = retryError instanceof BaseError 
          ? retryError 
          : this.processError(retryError, {})
        
        // Don't retry if error is not retryable
        if (lastError.action !== 'RETRY') {
          break
        }
      }
    }

    throw lastError
  }
}

// Singleton instance
const globalErrorHandler = new GlobalErrorHandler()

// Convenience functions
export function handleError(
  error: unknown,
  context?: ErrorContext
): { response: ErrorResponse; status: number } {
  return globalErrorHandler.handleError(error, context)
}

export function handleApiError(
  error: unknown,
  request?: NextRequest
): NextResponse<ErrorResponse> {
  return globalErrorHandler.handleApiError(error, request)
}

export async function withErrorRecovery<T>(
  operation: () => Promise<T>,
  maxRetries?: number,
  delay?: number
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const processedError = error instanceof BaseError 
      ? error 
      : globalErrorHandler['processError'](error, {})
    
    return await globalErrorHandler.attemptRecovery(
      processedError,
      operation,
      maxRetries,
      delay
    ) as T
  }
}

// Error boundary for React components (for future frontend usage)
export function createErrorBoundaryHandler() {
  return (error: Error, errorInfo: { componentStack: string }) => {
    const context: ErrorContext = {
      requestId: globalErrorHandler['generateRequestId'](),
      timestamp: new Date().toISOString(),
    }

    ErrorLogger.log(error, { ...context, componentStack: errorInfo.componentStack })
  }
}

// Middleware for automatic error handling
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args)
    } catch (error) {
      const { response } = handleError(error)
      throw new Error(JSON.stringify(response))
    }
  }
}

export { ErrorLogger }
export type { ErrorHandlerConfig }
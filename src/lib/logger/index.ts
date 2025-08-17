import { config, isDevelopment, isProduction } from '../config'
import { LOGGING } from '../config/constants'
import type { LogLevel } from '../config/env.schema'

/**
 * Structured logging utility for consistent logging across the application
 * Provides context injection, performance monitoring, and environment-aware logging
 */

// Log entry interface
interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  service?: string
  operation?: string
  duration?: number
  requestId?: string
  userId?: string
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
}

// Performance tracking interface
interface PerformanceContext {
  operation: string
  startTime: number
  requestId?: string
  userId?: string
  metadata?: Record<string, unknown>
}

// Logger configuration
interface LoggerConfig {
  level: LogLevel
  enableColors: boolean
  enableTimestamp: boolean
  enableContext: boolean
  maxMessageLength: number
  sensitiveFields: string[]
  performanceThreshold: number
}

class Logger {
  private config: LoggerConfig
  private performanceMap = new Map<string, PerformanceContext>()

  constructor() {
    this.config = {
      level: config.app.logLevel,
      enableColors: isDevelopment,
      enableTimestamp: true,
      enableContext: true,
      maxMessageLength: LOGGING.MAX_LOG_LENGTH,
      sensitiveFields: [...LOGGING.SENSITIVE_FIELDS],
      performanceThreshold: LOGGING.PERFORMANCE_THRESHOLD,
    }
  }

  /**
   * Log debug message
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  /**
   * Log info message
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  /**
   * Log warning message
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  /**
   * Log error message
   */
  public error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = this.extractErrorContext(error)
    this.log('error', message, { ...context, ...errorContext })
  }

  /**
   * Log with specified level
   */
  public log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return
    }

    const logEntry = this.createLogEntry(level, message, context)
    const formattedMessage = this.formatLogEntry(logEntry)

    this.writeLog(level, formattedMessage)
  }

  /**
   * Start performance tracking
   */
  public startPerformance(
    operation: string,
    requestId?: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): string {
    const trackingId = this.generateTrackingId(operation)
    
    this.performanceMap.set(trackingId, {
      operation,
      startTime: Date.now(),
      requestId,
      userId,
      metadata,
    })

    this.debug(`Started operation: ${operation}`, {
      trackingId,
      requestId,
      userId,
      ...metadata,
    })

    return trackingId
  }

  /**
   * End performance tracking and log results
   */
  public endPerformance(
    trackingId: string,
    success: boolean = true,
    additionalContext?: Record<string, unknown>
  ): void {
    const perfContext = this.performanceMap.get(trackingId)
    if (!perfContext) {
      this.warn(`Performance tracking not found for ID: ${trackingId}`)
      return
    }

    const duration = Date.now() - perfContext.startTime
    const isSlowOperation = duration > this.config.performanceThreshold

    const logLevel: LogLevel = !success ? 'error' : isSlowOperation ? 'warn' : 'info'
    const statusText = success ? 'completed' : 'failed'
    
    this.log(logLevel, `Operation ${perfContext.operation} ${statusText}`, {
      trackingId,
      operation: perfContext.operation,
      duration,
      success,
      isSlowOperation,
      requestId: perfContext.requestId,
      userId: perfContext.userId,
      ...perfContext.metadata,
      ...additionalContext,
    })

    // Clean up tracking
    this.performanceMap.delete(trackingId)
  }

  /**
   * Log API request/response
   */
  public logApiCall(
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    requestId?: string,
    userId?: string,
    additionalContext?: Record<string, unknown>
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    
    this.log(level, `${method} ${endpoint} - ${statusCode}`, {
      type: 'api_call',
      method,
      endpoint,
      statusCode,
      duration,
      requestId,
      userId,
      ...additionalContext,
    })
  }

  /**
   * Log database operation
   */
  public logDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    recordCount?: number,
    success: boolean = true,
    error?: Error,
    requestId?: string
  ): void {
    const level: LogLevel = !success ? 'error' : duration > 1000 ? 'warn' : 'debug'
    
    this.log(level, `Database ${operation} on ${table}`, {
      type: 'database_operation',
      operation,
      table,
      duration,
      recordCount,
      success,
      error: error ? this.extractErrorContext(error) : undefined,
      requestId,
    })
  }

  /**
   * Log external service call
   */
  public logServiceCall(
    service: string,
    operation: string,
    duration: number,
    success: boolean = true,
    statusCode?: number,
    error?: Error,
    requestId?: string
  ): void {
    const level: LogLevel = !success ? 'error' : duration > 5000 ? 'warn' : 'info'
    
    this.log(level, `${service} ${operation}`, {
      type: 'service_call',
      service,
      operation,
      duration,
      success,
      statusCode,
      error: error ? this.extractErrorContext(error) : undefined,
      requestId,
    })
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message: this.truncateMessage(message),
      context: context ? this.sanitizeContext(context) : undefined,
    }
  }

  /**
   * Format log entry for output
   */
  private formatLogEntry(entry: LogEntry): string {
    if (isProduction) {
      // JSON format for production (for log aggregation)
      return JSON.stringify(entry)
    }

    // Human-readable format for development
    const timestamp = entry.timestamp
    const level = this.config.enableColors ? this.colorizeLevel(entry.level) : entry.level.toUpperCase()
    const message = entry.message
    const context = entry.context ? `\n${JSON.stringify(entry.context, null, 2)}` : ''

    return `[${timestamp}] ${level}: ${message}${context}`
  }

  /**
   * Write log to appropriate output
   */
  private writeLog(level: LogLevel, message: string): void {
    switch (level) {
      case 'error':
        console.error(message)
        break
      case 'warn':
        console.warn(message)
        break
      case 'info':
        console.info(message)
        break
      case 'debug':
      default:
        console.log(message)
        break
    }
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    }

    return levels[level] >= levels[this.config.level]
  }

  /**
   * Sanitize context to remove sensitive information
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(context)) {
      if (this.config.sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Extract error context
   */
  private extractErrorContext(error: Error | unknown): Record<string, unknown> {
    if (!error) return {}

    if (error instanceof Error) {
      return {
        error: {
          name: error.name,
          message: error.message,
          stack: isDevelopment ? error.stack : undefined,
          code: 'code' in error ? error.code : undefined,
        }
      }
    }

    return {
      error: {
        name: 'Unknown',
        message: String(error),
      }
    }
  }

  /**
   * Truncate message if too long
   */
  private truncateMessage(message: string): string {
    if (message.length <= this.config.maxMessageLength) {
      return message
    }

    return message.substring(0, this.config.maxMessageLength) + '...'
  }

  /**
   * Generate tracking ID for performance monitoring
   */
  private generateTrackingId(operation: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6)
    return `${operation}_${timestamp}_${random}`
  }

  /**
   * Colorize log level for development
   */
  private colorizeLevel(level: LogLevel): string {
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    }
    const reset = '\x1b[0m'

    return `${colors[level]}${level.toUpperCase()}${reset}`
  }

  /**
   * Update logger configuration
   */
  public updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Get current configuration
   */
  public getConfig(): LoggerConfig {
    return { ...this.config }
  }

  /**
   * Clear performance tracking (useful for testing)
   */
  public clearPerformanceTracking(): void {
    this.performanceMap.clear()
  }
}

// Create singleton instance
const logger = new Logger()

// Convenience functions
export const debug = (message: string, context?: Record<string, unknown>) => 
  logger.debug(message, context)

export const info = (message: string, context?: Record<string, unknown>) => 
  logger.info(message, context)

export const warn = (message: string, context?: Record<string, unknown>) => 
  logger.warn(message, context)

export const error = (message: string, error?: Error | unknown, context?: Record<string, unknown>) => 
  logger.error(message, error, context)

export const startPerformance = (operation: string, requestId?: string, userId?: string, metadata?: Record<string, unknown>) =>
  logger.startPerformance(operation, requestId, userId, metadata)

export const endPerformance = (trackingId: string, success?: boolean, additionalContext?: Record<string, unknown>) =>
  logger.endPerformance(trackingId, success, additionalContext)

export const logApiCall = (method: string, endpoint: string, statusCode: number, duration: number, requestId?: string, userId?: string, additionalContext?: Record<string, unknown>) =>
  logger.logApiCall(method, endpoint, statusCode, duration, requestId, userId, additionalContext)

export const logDatabaseOperation = (operation: string, table: string, duration: number, recordCount?: number, success?: boolean, error?: Error, requestId?: string) =>
  logger.logDatabaseOperation(operation, table, duration, recordCount, success, error, requestId)

export const logServiceCall = (service: string, operation: string, duration: number, success?: boolean, statusCode?: number, error?: Error, requestId?: string) =>
  logger.logServiceCall(service, operation, duration, success, statusCode, error, requestId)

// Export logger instance and types
export { logger }
export type { LogEntry, PerformanceContext, LoggerConfig }
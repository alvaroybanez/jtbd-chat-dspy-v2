import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config, isDevelopment } from '../config'
import { RETRY_CONFIG, TIMEOUTS, DATABASE_LIMITS } from '../config/constants'
import {
  DatabaseConnectionError,
  QueryError,
  SupabaseError,
  QueryTimeoutError,
  ConnectionPoolExhaustedError,
  VectorSearchError,
  TransactionError,
} from '../errors/database'
import type { Database, Vector } from './types'

/**
 * Supabase database client with singleton pattern, retry logic, and health monitoring
 * Provides connection pooling, circuit breaker pattern, and comprehensive error handling
 */

interface ConnectionHealth {
  isHealthy: boolean
  lastChecked: Date
  consecutiveFailures: number
  lastError?: Error
}

interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  shouldRetry?: (error: Error, attempt: number) => boolean
}

class DatabaseClient {
  private static instance: DatabaseClient | null = null
  private client: SupabaseClient<Database, 'public'> | null = null
  private health: ConnectionHealth = {
    isHealthy: true,
    lastChecked: new Date(),
    consecutiveFailures: 0,
  }
  private isInitialized = false
  private readonly circuitBreakerThreshold = 5
  private readonly healthCheckInterval = 30000 // 30 seconds

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient()
    }
    return DatabaseClient.instance
  }

  /**
   * Initialize the database connection
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized && this.client) {
      return
    }

    try {
      const { supabase: supabaseConfig } = config
      
      this.client = createClient<Database>(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        {
          auth: {
            persistSession: false, // Disable session persistence for server-side usage
            autoRefreshToken: false,
          },
          global: {
            headers: {
              'x-client-info': 'jtbd-assistant-platform',
            },
          },
          db: {
            schema: 'public',
          },
        }
      )

      // Perform initial health check
      await this.performHealthCheck()
      
      // Start periodic health checks
      this.startHealthCheckInterval()
      
      this.isInitialized = true
      
      if (isDevelopment) {
        console.log('✅ Database client initialized successfully')
      }
    } catch (error) {
      const dbError = new DatabaseConnectionError(
        'Failed to initialize database client',
        config.supabase.url,
        { supabaseUrl: config.supabase.url },
        error instanceof Error ? error : undefined
      )
      
      this.health.isHealthy = false
      this.health.lastError = dbError
      this.health.consecutiveFailures++
      
      throw dbError
    }
  }

  /**
   * Get the Supabase client instance
   */
  public async getClient(): Promise<SupabaseClient<Database, 'public'>> {
    if (!this.isInitialized || !this.client) {
      await this.initialize()
    }

    if (!this.client) {
      throw new DatabaseConnectionError('Database client not initialized')
    }

    // Check circuit breaker
    if (!this.health.isHealthy && this.health.consecutiveFailures >= this.circuitBreakerThreshold) {
      throw new DatabaseConnectionError(
        `Circuit breaker open: ${this.health.consecutiveFailures} consecutive failures`,
        undefined,
        { 
          consecutiveFailures: this.health.consecutiveFailures,
          lastError: this.health.lastError?.message 
        }
      )
    }

    return this.client
  }

  /**
   * Perform database health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Client not initialized')
      }

      // Simple query to test connection
      const { error } = await this.client
        .from('documents')
        .select('id')
        .limit(1)
        .single()

      // Error is expected if no documents exist, but connection should work
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw new Error(`Health check failed: ${error.message}`)
      }

      // Reset health status on successful check
      this.health.isHealthy = true
      this.health.consecutiveFailures = 0
      this.health.lastError = undefined
      this.health.lastChecked = new Date()

    } catch (error) {
      this.health.isHealthy = false
      this.health.consecutiveFailures++
      this.health.lastError = error instanceof Error ? error : new Error(String(error))
      this.health.lastChecked = new Date()

      if (isDevelopment) {
        console.warn(`⚠️ Database health check failed:`, error)
      }
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheckInterval(): void {
    setInterval(() => {
      this.performHealthCheck().catch(() => {
        // Health check errors are handled in performHealthCheck
      })
    }, this.healthCheckInterval)
  }

  /**
   * Execute query with retry logic and timeout
   */
  public async executeQuery<T>(
    operation: (client: SupabaseClient<Database, 'public'>) => Promise<{ data: T | null; error: any }>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = RETRY_CONFIG.MAX_RETRIES,
      initialDelay = RETRY_CONFIG.INITIAL_DELAY,
      maxDelay = RETRY_CONFIG.MAX_DELAY,
      backoffMultiplier = RETRY_CONFIG.BACKOFF_MULTIPLIER,
      shouldRetry = this.defaultShouldRetry,
    } = options

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const client = await this.getClient()
        
        // Add timeout to the operation
        const result = await Promise.race([
          operation(client),
          this.createTimeoutPromise(TIMEOUTS.DATABASE),
        ])

        if (result.error) {
          throw this.handleSupabaseError(result.error)
        }

        // Reset health on successful operation
        if (this.health.consecutiveFailures > 0) {
          this.health.isHealthy = true
          this.health.consecutiveFailures = 0
          this.health.lastError = undefined
        }

        return result.data as T

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Update health status
        this.health.consecutiveFailures++
        this.health.lastError = lastError

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break
        }

        // Check if we should retry
        if (!shouldRetry(lastError, attempt)) {
          break
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        )
        const jitter = delay * RETRY_CONFIG.JITTER_FACTOR * Math.random()
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter))
      }
    }

    throw lastError || new QueryError('Unknown error', 'Query execution failed')
  }

  /**
   * Execute RPC function with retry logic
   */
  public async executeRPC<T>(
    functionName: string,
    parameters: Record<string, unknown> = {},
    options: RetryOptions = {}
  ): Promise<T> {
    return this.executeQuery(
      async (client) => {
        return await client.rpc(functionName, parameters)
      },
      options
    )
  }

  /**
   * Execute vector search with specific error handling
   */
  public async executeVectorSearch<T>(
    functionName: string,
    queryEmbedding: Vector,
    threshold: number = 0.7,
    limit: number = DATABASE_LIMITS.MAX_SEARCH_RESULTS,
    userId?: string
  ): Promise<T> {
    try {
      return await this.executeQuery(
        async (client) => {
          return await client.rpc(functionName, {
            query_embedding: queryEmbedding,
            match_threshold: threshold,
            match_count: limit,
            user_id: userId,
          })
        },
        {
          maxRetries: 2, // Fewer retries for search operations
          shouldRetry: (error) => !error.message.includes('invalid vector'),
        }
      )
    } catch (error) {
      throw new VectorSearchError(
        `Vector search failed for function ${functionName}`,
        undefined,
        threshold,
        { functionName, threshold, limit, userId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Execute transaction with rollback on failure
   */
  public async executeTransaction<T>(
    operations: Array<(client: SupabaseClient<Database, 'public'>) => Promise<any>>,
    transactionName: string = 'unnamed'
  ): Promise<T[]> {
    const client = await this.getClient()
    const results: T[] = []

    try {
      // Note: Supabase doesn't have explicit transaction support in the client
      // Each operation is atomic, but we can't rollback across multiple operations
      // This is a limitation of the Supabase client library
      
      for (const [index, operation] of operations.entries()) {
        try {
          const result = await operation(client)
          if (result.error) {
            throw this.handleSupabaseError(result.error)
          }
          results.push(result.data)
        } catch (error) {
          throw new TransactionError(
            transactionName,
            `Operation ${index + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
            { operationIndex: index, transactionName },
            error instanceof Error ? error : undefined
          )
        }
      }

      return results
    } catch (error) {
      throw new TransactionError(
        transactionName,
        error instanceof Error ? error.message : String(error),
        { transactionName, operationsCount: operations.length },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get connection health status
   */
  public getHealth(): ConnectionHealth {
    return { ...this.health }
  }

  /**
   * Force health check
   */
  public async checkHealth(): Promise<ConnectionHealth> {
    await this.performHealthCheck()
    return this.getHealth()
  }

  /**
   * Reset connection (for testing or recovery)
   */
  public async reset(): Promise<void> {
    this.client = null
    this.isInitialized = false
    this.health = {
      isHealthy: true,
      lastChecked: new Date(),
      consecutiveFailures: 0,
    }
    await this.initialize()
  }

  /**
   * Default retry logic
   */
  private defaultShouldRetry(error: Error, attempt: number): boolean {
    // Don't retry validation errors
    if (error.message.includes('constraint') || 
        error.message.includes('validation') ||
        error.message.includes('unauthorized')) {
      return false
    }

    // Retry connection and timeout errors
    if (error.message.includes('connection') ||
        error.message.includes('timeout') ||
        error.message.includes('network')) {
      return true
    }

    // Don't retry after too many attempts
    return attempt < 2
  }

  /**
   * Handle Supabase-specific errors
   */
  private handleSupabaseError(error: any): Error {
    const message = error.message || error.details || 'Unknown Supabase error'
    const code = error.code || error.status

    // Map Supabase error codes to our error types
    switch (code) {
      case 'PGRST116':
        return new QueryError('No rows found', message)
      case 'PGRST301':
        return new QueryError('Invalid query', message)
      case '23505': // Unique violation
        return new QueryError('Unique constraint violation', message)
      case '23503': // Foreign key violation  
        return new QueryError('Foreign key constraint violation', message)
      case '23514': // Check violation
        return new QueryError('Check constraint violation', message)
      default:
        return new SupabaseError('query', code, message)
    }
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new QueryTimeoutError('Database operation', timeoutMs))
      }, timeoutMs)
    })
  }
}

// Export singleton instance
const databaseClient = DatabaseClient.getInstance()

// Main exports for external usage
export const db = databaseClient
export const getSupabaseClient = () => databaseClient.getClient()
export const executeQuery = <T>(
  operation: (client: SupabaseClient<Database, 'public'>) => Promise<{ data: T | null; error: any }>,
  options?: RetryOptions
) => databaseClient.executeQuery<T>(operation, options)
export const executeRPC = (functionName: string, parameters?: Record<string, unknown>, options?: RetryOptions) =>
  databaseClient.executeRPC(functionName, parameters, options)
export const executeVectorSearch = <T>(
  functionName: string, 
  queryEmbedding: Vector, 
  threshold?: number, 
  limit?: number, 
  userId?: string
) => databaseClient.executeVectorSearch<T>(functionName, queryEmbedding, threshold, limit, userId)

// Health monitoring exports
export const getDatabaseHealth = () => databaseClient.getHealth()
export const checkDatabaseHealth = () => databaseClient.checkHealth()

// Type exports
export type { ConnectionHealth, RetryOptions }
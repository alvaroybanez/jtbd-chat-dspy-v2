/**
 * JTBD (Jobs-to-be-Done) Service
 * Handles creation, validation, and storage of JTBD statements with embeddings
 */

import { logger, startPerformance, endPerformance } from '../../logger'
import { db } from '../../database/client'
import embeddingService from '../embeddings'
import type { 
  JTBD,
  JTBDInsert, 
  UUID,
  CreateJTBDRequest,
  Vector,
  Database
} from '../../database/types'
import { ValidationError } from '../../errors/base'
import { DatabaseError } from '../../errors/database'
import { ERROR_CODES } from '../../config/constants'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface JTBDCreationResult {
  id: UUID
  statement: string
  context: string | null
  priority: number | null
  embedding_generated: boolean
  created_at: string
}

export interface CreateJTBDOptions {
  userId: UUID
  generateEmbedding?: boolean
}

// Validation constants
const MAX_STATEMENT_LENGTH = 500
const MAX_CONTEXT_LENGTH = 1000
const MIN_PRIORITY = 1
const MAX_PRIORITY = 5

/**
 * JTBD service implementation
 */
class JTBDService {
  /**
   * Create a new JTBD with validation and embedding generation
   */
  async createJTBD(
    request: CreateJTBDRequest,
    options: CreateJTBDOptions
  ): Promise<JTBDCreationResult> {
    const trackingId = startPerformance('jtbd_creation')

    try {
      logger.info('Creating JTBD', {
        userId: options.userId,
        statementLength: request.statement.length,
        hasContext: !!request.context,
        priority: request.priority
      })

      // Step 1: Validate input
      this.validateJTBDInput(request)

      // Step 2: Check for duplicates
      await this.checkDuplicateJTBD(request.statement, options.userId)

      // Step 3: Generate embedding for statement + context
      let embeddingVector: Vector | null = null
      let embeddingGenerated = false

      if (options.generateEmbedding !== false) {
        try {
          const textForEmbedding = request.context 
            ? `${request.statement} ${request.context}` 
            : request.statement

          const embeddingResult = await embeddingService.generateEmbedding(textForEmbedding)
          embeddingVector = embeddingResult.embedding
          embeddingGenerated = true

          logger.info('Embedding generated for JTBD', {
            textLength: textForEmbedding.length,
            embeddingDimensions: embeddingVector.length
          })
        } catch (error) {
          logger.error('Failed to generate embedding for JTBD', {
            error: error instanceof Error ? error.message : String(error),
            userId: options.userId
          })
          // Continue without embedding - not a critical failure
        }
      }

      // Step 4: Prepare database insert
      const jtbdInsert: JTBDInsert = {
        user_id: options.userId,
        statement: request.statement.trim(),
        context: request.context?.trim() || null,
        embedding: embeddingVector || [],
        priority: request.priority || null
      }

      // Step 5: Insert into database
      const insertedJTBD = await db.executeQuery<{
        id: string,
        statement: string,
        context: string | null,
        priority: number | null,
        created_at: string
      }>(
        async (client) => {
          return await client
            .from('jtbds')
            .insert(jtbdInsert)
            .select('id, statement, context, priority, created_at')
            .single()
        }
      )

      if (!insertedJTBD) {
        throw new DatabaseError(
          'Failed to insert JTBD into database'
        )
      }

      logger.info('JTBD created successfully', {
        jtbdId: insertedJTBD.id,
        userId: options.userId,
        embeddingGenerated,
        processingTime: endPerformance(trackingId)
      })

      return {
        id: insertedJTBD.id,
        statement: insertedJTBD.statement,
        context: insertedJTBD.context,
        priority: insertedJTBD.priority,
        embedding_generated: embeddingGenerated,
        created_at: insertedJTBD.created_at
      }

    } catch (error) {
      logger.error('JTBD creation failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: options.userId,
        statement: request.statement
      })

      endPerformance(trackingId)
      throw error
    }
  }

  /**
   * Get JTBD by ID for a specific user
   */
  async getJTBD(id: UUID, userId: UUID): Promise<JTBD | null> {
    try {
      const jtbd = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('jtbds')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single()

          if (error && error.code !== 'PGRST116') { // Not found is ok
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: data as JTBD | null, error: null }
        }
      )

      return jtbd
    } catch (error) {
      logger.error('Failed to retrieve JTBD', {
        error: error instanceof Error ? error.message : String(error),
        jtbdId: id,
        userId
      })
      throw new DatabaseError(
        'Failed to retrieve JTBD'
      )
    }
  }

  /**
   * List JTBDs for a user with pagination
   */
  async listJTBDs(
    userId: UUID, 
    options: { limit?: number; offset?: number } = {}
  ): Promise<JTBD[]> {
    const { limit = 50, offset = 0 } = options

    try {
      const jtbds = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('jtbds')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

          if (error) {
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: data as JTBD[], error: null }
        }
      )

      return jtbds || []
    } catch (error) {
      logger.error('Failed to list JTBDs', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        limit,
        offset
      })
      throw new DatabaseError(
        'Failed to retrieve JTBDs'
      )
    }
  }

  /**
   * Validate JTBD input data
   */
  private validateJTBDInput(request: CreateJTBDRequest): void {
    // Validate statement
    if (!request.statement || typeof request.statement !== 'string') {
      throw new ValidationError(
        'JTBD statement is required and must be a string',
        ERROR_CODES.INVALID_INPUT,
        { field: 'statement', value: request.statement }
      )
    }

    const trimmedStatement = request.statement.trim()
    if (trimmedStatement.length === 0) {
      throw new ValidationError(
        'JTBD statement cannot be empty',
        ERROR_CODES.INVALID_INPUT,
        { field: 'statement' }
      )
    }

    if (trimmedStatement.length > MAX_STATEMENT_LENGTH) {
      throw new ValidationError(
        `JTBD statement cannot exceed ${MAX_STATEMENT_LENGTH} characters`,
        ERROR_CODES.INVALID_INPUT,
        { 
          field: 'statement', 
          currentLength: trimmedStatement.length,
          maxLength: MAX_STATEMENT_LENGTH 
        }
      )
    }

    // Validate context if provided
    if (request.context !== undefined && request.context !== null) {
      if (typeof request.context !== 'string') {
        throw new ValidationError(
          'JTBD context must be a string',
          ERROR_CODES.INVALID_INPUT,
          { field: 'context', value: request.context }
        )
      }

      const trimmedContext = request.context.trim()
      if (trimmedContext.length > MAX_CONTEXT_LENGTH) {
        throw new ValidationError(
          `JTBD context cannot exceed ${MAX_CONTEXT_LENGTH} characters`,
          ERROR_CODES.INVALID_INPUT,
          { 
            field: 'context', 
            currentLength: trimmedContext.length,
            maxLength: MAX_CONTEXT_LENGTH 
          }
        )
      }
    }

    // Validate priority if provided
    if (request.priority !== undefined && request.priority !== null) {
      if (!Number.isInteger(request.priority) || 
          request.priority < MIN_PRIORITY || 
          request.priority > MAX_PRIORITY) {
        throw new ValidationError(
          `JTBD priority must be an integer between ${MIN_PRIORITY} and ${MAX_PRIORITY}`,
          ERROR_CODES.INVALID_INPUT,
          { 
            field: 'priority', 
            value: request.priority,
            validRange: `${MIN_PRIORITY}-${MAX_PRIORITY}`
          }
        )
      }
    }
  }

  /**
   * Check for duplicate JTBD statements for the same user
   */
  private async checkDuplicateJTBD(statement: string, userId: UUID): Promise<void> {
    try {
      const existingJTBD = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('jtbds')
            .select('id')
            .eq('user_id', userId)
            .ilike('statement', statement.trim())
            .maybeSingle()

          if (error && error.code !== 'PGRST116') { // Not found is ok
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: data as { id: UUID } | null, error: null }
        }
      )

      if (existingJTBD) {
        throw new ValidationError(
          'A JTBD with this statement already exists for this user',
          ERROR_CODES.DUPLICATE_ENTRY,
          { 
            userId, 
            statement: statement.trim(),
            existingId: existingJTBD.id
          }
        )
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error // Re-throw validation errors
      }

      logger.error('Error checking for duplicate JTBD', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        statement
      })

      // Don't fail creation for database check errors
      logger.warn('Skipping duplicate check due to database error', { userId })
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: string }> {
    try {
      // Test database connectivity
      const testResult = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('jtbds')
            .select('count')
            .limit(1)

          if (error) {
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: { test: 1 }, error: null }
        }
      )
      
      if (testResult) {
        return { status: 'healthy', details: 'JTBD service operational' }
      } else {
        return { status: 'unhealthy', details: 'Database connectivity issue' }
      }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

// Export singleton instance
const jtbdService = new JTBDService()
export default jtbdService
/**
 * Metrics Service
 * Handles creation, validation, and storage of user-defined metrics
 */

import { logger, startPerformance, endPerformance } from '../../logger'
import { db } from '../../database/client'
import type { 
  Metric,
  MetricInsert, 
  UUID,
  CreateMetricRequest,
  Database
} from '../../database/types'
import { ValidationError } from '../../errors/base'
import { DatabaseError } from '../../errors/database'
import { ERROR_CODES } from '../../config/constants'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MetricCreationResult {
  id: UUID
  name: string
  description: string | null
  current_value: number | null
  target_value: number | null
  unit: string
  created_at: string
}

export interface CreateMetricOptions {
  userId: UUID
}

// Validation constants
const MAX_NAME_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 500
const MAX_UNIT_LENGTH = 50

/**
 * Metrics service implementation
 */
class MetricsService {
  /**
   * Create a new metric with validation
   */
  async createMetric(
    request: CreateMetricRequest,
    options: CreateMetricOptions
  ): Promise<MetricCreationResult> {
    const trackingId = startPerformance('metric_creation')

    try {
      logger.info('Creating metric', {
        userId: options.userId,
        name: request.name,
        unit: request.unit,
        hasDescription: !!request.description,
        hasCurrentValue: request.current_value !== undefined,
        hasTargetValue: request.target_value !== undefined
      })

      // Step 1: Validate input
      this.validateMetricInput(request)

      // Step 2: Check for duplicates (name must be unique per user)
      await this.checkDuplicateMetric(request.name, options.userId)

      // Step 3: Prepare database insert
      const metricInsert: MetricInsert = {
        user_id: options.userId,
        name: request.name.trim(),
        description: request.description?.trim() || null,
        current_value: request.current_value || null,
        target_value: request.target_value || null,
        unit: request.unit.trim()
      }

      // Step 4: Insert into database
      const insertedMetric = await db.executeQuery<{
        id: string,
        name: string,
        description: string | null,
        current_value: number | null,
        target_value: number | null,
        unit: string,
        created_at: string
      }>(
        async (client) => {
          return await client
            .from('metrics')
            .insert(metricInsert)
            .select('id, name, description, current_value, target_value, unit, created_at')
            .single()
        }
      )

      if (!insertedMetric) {
        throw new DatabaseError(
          'Failed to insert metric into database'
        )
      }

      logger.info('Metric created successfully', {
        metricId: insertedMetric.id,
        userId: options.userId,
        processingTime: endPerformance(trackingId)
      })

      return {
        id: insertedMetric.id,
        name: insertedMetric.name,
        description: insertedMetric.description,
        current_value: insertedMetric.current_value,
        target_value: insertedMetric.target_value,
        unit: insertedMetric.unit,
        created_at: insertedMetric.created_at
      }

    } catch (error) {
      logger.error('Metric creation failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: options.userId,
        name: request.name
      })

      endPerformance(trackingId)
      throw error
    }
  }

  /**
   * Get metric by ID for a specific user
   */
  async getMetric(id: UUID, userId: UUID): Promise<Metric | null> {
    try {
      const metric = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('metrics')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single()

          if (error && error.code !== 'PGRST116') { // Not found is ok
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: data as Metric | null, error: null }
        }
      )

      return metric
    } catch (error) {
      logger.error('Failed to retrieve metric', {
        error: error instanceof Error ? error.message : String(error),
        metricId: id,
        userId
      })
      throw new DatabaseError(
        'Failed to retrieve metric'
      )
    }
  }

  /**
   * List metrics for a user with pagination
   */
  async listMetrics(
    userId: UUID, 
    options: { limit?: number; offset?: number } = {}
  ): Promise<Metric[]> {
    const { limit = 50, offset = 0 } = options

    try {
      const metrics = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('metrics')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

          if (error) {
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: data as Metric[], error: null }
        }
      )

      return metrics || []
    } catch (error) {
      logger.error('Failed to list metrics', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        limit,
        offset
      })
      throw new DatabaseError(
        'Failed to retrieve metrics'
      )
    }
  }

  /**
   * Validate metric input data
   */
  private validateMetricInput(request: CreateMetricRequest): void {
    // Validate name (required)
    if (!request.name || typeof request.name !== 'string') {
      throw new ValidationError(
        'Metric name is required and must be a string',
        ERROR_CODES.INVALID_INPUT,
        { field: 'name', value: request.name }
      )
    }

    const trimmedName = request.name.trim()
    if (trimmedName.length === 0) {
      throw new ValidationError(
        'Metric name cannot be empty',
        ERROR_CODES.INVALID_INPUT,
        { field: 'name' }
      )
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(
        `Metric name cannot exceed ${MAX_NAME_LENGTH} characters`,
        ERROR_CODES.INVALID_INPUT,
        { 
          field: 'name', 
          currentLength: trimmedName.length,
          maxLength: MAX_NAME_LENGTH 
        }
      )
    }

    // Validate unit (required)
    if (!request.unit || typeof request.unit !== 'string') {
      throw new ValidationError(
        'Metric unit is required and must be a string',
        ERROR_CODES.INVALID_INPUT,
        { field: 'unit', value: request.unit }
      )
    }

    const trimmedUnit = request.unit.trim()
    if (trimmedUnit.length === 0) {
      throw new ValidationError(
        'Metric unit cannot be empty',
        ERROR_CODES.INVALID_INPUT,
        { field: 'unit' }
      )
    }

    if (trimmedUnit.length > MAX_UNIT_LENGTH) {
      throw new ValidationError(
        `Metric unit cannot exceed ${MAX_UNIT_LENGTH} characters`,
        ERROR_CODES.INVALID_INPUT,
        { 
          field: 'unit', 
          currentLength: trimmedUnit.length,
          maxLength: MAX_UNIT_LENGTH 
        }
      )
    }

    // Validate description if provided
    if (request.description !== undefined && request.description !== null) {
      if (typeof request.description !== 'string') {
        throw new ValidationError(
          'Metric description must be a string',
          ERROR_CODES.INVALID_INPUT,
          { field: 'description', value: request.description }
        )
      }

      const trimmedDescription = request.description.trim()
      if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
        throw new ValidationError(
          `Metric description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
          ERROR_CODES.INVALID_INPUT,
          { 
            field: 'description', 
            currentLength: trimmedDescription.length,
            maxLength: MAX_DESCRIPTION_LENGTH 
          }
        )
      }
    }

    // Validate current_value if provided
    if (request.current_value !== undefined && request.current_value !== null) {
      if (typeof request.current_value !== 'number' || !isFinite(request.current_value)) {
        throw new ValidationError(
          'Metric current_value must be a finite number',
          ERROR_CODES.INVALID_INPUT,
          { field: 'current_value', value: request.current_value }
        )
      }

      // Check decimal precision (database stores decimal(12,2))
      const decimalParts = String(Math.abs(request.current_value)).split('.')
      if (decimalParts.length > 1 && decimalParts[1].length > 2) {
        throw new ValidationError(
          'Metric current_value cannot have more than 2 decimal places',
          ERROR_CODES.INVALID_INPUT,
          { field: 'current_value', value: request.current_value, maxDecimals: 2 }
        )
      }
    }

    // Validate target_value if provided
    if (request.target_value !== undefined && request.target_value !== null) {
      if (typeof request.target_value !== 'number' || !isFinite(request.target_value)) {
        throw new ValidationError(
          'Metric target_value must be a finite number',
          ERROR_CODES.INVALID_INPUT,
          { field: 'target_value', value: request.target_value }
        )
      }

      // Check decimal precision (database stores decimal(12,2))
      const decimalParts = String(Math.abs(request.target_value)).split('.')
      if (decimalParts.length > 1 && decimalParts[1].length > 2) {
        throw new ValidationError(
          'Metric target_value cannot have more than 2 decimal places',
          ERROR_CODES.INVALID_INPUT,
          { field: 'target_value', value: request.target_value, maxDecimals: 2 }
        )
      }
    }
  }

  /**
   * Check for duplicate metric names for the same user
   */
  private async checkDuplicateMetric(name: string, userId: UUID): Promise<void> {
    try {
      const existingMetric = await db.executeQuery(
        async (client: SupabaseClient<Database>) => {
          const { data, error } = await client
            .from('metrics')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', name.trim())
            .maybeSingle()

          if (error && error.code !== 'PGRST116') { // Not found is ok
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: data as { id: UUID } | null, error: null }
        }
      )

      if (existingMetric) {
        throw new ValidationError(
          'A metric with this name already exists for this user',
          ERROR_CODES.DUPLICATE_ENTRY,
          { 
            userId, 
            name: name.trim(),
            existingId: existingMetric.id
          }
        )
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error // Re-throw validation errors
      }

      logger.error('Error checking for duplicate metric', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        name
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
            .from('metrics')
            .select('count')
            .limit(1)

          if (error) {
            throw new Error(`Database query failed: ${error.message}`)
          }

          return { data: { test: 1 }, error: null }
        }
      )
      
      if (testResult) {
        return { status: 'healthy', details: 'Metrics service operational' }
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
const metricsService = new MetricsService()
export default metricsService
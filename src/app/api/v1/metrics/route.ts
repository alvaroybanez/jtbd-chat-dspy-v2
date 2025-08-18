/**
 * Metrics Creation API Endpoint
 * POST /api/v1/metrics - Handle metric creation with validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import metricsService from '@/lib/services/metrics'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { UUID, CreateMetricRequest } from '@/lib/database/types'

// Response interface matching API documentation
interface MetricCreationResponse {
  id: UUID
  name: string
  description: string | null
  current_value: number | null
  target_value: number | null
  unit: string
  created_at: string
}

// Custom validation for decimal precision (max 2 decimal places)
const decimalSchema = z
  .number()
  .finite('Value must be a finite number')
  .refine((val) => {
    const decimalParts = String(Math.abs(val)).split('.')
    return decimalParts.length <= 1 || decimalParts[1].length <= 2
  }, 'Value cannot have more than 2 decimal places')

// Request validation schema
const createMetricSchema = z.object({
  name: z
    .string()
    .min(1, 'Metric name is required')
    .max(100, 'Metric name cannot exceed 100 characters')
    .transform(s => s.trim()),
  description: z
    .string()
    .max(500, 'Metric description cannot exceed 500 characters')
    .transform(s => s.trim())
    .optional()
    .nullable(),
  current_value: decimalSchema
    .optional()
    .nullable(),
  target_value: decimalSchema
    .optional()
    .nullable(),
  unit: z
    .string()
    .min(1, 'Metric unit is required')
    .max(50, 'Metric unit cannot exceed 50 characters')
    .transform(s => s.trim()),
  user_id: z
    .string()
    .uuid('Invalid user ID format')
    .optional() // Can come from header
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('Metric creation request received', {
      url: request.url,
      method: request.method,
      contentType: request.headers.get('content-type')
    })

    // Step 1: Validate content type
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new ValidationError(
        'Content-Type must be application/json for metric creation',
        ERROR_CODES.INVALID_INPUT,
        { 
          receivedContentType: contentType,
          expectedContentType: 'application/json'
        }
      )
    }

    // Step 2: Parse and validate request body
    let requestBody: any
    try {
      requestBody = await request.json()
    } catch (error) {
      throw new ValidationError(
        'Invalid JSON in request body',
        ERROR_CODES.INVALID_INPUT,
        { error: error instanceof Error ? error.message : String(error) }
      )
    }

    // Extract user_id from body or header
    const userId = requestBody.user_id || request.headers.get('x-user-id')
    if (!userId) {
      throw new ValidationError(
        'User ID is required (provide in request body or x-user-id header)',
        ERROR_CODES.INVALID_INPUT,
        { field: 'user_id' }
      )
    }

    // Validate the complete request
    const validatedData = createMetricSchema.parse({
      ...requestBody,
      user_id: userId
    })

    logger.info('Request validated successfully', {
      userId: validatedData.user_id,
      name: validatedData.name,
      unit: validatedData.unit,
      hasDescription: !!validatedData.description,
      hasCurrentValue: validatedData.current_value !== undefined,
      hasTargetValue: validatedData.target_value !== undefined
    })

    // Step 3: Prepare metric request
    const metricRequest: CreateMetricRequest = {
      name: validatedData.name,
      description: validatedData.description || undefined,
      current_value: validatedData.current_value || undefined,
      target_value: validatedData.target_value || undefined,
      unit: validatedData.unit
    }

    // Step 4: Create metric using service
    const result = await metricsService.createMetric(
      metricRequest,
      {
        userId: validatedData.user_id as UUID
      }
    )

    // Step 5: Format and return response
    const response: MetricCreationResponse = {
      id: result.id,
      name: result.name,
      description: result.description,
      current_value: result.current_value,
      target_value: result.target_value,
      unit: result.unit,
      created_at: result.created_at
    }

    logger.info('Metric created successfully', {
      metricId: response.id,
      userId: validatedData.user_id,
      name: response.name,
      unit: response.unit,
      hasCurrentValue: response.current_value !== null,
      hasTargetValue: response.target_value !== null
    })

    return NextResponse.json(response, { 
      status: HTTP_STATUS.CREATED,
      headers: {
        'Content-Type': 'application/json',
        'X-Metric-ID': response.id
      }
    })

  } catch (error) {
    logger.error('Metric creation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// Handle GET requests for metric listing (future feature)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'User ID is required (provide x-user-id header)',
          action: 'NONE'
        },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    // Extract query parameters
    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

    logger.info('Metric list request received', {
      userId,
      limit,
      offset
    })

    // Get metrics for user
    const metrics = await metricsService.listMetrics(userId as UUID, { limit, offset })

    const response = {
      metrics: metrics.map(metric => ({
        id: metric.id,
        name: metric.name,
        description: metric.description,
        current_value: metric.current_value,
        target_value: metric.target_value,
        unit: metric.unit,
        created_at: metric.created_at,
        updated_at: metric.updated_at
      })),
      pagination: {
        limit,
        offset,
        count: metrics.length
      }
    }

    logger.info('Metric list retrieved successfully', {
      userId,
      count: metrics.length,
      limit,
      offset
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('Metric listing failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// Handle unsupported methods
export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PUT method not supported. Use POST to create metrics.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'DELETE method not supported. Use POST to create metrics.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PATCH method not supported. Use POST to create metrics.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
/**
 * JTBD Creation API Endpoint
 * POST /api/v1/jtbds - Handle JTBD creation with validation and embeddings
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import jtbdService from '@/lib/services/jtbd'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { UUID, CreateJTBDRequest } from '@/lib/database/types'

// Response interface matching API documentation
interface JTBDCreationResponse {
  id: UUID
  statement: string
  context: string | null
  priority: number | null
  embedding_generated: boolean
  created_at: string
}

// Request validation schema
const createJTBDSchema = z.object({
  statement: z
    .string()
    .min(1, 'JTBD statement is required')
    .max(500, 'JTBD statement cannot exceed 500 characters')
    .transform(s => s.trim()),
  context: z
    .string()
    .max(1000, 'JTBD context cannot exceed 1000 characters')
    .transform(s => s.trim())
    .optional()
    .nullable(),
  priority: z
    .number()
    .int('Priority must be an integer')
    .min(1, 'Priority must be at least 1')
    .max(5, 'Priority must be at most 5')
    .optional()
    .nullable(),
  user_id: z
    .string()
    .uuid('Invalid user ID format')
    .optional(), // Can come from header
  generate_embedding: z
    .boolean()
    .optional()
    .default(true)
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('JTBD creation request received', {
      url: request.url,
      method: request.method,
      contentType: request.headers.get('content-type')
    })

    // Step 1: Validate content type
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new ValidationError(
        'Content-Type must be application/json for JTBD creation',
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
    const validatedData = createJTBDSchema.parse({
      ...requestBody,
      user_id: userId
    })

    logger.info('Request validated successfully', {
      userId: validatedData.user_id,
      statementLength: validatedData.statement.length,
      hasContext: !!validatedData.context,
      priority: validatedData.priority,
      generateEmbedding: validatedData.generate_embedding
    })

    // Step 3: Prepare JTBD request
    const jtbdRequest: CreateJTBDRequest = {
      statement: validatedData.statement,
      context: validatedData.context || undefined,
      priority: validatedData.priority || undefined
    }

    // Step 4: Create JTBD using service
    const result = await jtbdService.createJTBD(
      jtbdRequest,
      {
        userId: validatedData.user_id as UUID,
        generateEmbedding: validatedData.generate_embedding
      }
    )

    // Step 5: Format and return response
    const response: JTBDCreationResponse = {
      id: result.id,
      statement: result.statement,
      context: result.context,
      priority: result.priority,
      embedding_generated: result.embedding_generated,
      created_at: result.created_at
    }

    logger.info('JTBD created successfully', {
      jtbdId: response.id,
      userId: validatedData.user_id,
      statement: response.statement,
      embeddingGenerated: response.embedding_generated,
      priority: response.priority
    })

    return NextResponse.json(response, { 
      status: HTTP_STATUS.CREATED,
      headers: {
        'Content-Type': 'application/json',
        'X-JTBD-ID': response.id
      }
    })

  } catch (error) {
    logger.error('JTBD creation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// Handle GET requests for JTBD listing (future feature)
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

    logger.info('JTBD list request received', {
      userId,
      limit,
      offset
    })

    // Get JTBDs for user
    const jtbds = await jtbdService.listJTBDs(userId as UUID, { limit, offset })

    const response = {
      jtbds: jtbds.map(jtbd => ({
        id: jtbd.id,
        statement: jtbd.statement,
        context: jtbd.context,
        priority: jtbd.priority,
        created_at: jtbd.created_at,
        updated_at: jtbd.updated_at
      })),
      pagination: {
        limit,
        offset,
        count: jtbds.length
      }
    }

    logger.info('JTBD list retrieved successfully', {
      userId,
      count: jtbds.length,
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
    logger.error('JTBD listing failed', {
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
      message: 'PUT method not supported. Use POST to create JTBDs.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'DELETE method not supported. Use POST to create JTBDs.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PATCH method not supported. Use POST to create JTBDs.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
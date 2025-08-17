/**
 * Document Upload API Endpoint
 * POST /api/v1/upload - Handle file uploads with processing and storage
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { fileParser } from '@/lib/services/document-upload/file-parser'
import documentUploadService from '@/lib/services/document-upload'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { UUID } from '@/lib/database/types'

// Response interface matching API documentation
interface UploadResponse {
  document_id: UUID
  filename: string
  chunks_created: number
  insights_generated: number
  processing_time?: number
  success: true
}

// Request validation schema
const uploadRequestSchema = z.object({
  user_id: z.string().uuid('Invalid user ID format'),
  generate_insights: z.boolean().optional().default(true),
  generate_embeddings: z.boolean().optional().default(true)
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('Document upload request received', {
      url: request.url,
      method: request.method,
      contentType: request.headers.get('content-type')
    })

    // Step 1: Validate content type
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      throw new ValidationError(
        'Content-Type must be multipart/form-data for file uploads',
        ERROR_CODES.INVALID_INPUT,
        { 
          receivedContentType: contentType,
          expectedContentType: 'multipart/form-data'
        }
      )
    }

    // Step 2: Parse and validate request data
    const formData = await request.formData()
    
    // Extract user_id and options from form data or headers
    const userId = formData.get('user_id') as string || request.headers.get('x-user-id')
    const generateInsights = formData.get('generate_insights') !== 'false'
    const generateEmbeddings = formData.get('generate_embeddings') !== 'false'

    if (!userId) {
      throw new ValidationError(
        'User ID is required (provide via form data or x-user-id header)',
        ERROR_CODES.INVALID_INPUT,
        { field: 'user_id' }
      )
    }

    // Validate the request data
    const validatedData = uploadRequestSchema.parse({
      user_id: userId,
      generate_insights: generateInsights,
      generate_embeddings: generateEmbeddings
    })

    // Step 3: Parse and validate uploaded file
    const parsedFile = await fileParser.parseUploadedFile(request)

    logger.info('File parsed successfully', {
      filename: parsedFile.filename,
      fileSize: parsedFile.fileSize,
      fileType: parsedFile.fileType,
      userId: validatedData.user_id
    })

    // Step 4: Upload and process the document
    const uploadResult = await documentUploadService.uploadDocument(
      parsedFile,
      {
        userId: validatedData.user_id as UUID,
        generateInsights: validatedData.generate_insights,
        generateEmbeddings: validatedData.generate_embeddings
      }
    )

    // Step 5: Format and return response
    const response: UploadResponse = {
      document_id: uploadResult.documentId,
      filename: uploadResult.filename,
      chunks_created: uploadResult.chunksCreated,
      insights_generated: uploadResult.insightsGenerated,
      processing_time: uploadResult.processingTime,
      success: true
    }

    logger.info('Document upload completed successfully', {
      documentId: response.document_id,
      filename: response.filename,
      chunksCreated: response.chunks_created,
      insightsGenerated: response.insights_generated,
      processingTime: response.processing_time
    })

    return NextResponse.json(response, { 
      status: HTTP_STATUS.CREATED,
      headers: {
        'Content-Type': 'application/json',
        'X-Document-ID': response.document_id
      }
    })

  } catch (error) {
    logger.error('Document upload failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// Handle unsupported methods
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'GET method not supported. Use POST to upload documents.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PUT method not supported. Use POST to upload documents.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'DELETE method not supported. Use POST to upload documents.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PATCH method not supported. Use POST to upload documents.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
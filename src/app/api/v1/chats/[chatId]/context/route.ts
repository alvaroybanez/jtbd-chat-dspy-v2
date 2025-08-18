/**
 * Chat Context Update API Endpoint
 * POST /api/v1/chats/[chatId]/context - Update chat context with advanced context management
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatSessionManager, contextManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { 
  UUID, 
  ContextItemType, 
  BulkContextOperation, 
  ContextSelectionCriteria 
} from '@/lib/services/chat'

// ===== REQUEST/RESPONSE INTERFACES =====

interface ContextUpdateRequest {
  operation: 'add' | 'remove' | 'replace' | 'bulk'
  
  // Single operation fields
  itemType?: ContextItemType
  itemId?: string
  
  // Bulk operations
  operations?: Array<{
    type: 'add' | 'remove'
    itemType: ContextItemType
    itemId: string
  }>
  
  // Replace operation (sets entire context)
  context?: {
    selectedDocumentIds?: string[]
    selectedInsightIds?: string[]
    selectedJtbdIds?: string[]
    selectedMetricIds?: string[]
  }
  
  // Metadata
  metadata?: Record<string, unknown>
  user_id?: string // Can come from header
}

interface ContextUpdateResponse {
  chatId: string
  operation: string
  success: boolean
  affectedItems: number
  newState: {
    documents: Array<{
      id: string
      type: 'document'
      title: string
      content: string
      addedAt: string
      lastUsedAt?: string
    }>
    insights: Array<{
      id: string
      type: 'insight'
      title: string
      content: string
      addedAt: string
      lastUsedAt?: string
    }>
    jtbds: Array<{
      id: string
      type: 'jtbd'
      title: string
      content: string
      addedAt: string
      lastUsedAt?: string
    }>
    metrics: Array<{
      id: string
      type: 'metric'
      title: string
      content: string
      addedAt: string
      lastUsedAt?: string
    }>
    totalItems: number
    lastUpdated: string
  }
  warnings?: string[]
  processingTimeMs: number
}

// ===== VALIDATION SCHEMAS =====

const chatIdParamsSchema = z.object({
  chatId: z.string().uuid('Invalid chat ID format')
})

const contextUpdateSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace', 'bulk']),
  
  // Single operation fields
  itemType: z.enum(['document', 'insight', 'jtbd', 'metric']).optional(),
  itemId: z.string().uuid('Invalid item ID format').optional(),
  
  // Bulk operations
  operations: z.array(z.object({
    type: z.enum(['add', 'remove']),
    itemType: z.enum(['document', 'insight', 'jtbd', 'metric']),
    itemId: z.string().uuid('Invalid item ID format')
  })).optional(),
  
  // Replace operation
  context: z.object({
    selectedDocumentIds: z.array(z.string().uuid()).optional(),
    selectedInsightIds: z.array(z.string().uuid()).optional(),
    selectedJtbdIds: z.array(z.string().uuid()).optional(),
    selectedMetricIds: z.array(z.string().uuid()).optional(),
  }).optional(),
  
  // Metadata
  metadata: z.record(z.unknown()).optional(),
  user_id: z.string().uuid('Invalid user ID format').optional()
})

// ===== POST /api/v1/chats/[chatId]/context - Update chat context =====

export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } }
): Promise<NextResponse> {
  const startTime = Date.now()
  
  try {
    logger.info('Chat context update request received', {
      url: request.url,
      method: request.method,
      chatId: params.chatId,
      contentType: request.headers.get('content-type')
    })

    // Step 1: Validate chat ID parameter
    const { chatId } = chatIdParamsSchema.parse(params)

    // Step 2: Validate content type
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new ValidationError(
        'Content-Type must be application/json for context updates',
        ERROR_CODES.INVALID_INPUT,
        { 
          receivedContentType: contentType,
          expectedContentType: 'application/json'
        }
      )
    }

    // Step 3: Parse and validate request body
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
    const validatedData = contextUpdateSchema.parse({
      ...requestBody,
      user_id: userId
    })

    logger.info('Context update request validated', {
      chatId,
      userId: validatedData.user_id,
      operation: validatedData.operation
    })

    // Step 4: Verify chat exists and user has access
    try {
      await chatSessionManager.loadChat(chatId as UUID, validatedData.user_id as UUID)
    } catch (error) {
      throw error
    }

    // Step 5: Perform the context operation based on type
    let result
    let affectedItems = 0
    
    switch (validatedData.operation) {
      case 'add': {
        if (!validatedData.itemType || !validatedData.itemId) {
          throw new ValidationError(
            'itemType and itemId are required for add operation',
            ERROR_CODES.INVALID_INPUT,
            { missingFields: ['itemType', 'itemId'] }
          )
        }
        
        const criteria: ContextSelectionCriteria = {
          itemType: validatedData.itemType as ContextItemType,
          itemId: validatedData.itemId as UUID,
          userId: validatedData.user_id as UUID,
          metadata: validatedData.metadata
        }
        
        result = await contextManager.addToContext(chatId as UUID, criteria)
        affectedItems = result.affectedItems
        break
      }
      
      case 'remove': {
        if (!validatedData.itemType || !validatedData.itemId) {
          throw new ValidationError(
            'itemType and itemId are required for remove operation',
            ERROR_CODES.INVALID_INPUT,
            { missingFields: ['itemType', 'itemId'] }
          )
        }
        
        result = await contextManager.removeFromContext(
          chatId as UUID,
          validatedData.itemType as ContextItemType,
          validatedData.itemId as UUID,
          validatedData.user_id as UUID
        )
        affectedItems = result.affectedItems
        break
      }
      
      case 'bulk': {
        if (!validatedData.operations || validatedData.operations.length === 0) {
          throw new ValidationError(
            'operations array is required and cannot be empty for bulk operation',
            ERROR_CODES.INVALID_INPUT,
            { providedOperations: validatedData.operations }
          )
        }
        
        const bulkOperation: BulkContextOperation = {
          operations: validatedData.operations.map(op => ({
            type: op.type,
            itemType: op.itemType as ContextItemType,
            itemId: op.itemId as UUID
          })),
          chatId: chatId as UUID,
          userId: validatedData.user_id as UUID,
          metadata: validatedData.metadata
        }
        
        result = await contextManager.addMultipleToContext(bulkOperation)
        affectedItems = result.affectedItems
        break
      }
      
      case 'replace': {
        if (!validatedData.context) {
          throw new ValidationError(
            'context object is required for replace operation',
            ERROR_CODES.INVALID_INPUT,
            { providedContext: validatedData.context }
          )
        }
        
        // Clear existing context first
        await contextManager.clearContext(chatId as UUID, validatedData.user_id as UUID)
        
        // Add new context items
        const contextItems = [
          ...(validatedData.context.selectedDocumentIds || []).map(id => ({ type: 'document' as ContextItemType, id })),
          ...(validatedData.context.selectedInsightIds || []).map(id => ({ type: 'insight' as ContextItemType, id })),
          ...(validatedData.context.selectedJtbdIds || []).map(id => ({ type: 'jtbd' as ContextItemType, id })),
          ...(validatedData.context.selectedMetricIds || []).map(id => ({ type: 'metric' as ContextItemType, id }))
        ]
        
        if (contextItems.length > 0) {
          const bulkOperation: BulkContextOperation = {
            operations: contextItems.map(item => ({
              type: 'add',
              itemType: item.type,
              itemId: item.id as UUID
            })),
            chatId: chatId as UUID,
            userId: validatedData.user_id as UUID,
            metadata: validatedData.metadata
          }
          
          result = await contextManager.addMultipleToContext(bulkOperation)
        } else {
          // Context was just cleared, load the empty state
          const contextState = await contextManager.getChatContext(
            chatId as UUID,
            validatedData.user_id as UUID
          )
          result = {
            success: true,
            operation: { type: 'replace', chatId, userId: validatedData.user_id, timestamp: new Date().toISOString() },
            affectedItems: 0,
            newState: contextState,
            warnings: []
          }
        }
        
        affectedItems = result.affectedItems
        break
      }
    }

    // Step 6: Calculate processing time
    const processingTimeMs = Date.now() - startTime

    // Step 7: Format response
    const response: ContextUpdateResponse = {
      chatId,
      operation: validatedData.operation,
      success: result.success,
      affectedItems,
      newState: {
        documents: result.newState.documents.map(item => ({
          id: item.id,
          type: 'document' as const,
          title: item.title,
          content: item.content,
          addedAt: item.addedAt,
          lastUsedAt: item.lastUsedAt
        })),
        insights: result.newState.insights.map(item => ({
          id: item.id,
          type: 'insight' as const,
          title: item.title,
          content: item.content,
          addedAt: item.addedAt,
          lastUsedAt: item.lastUsedAt
        })),
        jtbds: result.newState.jtbds.map(item => ({
          id: item.id,
          type: 'jtbd' as const,
          title: item.title,
          content: item.content,
          addedAt: item.addedAt,
          lastUsedAt: item.lastUsedAt
        })),
        metrics: result.newState.metrics.map(item => ({
          id: item.id,
          type: 'metric' as const,
          title: item.title,
          content: item.content,
          addedAt: item.addedAt,
          lastUsedAt: item.lastUsedAt
        })),
        totalItems: result.newState.totalItems,
        lastUpdated: result.newState.lastUpdated
      },
      warnings: result.warnings,
      processingTimeMs
    }

    logger.info('Context update completed successfully', {
      chatId,
      userId: validatedData.user_id,
      operation: validatedData.operation,
      affectedItems,
      totalItems: response.newState.totalItems,
      processingTimeMs,
      warnings: response.warnings?.length || 0
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    const processingTimeMs = Date.now() - startTime
    
    logger.error('Context update failed', {
      chatId: params.chatId,
      processingTimeMs,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// ===== UNSUPPORTED METHODS =====

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'GET method not supported. Use GET /api/v1/chats/[chatId] to retrieve chat with context.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PUT method not supported. Use POST to update context.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PATCH method not supported. Use POST to update context.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'DELETE method not supported. Use POST with operation: "remove" or "replace" to remove context items.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
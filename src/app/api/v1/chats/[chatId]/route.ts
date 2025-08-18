/**
 * Chat History API Endpoints - Chat-Specific Routes
 * GET /api/v1/chats/[chatId] - Retrieve specific chat session
 * PATCH /api/v1/chats/[chatId] - Update chat (title, context)
 * DELETE /api/v1/chats/[chatId] - Archive/soft-delete chat
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatSessionManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { UUID, ChatContext } from '@/lib/services/chat'

// ===== RESPONSE INTERFACES =====

interface ChatRetrieveResponse {
  id: string
  title: string
  status: 'active' | 'archived' | 'deleted'
  messageCount: number
  totalTokensUsed: number
  lastMessageAt: string | null
  selectedDocumentIds: string[]
  selectedInsightIds: string[]
  selectedJtbdIds: string[]
  selectedMetricIds: string[]
  createdAt: string
  updatedAt: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    intent?: string
    processingTimeMs?: number
    tokensUsed?: number
    createdAt: string
    updatedAt: string
  }>
}

interface ChatUpdateRequest {
  title?: string
  context?: {
    selectedDocumentIds?: string[]
    selectedInsightIds?: string[]
    selectedJtbdIds?: string[]
    selectedMetricIds?: string[]
  }
  user_id?: string // Can come from header
}

interface ChatUpdateResponse {
  id: string
  title: string
  status: 'active' | 'archived' | 'deleted'
  messageCount: number
  totalTokensUsed: number
  selectedDocumentIds: string[]
  selectedInsightIds: string[]
  selectedJtbdIds: string[]
  selectedMetricIds: string[]
  updatedAt: string
  updated: {
    title: boolean
    context: boolean
  }
}

interface ChatArchiveResponse {
  id: string
  status: 'archived'
  archivedAt: string
}

// ===== VALIDATION SCHEMAS =====

const chatIdParamsSchema = z.object({
  chatId: z.string().uuid('Invalid chat ID format')
})

const updateChatSchema = z.object({
  title: z
    .string()
    .max(100, 'Chat title cannot exceed 100 characters')
    .transform(s => s.trim())
    .optional(),
  context: z.object({
    selectedDocumentIds: z.array(z.string().uuid()).optional(),
    selectedInsightIds: z.array(z.string().uuid()).optional(),
    selectedJtbdIds: z.array(z.string().uuid()).optional(),
    selectedMetricIds: z.array(z.string().uuid()).optional(),
  }).optional(),
  user_id: z
    .string()
    .uuid('Invalid user ID format')
    .optional(), // Can come from header
})

// ===== GET /api/v1/chats/[chatId] - Retrieve specific chat session =====

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
): Promise<NextResponse> {
  try {
    logger.info('Chat retrieval request received', {
      url: request.url,
      method: request.method,
      chatId: params.chatId
    })

    // Step 1: Validate chat ID parameter
    const { chatId } = chatIdParamsSchema.parse(params)

    // Step 2: Get user ID from header
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      throw new ValidationError(
        'User ID is required (provide x-user-id header)',
        ERROR_CODES.INVALID_INPUT,
        { field: 'user_id' }
      )
    }

    logger.info('Chat retrieval parameters validated', {
      chatId,
      userId
    })

    // Step 3: Load chat using session manager
    const chat = await chatSessionManager.loadChat(chatId as UUID, userId as UUID)

    // Step 4: Format response
    const response: ChatRetrieveResponse = {
      id: chat.id,
      title: chat.title,
      status: chat.status,
      messageCount: chat.messageCount,
      totalTokensUsed: chat.totalTokensUsed,
      lastMessageAt: chat.lastMessageAt || null,
      selectedDocumentIds: chat.selectedDocumentIds,
      selectedInsightIds: chat.selectedInsightIds,
      selectedJtbdIds: chat.selectedJtbdIds,
      selectedMetricIds: chat.selectedMetricIds,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: chat.messages.map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        intent: message.intent,
        processingTimeMs: message.processingTimeMs,
        tokensUsed: message.tokensUsed,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt
      }))
    }

    logger.info('Chat retrieved successfully', {
      chatId,
      userId,
      messageCount: response.messages.length,
      contextItems: {
        documents: response.selectedDocumentIds.length,
        insights: response.selectedInsightIds.length,
        jtbds: response.selectedJtbdIds.length,
        metrics: response.selectedMetricIds.length
      }
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('Chat retrieval failed', {
      chatId: params.chatId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// ===== PATCH /api/v1/chats/[chatId] - Update chat (title, context) =====

export async function PATCH(
  request: NextRequest,
  { params }: { params: { chatId: string } }
): Promise<NextResponse> {
  try {
    logger.info('Chat update request received', {
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
        'Content-Type must be application/json for chat updates',
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
    const validatedData = updateChatSchema.parse({
      ...requestBody,
      user_id: userId
    })

    // Check if at least one field to update is provided
    if (!validatedData.title && !validatedData.context) {
      throw new ValidationError(
        'At least one field must be provided for update (title or context)',
        ERROR_CODES.INVALID_INPUT,
        { providedFields: Object.keys(requestBody).filter(k => k !== 'user_id') }
      )
    }

    logger.info('Chat update request validated', {
      chatId,
      userId: validatedData.user_id,
      updateTitle: !!validatedData.title,
      updateContext: !!validatedData.context
    })

    // Step 4: Perform updates
    let titleUpdated = false
    let contextUpdated = false

    // Update title if provided
    if (validatedData.title) {
      await chatSessionManager.updateChatTitle(
        chatId as UUID,
        validatedData.title,
        validatedData.user_id as UUID
      )
      titleUpdated = true
    }

    // Update context if provided
    if (validatedData.context) {
      const contextUpdate: ChatContext = {
        selectedDocumentIds: validatedData.context.selectedDocumentIds,
        selectedInsightIds: validatedData.context.selectedInsightIds,
        selectedJtbdIds: validatedData.context.selectedJtbdIds,
        selectedMetricIds: validatedData.context.selectedMetricIds,
      }

      await chatSessionManager.updateChatContext(
        chatId as UUID,
        contextUpdate,
        validatedData.user_id as UUID
      )
      contextUpdated = true
    }

    // Step 5: Load updated chat to return current state
    const updatedChat = await chatSessionManager.loadChat(
      chatId as UUID,
      validatedData.user_id as UUID
    )

    // Step 6: Format response
    const response: ChatUpdateResponse = {
      id: updatedChat.id,
      title: updatedChat.title,
      status: updatedChat.status,
      messageCount: updatedChat.messageCount,
      totalTokensUsed: updatedChat.totalTokensUsed,
      selectedDocumentIds: updatedChat.selectedDocumentIds,
      selectedInsightIds: updatedChat.selectedInsightIds,
      selectedJtbdIds: updatedChat.selectedJtbdIds,
      selectedMetricIds: updatedChat.selectedMetricIds,
      updatedAt: updatedChat.updatedAt,
      updated: {
        title: titleUpdated,
        context: contextUpdated
      }
    }

    logger.info('Chat updated successfully', {
      chatId,
      userId: validatedData.user_id,
      updated: response.updated,
      newTitle: titleUpdated ? response.title : undefined,
      contextItems: contextUpdated ? {
        documents: response.selectedDocumentIds.length,
        insights: response.selectedInsightIds.length,
        jtbds: response.selectedJtbdIds.length,
        metrics: response.selectedMetricIds.length
      } : undefined
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('Chat update failed', {
      chatId: params.chatId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// ===== DELETE /api/v1/chats/[chatId] - Archive/soft-delete chat =====

export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatId: string } }
): Promise<NextResponse> {
  try {
    logger.info('Chat archive request received', {
      url: request.url,
      method: request.method,
      chatId: params.chatId
    })

    // Step 1: Validate chat ID parameter
    const { chatId } = chatIdParamsSchema.parse(params)

    // Step 2: Get user ID from header
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      throw new ValidationError(
        'User ID is required (provide x-user-id header)',
        ERROR_CODES.INVALID_INPUT,
        { field: 'user_id' }
      )
    }

    logger.info('Chat archive parameters validated', {
      chatId,
      userId
    })

    // Step 3: Archive chat using session manager
    await chatSessionManager.archiveChat(chatId as UUID, userId as UUID)

    // Step 4: Format response
    const response: ChatArchiveResponse = {
      id: chatId,
      status: 'archived',
      archivedAt: new Date().toISOString()
    }

    logger.info('Chat archived successfully', {
      chatId,
      userId,
      archivedAt: response.archivedAt
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('Chat archive failed', {
      chatId: params.chatId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// ===== UNSUPPORTED METHODS =====

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'POST method not supported on specific chat endpoint. Use POST /api/v1/chats to create new chats.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PUT method not supported. Use PATCH to update chat properties.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
/**
 * Chat Messages API Endpoint
 * GET /api/v1/chats/[chatId]/messages - Get messages for a specific chat
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatSessionManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { UUID, MessageOptions } from '@/lib/services/chat'

// ===== RESPONSE INTERFACES =====

interface MessageResponse {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  intent?: string
  processingTimeMs?: number
  tokensUsed?: number
  contextDocumentChunks: string[]
  contextInsights: string[]
  contextJtbds: string[]
  contextMetrics: string[]
  modelUsed?: string
  temperature?: number
  errorCode?: string
  errorMessage?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface MessagesListResponse {
  chatId: string
  messages: MessageResponse[]
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
  metadata: {
    totalTokensUsed: number
    averageProcessingTime?: number
    messagesByRole: {
      user: number
      assistant: number
      system: number
    }
  }
}

// ===== VALIDATION SCHEMAS =====

const chatIdParamsSchema = z.object({
  chatId: z.string().uuid('Invalid chat ID format')
})

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  orderBy: z.enum(['created_at', 'updated_at']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  includeContext: z.coerce.boolean().optional().default(true),
  role: z.enum(['user', 'assistant', 'system']).optional(),
  intent: z.string().optional(),
})

// ===== GET /api/v1/chats/[chatId]/messages - Get messages for a chat =====

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
): Promise<NextResponse> {
  try {
    logger.info('Chat messages retrieval request received', {
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

    // Step 3: Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    
    const validatedQuery = messagesQuerySchema.parse(queryParams)

    logger.info('Messages query parameters validated', {
      chatId,
      userId,
      ...validatedQuery
    })

    // Step 4: First verify chat exists and user has access by loading chat
    try {
      await chatSessionManager.loadChat(chatId as UUID, userId as UUID)
    } catch (error) {
      // This will throw appropriate errors (ChatNotFoundError, ChatAccessDeniedError, etc.)
      throw error
    }

    // Step 5: Build options for message retrieval
    const options: MessageOptions = {
      limit: validatedQuery.limit,
      offset: validatedQuery.offset,
      orderBy: validatedQuery.orderBy,
      order: validatedQuery.order,
      includeContext: validatedQuery.includeContext,
    }

    // Step 6: Retrieve messages using chat session manager
    const messages = await chatSessionManager.getMessages(
      chatId as UUID,
      options,
      userId as UUID
    )

    // Step 7: Filter messages by role and intent if specified
    let filteredMessages = messages
    if (validatedQuery.role) {
      filteredMessages = filteredMessages.filter(msg => msg.role === validatedQuery.role)
    }
    if (validatedQuery.intent) {
      filteredMessages = filteredMessages.filter(msg => msg.intent === validatedQuery.intent)
    }

    // Step 8: Calculate pagination info
    const total = filteredMessages.length
    const hasMore = validatedQuery.offset + validatedQuery.limit < total
    const paginatedMessages = filteredMessages.slice(
      validatedQuery.offset,
      validatedQuery.offset + validatedQuery.limit
    )

    // Step 9: Calculate metadata
    const totalTokensUsed = paginatedMessages.reduce((sum, msg) => sum + (msg.tokensUsed || 0), 0)
    const processingTimes = paginatedMessages
      .map(msg => msg.processingTimeMs)
      .filter((time): time is number => time !== undefined && time !== null)
    const averageProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : undefined

    const messagesByRole = {
      user: paginatedMessages.filter(msg => msg.role === 'user').length,
      assistant: paginatedMessages.filter(msg => msg.role === 'assistant').length,
      system: paginatedMessages.filter(msg => msg.role === 'system').length,
    }

    // Step 10: Format response
    const response: MessagesListResponse = {
      chatId,
      messages: paginatedMessages.map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        intent: message.intent,
        processingTimeMs: message.processingTimeMs,
        tokensUsed: message.tokensUsed,
        contextDocumentChunks: message.contextDocumentChunks || [],
        contextInsights: message.contextInsights || [],
        contextJtbds: message.contextJtbds || [],
        contextMetrics: message.contextMetrics || [],
        modelUsed: message.modelUsed,
        temperature: message.temperature,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        metadata: message.metadata || {},
        createdAt: message.createdAt,
        updatedAt: message.updatedAt
      })),
      pagination: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        total: total,
        hasMore: hasMore
      },
      metadata: {
        totalTokensUsed,
        averageProcessingTime,
        messagesByRole
      }
    }

    logger.info('Chat messages retrieved successfully', {
      chatId,
      userId,
      messageCount: response.messages.length,
      totalMessages: total,
      totalTokensUsed,
      averageProcessingTime,
      messagesByRole
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('Chat messages retrieval failed', {
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
      message: 'POST method not supported on messages endpoint. Messages are created through the chat orchestration API.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PUT method not supported. Messages cannot be updated once created.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PATCH method not supported. Messages cannot be updated once created.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'DELETE method not supported. Messages cannot be deleted individually.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
/**
 * Chat History API Endpoints - Base Routes
 * GET /api/v1/chats - List chats with pagination
 * POST /api/v1/chats - Create new chat session
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chatSessionManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
import { ERROR_CODES, HTTP_STATUS } from '@/lib/config/constants'
import type { UUID, ChatContext, ListChatsOptions } from '@/lib/services/chat'

// ===== REQUEST/RESPONSE INTERFACES =====

interface ChatListResponse {
  chats: Array<{
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
  }>
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrevious: boolean
  }
}

interface ChatCreateRequest {
  title?: string
  initialContext?: {
    selectedDocumentIds?: string[]
    selectedInsightIds?: string[]
    selectedJtbdIds?: string[]
    selectedMetricIds?: string[]
  }
  user_id?: string // Can come from header
}

interface ChatCreateResponse {
  id: string
  title: string
  status: 'active' | 'archived' | 'deleted'
  messageCount: number
  totalTokensUsed: number
  selectedDocumentIds: string[]
  selectedInsightIds: string[]
  selectedJtbdIds: string[]
  selectedMetricIds: string[]
  createdAt: string
  updatedAt: string
}

// ===== VALIDATION SCHEMAS =====

const createChatSchema = z.object({
  title: z
    .string()
    .max(100, 'Chat title cannot exceed 100 characters')
    .transform(s => s.trim())
    .optional(),
  initialContext: z.object({
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

const listChatsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['active', 'archived', 'all']).optional().default('active'),
  titleContains: z.string().optional(),
  orderBy: z.enum(['created_at', 'updated_at', 'last_message_at']).optional().default('updated_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})

// ===== GET /api/v1/chats - List chats with pagination =====

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('Chat list request received', {
      url: request.url,
      method: request.method
    })

    // Step 1: Get user ID from header
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      throw new ValidationError(
        'User ID is required (provide x-user-id header)',
        ERROR_CODES.INVALID_INPUT,
        { field: 'user_id' }
      )
    }

    // Step 2: Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    
    const validatedQuery = listChatsQuerySchema.parse(queryParams)

    logger.info('Query parameters validated', {
      userId,
      ...validatedQuery
    })

    // Step 3: Build options for chat session manager
    const options: ListChatsOptions = {
      page: validatedQuery.page,
      pageSize: validatedQuery.pageSize,
      status: validatedQuery.status,
      titleContains: validatedQuery.titleContains,
      orderBy: validatedQuery.orderBy,
      order: validatedQuery.order,
    }

    // Step 4: Retrieve chats using chat session manager
    const result = await chatSessionManager.listChats(userId as UUID, options)

    // Step 5: Format response
    const response: ChatListResponse = {
      chats: result.chats.map(chat => ({
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
        updatedAt: chat.updatedAt
      })),
      pagination: result.pagination
    }

    logger.info('Chat list retrieved successfully', {
      userId,
      chatCount: result.chats.length,
      totalItems: result.pagination.totalItems,
      page: validatedQuery.page,
      pageSize: validatedQuery.pageSize
    })

    return NextResponse.json(response, {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('Chat list retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// ===== POST /api/v1/chats - Create new chat session =====

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('Chat creation request received', {
      url: request.url,
      method: request.method,
      contentType: request.headers.get('content-type')
    })

    // Step 1: Validate content type
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new ValidationError(
        'Content-Type must be application/json for chat creation',
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
    const validatedData = createChatSchema.parse({
      ...requestBody,
      user_id: userId
    })

    logger.info('Request validated successfully', {
      userId: validatedData.user_id,
      hasTitle: !!validatedData.title,
      hasInitialContext: !!validatedData.initialContext
    })

    // Step 3: Prepare initial context if provided
    const initialContext: ChatContext | undefined = validatedData.initialContext ? {
      selectedDocumentIds: validatedData.initialContext.selectedDocumentIds,
      selectedInsightIds: validatedData.initialContext.selectedInsightIds,
      selectedJtbdIds: validatedData.initialContext.selectedJtbdIds,
      selectedMetricIds: validatedData.initialContext.selectedMetricIds,
    } : undefined

    // Step 4: Create chat using session manager
    const chat = await chatSessionManager.createChat(
      validatedData.user_id as UUID,
      validatedData.title,
      initialContext
    )

    // Step 5: Format and return response
    const response: ChatCreateResponse = {
      id: chat.id,
      title: chat.title,
      status: chat.status,
      messageCount: chat.messageCount,
      totalTokensUsed: chat.totalTokensUsed,
      selectedDocumentIds: chat.selectedDocumentIds,
      selectedInsightIds: chat.selectedInsightIds,
      selectedJtbdIds: chat.selectedJtbdIds,
      selectedMetricIds: chat.selectedMetricIds,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    }

    logger.info('Chat created successfully', {
      chatId: response.id,
      userId: validatedData.user_id,
      title: response.title,
      contextItems: {
        documents: response.selectedDocumentIds.length,
        insights: response.selectedInsightIds.length,
        jtbds: response.selectedJtbdIds.length,
        metrics: response.selectedMetricIds.length
      }
    })

    return NextResponse.json(response, { 
      status: HTTP_STATUS.CREATED,
      headers: {
        'Content-Type': 'application/json',
        'X-Chat-ID': response.id
      }
    })

  } catch (error) {
    logger.error('Chat creation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return handleApiError(error, request)
  }
}

// ===== UNSUPPORTED METHODS =====

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PUT method not supported. Use POST to create chats or PATCH to update specific chats.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function PATCH(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'PATCH method not supported on base endpoint. Use PATCH /api/v1/chats/[chatId] to update specific chats.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    {
      code: ERROR_CODES.INVALID_INPUT,
      message: 'DELETE method not supported on base endpoint. Use DELETE /api/v1/chats/[chatId] to archive specific chats.',
      action: 'NONE'
    },
    { status: HTTP_STATUS.BAD_REQUEST }
  )
}
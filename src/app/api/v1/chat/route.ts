import { NextRequest } from 'next/server'
import { chatOrchestrator } from '../../../../lib/services/chat/orchestrator'
import { logger } from '../../../../lib/logger'
import { ValidationError, ChatSessionError } from '../../../../lib/errors'
import type { ChatRequest } from '../../../../lib/services/chat/orchestrator'

interface ChatRequestBody {
  message: string
  chat_id?: string
  context_items?: {
    document_chunks?: string[]
    insights?: string[]
    jtbds?: string[]
    metrics?: string[]
  }
}

/**
 * POST /api/v1/chat - Main chat endpoint with Server-Sent Events streaming
 * Handles intent detection, context loading, and response generation
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Parse request body
    const body: ChatRequestBody = await request.json()
    
    // Extract user ID from headers (in real implementation, this would come from auth)
    // For now, use a default user ID - this should be replaced with actual auth
    const userId = request.headers.get('x-user-id') || 'default-user-id'
    
    logger.info('Chat request received', {
      hasMessage: !!body.message,
      hasChatId: !!body.chat_id,
      hasContext: !!body.context_items,
      userId
    })

    // Validate request
    if (!body.message?.trim()) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Message is required',
            action: 'NONE'
          }
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Build chat request
    const chatRequest: ChatRequest = {
      message: body.message.trim(),
      chatId: body.chat_id,
      userId,
      contextItems: body.context_items ? {
        documentChunks: body.context_items.document_chunks,
        insights: body.context_items.insights,
        jtbds: body.context_items.jtbds,
        metrics: body.context_items.metrics
      } : undefined
    }

    // Process chat request and get streaming response
    const orchestrationResult = await chatOrchestrator.processChatRequest(chatRequest)

    logger.info('Chat orchestration completed', {
      chatId: orchestrationResult.chatId,
      messageId: orchestrationResult.messageId,
      processingTime: Date.now() - startTime
    })

    // Return Server-Sent Events response
    return new Response(orchestrationResult.stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
        'X-Chat-ID': orchestrationResult.chatId,
        'X-Message-ID': orchestrationResult.messageId || ''
      }
    })

  } catch (error) {
    logger.error('Chat endpoint error', error, {
      processingTime: Date.now() - startTime,
      userAgent: request.headers.get('user-agent')
    })

    // Handle different error types
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            action: 'NONE'
          }
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    if (error instanceof ChatSessionError) {
      return new Response(
        JSON.stringify({
          error: {
            code: error.code || 'CHAT_SESSION_ERROR',
            message: error.message,
            action: 'RETRY'
          }
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Generic error handling
    return new Response(
      JSON.stringify({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          action: 'RETRY',
          details: process.env.NODE_ENV === 'development' 
            ? { error: error instanceof Error ? error.message : String(error) }
            : undefined
        }
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

/**
 * OPTIONS /api/v1/chat - Handle preflight requests for CORS
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
      'Access-Control-Max-Age': '86400'
    }
  })
}
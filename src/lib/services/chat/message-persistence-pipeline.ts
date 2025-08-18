/**
 * Message persistence pipeline for JTBD Assistant Platform
 * Orchestrates complete message storage with metadata collection and audit trail
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../logger'
import { ChatSessionManagerImpl } from './session-manager'
import { detectChatIntent } from './intent-detector'
import { tokenBudgetManager } from './token-budget'
import { 
  ChatSessionError,
  ChatNotFoundError,
  ValidationError,
  ChatPersistenceError
} from '../../errors'
import type { UUID, Timestamp } from '../../database/types'
import type { Message } from '../../database/types'
import type { MessageInput } from './session-types'

// ===== PIPELINE INTERFACES =====

export interface UserMessagePersistenceData {
  chatId: UUID
  userId: UUID
  content: string
  contextItems?: {
    documentChunks?: UUID[]
    insights?: UUID[]
    jtbds?: UUID[]
    metrics?: UUID[]
  }
  metadata?: Record<string, unknown>
}

export interface AssistantMessagePersistenceData {
  chatId: UUID
  userId: UUID
  content: string
  intent: string
  contextItems?: {
    documentChunks?: UUID[]
    insights?: UUID[]
    jtbds?: UUID[]
    metrics?: UUID[]
  }
  processingTimeMs: number
  tokensUsed: number
  modelUsed?: string
  temperature?: number
  errorCode?: string
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export interface MessagePersistenceResult {
  success: boolean
  messageId?: UUID
  processingTime: number
  tokensUsed?: number
  warnings?: string[]
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface StreamingMessagePersistenceContext {
  chatId: UUID
  userId: UUID
  intent: string
  startTime: number
  contextItems?: {
    documentChunks?: UUID[]
    insights?: UUID[]
    jtbds?: UUID[]
    metrics?: UUID[]
  }
  modelUsed?: string
  temperature?: number
}

// ===== PIPELINE IMPLEMENTATION =====

/**
 * High-level message persistence pipeline
 * Coordinates complete message storage lifecycle with metadata collection
 */
export class MessagePersistencePipeline {
  private static instance: MessagePersistencePipeline | null = null
  private sessionManager: ChatSessionManagerImpl
  private tokenManager: typeof tokenBudgetManager

  // Singleton pattern
  public static getInstance(): MessagePersistencePipeline {
    if (!MessagePersistencePipeline.instance) {
      MessagePersistencePipeline.instance = new MessagePersistencePipeline()
    }
    return MessagePersistencePipeline.instance
  }

  private constructor() {
    this.sessionManager = ChatSessionManagerImpl.getInstance()
    this.tokenManager = tokenBudgetManager
  }

  /**
   * Persist user message with immediate intent detection and context collection
   */
  public async persistUserMessage(
    data: UserMessagePersistenceData
  ): Promise<MessagePersistenceResult> {
    const startTime = Date.now()
    
    try {
      // Validate input data
      this.validateUserMessageData(data)
      
      // Detect intent from user message
      const intentResult = detectChatIntent(data.content)
      
      // Calculate token usage (simple estimation: ~4 chars per token)
      const tokensUsed = Math.ceil(data.content.length / 4)
      
      // Build message input
      const messageInput: MessageInput = {
        role: 'user',
        content: data.content,
        intent: intentResult.intent,
        tokensUsed,
        contextDocumentChunks: data.contextItems?.documentChunks || [],
        contextInsights: data.contextItems?.insights || [],
        contextJtbds: data.contextItems?.jtbds || [],
        contextMetrics: data.contextItems?.metrics || [],
        metadata: {
          ...data.metadata,
          intentConfidence: intentResult.confidence,
          intentKeywords: intentResult.matchedKeywords,
          persistedAt: new Date().toISOString(),
          pipelineVersion: '1.0',
        }
      }

      // Persist message using session manager
      const message = await this.sessionManager.addMessage(
        data.chatId,
        messageInput,
        data.userId
      )

      const processingTime = Date.now() - startTime

      // Audit logging
      logger.info('User message persisted successfully', {
        chatId: data.chatId,
        userId: data.userId,
        messageId: message.id,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        tokensUsed,
        processingTime,
        contextItemsCount: {
          documentChunks: data.contextItems?.documentChunks?.length || 0,
          insights: data.contextItems?.insights?.length || 0,
          jtbds: data.contextItems?.jtbds?.length || 0,
          metrics: data.contextItems?.metrics?.length || 0,
        }
      })

      return {
        success: true,
        messageId: message.id,
        processingTime,
        tokensUsed,
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Failed to persist user message', {
        chatId: data.chatId,
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
      })

      // Handle specific error types
      if (error instanceof ChatNotFoundError) {
        return {
          success: false,
          processingTime,
          error: {
            code: 'CHAT_NOT_FOUND',
            message: 'Chat not found or inaccessible',
            details: { chatId: data.chatId }
          }
        }
      }

      if (error instanceof ValidationError) {
        return {
          success: false,
          processingTime,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: { input: 'user_message_data' }
          }
        }
      }

      return {
        success: false,
        processingTime,
        error: {
          code: 'PERSISTENCE_ERROR',
          message: 'Failed to persist user message',
          details: { originalError: error instanceof Error ? error.message : 'Unknown' }
        }
      }
    }
  }

  /**
   * Persist assistant message with complete processing metadata
   */
  public async persistAssistantMessage(
    data: AssistantMessagePersistenceData
  ): Promise<MessagePersistenceResult> {
    const startTime = Date.now()
    
    try {
      // Validate input data
      this.validateAssistantMessageData(data)
      
      // Build message input with complete metadata
      const messageInput: MessageInput = {
        role: 'assistant',
        content: data.content,
        intent: data.intent,
        processingTimeMs: data.processingTimeMs,
        tokensUsed: data.tokensUsed,
        contextDocumentChunks: data.contextItems?.documentChunks || [],
        contextInsights: data.contextItems?.insights || [],
        contextJtbds: data.contextItems?.jtbds || [],
        contextMetrics: data.contextItems?.metrics || [],
        modelUsed: data.modelUsed,
        temperature: data.temperature,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        metadata: {
          ...data.metadata,
          persistedAt: new Date().toISOString(),
          pipelineVersion: '1.0',
          hasError: !!(data.errorCode || data.errorMessage),
        }
      }

      // Persist message using session manager
      const message = await this.sessionManager.addMessage(
        data.chatId,
        messageInput,
        data.userId
      )

      const processingTime = Date.now() - startTime

      // Audit logging
      logger.info('Assistant message persisted successfully', {
        chatId: data.chatId,
        userId: data.userId,
        messageId: message.id,
        intent: data.intent,
        processingTimeMs: data.processingTimeMs,
        tokensUsed: data.tokensUsed,
        modelUsed: data.modelUsed,
        hasError: !!(data.errorCode || data.errorMessage),
        persistenceTime: processingTime,
        contextItemsCount: {
          documentChunks: data.contextItems?.documentChunks?.length || 0,
          insights: data.contextItems?.insights?.length || 0,
          jtbds: data.contextItems?.jtbds?.length || 0,
          metrics: data.contextItems?.metrics?.length || 0,
        }
      })

      return {
        success: true,
        messageId: message.id,
        processingTime,
        tokensUsed: data.tokensUsed,
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Failed to persist assistant message', {
        chatId: data.chatId,
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
      })

      // Handle specific error types
      if (error instanceof ChatNotFoundError) {
        return {
          success: false,
          processingTime,
          error: {
            code: 'CHAT_NOT_FOUND',
            message: 'Chat not found or inaccessible',
            details: { chatId: data.chatId }
          }
        }
      }

      if (error instanceof ValidationError) {
        return {
          success: false,
          processingTime,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            details: { input: 'assistant_message_data' }
          }
        }
      }

      return {
        success: false,
        processingTime,
        error: {
          code: 'PERSISTENCE_ERROR',
          message: 'Failed to persist assistant message',
          details: { originalError: error instanceof Error ? error.message : 'Unknown' }
        }
      }
    }
  }

  /**
   * Create streaming context for assistant message that will be persisted later
   * Returns context object to track streaming response metadata
   */
  public createStreamingContext(
    chatId: UUID,
    userId: UUID,
    intent: string,
    contextItems?: {
      documentChunks?: UUID[]
      insights?: UUID[]
      jtbds?: UUID[]
      metrics?: UUID[]
    },
    modelUsed?: string,
    temperature?: number
  ): StreamingMessagePersistenceContext {
    const context: StreamingMessagePersistenceContext = {
      chatId,
      userId,
      intent,
      startTime: Date.now(),
      contextItems,
      modelUsed,
      temperature
    }

    logger.info('Created streaming message context', {
      chatId,
      userId,
      intent,
      contextId: uuidv4(),
      contextItemsCount: {
        documentChunks: contextItems?.documentChunks?.length || 0,
        insights: contextItems?.insights?.length || 0,
        jtbds: contextItems?.jtbds?.length || 0,
        metrics: contextItems?.metrics?.length || 0,
      }
    })

    return context
  }

  /**
   * Complete streaming message persistence using previously created context
   */
  public async completeStreamingMessage(
    context: StreamingMessagePersistenceContext,
    content: string,
    tokensUsed: number,
    errorCode?: string,
    errorMessage?: string,
    metadata?: Record<string, unknown>
  ): Promise<MessagePersistenceResult> {
    const processingTimeMs = Date.now() - context.startTime

    return this.persistAssistantMessage({
      chatId: context.chatId,
      userId: context.userId,
      content,
      intent: context.intent,
      contextItems: context.contextItems,
      processingTimeMs,
      tokensUsed,
      modelUsed: context.modelUsed,
      temperature: context.temperature,
      errorCode,
      errorMessage,
      metadata: {
        ...metadata,
        streamingEnabled: true,
        streamingDurationMs: processingTimeMs,
      }
    })
  }

  /**
   * Get message persistence statistics for monitoring
   */
  public async getMessagePersistenceStats(
    chatId: UUID,
    userId: UUID,
    timeRangeHours: number = 24
  ): Promise<{
    totalMessages: number
    userMessages: number
    assistantMessages: number
    systemMessages: number
    averageProcessingTime: number
    totalTokensUsed: number
    errorRate: number
    intentsDistribution: Record<string, number>
  }> {
    try {
      const since = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000)
      
      const messages = await this.sessionManager.getMessages(
        chatId,
        { 
          limit: 1000,
          orderBy: 'created_at',
          order: 'desc'
        },
        userId
      )

      const recentMessages = messages.filter(msg => 
        new Date(msg.created_at) >= since
      )

      const stats = recentMessages.reduce((acc, msg) => {
        acc.totalMessages++
        
        if (msg.role === 'user') acc.userMessages++
        else if (msg.role === 'assistant') acc.assistantMessages++
        else if (msg.role === 'system') acc.systemMessages++
        
        if (msg.processing_time_ms) {
          acc.totalProcessingTime += msg.processing_time_ms
          acc.processedMessages++
        }
        
        if (msg.token_count) {
          acc.totalTokensUsed += msg.token_count
        }
        
        if (msg.intent) {
          acc.intentsDistribution[msg.intent] = (acc.intentsDistribution[msg.intent] || 0) + 1
        }
        
        if (msg.context_items && typeof msg.context_items === 'object') {
          const contextObj = msg.context_items as Record<string, unknown>
          if (contextObj.hasError === true) {
            acc.errorCount++
          }
        }
        
        return acc
      }, {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        systemMessages: 0,
        totalProcessingTime: 0,
        processedMessages: 0,
        totalTokensUsed: 0,
        errorCount: 0,
        intentsDistribution: {} as Record<string, number>
      })

      return {
        totalMessages: stats.totalMessages,
        userMessages: stats.userMessages,
        assistantMessages: stats.assistantMessages,
        systemMessages: stats.systemMessages,
        averageProcessingTime: stats.processedMessages > 0 
          ? Math.round(stats.totalProcessingTime / stats.processedMessages)
          : 0,
        totalTokensUsed: stats.totalTokensUsed,
        errorRate: stats.totalMessages > 0 
          ? Number((stats.errorCount / stats.totalMessages * 100).toFixed(2))
          : 0,
        intentsDistribution: stats.intentsDistribution
      }
      
    } catch (error) {
      logger.error('Failed to get message persistence stats', {
        chatId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        systemMessages: 0,
        averageProcessingTime: 0,
        totalTokensUsed: 0,
        errorRate: 0,
        intentsDistribution: {}
      }
    }
  }

  // ===== PRIVATE VALIDATION METHODS =====

  private validateUserMessageData(data: UserMessagePersistenceData): void {
    if (!data.chatId || typeof data.chatId !== 'string') {
      throw new ValidationError('Valid chatId is required')
    }
    
    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('Valid userId is required')
    }
    
    if (!data.content || typeof data.content !== 'string') {
      throw new ValidationError('Message content is required')
    }
    
    if (data.content.length > 10000) {
      throw new ValidationError('Message content too long (max 10000 characters)')
    }
    
    if (data.contextItems) {
      this.validateContextItems(data.contextItems)
    }
  }

  private validateAssistantMessageData(data: AssistantMessagePersistenceData): void {
    if (!data.chatId || typeof data.chatId !== 'string') {
      throw new ValidationError('Valid chatId is required')
    }
    
    if (!data.userId || typeof data.userId !== 'string') {
      throw new ValidationError('Valid userId is required')
    }
    
    if (!data.content || typeof data.content !== 'string') {
      throw new ValidationError('Message content is required')
    }
    
    if (!data.intent || typeof data.intent !== 'string') {
      throw new ValidationError('Intent is required for assistant messages')
    }
    
    if (data.processingTimeMs < 0) {
      throw new ValidationError('Processing time must be non-negative')
    }
    
    if (data.tokensUsed < 0) {
      throw new ValidationError('Token count must be non-negative')
    }
    
    if (data.contextItems) {
      this.validateContextItems(data.contextItems)
    }
  }

  private validateContextItems(contextItems: {
    documentChunks?: UUID[]
    insights?: UUID[]
    jtbds?: UUID[]
    metrics?: UUID[]
  }): void {
    const validateUUIDArray = (arr: UUID[] | undefined, name: string) => {
      if (arr && (!Array.isArray(arr) || arr.some(id => typeof id !== 'string'))) {
        throw new ValidationError(`${name} must be an array of UUID strings`)
      }
    }

    validateUUIDArray(contextItems.documentChunks, 'documentChunks')
    validateUUIDArray(contextItems.insights, 'insights')
    validateUUIDArray(contextItems.jtbds, 'jtbds')
    validateUUIDArray(contextItems.metrics, 'metrics')
  }
}

// ===== SINGLETON EXPORT =====

export const messagePersistencePipeline = MessagePersistencePipeline.getInstance()
/**
 * Chat session management service for JTBD Assistant Platform
 * Handles creation, loading, archival, and cleanup of chat sessions with context persistence
 */

import { v4 as uuidv4 } from 'uuid'
import { executeQuery, executeRPC } from '../../database/client'
import { logger } from '../../logger'
import {
  ChatSessionError,
  ChatNotFoundError,
  ChatAccessDeniedError,
  ValidationError,
} from '../../errors'
import type { UUID, Timestamp } from '../../database/types'
import type { Message } from '../../database/types'
import type {
  ChatSessionManager,
  ChatContext,
  ChatWithMessagesAndContext,
  MessageInput,
  MessageOptions,
  ListChatsOptions,
  PaginatedChats,
  ChatCreateResult,
  ChatLoadResult,
} from './session-types'
import {
  CHAT_SESSION_DEFAULTS,
  CHAT_SESSION_ERROR_CODES,
  isChatContext,
  isMessageInput,
} from './session-types'

/**
 * Implementation of chat session management service
 * Provides full CRUD operations for chat sessions with context tracking
 */
export class ChatSessionManagerImpl implements ChatSessionManager {
  private static instance: ChatSessionManagerImpl | null = null

  // Singleton pattern
  public static getInstance(): ChatSessionManagerImpl {
    if (!ChatSessionManagerImpl.instance) {
      ChatSessionManagerImpl.instance = new ChatSessionManagerImpl()
    }
    return ChatSessionManagerImpl.instance
  }

  /**
   * Create new chat session with optional initial context
   */
  public async createChat(
    userId: UUID,
    title?: string,
    initialContext?: ChatContext
  ): Promise<ChatWithMessagesAndContext> {
    const startTime = Date.now()
    
    try {
      // Validate inputs
      this.validateUserId(userId)
      if (title) {
        this.validateChatTitle(title)
      }
      if (initialContext && !isChatContext(initialContext)) {
        throw new ValidationError('Invalid chat context format')
      }

      // Generate chat data
      const chatId = uuidv4()
      const chatTitle = title || `Chat ${new Date().toISOString().split('T')[0]}`
      const context = initialContext || {}

      // Insert chat record
      const chat = await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .insert({
              id: chatId,
              user_id: userId,
              title: chatTitle,
              status: 'active',
              message_count: 0,
              selected_document_ids: context.selectedDocumentIds || [],
              selected_insight_ids: context.selectedInsightIds || [],
              selected_jtbd_ids: context.selectedJtbdIds || [],
              selected_metric_ids: context.selectedMetricIds || [],
              selected_hmw_ids: context.selectedHmwIds || [],
              total_tokens_used: 0,
              metadata: {},
            })
            .select()
            .single()
        }
      )

      const result: ChatWithMessagesAndContext = {
        ...chat,
        messages: [],
        messageCount: 0,
        status: 'active',
        totalTokensUsed: 0,
        selectedDocumentIds: context.selectedDocumentIds || [],
        selectedInsightIds: context.selectedInsightIds || [],
        selectedJtbdIds: context.selectedJtbdIds || [],
        selectedMetricIds: context.selectedMetricIds || [],
        selectedHmwIds: context.selectedHmwIds || [],
        metadata: {},
      }

      const processingTime = Date.now() - startTime

      logger.info('Chat created successfully', {
        chatId,
        userId,
        title: chatTitle,
        processingTime,
        contextItemsCount: this.countContextItems(context),
      })

      return result
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Failed to create chat', {
        userId,
        title,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to create chat session',
        { userId, title },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Load existing chat with full message history and context
   */
  public async loadChat(chatId: UUID, userId: UUID): Promise<ChatWithMessagesAndContext> {
    const startTime = Date.now()
    
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)

      // Load chat with messages
      const chatResult = await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .select(`
              *,
              chat_messages (
                id,
                role,
                content,
                created_at,
                intent,
                processing_time_ms,
                tokens_used,
                context_document_chunks,
                context_insights,
                context_jtbds,
                context_metrics,
                model_used,
                temperature,
                error_code,
                error_message,
                metadata
              )
            `)
            .eq('id', chatId)
            .eq('user_id', userId)
            .neq('status', 'deleted')
            .single()
        }
      )

      if (!chatResult) {
        throw new ChatNotFoundError(chatId, userId)
      }

      const chat = chatResult
      const result: ChatWithMessagesAndContext = {
        id: chat.id,
        user_id: chat.user_id,
        title: chat.title,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        messages: (chat.chat_messages || []).map((msg: {
          id: string;
          role: string;
          content: string;
          created_at: string;
          intent: string | null;
          processing_time_ms: number | null;
          tokens_used: number | null;
          context_document_chunks: string[] | null;
          context_insights: string[] | null;
          context_jtbds: string[] | null;
          context_metrics: string[] | null;
          model_used: string | null;
          temperature: number | null;
          error_code: string | null;
          error_message: string | null;
          metadata: Record<string, unknown> | null;
        }) => ({
          id: msg.id,
          chat_id: chatId,
          role: msg.role,
          content: msg.content,
          created_at: msg.created_at,
          intent: msg.intent,
          processing_time_ms: msg.processing_time_ms,
          tokens_used: msg.tokens_used || 0,
          context_document_chunks: msg.context_document_chunks || [],
          context_insights: msg.context_insights || [],
          context_jtbds: msg.context_jtbds || [],
          context_metrics: msg.context_metrics || [],
          model_used: msg.model_used,
          temperature: msg.temperature,
          error_code: msg.error_code,
          error_message: msg.error_message,
          metadata: msg.metadata || {},
        })),
        messageCount: chat.message_count || 0,
        lastMessageAt: chat.last_message_at,
        status: chat.status,
        totalTokensUsed: chat.total_tokens_used || 0,
        selectedDocumentIds: chat.selected_document_ids || [],
        selectedInsightIds: chat.selected_insight_ids || [],
        selectedJtbdIds: chat.selected_jtbd_ids || [],
        selectedMetricIds: chat.selected_metric_ids || [],
        selectedHmwIds: chat.selected_hmw_ids || [],
        metadata: chat.metadata || {},
      }

      const processingTime = Date.now() - startTime

      logger.info('Chat loaded successfully', {
        chatId,
        userId,
        messageCount: result.messages.length,
        processingTime,
      })

      return result
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Failed to load chat', {
        chatId,
        userId,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to load chat session',
        { chatId, userId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * List user's chat sessions with pagination and filtering
   */
  public async listChats(userId: UUID, options: ListChatsOptions = {}): Promise<PaginatedChats> {
    const startTime = Date.now()
    
    try {
      this.validateUserId(userId)

      const {
        page = 1,
        pageSize = CHAT_SESSION_DEFAULTS.DEFAULT_PAGE_SIZE,
        status = 'active',
        titleContains,
        createdAfter,
        createdBefore,
        orderBy = 'updated_at',
        order = 'desc',
      } = options

      // Validate pagination
      if (page < 1 || pageSize < 1 || pageSize > CHAT_SESSION_DEFAULTS.MAX_PAGE_SIZE) {
        throw new ValidationError('Invalid pagination parameters')
      }

      const offset = (page - 1) * pageSize

      // Build query
      const query = executeQuery(async (client) => {
        let baseQuery = client
          .from('chats')
          .select(`
            *,
            chat_messages (count)
          `, { count: 'exact' })
          .eq('user_id', userId)

        // Status filter
        if (status === 'active') {
          baseQuery = baseQuery.eq('status', 'active')
        } else if (status === 'archived') {
          baseQuery = baseQuery.eq('status', 'archived')
        } else if (status === 'all') {
          baseQuery = baseQuery.neq('status', 'deleted')
        }

        // Text filter
        if (titleContains) {
          baseQuery = baseQuery.ilike('title', `%${titleContains}%`)
        }

        // Date filters
        if (createdAfter) {
          baseQuery = baseQuery.gte('created_at', createdAfter)
        }
        if (createdBefore) {
          baseQuery = baseQuery.lte('created_at', createdBefore)
        }

        // Ordering and pagination
        baseQuery = baseQuery
          .order(orderBy, { ascending: order === 'asc' })
          .range(offset, offset + pageSize - 1)

        return baseQuery
      })

      const queryResult = await query
      const chats = queryResult?.data || []
      const totalItems = queryResult?.count || 0

      // Transform results
      const transformedChats: ChatWithMessagesAndContext[] = chats.map((chat: {
        id: string;
        user_id: string;
        title: string;
        created_at: string;
        updated_at: string;
        status: string;
        total_tokens_used: number;
        selected_document_ids: string[];
        selected_insight_ids: string[];
        selected_jtbd_ids: string[];
        selected_metric_ids: string[];
        selected_hmw_ids: string[];
      }) => ({
        id: chat.id,
        user_id: chat.user_id,
        title: chat.title,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        messages: [], // Don't load messages in list view for performance
        messageCount: chat.message_count || 0,
        lastMessageAt: chat.last_message_at,
        status: chat.status,
        totalTokensUsed: chat.total_tokens_used || 0,
        selectedDocumentIds: chat.selected_document_ids || [],
        selectedInsightIds: chat.selected_insight_ids || [],
        selectedJtbdIds: chat.selected_jtbd_ids || [],
        selectedMetricIds: chat.selected_metric_ids || [],
        selectedHmwIds: chat.selected_hmw_ids || [],
        metadata: chat.metadata || {},
      }))

      const result: PaginatedChats = {
        chats: transformedChats,
        pagination: {
          page,
          pageSize,
          totalItems: totalItems || 0,
          totalPages: Math.ceil((totalItems || 0) / pageSize),
          hasNext: page * pageSize < (totalItems || 0),
          hasPrevious: page > 1,
        },
      }

      const processingTime = Date.now() - startTime

      logger.info('Chat list retrieved successfully', {
        userId,
        page,
        pageSize,
        totalItems: totalItems || 0,
        processingTime,
      })

      return result
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Failed to list chats', {
        userId,
        options,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to list chat sessions',
        { userId, options },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Update chat title
   */
  public async updateChatTitle(chatId: UUID, title: string, userId: UUID): Promise<void> {
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)
      this.validateChatTitle(title)

      await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', chatId)
            .eq('user_id', userId)
            .neq('status', 'deleted')
        }
      )

      logger.info('Chat title updated', { chatId, userId, title })
    } catch (error) {
      logger.error('Failed to update chat title', {
        chatId,
        userId,
        title,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to update chat title',
        { chatId, userId, title },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Update chat context (selected items)
   */
  public async updateChatContext(chatId: UUID, context: ChatContext, userId: UUID): Promise<void> {
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)
      
      if (!isChatContext(context)) {
        throw new ValidationError('Invalid chat context format')
      }

      await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .update({
              selected_document_ids: context.selectedDocumentIds || [],
              selected_insight_ids: context.selectedInsightIds || [],
              selected_jtbd_ids: context.selectedJtbdIds || [],
              selected_metric_ids: context.selectedMetricIds || [],
              selected_hmw_ids: context.selectedHmwIds || [],
              updated_at: new Date().toISOString(),
            })
            .eq('id', chatId)
            .eq('user_id', userId)
            .neq('status', 'deleted')
        }
      )

      logger.info('Chat context updated', {
        chatId,
        userId,
        contextItemsCount: this.countContextItems(context),
      })
    } catch (error) {
      logger.error('Failed to update chat context', {
        chatId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to update chat context',
        { chatId, userId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Archive chat (soft delete)
   */
  public async archiveChat(chatId: UUID, userId: UUID): Promise<void> {
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)

      await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .update({
              status: 'archived',
              updated_at: new Date().toISOString(),
            })
            .eq('id', chatId)
            .eq('user_id', userId)
            .neq('status', 'deleted')
        }
      )

      logger.info('Chat archived', { chatId, userId })
    } catch (error) {
      logger.error('Failed to archive chat', {
        chatId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to archive chat',
        { chatId, userId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Delete chat (hard delete)
   */
  public async deleteChat(chatId: UUID, userId: UUID): Promise<void> {
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)

      await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .delete()
            .eq('id', chatId)
            .eq('user_id', userId)
        }
      )

      logger.info('Chat deleted', { chatId, userId })
    } catch (error) {
      logger.error('Failed to delete chat', {
        chatId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to delete chat',
        { chatId, userId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Clean up old archived chats
   */
  public async cleanupArchivedChats(olderThan: Timestamp): Promise<number> {
    try {
      const result = await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .delete()
            .eq('status', 'archived')
            .lt('updated_at', olderThan)
        }
      )

      const deletedCount = result?.length || 0

      logger.info('Archived chats cleaned up', {
        deletedCount,
        olderThan,
      })

      return deletedCount
    } catch (error) {
      logger.error('Failed to cleanup archived chats', {
        olderThan,
        error: error instanceof Error ? error.message : String(error),
      })

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to cleanup archived chats',
        { olderThan },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Add message to chat
   */
  public async addMessage(chatId: UUID, message: MessageInput, userId: UUID): Promise<Message> {
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)
      
      if (!isMessageInput(message)) {
        throw new ValidationError('Invalid message input format')
      }

      const messageId = uuidv4()
      
      const result = await executeQuery(
        async (client) => {
          return await client
            .from('chat_messages')
            .insert({
              id: messageId,
              chat_id: chatId,
              role: message.role,
              content: message.content,
              intent: message.intent,
              processing_time_ms: message.processingTimeMs,
              tokens_used: message.tokensUsed || 0,
              context_document_chunks: message.contextDocumentChunks || [],
              context_insights: message.contextInsights || [],
              context_jtbds: message.contextJtbds || [],
              context_metrics: message.contextMetrics || [],
              model_used: message.modelUsed,
              temperature: message.temperature,
              error_code: message.errorCode,
              error_message: message.errorMessage,
              metadata: message.metadata || {},
            })
            .select()
            .single()
        }
      )

      logger.info('Message added to chat', {
        chatId,
        messageId,
        userId,
        role: message.role,
        tokensUsed: message.tokensUsed || 0,
      })

      return result
    } catch (error) {
      logger.error('Failed to add message', {
        chatId,
        userId,
        role: message.role,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to add message to chat',
        { chatId, userId },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get messages from chat with pagination
   */
  public async getMessages(
    chatId: UUID,
    options: MessageOptions = {},
    userId: UUID
  ): Promise<Message[]> {
    try {
      this.validateUserId(userId)
      this.validateChatId(chatId)

      const {
        limit = CHAT_SESSION_DEFAULTS.DEFAULT_MESSAGE_LIMIT,
        offset = 0,
        orderBy = 'created_at',
        order = 'asc',
      } = options

      if (limit > CHAT_SESSION_DEFAULTS.MAX_MESSAGE_LIMIT) {
        throw new ValidationError('Message limit exceeds maximum allowed')
      }

      const messages = await executeQuery(
        async (client) => {
          return await client
            .from('chat_messages')
            .select('*')
            .eq('chat_id', chatId)
            .order(orderBy, { ascending: order === 'asc' })
            .range(offset, offset + limit - 1)
        }
      )

      return messages as Message[]
    } catch (error) {
      logger.error('Failed to get messages', {
        chatId,
        userId,
        options,
        error: error instanceof Error ? error.message : String(error),
      })

      if (error instanceof ChatSessionError) {
        throw error
      }

      throw new ChatSessionError(
        CHAT_SESSION_ERROR_CODES.DATABASE_ERROR,
        'Failed to get messages',
        { chatId, userId, options },
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Health check for service monitoring
   */
  public async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details?: Record<string, unknown> }> {
    try {
      // Perform basic database connectivity test
      const testResult = await executeQuery(
        async (client) => {
          return await client
            .from('chats')
            .select('id')
            .limit(1)
        }
      )

      return {
        status: 'healthy',
        details: {
          lastChecked: new Date().toISOString(),
          databaseConnectivity: 'ok',
        },
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          lastChecked: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private validateUserId(userId: UUID): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new ValidationError('Invalid user ID')
    }
  }

  private validateChatId(chatId: UUID): void {
    if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
      throw new ValidationError('Invalid chat ID')
    }
  }

  private validateChatTitle(title: string): void {
    if (!title || typeof title !== 'string') {
      throw new ValidationError('Chat title is required')
    }
    
    if (title.trim().length === 0) {
      throw new ValidationError('Chat title cannot be empty')
    }
    
    if (title.length > CHAT_SESSION_DEFAULTS.MAX_TITLE_LENGTH) {
      throw new ValidationError(`Chat title cannot exceed ${CHAT_SESSION_DEFAULTS.MAX_TITLE_LENGTH} characters`)
    }
  }

  private countContextItems(context: ChatContext): number {
    return (
      (context.selectedDocumentIds?.length || 0) +
      (context.selectedInsightIds?.length || 0) +
      (context.selectedJtbdIds?.length || 0) +
      (context.selectedMetricIds?.length || 0) +
      (context.selectedHmwIds?.length || 0)
    )
  }
}

// Create and export singleton instance
export const chatSessionManager = ChatSessionManagerImpl.getInstance()

// Export the class for testing
export default ChatSessionManagerImpl
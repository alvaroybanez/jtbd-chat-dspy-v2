/**
 * TypeScript interfaces and types for chat session management
 * Defines all session-specific types for JTBD Assistant Platform chat persistence
 */

import type { UUID, Timestamp } from '../../database/types'
import type { Chat, Message } from '../../database/types'

// ===== CHAT SESSION INTERFACES =====

export interface ChatContext {
  selectedDocumentIds?: UUID[]
  selectedInsightIds?: UUID[]
  selectedJtbdIds?: UUID[]
  selectedMetricIds?: UUID[]
  selectedHmwIds?: UUID[]
}

export interface ChatWithMessagesAndContext extends Chat {
  messages: Message[]
  messageCount: number
  lastMessageAt?: Timestamp
  status: 'active' | 'archived' | 'deleted'
  totalTokensUsed: number
  selectedDocumentIds: UUID[]
  selectedInsightIds: UUID[]
  selectedJtbdIds: UUID[]
  selectedMetricIds: UUID[]
  selectedHmwIds: UUID[]
  metadata: Record<string, unknown>
}

// ===== MESSAGE MANAGEMENT INTERFACES =====

export interface MessageInput {
  role: 'user' | 'assistant' | 'system'
  content: string
  intent?: string
  processingTimeMs?: number
  tokensUsed?: number
  contextDocumentChunks?: UUID[]
  contextInsights?: UUID[]
  contextJtbds?: UUID[]
  contextMetrics?: UUID[]
  modelUsed?: string
  temperature?: number
  errorCode?: string
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export interface MessageOptions {
  limit?: number
  offset?: number
  orderBy?: 'created_at' | 'updated_at'
  order?: 'asc' | 'desc'
  includeContext?: boolean
}

// ===== CHAT LISTING AND FILTERING =====

export interface ListChatsOptions {
  page?: number
  pageSize?: number
  status?: 'active' | 'archived' | 'all'
  titleContains?: string
  createdAfter?: Timestamp
  createdBefore?: Timestamp
  orderBy?: 'created_at' | 'updated_at' | 'last_message_at'
  order?: 'asc' | 'desc'
}

export interface PaginatedChats {
  chats: ChatWithMessagesAndContext[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrevious: boolean
  }
}

// ===== SESSION MANAGER INTERFACE =====

export interface ChatSessionManager {
  // Creation
  createChat(userId: UUID, title?: string, initialContext?: ChatContext): Promise<ChatWithMessagesAndContext>
  
  // Loading
  loadChat(chatId: UUID, userId: UUID): Promise<ChatWithMessagesAndContext>
  listChats(userId: UUID, options?: ListChatsOptions): Promise<PaginatedChats>
  
  // Updates
  updateChatTitle(chatId: UUID, title: string, userId: UUID): Promise<void>
  updateChatContext(chatId: UUID, context: ChatContext, userId: UUID): Promise<void>
  
  // Archival/Cleanup
  archiveChat(chatId: UUID, userId: UUID): Promise<void>
  deleteChat(chatId: UUID, userId: UUID): Promise<void>
  cleanupArchivedChats(olderThan: Timestamp): Promise<number>
  
  // Message Management
  addMessage(chatId: UUID, message: MessageInput, userId: UUID): Promise<Message>
  getMessages(chatId: UUID, options?: MessageOptions, userId: UUID): Promise<Message[]>
  
  // Health and Monitoring
  getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details?: Record<string, unknown> }>
}

// ===== OPERATION RESULTS =====

export interface ChatCreateResult {
  chat: ChatWithMessagesAndContext
  success: boolean
  processingTime: number
  warnings?: string[]
}

export interface ChatLoadResult {
  chat: ChatWithMessagesAndContext
  success: boolean
  processingTime: number
  warnings?: string[]
}

// ===== ERROR INTERFACES =====

export interface ChatSessionError extends Error {
  code: string
  chatId?: UUID
  userId?: UUID
  details?: Record<string, unknown>
}

// ===== CONSTANTS =====

export const CHAT_SESSION_DEFAULTS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_TITLE_LENGTH: 100,
  DEFAULT_MESSAGE_LIMIT: 50,
  MAX_MESSAGE_LIMIT: 500,
  CLEANUP_BATCH_SIZE: 100,
  ARCHIVED_RETENTION_DAYS: 90,
  DELETED_RETENTION_DAYS: 30,
} as const

export const CHAT_SESSION_ERROR_CODES = {
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  CHAT_ACCESS_DENIED: 'CHAT_ACCESS_DENIED',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  TITLE_TOO_LONG: 'TITLE_TOO_LONG',
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const

// ===== TYPE GUARDS =====

export function isChatContext(value: unknown): value is ChatContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ChatContext).selectedDocumentIds === undefined ||
    Array.isArray((value as ChatContext).selectedDocumentIds)
  )
}

export function isMessageInput(value: unknown): value is MessageInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MessageInput).role === 'string' &&
    typeof (value as MessageInput).content === 'string' &&
    ['user', 'assistant', 'system'].includes((value as MessageInput).role)
  )
}

export function isChatWithMessagesAndContext(value: unknown): value is ChatWithMessagesAndContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ChatWithMessagesAndContext).id === 'string' &&
    typeof (value as ChatWithMessagesAndContext).userId === 'string' &&
    Array.isArray((value as ChatWithMessagesAndContext).messages) &&
    typeof (value as ChatWithMessagesAndContext).messageCount === 'number'
  )
}
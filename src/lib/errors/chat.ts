/**
 * Chat-specific error classes for JTBD Assistant Platform
 * Extends base error classes with chat session management context
 */

import { BaseError, NotFoundError, UnauthorizedError, type ErrorAction } from './base'
import type { UUID } from '../database/types'

/**
 * Base class for all chat session errors
 */
export class ChatSessionError extends BaseError {
  public readonly chatId?: UUID
  public readonly userId?: UUID

  constructor(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error,
    action: ErrorAction = 'NONE'
  ) {
    super(code, message, action, context, cause)
    
    // Extract chat/user IDs from context for convenience
    this.chatId = context.chatId as UUID
    this.userId = context.userId as UUID
  }
}

/**
 * Chat not found error - when chat doesn't exist or is inaccessible
 */
export class ChatNotFoundError extends NotFoundError {
  constructor(chatId: UUID, userId?: UUID, context: Record<string, unknown> = {}) {
    super(
      'Chat session',
      chatId,
      { chatId, userId, ...context }
    )
  }
}

/**
 * Chat access denied error - when user doesn't have permission to access chat
 */
export class ChatAccessDeniedError extends UnauthorizedError {
  constructor(chatId: UUID, userId: UUID, context: Record<string, unknown> = {}) {
    super(
      `chat session ${chatId}`,
      { chatId, userId, ...context }
    )
  }
}

/**
 * Chat validation error - when chat data is invalid
 */
export class ChatValidationError extends ChatSessionError {
  constructor(
    message: string,
    field?: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      'CHAT_VALIDATION_ERROR',
      message,
      { field, ...context }
    )
  }
}

/**
 * Chat context error - when chat context is invalid
 */
export class ChatContextError extends ChatSessionError {
  constructor(
    message: string,
    chatId?: UUID,
    context: Record<string, unknown> = {}
  ) {
    super(
      'CHAT_CONTEXT_ERROR',
      message,
      { chatId, ...context }
    )
  }
}

/**
 * Chat message error - when message operations fail
 */
export class ChatMessageError extends ChatSessionError {
  constructor(
    message: string,
    chatId?: UUID,
    messageId?: UUID,
    context: Record<string, unknown> = {}
  ) {
    super(
      'CHAT_MESSAGE_ERROR',
      message,
      { chatId, messageId, ...context },
      undefined,
      'RETRY'
    )
  }
}

/**
 * Chat persistence error - when database operations fail
 */
export class ChatPersistenceError extends ChatSessionError {
  constructor(
    operation: string,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      'CHAT_PERSISTENCE_ERROR',
      `Chat ${operation} failed: ${message}`,
      { operation, ...context },
      cause,
      'RETRY'
    )
  }
}

/**
 * Chat title error - when chat title is invalid
 */
export class ChatTitleError extends ChatSessionError {
  constructor(
    title: string,
    reason: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      'CHAT_TITLE_ERROR',
      `Invalid chat title "${title}": ${reason}`,
      { title, reason, ...context }
    )
  }
}

/**
 * Chat archival error - when chat archival operations fail
 */
export class ChatArchivalError extends ChatSessionError {
  constructor(
    operation: 'archive' | 'delete' | 'cleanup',
    chatId?: UUID,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      'CHAT_ARCHIVAL_ERROR',
      `Chat ${operation} operation failed`,
      { operation, chatId, ...context },
      cause,
      'RETRY'
    )
  }
}

// Type guard functions
export function isChatSessionError(error: unknown): error is ChatSessionError {
  return error instanceof ChatSessionError
}

export function isChatNotFoundError(error: unknown): error is ChatNotFoundError {
  return error instanceof ChatNotFoundError
}

export function isChatAccessDeniedError(error: unknown): error is ChatAccessDeniedError {
  return error instanceof ChatAccessDeniedError
}

export function isChatValidationError(error: unknown): error is ChatValidationError {
  return error instanceof ChatValidationError
}

export function isChatPersistenceError(error: unknown): error is ChatPersistenceError {
  return error instanceof ChatPersistenceError
}

// Error code constants
export const CHAT_ERROR_CODES = {
  SESSION_ERROR: 'CHAT_SESSION_ERROR',
  NOT_FOUND: 'CHAT_NOT_FOUND',
  ACCESS_DENIED: 'CHAT_ACCESS_DENIED',
  VALIDATION_ERROR: 'CHAT_VALIDATION_ERROR',
  CONTEXT_ERROR: 'CHAT_CONTEXT_ERROR',
  MESSAGE_ERROR: 'CHAT_MESSAGE_ERROR',
  PERSISTENCE_ERROR: 'CHAT_PERSISTENCE_ERROR',
  TITLE_ERROR: 'CHAT_TITLE_ERROR',
  ARCHIVAL_ERROR: 'CHAT_ARCHIVAL_ERROR',
} as const

export type ChatErrorCode = typeof CHAT_ERROR_CODES[keyof typeof CHAT_ERROR_CODES]
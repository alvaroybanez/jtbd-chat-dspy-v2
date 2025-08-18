/**
 * Chat services module exports
 * Centralized exports for all chat-related services and types
 */

// ===== COMPREHENSIVE TYPE DEFINITIONS =====
export * from './types'

// ===== SERVICE IMPLEMENTATIONS =====
export {
  ChatIntent,
  type IntentDetectionResult,
  intentDetector,
  detectChatIntent,
  requiresContext,
  isRetrievalIntent,
  IntentDetectionError
} from './intent-detector'

export {
  default as contextRetrievalService,
  ContextRetrievalService,
  type ContextRetrievalOptions,
  type ContextRetrievalItem,
  type ContextRetrievalResult
} from './context-retrieval'

export {
  TokenBudgetManager,
  tokenBudgetManager,
  MAX_TOKEN_BUDGET,
  WARNING_THRESHOLD,
  CRITICAL_THRESHOLD
} from './token-budget'

export {
  processChatWithBudget,
  canAddToChat,
  getBudgetHealthMetrics,
  formatBudgetStatusForUser
} from './integration-example'

// ===== CHAT SESSION MANAGEMENT =====
export {
  chatSessionManager,
  ChatSessionManagerImpl,
  type ChatSessionManager,
  type ChatContext,
  type ChatWithMessagesAndContext,
  type MessageInput,
  type MessageOptions,
  type ListChatsOptions,
  type PaginatedChats,
  type ChatCreateResult,
  type ChatLoadResult,
  CHAT_SESSION_DEFAULTS,
  CHAT_SESSION_ERROR_CODES
} from './session-manager'

export * from './session-types'
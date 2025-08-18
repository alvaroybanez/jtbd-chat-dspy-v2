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
} from './session-manager'

export * from './session-types'

// ===== MESSAGE PERSISTENCE PIPELINE =====
export {
  MessagePersistencePipeline,
  messagePersistencePipeline,
  type UserMessagePersistenceData,
  type AssistantMessagePersistenceData,
  type MessagePersistenceResult,
  type StreamingMessagePersistenceContext
} from './message-persistence-pipeline'

// ===== CONTEXT MANAGEMENT SYSTEM =====
export {
  contextManager,
  ContextManagerImpl,
  ContextError,
  ContextLimitError,
  ContextItemNotFoundError
} from './context-manager'

export * from './context-types'
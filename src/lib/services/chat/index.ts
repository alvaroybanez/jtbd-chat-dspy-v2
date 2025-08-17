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
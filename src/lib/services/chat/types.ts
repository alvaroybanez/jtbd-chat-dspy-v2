/**
 * Comprehensive TypeScript interfaces for JTBD Assistant Platform chat services
 * Consolidates all chat-related types, interfaces, and constants for type safety
 */

import type { Message, MessageRole, UUID, Timestamp, Vector } from '../../database/types'

// ===== CHAT INTENT SYSTEM =====

export enum ChatIntent {
  RETRIEVE_INSIGHTS = 'retrieve_insights',
  RETRIEVE_METRICS = 'retrieve_metrics', 
  RETRIEVE_JTBDS = 'retrieve_jtbds',
  GENERATE_HMW = 'generate_hmw',
  CREATE_SOLUTIONS = 'create_solutions',
  GENERAL_EXPLORATION = 'general_exploration'
}

export interface IntentDetectionResult {
  intent: ChatIntent
  confidence: number
  matchedKeywords: string[]
  rawMessage: string
  context?: { alternativeIntents?: Array<{ intent: ChatIntent; confidence: number }>; processingTime: number }
}

export interface IntentDetectionConfig {
  thresholds: { high: number; medium: number; low: number; minimum: number }
  weights: { exact: number; partial: number; position: number; multiple: number }
}

// ===== CONTEXT RETRIEVAL SYSTEM =====

export interface ContextItem {
  id: string
  content: string
  type: 'insight' | 'metric' | 'jtbd' | 'hmw' | 'solution'
  similarity?: number
  metadata: Record<string, unknown>
  displayText: string
  snippet: string
}

export interface RetrievalOptions {
  limit?: number
  threshold?: number
  userId?: string
  page?: number
  pageSize?: number
}

export interface RetrievalResult {
  items: ContextItem[]
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }
  summary: { maxSimilarity: number; averageSimilarity: number; retrievalTime: number; searchType: 'semantic' | 'text' }
}

// ===== TOKEN BUDGET MANAGEMENT =====

export interface TokenBudgetStatus {
  currentTokens: number
  maxTokens: number
  remainingTokens: number
  utilizationPercentage: number
  status: 'healthy' | 'warning' | 'critical' | 'exceeded'
  warnings: string[]
}

export type TruncationStrategy = 'remove_oldest_messages' | 'remove_low_priority_context' | 'compress_content' | 'hybrid'

export interface TruncationResult {
  messages: Message[]
  contextItems: ContextItem[]
  tokensRemoved: number
  messagesRemoved: number
  contextItemsRemoved: number
  preservedItems: { recentMessages: number; systemMessages: number; contextItems: number }
  truncationLog: string[]
}

export interface BudgetOptimization {
  canFit: boolean
  recommendedActions: string[]
  tokenSavings: number
  optimizedMessages?: Message[]
  optimizedContextItems?: ContextItem[]
}

// ===== CHAT FLOW TYPES =====

export interface ChatMessage extends Message {
  detectedIntent?: ChatIntent
  intentConfidence?: number
  associatedContext?: ContextItem[]
  tokenCount: number
}

export interface ChatSession {
  id: UUID
  userId: UUID
  title: string | null
  messages: ChatMessage[]
  budgetStatus: TokenBudgetStatus
  createdAt: Timestamp
  updatedAt: Timestamp
  metadata: { messageCount: number; totalTokens: number; lastActivity: Timestamp; contextItemsCount: number }
}

export interface ChatResponse {
  message: ChatMessage
  session: ChatSession
  processing: { processingTime: number; intentDetection: IntentDetectionResult; contextRetrieval?: RetrievalResult; budgetActions: string[]; usedFallback: boolean }
  warnings: string[]
}

export interface ChatStreamChunk {
  type: 'text' | 'context' | 'processing' | 'complete' | 'error'
  content?: string
  processing?: { stage: string; progress: number; message: string }
  contextItems?: ContextItem[]
  error?: { code: string; message: string; details?: Record<string, unknown> }
}

// ===== CHAT ORCHESTRATION =====

export interface ChatProcessingConfig {
  maxProcessingTime: number
  enableStreaming: boolean
  tokenBudget: { maxTokens: number; warningThreshold: number; criticalThreshold: number }
  intentDetection: IntentDetectionConfig
  contextRetrieval: { defaultLimit: number; defaultThreshold: number; enableCaching: boolean }
  fallback: { enabled: boolean; timeoutMs: number; preserveContext: boolean }
}

export interface ChatProcessingResult {
  success: boolean
  response?: ChatResponse
  error?: { code: string; message: string; details?: Record<string, unknown> }
  metrics: { totalTime: number; intentDetectionTime: number; contextRetrievalTime: number; generationTime: number; tokenCount: number }
}

// ===== CONSTANTS AND DEFAULTS =====

export const CHAT_DEFAULTS = {
  TOKEN_BUDGET: { MAX_TOKENS: 4000, WARNING_THRESHOLD: 0.8, CRITICAL_THRESHOLD: 0.95, MIN_CONTEXT_TOKENS: 500, MIN_RECENT_MESSAGES: 2 },
  INTENT_DETECTION: { THRESHOLDS: { HIGH: 0.8, MEDIUM: 0.6, LOW: 0.4, MINIMUM: 0.3 }, WEIGHTS: { EXACT: 1.0, PARTIAL: 0.7, POSITION: 0.1, MULTIPLE: 0.2 } },
  CONTEXT_RETRIEVAL: { DEFAULT_LIMIT: 20, DEFAULT_THRESHOLD: 0.7, DEFAULT_PAGE_SIZE: 20, MAX_SNIPPET_LENGTH: 150, MAX_DISPLAY_TEXT_LENGTH: 100 },
  TIMEOUTS: { INTENT_DETECTION: 1000, CONTEXT_RETRIEVAL: 5000, RESPONSE_GENERATION: 30000, TOTAL_PROCESSING: 45000 },
  DISPLAY: { MAX_CONTEXT_ITEMS: 50, MAX_MESSAGE_PREVIEW: 200, MAX_TITLE_LENGTH: 100, ITEMS_PER_PAGE: 20 }
} as const

export const DEFAULT_RETRIEVAL_OPTIONS: Required<RetrievalOptions> = {
  limit: CHAT_DEFAULTS.CONTEXT_RETRIEVAL.DEFAULT_LIMIT,
  threshold: CHAT_DEFAULTS.CONTEXT_RETRIEVAL.DEFAULT_THRESHOLD,
  userId: '',
  page: 1,
  pageSize: CHAT_DEFAULTS.CONTEXT_RETRIEVAL.DEFAULT_PAGE_SIZE
} as const

export const INTENT_PRIORITIES: Record<ChatIntent, number> = {
  [ChatIntent.GENERAL_EXPLORATION]: 1,
  [ChatIntent.RETRIEVE_INSIGHTS]: 2,
  [ChatIntent.RETRIEVE_METRICS]: 2,
  [ChatIntent.RETRIEVE_JTBDS]: 2,
  [ChatIntent.GENERATE_HMW]: 3,
  [ChatIntent.CREATE_SOLUTIONS]: 3
} as const

export const CONTEXT_TYPE_PRIORITIES: Record<ContextItem['type'], number> = {
  insight: 1, metric: 1, jtbd: 1, hmw: 2, solution: 3
} as const

export const CHAT_ERROR_CODES = {
  INTENT_DETECTION_FAILED: 'INTENT_DETECTION_FAILED',
  CONTEXT_RETRIEVAL_FAILED: 'CONTEXT_RETRIEVAL_FAILED',
  TOKEN_BUDGET_EXCEEDED: 'TOKEN_BUDGET_EXCEEDED',
  PROCESSING_TIMEOUT: 'PROCESSING_TIMEOUT',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
} as const

// ===== TYPE GUARDS =====

export function isChatIntent(value: unknown): value is ChatIntent {
  return typeof value === 'string' && Object.values(ChatIntent).includes(value as ChatIntent)
}

export function isContextItem(value: unknown): value is ContextItem {
  return typeof value === 'object' && value !== null && 'id' in value && 'content' in value && 'type' in value && 'displayText' in value && 'snippet' in value
}

export function isChatMessage(value: unknown): value is ChatMessage {
  return typeof value === 'object' && value !== null && 'id' in value && 'content' in value && 'role' in value && 'tokenCount' in value
}
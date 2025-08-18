/**
 * Context Management Types for JTBD Assistant Platform
 * Defines all types for stateful context selection, tracking, and notifications
 */

import type { UUID, Timestamp } from '../../database/types'

// ===== CORE CONTEXT TYPES =====

export type ContextItemType = 'document' | 'insight' | 'jtbd' | 'metric'

export interface ContextItem {
  id: UUID
  type: ContextItemType
  title: string
  content: string
  similarity?: number
  metadata: Record<string, unknown>
  addedAt: Timestamp
  lastUsedAt?: Timestamp
}

export interface ContextState {
  chatId: UUID
  userId: UUID
  documents: ContextItem[]
  insights: ContextItem[]
  jtbds: ContextItem[]
  metrics: ContextItem[]
  totalItems: number
  lastUpdated: Timestamp
}

// ===== CONTEXT OPERATIONS =====

export interface ContextOperation {
  type: 'add' | 'remove' | 'clear' | 'update'
  itemType?: ContextItemType
  itemId?: UUID
  chatId: UUID
  userId: UUID
  timestamp: Timestamp
  metadata?: Record<string, unknown>
}

export interface ContextOperationResult {
  success: boolean
  operation: ContextOperation
  affectedItems: number
  newState: ContextState
  warnings?: string[]
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// ===== CONTEXT SELECTION =====

export interface ContextSelectionCriteria {
  itemType: ContextItemType
  itemId: UUID
  userId: UUID
  metadata?: Record<string, unknown>
}

export interface BulkContextOperation {
  operations: Array<{
    type: 'add' | 'remove'
    itemType: ContextItemType
    itemId: UUID
  }>
  chatId: UUID
  userId: UUID
  metadata?: Record<string, unknown>
}

// ===== CONTEXT LOADING & HYDRATION =====

export interface ContextLoadOptions {
  includeContent?: boolean
  includeSimilarityScores?: boolean
  includeUsageStats?: boolean
  sortBy?: 'addedAt' | 'lastUsedAt' | 'similarity' | 'title'
  sortOrder?: 'asc' | 'desc'
}

export interface ContextHydrationResult {
  context: ContextState
  missingItems: Array<{ itemType: ContextItemType; itemId: UUID }>
  hydrationTime: number
  fromCache: boolean
}

// ===== CONTEXT USAGE TRACKING =====

export interface ContextUsageEvent {
  chatId: UUID
  userId: UUID
  messageId?: UUID
  contextItems: Array<{
    itemType: ContextItemType
    itemId: UUID
    utilizationScore: number // 0-1 based on how much content was used
  }>
  intent?: string
  timestamp: Timestamp
  metadata?: Record<string, unknown>
}

export interface ContextUsageMetrics {
  itemType: ContextItemType
  itemId: UUID
  title: string
  totalUsages: number
  averageUtilization: number
  firstUsedAt: Timestamp
  lastUsedAt: Timestamp
  associatedIntents: string[]
  performanceScore: number // Combined metric of usage frequency and effectiveness
}

export interface ContextAnalytics {
  chatId: UUID
  userId: UUID
  timeRange: {
    start: Timestamp
    end: Timestamp
  }
  summary: {
    totalItems: number
    totalUsages: number
    averageItemsPerMessage: number
    mostUsedType: ContextItemType
  }
  itemMetrics: ContextUsageMetrics[]
  recommendations: string[]
}

// ===== CONTEXT EVENTS & NOTIFICATIONS =====

export interface ContextUpdateEvent {
  type: 'context_updated'
  chatId: UUID
  userId: UUID
  operation: ContextOperation
  previousState: Pick<ContextState, 'totalItems' | 'lastUpdated'>
  newState: Pick<ContextState, 'totalItems' | 'lastUpdated'>
  affectedItems: number
  timestamp: Timestamp
}

export interface ContextValidationEvent {
  type: 'context_validated'
  chatId: UUID
  userId: UUID
  validItems: number
  invalidItems: Array<{ itemType: ContextItemType; itemId: UUID; reason: string }>
  timestamp: Timestamp
}

export interface ContextUsageNotificationEvent {
  type: 'context_usage'
  chatId: UUID
  userId: UUID
  messageId: UUID
  usedItems: Array<{
    itemType: ContextItemType
    itemId: UUID
    utilizationScore: number
  }>
  intent: string
  timestamp: Timestamp
}

export type ContextEvent = ContextUpdateEvent | ContextValidationEvent | ContextUsageNotificationEvent

export interface ContextEventSubscriber {
  id: string
  callback: (event: ContextEvent) => void | Promise<void>
  eventTypes?: ContextEvent['type'][]
}

// ===== CONTEXT MANAGER INTERFACE =====

export interface ContextManager {
  // Context Selection
  addToContext(chatId: UUID, criteria: ContextSelectionCriteria): Promise<ContextOperationResult>
  addMultipleToContext(operation: BulkContextOperation): Promise<ContextOperationResult>
  removeFromContext(chatId: UUID, itemType: ContextItemType, itemId: UUID, userId: UUID): Promise<ContextOperationResult>
  clearContext(chatId: UUID, userId: UUID, itemType?: ContextItemType): Promise<ContextOperationResult>
  
  // Context Loading & State
  loadContextWithData(chatId: UUID, userId: UUID, options?: ContextLoadOptions): Promise<ContextHydrationResult>
  getChatContext(chatId: UUID, userId: UUID): Promise<ContextState>
  validateContext(chatId: UUID, userId: UUID): Promise<{ validItems: number; invalidItems: Array<{ itemType: ContextItemType; itemId: UUID; reason: string }> }>
  
  // Usage Tracking
  trackContextUsage(usage: ContextUsageEvent): Promise<void>
  getContextUsageStats(chatId: UUID, userId: UUID, timeRangeHours?: number): Promise<ContextAnalytics>
  getItemUsageMetrics(itemType: ContextItemType, itemId: UUID, userId: UUID): Promise<ContextUsageMetrics | null>
  
  // Event Management
  subscribe(subscriber: ContextEventSubscriber): string
  unsubscribe(subscriberId: string): boolean
  emit(event: ContextEvent): Promise<void>
  
  // Utilities
  getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details?: Record<string, unknown> }>
}

// ===== CONSTANTS =====

export const CONTEXT_DEFAULTS = {
  MAX_ITEMS_PER_TYPE: 50,
  MAX_TOTAL_ITEMS: 100,
  DEFAULT_LOAD_LIMIT: 20,
  USAGE_TRACKING_RETENTION_DAYS: 30,
  CACHE_TTL_SECONDS: 300, // 5 minutes
  VALIDATION_INTERVAL_HOURS: 24,
} as const

export const CONTEXT_ERROR_CODES = {
  CONTEXT_NOT_FOUND: 'CONTEXT_NOT_FOUND',
  CONTEXT_LIMIT_EXCEEDED: 'CONTEXT_LIMIT_EXCEEDED',
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
  ITEM_ALREADY_SELECTED: 'ITEM_ALREADY_SELECTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  HYDRATION_FAILED: 'HYDRATION_FAILED',
  USAGE_TRACKING_FAILED: 'USAGE_TRACKING_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

// ===== TYPE GUARDS =====

export function isContextItem(obj: unknown): obj is ContextItem {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'type' in obj &&
    'title' in obj &&
    'content' in obj &&
    typeof (obj as any).id === 'string' &&
    ['document', 'insight', 'jtbd', 'metric'].includes((obj as any).type)
  )
}

export function isContextState(obj: unknown): obj is ContextState {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'chatId' in obj &&
    'userId' in obj &&
    'documents' in obj &&
    'insights' in obj &&
    'jtbds' in obj &&
    'metrics' in obj &&
    'totalItems' in obj &&
    Array.isArray((obj as any).documents) &&
    Array.isArray((obj as any).insights) &&
    Array.isArray((obj as any).jtbds) &&
    Array.isArray((obj as any).metrics)
  )
}

export function isContextOperation(obj: unknown): obj is ContextOperation {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    'chatId' in obj &&
    'userId' in obj &&
    'timestamp' in obj &&
    ['add', 'remove', 'clear', 'update'].includes((obj as any).type)
  )
}

export function isContextSelectionCriteria(obj: unknown): obj is ContextSelectionCriteria {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'itemType' in obj &&
    'itemId' in obj &&
    'userId' in obj &&
    typeof (obj as any).itemType === 'string' &&
    typeof (obj as any).itemId === 'string' &&
    typeof (obj as any).userId === 'string' &&
    ['document', 'insight', 'jtbd', 'metric'].includes((obj as any).itemType)
  )
}
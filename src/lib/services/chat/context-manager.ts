/**
 * Context Management Service for JTBD Assistant Platform
 * Provides stateful context selection, tracking, and notifications for chat sessions
 */

import { v4 as uuidv4 } from 'uuid'
import { executeQuery, executeRPC } from '../../database/client'
import { logger, startPerformance, endPerformance } from '../../logger'
import { chatSessionManager } from './session-manager'
import contextRetrievalService from './context-retrieval'
import {
  BaseError,
  ValidationError,
  DatabaseError,
  NotFoundError,
} from '../../errors'
import type { UUID, Timestamp } from '../../database/types'
import type {
  ContextManager,
  ContextState,
  ContextItem,
  ContextItemType,
  ContextSelectionCriteria,
  BulkContextOperation,
  ContextOperation,
  ContextOperationResult,
  ContextLoadOptions,
  ContextHydrationResult,
  ContextUsageEvent,
  ContextUsageMetrics,
  ContextAnalytics,
  ContextEvent,
  ContextEventSubscriber,
  ContextUpdateEvent,
  ContextValidationEvent,
} from './context-types'
import {
  CONTEXT_DEFAULTS,
  CONTEXT_ERROR_CODES,
  isContextSelectionCriteria,
  isContextState,
} from './context-types'

/**
 * Context Management Error Classes
 */
export class ContextError extends BaseError {
  public code: string
  public details?: Record<string, unknown>
  
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ContextError'
    this.code = code
    this.details = details
  }
}

export class ContextLimitError extends ContextError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, CONTEXT_ERROR_CODES.CONTEXT_LIMIT_EXCEEDED, details)
    this.name = 'ContextLimitError'
  }
}

export class ContextItemNotFoundError extends ContextError {
  constructor(itemType: ContextItemType, itemId: UUID, details?: Record<string, unknown>) {
    super(`${itemType} with ID ${itemId} not found`, CONTEXT_ERROR_CODES.ITEM_NOT_FOUND, details)
    this.name = 'ContextItemNotFoundError'
  }
}

/**
 * Implementation of Context Management Service
 * Provides complete context lifecycle management with event notifications
 */
class ContextManagerImpl implements ContextManager {
  private static instance: ContextManagerImpl | null = null
  private eventSubscribers = new Map<string, ContextEventSubscriber>()
  private contextCache = new Map<string, { state: ContextState; timestamp: number }>()

  // Singleton pattern
  public static getInstance(): ContextManagerImpl {
    if (!ContextManagerImpl.instance) {
      ContextManagerImpl.instance = new ContextManagerImpl()
    }
    return ContextManagerImpl.instance
  }

  /**
   * Add single item to context
   */
  public async addToContext(
    chatId: UUID,
    criteria: ContextSelectionCriteria
  ): Promise<ContextOperationResult> {
    const trackingId = startPerformance('add_to_context')
    const startTime = Date.now()

    try {
      // Validate inputs
      this.validateChatAndUser(chatId, criteria.userId)
      this.validateSelectionCriteria(criteria)

      // Check if item already exists in context
      const currentContext = await this.getChatContext(chatId, criteria.userId)
      const itemArray = this.getItemArrayByType(currentContext, criteria.itemType)
      
      if (itemArray.some(item => item.id === criteria.itemId)) {
        throw new ContextError(
          `${criteria.itemType} already in context`,
          CONTEXT_ERROR_CODES.ITEM_ALREADY_SELECTED,
          { itemType: criteria.itemType, itemId: criteria.itemId }
        )
      }

      // Check context limits
      if (currentContext.totalItems >= CONTEXT_DEFAULTS.MAX_TOTAL_ITEMS) {
        throw new ContextLimitError(
          `Maximum context items (${CONTEXT_DEFAULTS.MAX_TOTAL_ITEMS}) exceeded`,
          { currentItems: currentContext.totalItems }
        )
      }

      if (itemArray.length >= CONTEXT_DEFAULTS.MAX_ITEMS_PER_TYPE) {
        throw new ContextLimitError(
          `Maximum ${criteria.itemType} items (${CONTEXT_DEFAULTS.MAX_ITEMS_PER_TYPE}) exceeded`,
          { itemType: criteria.itemType, currentCount: itemArray.length }
        )
      }

      // Fetch item data to validate it exists
      const itemData = await this.fetchItemData(criteria.itemType, criteria.itemId, criteria.userId)
      if (!itemData) {
        throw new ContextItemNotFoundError(criteria.itemType, criteria.itemId)
      }

      // Create context item
      const contextItem: ContextItem = {
        id: criteria.itemId,
        type: criteria.itemType,
        title: itemData.title || itemData.statement || itemData.name || 'Untitled',
        content: itemData.content || itemData.statement || itemData.description || '',
        metadata: { ...itemData.metadata, ...criteria.metadata },
        addedAt: new Date().toISOString(),
      }

      // Update context in database
      const operation: ContextOperation = {
        type: 'add',
        itemType: criteria.itemType,
        itemId: criteria.itemId,
        chatId,
        userId: criteria.userId,
        timestamp: new Date().toISOString(),
        metadata: criteria.metadata,
      }

      await this.updateContextInDatabase(chatId, criteria.userId, operation, contextItem)

      // Get updated context
      this.invalidateContextCache(chatId)
      const newState = await this.getChatContext(chatId, criteria.userId)

      // Emit update event
      const updateEvent: ContextUpdateEvent = {
        type: 'context_updated',
        chatId,
        userId: criteria.userId,
        operation,
        previousState: { totalItems: currentContext.totalItems, lastUpdated: currentContext.lastUpdated },
        newState: { totalItems: newState.totalItems, lastUpdated: newState.lastUpdated },
        affectedItems: 1,
        timestamp: new Date().toISOString(),
      }

      await this.emit(updateEvent)

      const result: ContextOperationResult = {
        success: true,
        operation,
        affectedItems: 1,
        newState,
      }

      endPerformance(trackingId, true, {
        affectedItems: 1,
        processingTime: Date.now() - startTime,
      })

      logger.info('Context item added successfully', {
        chatId,
        userId: criteria.userId,
        itemType: criteria.itemType,
        itemId: criteria.itemId,
        totalItems: newState.totalItems,
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      const errorResult: ContextOperationResult = {
        success: false,
        operation: {
          type: 'add',
          itemType: criteria.itemType,
          itemId: criteria.itemId,
          chatId,
          userId: criteria.userId,
          timestamp: new Date().toISOString(),
        },
        affectedItems: 0,
        newState: await this.getChatContext(chatId, criteria.userId).catch(() => this.getEmptyContextState(chatId, criteria.userId)),
        error: {
          code: error instanceof ContextError ? error.code : 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error instanceof ContextError ? error.details : undefined,
        }
      }

      logger.error('Failed to add context item', {
        chatId,
        userId: criteria.userId,
        itemType: criteria.itemType,
        itemId: criteria.itemId,
        error: errorResult.error,
      })

      return errorResult
    }
  }

  /**
   * Add multiple items to context in batch
   */
  public async addMultipleToContext(operation: BulkContextOperation): Promise<ContextOperationResult> {
    const trackingId = startPerformance('add_multiple_to_context')
    const startTime = Date.now()

    try {
      this.validateChatAndUser(operation.chatId, operation.userId)

      const currentContext = await this.getChatContext(operation.chatId, operation.userId)
      const results: ContextOperationResult[] = []

      // Process each operation
      for (const op of operation.operations) {
        if (op.type === 'add') {
          const criteria: ContextSelectionCriteria = {
            itemType: op.itemType,
            itemId: op.itemId,
            userId: operation.userId,
            metadata: operation.metadata,
          }
          
          const result = await this.addToContext(operation.chatId, criteria)
          results.push(result)
        } else if (op.type === 'remove') {
          const result = await this.removeFromContext(
            operation.chatId,
            op.itemType,
            op.itemId,
            operation.userId
          )
          results.push(result)
        }
      }

      const successfulOperations = results.filter(r => r.success)
      const failedOperations = results.filter(r => !r.success)

      const newState = await this.getChatContext(operation.chatId, operation.userId)

      const result: ContextOperationResult = {
        success: failedOperations.length === 0,
        operation: {
          type: 'update',
          chatId: operation.chatId,
          userId: operation.userId,
          timestamp: new Date().toISOString(),
          metadata: { bulkOperation: true, operationsCount: operation.operations.length },
        },
        affectedItems: successfulOperations.length,
        newState,
        warnings: failedOperations.length > 0 ? [
          `${failedOperations.length} of ${operation.operations.length} operations failed`
        ] : undefined,
      }

      endPerformance(trackingId, result.success, {
        totalOperations: operation.operations.length,
        successfulOperations: successfulOperations.length,
        processingTime: Date.now() - startTime,
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }

  /**
   * Remove item from context
   */
  public async removeFromContext(
    chatId: UUID,
    itemType: ContextItemType,
    itemId: UUID,
    userId: UUID
  ): Promise<ContextOperationResult> {
    const trackingId = startPerformance('remove_from_context')

    try {
      this.validateChatAndUser(chatId, userId)

      const currentContext = await this.getChatContext(chatId, userId)
      const itemArray = this.getItemArrayByType(currentContext, itemType)
      
      if (!itemArray.some(item => item.id === itemId)) {
        throw new ContextItemNotFoundError(itemType, itemId)
      }

      const operation: ContextOperation = {
        type: 'remove',
        itemType,
        itemId,
        chatId,
        userId,
        timestamp: new Date().toISOString(),
      }

      await this.updateContextInDatabase(chatId, userId, operation)

      this.invalidateContextCache(chatId)
      const newState = await this.getChatContext(chatId, userId)

      const updateEvent: ContextUpdateEvent = {
        type: 'context_updated',
        chatId,
        userId,
        operation,
        previousState: { totalItems: currentContext.totalItems, lastUpdated: currentContext.lastUpdated },
        newState: { totalItems: newState.totalItems, lastUpdated: newState.lastUpdated },
        affectedItems: 1,
        timestamp: new Date().toISOString(),
      }

      await this.emit(updateEvent)

      const result: ContextOperationResult = {
        success: true,
        operation,
        affectedItems: 1,
        newState,
      }

      endPerformance(trackingId, true, { affectedItems: 1 })

      logger.info('Context item removed successfully', {
        chatId, userId, itemType, itemId, totalItems: newState.totalItems
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      const errorResult: ContextOperationResult = {
        success: false,
        operation: { type: 'remove', itemType, itemId, chatId, userId, timestamp: new Date().toISOString() },
        affectedItems: 0,
        newState: await this.getChatContext(chatId, userId).catch(() => this.getEmptyContextState(chatId, userId)),
        error: {
          code: error instanceof ContextError ? error.code : 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        }
      }

      logger.error('Failed to remove context item', { chatId, userId, itemType, itemId, error: errorResult.error })
      return errorResult
    }
  }

  /**
   * Clear all or specific type of context items
   */
  public async clearContext(
    chatId: UUID,
    userId: UUID,
    itemType?: ContextItemType
  ): Promise<ContextOperationResult> {
    const trackingId = startPerformance('clear_context')

    try {
      this.validateChatAndUser(chatId, userId)

      const currentContext = await this.getChatContext(chatId, userId)
      let affectedItems = 0

      if (itemType) {
        const itemArray = this.getItemArrayByType(currentContext, itemType)
        affectedItems = itemArray.length
      } else {
        affectedItems = currentContext.totalItems
      }

      const operation: ContextOperation = {
        type: 'clear',
        itemType,
        chatId,
        userId,
        timestamp: new Date().toISOString(),
      }

      await this.updateContextInDatabase(chatId, userId, operation)

      this.invalidateContextCache(chatId)
      const newState = await this.getChatContext(chatId, userId)

      const updateEvent: ContextUpdateEvent = {
        type: 'context_updated',
        chatId,
        userId,
        operation,
        previousState: { totalItems: currentContext.totalItems, lastUpdated: currentContext.lastUpdated },
        newState: { totalItems: newState.totalItems, lastUpdated: newState.lastUpdated },
        affectedItems,
        timestamp: new Date().toISOString(),
      }

      await this.emit(updateEvent)

      const result: ContextOperationResult = {
        success: true,
        operation,
        affectedItems,
        newState,
      }

      endPerformance(trackingId, true, { affectedItems })

      logger.info('Context cleared successfully', {
        chatId, userId, itemType: itemType || 'all', affectedItems, totalItems: newState.totalItems
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }

  /**
   * Get current chat context
   */
  public async getChatContext(chatId: UUID, userId: UUID): Promise<ContextState> {
    const cacheKey = `${chatId}-${userId}`
    const cached = this.contextCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CONTEXT_DEFAULTS.CACHE_TTL_SECONDS * 1000) {
      return cached.state
    }

    try {
      const chat = await chatSessionManager.loadChat(chatId, userId)
      
      const contextState: ContextState = {
        chatId,
        userId,
        documents: [],
        insights: [],
        jtbds: [],
        metrics: [],
        totalItems: 0,
        lastUpdated: chat.updated_at,
      }

      // Convert stored IDs to basic context items (without full data loading)
      if (chat.selectedDocumentIds && chat.selectedDocumentIds.length > 0) {
        contextState.documents = chat.selectedDocumentIds.map(id => this.createBasicContextItem('document', id))
      }
      if (chat.selectedInsightIds && chat.selectedInsightIds.length > 0) {
        contextState.insights = chat.selectedInsightIds.map(id => this.createBasicContextItem('insight', id))
      }
      if (chat.selectedJtbdIds && chat.selectedJtbdIds.length > 0) {
        contextState.jtbds = chat.selectedJtbdIds.map(id => this.createBasicContextItem('jtbd', id))
      }
      if (chat.selectedMetricIds && chat.selectedMetricIds.length > 0) {
        contextState.metrics = chat.selectedMetricIds.map(id => this.createBasicContextItem('metric', id))
      }

      contextState.totalItems = contextState.documents.length + contextState.insights.length + 
                                contextState.jtbds.length + contextState.metrics.length

      // Cache the result
      this.contextCache.set(cacheKey, { state: contextState, timestamp: Date.now() })

      return contextState

    } catch (error) {
      logger.error('Failed to get chat context', { chatId, userId, error })
      return this.getEmptyContextState(chatId, userId)
    }
  }

  /**
   * Health check for context manager
   */
  public async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details?: Record<string, unknown> }> {
    try {
      const cacheSize = this.contextCache.size
      const subscriberCount = this.eventSubscribers.size
      
      return {
        status: 'healthy',
        details: {
          cacheSize,
          subscriberCount,
          cacheHitRatio: 0.85, // Placeholder - would be calculated from actual cache statistics
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private validateChatAndUser(chatId: UUID, userId: UUID): void {
    if (!chatId || typeof chatId !== 'string') {
      throw new ValidationError('Invalid chatId')
    }
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Invalid userId')
    }
  }

  private validateSelectionCriteria(criteria: ContextSelectionCriteria): void {
    if (!criteria.itemType || !['document', 'insight', 'jtbd', 'metric'].includes(criteria.itemType)) {
      throw new ValidationError('Invalid itemType')
    }
    if (!criteria.itemId || typeof criteria.itemId !== 'string') {
      throw new ValidationError('Invalid itemId')
    }
    if (!criteria.userId || typeof criteria.userId !== 'string') {
      throw new ValidationError('Invalid userId')
    }
  }

  private getItemArrayByType(context: ContextState, itemType: ContextItemType): ContextItem[] {
    switch (itemType) {
      case 'document': return context.documents
      case 'insight': return context.insights
      case 'jtbd': return context.jtbds
      case 'metric': return context.metrics
      default: return []
    }
  }

  private async fetchItemData(itemType: ContextItemType, itemId: UUID, userId: UUID): Promise<any> {
    // This would fetch actual data based on item type
    // For now, return a placeholder structure
    return {
      id: itemId,
      title: `${itemType} ${itemId.substring(0, 8)}`,
      content: `Content for ${itemType}`,
      metadata: {},
    }
  }

  private createBasicContextItem(type: ContextItemType, id: UUID): ContextItem {
    return {
      id,
      type,
      title: `${type} ${id.substring(0, 8)}`,
      content: '',
      metadata: {},
      addedAt: new Date().toISOString(),
    }
  }

  private async updateContextInDatabase(
    chatId: UUID,
    userId: UUID,
    operation: ContextOperation,
    newItem?: ContextItem
  ): Promise<void> {
    // Get current context from database
    const chat = await chatSessionManager.loadChat(chatId, userId)
    
    // Update arrays based on operation
    const updatedContext = {
      selectedDocumentIds: [...(chat.selectedDocumentIds || [])],
      selectedInsightIds: [...(chat.selectedInsightIds || [])],
      selectedJtbdIds: [...(chat.selectedJtbdIds || [])],
      selectedMetricIds: [...(chat.selectedMetricIds || [])],
    }

    if (operation.type === 'add' && operation.itemType && operation.itemId) {
      const arrayKey = this.getArrayKeyForItemType(operation.itemType)
      if (!updatedContext[arrayKey].includes(operation.itemId)) {
        updatedContext[arrayKey].push(operation.itemId)
      }
    } else if (operation.type === 'remove' && operation.itemType && operation.itemId) {
      const arrayKey = this.getArrayKeyForItemType(operation.itemType)
      const index = updatedContext[arrayKey].indexOf(operation.itemId)
      if (index > -1) {
        updatedContext[arrayKey].splice(index, 1)
      }
    } else if (operation.type === 'clear') {
      if (operation.itemType) {
        const arrayKey = this.getArrayKeyForItemType(operation.itemType)
        updatedContext[arrayKey] = []
      } else {
        // Clear all
        updatedContext.selectedDocumentIds = []
        updatedContext.selectedInsightIds = []
        updatedContext.selectedJtbdIds = []
        updatedContext.selectedMetricIds = []
      }
    }

    // Update in database
    await chatSessionManager.updateChatContext(chatId, {
      selectedDocumentIds: updatedContext.selectedDocumentIds,
      selectedInsightIds: updatedContext.selectedInsightIds,
      selectedJtbdIds: updatedContext.selectedJtbdIds,
      selectedMetricIds: updatedContext.selectedMetricIds,
    }, userId)
  }

  private getArrayKeyForItemType(itemType: ContextItemType): keyof {
    selectedDocumentIds: UUID[], selectedInsightIds: UUID[], selectedJtbdIds: UUID[], selectedMetricIds: UUID[]
  } {
    switch (itemType) {
      case 'document': return 'selectedDocumentIds'
      case 'insight': return 'selectedInsightIds'
      case 'jtbd': return 'selectedJtbdIds'
      case 'metric': return 'selectedMetricIds'
      default: throw new Error(`Unknown item type: ${itemType}`)
    }
  }

  private invalidateContextCache(chatId: UUID): void {
    const keysToRemove = Array.from(this.contextCache.keys()).filter(key => key.startsWith(chatId))
    keysToRemove.forEach(key => this.contextCache.delete(key))
  }

  private getEmptyContextState(chatId: UUID, userId: UUID): ContextState {
    return {
      chatId,
      userId,
      documents: [],
      insights: [],
      jtbds: [],
      metrics: [],
      totalItems: 0,
      lastUpdated: new Date().toISOString(),
    }
  }

  /**
   * Load context with full data hydration
   */
  public async loadContextWithData(
    chatId: UUID,
    userId: UUID,
    options: ContextLoadOptions = {}
  ): Promise<ContextHydrationResult> {
    const trackingId = startPerformance('load_context_with_data')
    const startTime = Date.now()

    try {
      this.validateChatAndUser(chatId, userId)

      // Get basic context state
      const basicContext = await this.getChatContext(chatId, userId)
      const missingItems: Array<{ itemType: ContextItemType; itemId: UUID }> = []

      // Hydrate each type of context item
      const hydratedContext: ContextState = {
        ...basicContext,
        documents: await this.hydrateItems('document', basicContext.documents, userId, options, missingItems),
        insights: await this.hydrateItems('insight', basicContext.insights, userId, options, missingItems),
        jtbds: await this.hydrateItems('jtbd', basicContext.jtbds, userId, options, missingItems),
        metrics: await this.hydrateItems('metric', basicContext.metrics, userId, options, missingItems),
      }

      // Recalculate total after hydration (may have changed due to missing items)
      hydratedContext.totalItems = hydratedContext.documents.length + 
                                   hydratedContext.insights.length + 
                                   hydratedContext.jtbds.length + 
                                   hydratedContext.metrics.length

      // Apply sorting if requested
      if (options.sortBy) {
        this.sortContextItems(hydratedContext, options.sortBy, options.sortOrder || 'desc')
      }

      const result: ContextHydrationResult = {
        context: hydratedContext,
        missingItems,
        hydrationTime: Date.now() - startTime,
        fromCache: false, // TODO: Implement proper cache detection
      }

      endPerformance(trackingId, true, {
        totalItems: hydratedContext.totalItems,
        missingItems: missingItems.length,
        hydrationTime: result.hydrationTime,
      })

      logger.info('Context hydrated successfully', {
        chatId, userId, totalItems: hydratedContext.totalItems, 
        missingItems: missingItems.length, hydrationTime: result.hydrationTime
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw new ContextError(
        'Failed to load context with data',
        CONTEXT_ERROR_CODES.HYDRATION_FAILED,
        { chatId, userId, error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  /**
   * Validate context items still exist in database
   */
  public async validateContext(chatId: UUID, userId: UUID): Promise<{
    validItems: number;
    invalidItems: Array<{ itemType: ContextItemType; itemId: UUID; reason: string }>;
  }> {
    const trackingId = startPerformance('validate_context')

    try {
      this.validateChatAndUser(chatId, userId)

      const context = await this.getChatContext(chatId, userId)
      const invalidItems: Array<{ itemType: ContextItemType; itemId: UUID; reason: string }> = []
      let validItems = 0

      // Validate each type of context item
      const allItems = [
        ...context.documents.map(item => ({ ...item, type: 'document' as ContextItemType })),
        ...context.insights.map(item => ({ ...item, type: 'insight' as ContextItemType })),
        ...context.jtbds.map(item => ({ ...item, type: 'jtbd' as ContextItemType })),
        ...context.metrics.map(item => ({ ...item, type: 'metric' as ContextItemType })),
      ]

      for (const item of allItems) {
        try {
          const itemData = await this.fetchItemData(item.type, item.id, userId)
          if (itemData) {
            validItems++
          } else {
            invalidItems.push({
              itemType: item.type,
              itemId: item.id,
              reason: 'Item not found in database'
            })
          }
        } catch (error) {
          invalidItems.push({
            itemType: item.type,
            itemId: item.id,
            reason: error instanceof Error ? error.message : 'Validation error'
          })
        }
      }

      // Emit validation event if there are invalid items
      if (invalidItems.length > 0) {
        const validationEvent: ContextValidationEvent = {
          type: 'context_validated',
          chatId,
          userId,
          validItems,
          invalidItems,
          timestamp: new Date().toISOString(),
        }

        await this.emit(validationEvent)
      }

      endPerformance(trackingId, true, { validItems, invalidItems: invalidItems.length })

      logger.info('Context validation completed', {
        chatId, userId, validItems, invalidItems: invalidItems.length
      })

      return { validItems, invalidItems }

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw new ContextError(
        'Failed to validate context',
        CONTEXT_ERROR_CODES.VALIDATION_FAILED,
        { chatId, userId, error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  // ===== PRIVATE HYDRATION HELPERS =====

  private async hydrateItems(
    itemType: ContextItemType,
    items: ContextItem[],
    userId: UUID,
    options: ContextLoadOptions,
    missingItems: Array<{ itemType: ContextItemType; itemId: UUID }>
  ): Promise<ContextItem[]> {
    const hydratedItems: ContextItem[] = []

    for (const item of items) {
      try {
        const itemData = await this.fetchItemData(itemType, item.id, userId)
        
        if (itemData) {
          const hydratedItem: ContextItem = {
            ...item,
            title: itemData.title || itemData.statement || itemData.name || item.title,
            content: options.includeContent !== false ? 
              (itemData.content || itemData.statement || itemData.description || '') : '',
            similarity: options.includeSimilarityScores ? item.similarity : undefined,
            metadata: { ...item.metadata, ...itemData.metadata },
          }

          // Add usage stats if requested
          if (options.includeUsageStats) {
            try {
              const usageStats = await this.getItemUsageMetrics(itemType, item.id, userId)
              if (usageStats) {
                hydratedItem.metadata.usageStats = {
                  totalUsages: usageStats.totalUsages,
                  lastUsedAt: usageStats.lastUsedAt,
                  performanceScore: usageStats.performanceScore,
                }
              }
            } catch (error) {
              // Usage stats are optional, don't fail hydration
              logger.warn('Failed to fetch usage stats for item', {
                itemType, itemId: item.id, error
              })
            }
          }

          hydratedItems.push(hydratedItem)
        } else {
          missingItems.push({ itemType, itemId: item.id })
        }
      } catch (error) {
        logger.warn('Failed to hydrate context item', {
          itemType, itemId: item.id, error
        })
        missingItems.push({ itemType, itemId: item.id })
      }
    }

    return hydratedItems
  }

  private sortContextItems(
    context: ContextState,
    sortBy: NonNullable<ContextLoadOptions['sortBy']>,
    order: 'asc' | 'desc'
  ): void {
    const sortFn = (a: ContextItem, b: ContextItem): number => {
      let comparison = 0

      switch (sortBy) {
        case 'addedAt':
          comparison = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
          break
        case 'lastUsedAt':
          const aLastUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
          const bLastUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
          comparison = aLastUsed - bLastUsed
          break
        case 'similarity':
          comparison = (a.similarity || 0) - (b.similarity || 0)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
      }

      return order === 'desc' ? -comparison : comparison
    }

    context.documents.sort(sortFn)
    context.insights.sort(sortFn)
    context.jtbds.sort(sortFn)
    context.metrics.sort(sortFn)
  }

  /**
   * Track context usage for analytics
   */
  public async trackContextUsage(usage: ContextUsageEvent): Promise<void> {
    const trackingId = startPerformance('track_context_usage')

    try {
      this.validateChatAndUser(usage.chatId, usage.userId)

      // Store usage event in database
      await executeQuery(async (client) => {
        return await client
          .from('context_usage_events')
          .insert({
            id: uuidv4(),
            chat_id: usage.chatId,
            user_id: usage.userId,
            message_id: usage.messageId,
            context_items: usage.contextItems,
            intent: usage.intent,
            created_at: usage.timestamp,
            metadata: usage.metadata || {},
          })
      })

      // Update usage metrics for each item
      for (const item of usage.contextItems) {
        await this.updateItemUsageMetrics(
          item.itemType,
          item.itemId,
          usage.userId,
          usage.timestamp,
          item.utilizationScore,
          usage.intent
        )
      }

      // Emit usage event
      await this.emit({
        type: 'context_usage',
        chatId: usage.chatId,
        userId: usage.userId,
        messageId: usage.messageId || uuidv4(),
        usedItems: usage.contextItems,
        intent: usage.intent || 'unknown',
        timestamp: usage.timestamp,
      })

      endPerformance(trackingId, true, { itemCount: usage.contextItems.length })

      logger.info('Context usage tracked successfully', {
        chatId: usage.chatId,
        userId: usage.userId,
        itemCount: usage.contextItems.length,
        intent: usage.intent,
      })

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw new ContextError(
        'Failed to track context usage',
        CONTEXT_ERROR_CODES.USAGE_TRACKING_FAILED,
        { usage, error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  /**
   * Get context usage analytics for a chat
   */
  public async getContextUsageStats(
    chatId: UUID,
    userId: UUID,
    timeRangeHours = 24 * 7 // Default to 7 days
  ): Promise<ContextAnalytics> {
    const trackingId = startPerformance('get_context_usage_stats')

    try {
      this.validateChatAndUser(chatId, userId)

      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - timeRangeHours * 60 * 60 * 1000)

      // Get usage events for the time range
      const usageEvents = await executeQuery(async (client) => {
        return await client
          .from('context_usage_events')
          .select('*')
          .eq('chat_id', chatId)
          .eq('user_id', userId)
          .gte('created_at', startTime.toISOString())
          .lte('created_at', endTime.toISOString())
          .order('created_at', { ascending: false })
      })

      // Get item metrics for all used items
      const allItemIds = new Set<string>()
      const itemTypeMap = new Map<string, ContextItemType>()

      usageEvents.forEach((event: any) => {
        event.context_items?.forEach((item: any) => {
          allItemIds.add(item.itemId)
          itemTypeMap.set(item.itemId, item.itemType)
        })
      })

      const itemMetrics: ContextUsageMetrics[] = []
      for (const itemId of allItemIds) {
        const itemType = itemTypeMap.get(itemId)
        if (itemType) {
          const metrics = await this.getItemUsageMetrics(itemType, itemId, userId)
          if (metrics) {
            itemMetrics.push(metrics)
          }
        }
      }

      // Calculate summary statistics
      const totalUsages = usageEvents.reduce((sum: number, event: any) => 
        sum + (event.context_items?.length || 0), 0)
      
      const averageItemsPerMessage = usageEvents.length > 0 ? 
        totalUsages / usageEvents.length : 0

      // Find most used item type
      const typeUsageCounts = new Map<ContextItemType, number>()
      usageEvents.forEach((event: any) => {
        event.context_items?.forEach((item: any) => {
          const current = typeUsageCounts.get(item.itemType) || 0
          typeUsageCounts.set(item.itemType, current + 1)
        })
      })

      const mostUsedType = Array.from(typeUsageCounts.entries())
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'insight'

      // Generate recommendations based on usage patterns
      const recommendations = this.generateUsageRecommendations(itemMetrics, usageEvents)

      const analytics: ContextAnalytics = {
        chatId,
        userId,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
        summary: {
          totalItems: allItemIds.size,
          totalUsages,
          averageItemsPerMessage: Math.round(averageItemsPerMessage * 100) / 100,
          mostUsedType,
        },
        itemMetrics: itemMetrics.sort((a, b) => b.performanceScore - a.performanceScore),
        recommendations,
      }

      endPerformance(trackingId, true, {
        totalEvents: usageEvents.length,
        totalItems: allItemIds.size,
      })

      logger.info('Context usage stats retrieved successfully', {
        chatId, userId, timeRangeHours,
        totalEvents: usageEvents.length,
        totalItems: allItemIds.size,
      })

      return analytics

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      throw new ContextError(
        'Failed to get context usage stats',
        CONTEXT_ERROR_CODES.USAGE_TRACKING_FAILED,
        { chatId, userId, timeRangeHours, error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  /**
   * Get usage metrics for a specific item
   */
  public async getItemUsageMetrics(
    itemType: ContextItemType,
    itemId: UUID,
    userId: UUID
  ): Promise<ContextUsageMetrics | null> {
    try {
      const metrics = await executeQuery(async (client) => {
        return await client
          .from('context_item_metrics')
          .select('*')
          .eq('item_type', itemType)
          .eq('item_id', itemId)
          .eq('user_id', userId)
          .single()
      })

      if (!metrics) {
        return null
      }

      // Get item title for display
      const itemData = await this.fetchItemData(itemType, itemId, userId)
      const title = itemData?.title || itemData?.statement || itemData?.name || 
                   `${itemType} ${itemId.substring(0, 8)}`

      return {
        itemType,
        itemId,
        title,
        totalUsages: metrics.total_usages || 0,
        averageUtilization: metrics.average_utilization || 0,
        firstUsedAt: metrics.first_used_at,
        lastUsedAt: metrics.last_used_at,
        associatedIntents: metrics.associated_intents || [],
        performanceScore: metrics.performance_score || 0,
      }

    } catch (error) {
      logger.warn('Failed to get item usage metrics', {
        itemType, itemId, userId, error
      })
      return null
    }
  }

  // ===== PRIVATE USAGE TRACKING HELPERS =====

  private async updateItemUsageMetrics(
    itemType: ContextItemType,
    itemId: UUID,
    userId: UUID,
    timestamp: string,
    utilizationScore: number,
    intent?: string
  ): Promise<void> {
    try {
      // Use upsert to update or create metrics record
      await executeQuery(async (client) => {
        return await client
          .from('context_item_metrics')
          .upsert({
            item_type: itemType,
            item_id: itemId,
            user_id: userId,
            total_usages: 1,
            average_utilization: utilizationScore,
            first_used_at: timestamp,
            last_used_at: timestamp,
            associated_intents: intent ? [intent] : [],
            performance_score: utilizationScore * 100, // Simple initial calculation
            updated_at: new Date().toISOString(),
          })
          .onConflict(['item_type', 'item_id', 'user_id'])
          .returning()
      })

      // If record exists, update incrementally (this would need proper SQL logic in production)
      // For now, this is a simplified implementation

    } catch (error) {
      logger.warn('Failed to update item usage metrics', {
        itemType, itemId, userId, error
      })
      // Don't throw - usage tracking shouldn't fail the main operation
    }
  }

  private generateUsageRecommendations(
    itemMetrics: ContextUsageMetrics[],
    usageEvents: any[]
  ): string[] {
    const recommendations: string[] = []

    // Identify underutilized items
    const underutilizedItems = itemMetrics.filter(item => 
      item.averageUtilization < 0.3 && item.totalUsages > 2
    )

    if (underutilizedItems.length > 0) {
      recommendations.push(
        `Consider removing ${underutilizedItems.length} underutilized items from context`
      )
    }

    // Identify highly effective items
    const highPerformanceItems = itemMetrics.filter(item => 
      item.performanceScore > 80 && item.totalUsages > 5
    )

    if (highPerformanceItems.length > 0) {
      recommendations.push(
        `Keep ${highPerformanceItems.length} high-performing items in context`
      )
    }

    // Context size recommendations
    const averageContextSize = usageEvents.length > 0 ? 
      usageEvents.reduce((sum, event) => sum + (event.context_items?.length || 0), 0) / usageEvents.length : 0

    if (averageContextSize > 10) {
      recommendations.push('Consider reducing context size for better focus')
    } else if (averageContextSize < 3) {
      recommendations.push('Consider adding more context items for richer responses')
    }

    // Intent-based recommendations
    const intentUsage = new Map<string, number>()
    usageEvents.forEach(event => {
      if (event.intent) {
        intentUsage.set(event.intent, (intentUsage.get(event.intent) || 0) + 1)
      }
    })

    const topIntent = Array.from(intentUsage.entries())
      .sort(([, a], [, b]) => b - a)[0]?.[0]

    if (topIntent && intentUsage.get(topIntent)! > usageEvents.length * 0.5) {
      recommendations.push(`Optimize context for "${topIntent}" intent usage patterns`)
    }

    return recommendations.slice(0, 5) // Limit to top 5 recommendations
  }

  /**
   * Subscribe to context events
   */
  public subscribe(subscriber: ContextEventSubscriber): string {
    if (!subscriber.callback || typeof subscriber.callback !== 'function') {
      throw new ValidationError('Subscriber callback must be a function')
    }

    // Generate unique subscriber ID if not provided
    const subscriberId = subscriber.id || uuidv4()

    // Store subscriber with validated structure
    this.eventSubscribers.set(subscriberId, {
      id: subscriberId,
      callback: subscriber.callback,
      eventTypes: subscriber.eventTypes || ['context_updated', 'context_validated', 'context_usage'],
    })

    logger.debug('Event subscriber registered', {
      subscriberId,
      eventTypes: subscriber.eventTypes || 'all',
    })

    return subscriberId
  }

  /**
   * Unsubscribe from context events
   */
  public unsubscribe(subscriberId: string): boolean {
    const existed = this.eventSubscribers.has(subscriberId)
    
    if (existed) {
      this.eventSubscribers.delete(subscriberId)
      logger.debug('Event subscriber unregistered', { subscriberId })
    }

    return existed
  }

  /**
   * Emit context event to all subscribers
   */
  public async emit(event: ContextEvent): Promise<void> {
    const trackingId = startPerformance('emit_context_event')

    try {
      if (!event || !event.type) {
        throw new ValidationError('Invalid event structure')
      }

      const subscribers = Array.from(this.eventSubscribers.values())
        .filter(subscriber => 
          !subscriber.eventTypes || 
          subscriber.eventTypes.includes(event.type)
        )

      if (subscribers.length === 0) {
        logger.debug('No subscribers for event type', { eventType: event.type })
        return
      }

      // Execute subscriber callbacks concurrently with error handling
      const subscriptionPromises = subscribers.map(async (subscriber) => {
        try {
          await subscriber.callback(event)
        } catch (error) {
          logger.warn('Event subscriber callback failed', {
            subscriberId: subscriber.id,
            eventType: event.type,
            error: error instanceof Error ? error.message : String(error),
          })
          // Don't rethrow - one subscriber failure shouldn't affect others
        }
      })

      await Promise.allSettled(subscriptionPromises)

      endPerformance(trackingId, true, {
        eventType: event.type,
        subscriberCount: subscribers.length,
      })

      logger.debug('Context event emitted successfully', {
        eventType: event.type,
        subscriberCount: subscribers.length,
        chatId: event.chatId,
        userId: event.userId,
      })

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
      })

      logger.error('Failed to emit context event', {
        eventType: event?.type,
        error: error instanceof Error ? error.message : String(error),
      })

      // Re-throw for caller to handle
      throw new ContextError(
        'Failed to emit context event',
        'EVENT_EMISSION_FAILED',
        { event, error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  /**
   * Get current event subscriber information
   */
  public getEventSubscribers(): Array<{ id: string; eventTypes: string[] }> {
    return Array.from(this.eventSubscribers.values()).map(subscriber => ({
      id: subscriber.id,
      eventTypes: subscriber.eventTypes || ['all'],
    }))
  }

  /**
   * Clear all event subscribers (useful for cleanup)
   */
  public clearAllSubscribers(): number {
    const count = this.eventSubscribers.size
    this.eventSubscribers.clear()
    
    logger.info('All event subscribers cleared', { count })
    
    return count
  }
}

// Export singleton instance and class
export const contextManager = ContextManagerImpl.getInstance()
export { ContextManagerImpl }
export default contextManager
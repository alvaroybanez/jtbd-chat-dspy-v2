/**
 * Context Manager Tests
 * Comprehensive test suite for the context management system
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { contextManager, ContextManagerImpl } from '../context-manager'
import type {
  ContextState,
  ContextItemType,
  ContextSelectionCriteria,
  ContextOperationResult,
  ContextEvent,
  ContextEventSubscriber,
} from '../context-types'
import { CONTEXT_DEFAULTS, CONTEXT_ERROR_CODES } from '../context-types'

// ===== MOCKS =====

// Mock dependencies similar to existing tests
jest.mock('../../../database/client')
jest.mock('../../../logger')

const mockExecuteQuery = jest.fn()
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}
const mockStartPerformance = jest.fn(() => 'tracking-id')
const mockEndPerformance = jest.fn()

const mockChatSessionManager = {
  loadChat: jest.fn(),
  updateChatContext: jest.fn(),
}

// Mock UUID
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}))

// Setup mocks
beforeEach(() => {
  jest.clearAllMocks()
  
  // Mock the database client
  require('../../../database/client').executeQuery = mockExecuteQuery
  require('../../../logger').logger = mockLogger
  require('../../../logger').startPerformance = mockStartPerformance
  require('../../../logger').endPerformance = mockEndPerformance
})

// Import mocked modules
import { v4 as uuidv4 } from 'uuid'
const mockUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>

describe('ContextManager', () => {
  let manager: ContextManagerImpl

  // Test data
  const mockUserId = 'user-123'
  const mockChatId = 'chat-456'
  const mockItemId = 'insight-789'

  const mockChat = {
    id: mockChatId,
    user_id: mockUserId,
    updated_at: '2024-01-01T00:00:00Z',
    selectedDocumentIds: [],
    selectedInsightIds: ['existing-insight-1'],
    selectedJtbdIds: [],
    selectedMetricIds: ['existing-metric-1'],
  }

  beforeEach(() => {
    // Get fresh instance (singleton reset)
    manager = ContextManagerImpl.getInstance()
    manager.clearAllSubscribers()

    // Mock session manager methods
    manager['chatSessionManager'] = mockChatSessionManager as any
    
    // Setup default mocks
    mockChatSessionManager.loadChat.mockResolvedValue(mockChat)
    mockChatSessionManager.updateChatContext.mockResolvedValue(undefined)
    mockUuidv4.mockReturnValue('mock-uuid-12345')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ===== SINGLETON PATTERN TESTS =====

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ContextManagerImpl.getInstance()
      const instance2 = ContextManagerImpl.getInstance()
      
      expect(instance1).toBe(instance2)
      expect(instance1).toBe(manager)
    })
  })

  // ===== CONTEXT CRUD OPERATIONS =====

  describe('Context CRUD Operations', () => {
    describe('addToContext', () => {
      const validCriteria: ContextSelectionCriteria = {
        itemType: 'insight',
        itemId: mockItemId,
        userId: mockUserId,
        metadata: { source: 'test' },
      }

      beforeEach(() => {
        // Mock item data fetch
        manager['fetchItemData'] = jest.fn().mockResolvedValue({
          id: mockItemId,
          title: 'Test Insight',
          content: 'Test content',
          metadata: { category: 'test' },
        })
      })

      it('should successfully add item to context', async () => {
        const result = await manager.addToContext(mockChatId, validCriteria)

        expect(result.success).toBe(true)
        expect(result.affectedItems).toBe(1)
        expect(result.operation.type).toBe('add')
        expect(result.operation.itemType).toBe('insight')
        expect(result.operation.itemId).toBe(mockItemId)

        // Verify session manager was called
        expect(mockChatSessionManager.updateChatContext).toHaveBeenCalledWith(
          mockChatId,
          expect.objectContaining({
            selectedInsightIds: ['existing-insight-1', mockItemId],
          }),
          mockUserId
        )
      })

      it('should reject duplicate items', async () => {
        const duplicateCriteria: ContextSelectionCriteria = {
          itemType: 'insight',
          itemId: 'existing-insight-1', // Already exists in mock chat
          userId: mockUserId,
        }

        const result = await manager.addToContext(mockChatId, duplicateCriteria)

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe(CONTEXT_ERROR_CODES.ITEM_ALREADY_SELECTED)
        expect(result.affectedItems).toBe(0)
      })

      it('should validate input parameters', async () => {
        const invalidCriteria = {
          itemType: 'invalid-type' as ContextItemType,
          itemId: mockItemId,
          userId: mockUserId,
        }

        await expect(
          manager.addToContext(mockChatId, invalidCriteria)
        ).rejects.toThrow('Invalid itemType')
      })

      it('should handle item not found', async () => {
        manager['fetchItemData'] = jest.fn().mockResolvedValue(null)

        const result = await manager.addToContext(mockChatId, validCriteria)

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe(CONTEXT_ERROR_CODES.ITEM_NOT_FOUND)
      })

      it('should respect context limits', async () => {
        // Mock a chat with maximum items
        const fullChat = {
          ...mockChat,
          selectedInsightIds: Array(CONTEXT_DEFAULTS.MAX_ITEMS_PER_TYPE).fill(0).map((_, i) => `insight-${i}`),
        }
        mockChatSessionManager.loadChat.mockResolvedValue(fullChat)

        const result = await manager.addToContext(mockChatId, validCriteria)

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe(CONTEXT_ERROR_CODES.CONTEXT_LIMIT_EXCEEDED)
      })
    })

    describe('removeFromContext', () => {
      it('should successfully remove item from context', async () => {
        const result = await manager.removeFromContext(
          mockChatId,
          'insight',
          'existing-insight-1',
          mockUserId
        )

        expect(result.success).toBe(true)
        expect(result.affectedItems).toBe(1)
        expect(result.operation.type).toBe('remove')

        // Verify session manager was called with updated context
        expect(mockChatSessionManager.updateChatContext).toHaveBeenCalledWith(
          mockChatId,
          expect.objectContaining({
            selectedInsightIds: [], // Should be empty after removal
          }),
          mockUserId
        )
      })

      it('should handle item not in context', async () => {
        const result = await manager.removeFromContext(
          mockChatId,
          'insight',
          'non-existent-item',
          mockUserId
        )

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe(CONTEXT_ERROR_CODES.ITEM_NOT_FOUND)
      })
    })

    describe('clearContext', () => {
      it('should clear all context items', async () => {
        const result = await manager.clearContext(mockChatId, mockUserId)

        expect(result.success).toBe(true)
        expect(result.affectedItems).toBe(2) // existing-insight-1 and existing-metric-1

        // Verify all arrays are cleared
        expect(mockChatSessionManager.updateChatContext).toHaveBeenCalledWith(
          mockChatId,
          {
            selectedDocumentIds: [],
            selectedInsightIds: [],
            selectedJtbdIds: [],
            selectedMetricIds: [],
          },
          mockUserId
        )
      })

      it('should clear specific item type only', async () => {
        const result = await manager.clearContext(mockChatId, mockUserId, 'insight')

        expect(result.success).toBe(true)
        expect(result.affectedItems).toBe(1) // only existing-insight-1

        // Verify only insight array is cleared
        expect(mockChatSessionManager.updateChatContext).toHaveBeenCalledWith(
          mockChatId,
          expect.objectContaining({
            selectedInsightIds: [],
            selectedMetricIds: ['existing-metric-1'], // Should remain unchanged
          }),
          mockUserId
        )
      })
    })
  })

  // ===== CONTEXT LOADING & HYDRATION =====

  describe('Context Loading & Hydration', () => {
    describe('getChatContext', () => {
      it('should load basic context state', async () => {
        const context = await manager.getChatContext(mockChatId, mockUserId)

        expect(context).toMatchObject({
          chatId: mockChatId,
          userId: mockUserId,
          totalItems: 2,
          documents: [],
          insights: expect.arrayContaining([
            expect.objectContaining({
              id: 'existing-insight-1',
              type: 'insight',
            })
          ]),
          jtbds: [],
          metrics: expect.arrayContaining([
            expect.objectContaining({
              id: 'existing-metric-1',
              type: 'metric',
            })
          ]),
        })
      })

      it('should use cache on subsequent calls', async () => {
        // First call
        await manager.getChatContext(mockChatId, mockUserId)
        
        // Clear mock call history
        mockChatSessionManager.loadChat.mockClear()
        
        // Second call (within cache TTL)
        await manager.getChatContext(mockChatId, mockUserId)

        // Should not call database again
        expect(mockChatSessionManager.loadChat).not.toHaveBeenCalled()
      })
    })

    describe('loadContextWithData', () => {
      beforeEach(() => {
        // Mock item data fetching for hydration
        manager['fetchItemData'] = jest.fn().mockImplementation((type: ContextItemType, id: string) => {
          if (id === 'existing-insight-1') {
            return Promise.resolve({
              id,
              title: 'Insight 1',
              content: 'Insight content',
              metadata: { category: 'user-feedback' },
            })
          }
          if (id === 'existing-metric-1') {
            return Promise.resolve({
              id,
              name: 'Metric 1',
              description: 'Metric description',
              metadata: { unit: 'percentage' },
            })
          }
          return Promise.resolve(null)
        })
      })

      it('should load context with full data hydration', async () => {
        const result = await manager.loadContextWithData(mockChatId, mockUserId, {
          includeContent: true,
          includeSimilarityScores: false,
        })

        expect(result.context.insights).toHaveLength(1)
        expect(result.context.insights[0]).toMatchObject({
          id: 'existing-insight-1',
          title: 'Insight 1',
          content: 'Insight content',
          type: 'insight',
        })

        expect(result.context.metrics).toHaveLength(1)
        expect(result.context.metrics[0]).toMatchObject({
          id: 'existing-metric-1',
          title: 'Metric 1',
          content: 'Metric description',
          type: 'metric',
        })

        expect(result.missingItems).toHaveLength(0)
        expect(result.hydrationTime).toBeGreaterThan(0)
      })

      it('should handle missing items during hydration', async () => {
        // Make one item return null (missing)
        manager['fetchItemData'] = jest.fn().mockImplementation((type: ContextItemType, id: string) => {
          if (id === 'existing-insight-1') {
            return Promise.resolve(null) // Simulate missing item
          }
          return Promise.resolve({
            id,
            name: 'Found item',
            description: 'Found description',
          })
        })

        const result = await manager.loadContextWithData(mockChatId, mockUserId)

        expect(result.context.insights).toHaveLength(0) // Missing item filtered out
        expect(result.context.metrics).toHaveLength(1) // This one still exists
        expect(result.missingItems).toEqual([
          { itemType: 'insight', itemId: 'existing-insight-1' }
        ])
      })

      it('should apply sorting when requested', async () => {
        // Add multiple items for sorting test
        const multiItemChat = {
          ...mockChat,
          selectedInsightIds: ['insight-1', 'insight-2'],
        }
        mockChatSessionManager.loadChat.mockResolvedValue(multiItemChat)

        manager['fetchItemData'] = jest.fn().mockImplementation((type: ContextItemType, id: string) => {
          return Promise.resolve({
            id,
            title: id === 'insight-1' ? 'B Title' : 'A Title',
            content: 'Content',
          })
        })

        const result = await manager.loadContextWithData(mockChatId, mockUserId, {
          sortBy: 'title',
          sortOrder: 'asc',
        })

        expect(result.context.insights).toHaveLength(2)
        expect(result.context.insights[0].title).toBe('A Title')
        expect(result.context.insights[1].title).toBe('B Title')
      })
    })

    describe('validateContext', () => {
      beforeEach(() => {
        manager['fetchItemData'] = jest.fn().mockImplementation((type: ContextItemType, id: string) => {
          if (id === 'existing-insight-1') {
            return Promise.resolve({ id, title: 'Valid insight' })
          }
          if (id === 'existing-metric-1') {
            return Promise.resolve(null) // Simulate missing/invalid item
          }
          return Promise.resolve(null)
        })
      })

      it('should identify valid and invalid context items', async () => {
        const result = await manager.validateContext(mockChatId, mockUserId)

        expect(result.validItems).toBe(1)
        expect(result.invalidItems).toHaveLength(1)
        expect(result.invalidItems[0]).toMatchObject({
          itemType: 'metric',
          itemId: 'existing-metric-1',
          reason: 'Item not found in database',
        })
      })

      it('should emit validation event for invalid items', async () => {
        const eventSpy = jest.fn()
        manager.subscribe({
          id: 'test-subscriber',
          callback: eventSpy,
          eventTypes: ['context_validated'],
        })

        await manager.validateContext(mockChatId, mockUserId)

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'context_validated',
            chatId: mockChatId,
            userId: mockUserId,
            validItems: 1,
            invalidItems: expect.arrayContaining([
              expect.objectContaining({
                itemType: 'metric',
                itemId: 'existing-metric-1',
              })
            ]),
          })
        )
      })
    })
  })

  // ===== USAGE TRACKING =====

  describe('Usage Tracking', () => {
    const mockUsageEvent = {
      chatId: mockChatId,
      userId: mockUserId,
      messageId: 'message-123',
      contextItems: [
        {
          itemType: 'insight' as ContextItemType,
          itemId: 'insight-1',
          utilizationScore: 0.8,
        }
      ],
      intent: 'retrieve_insights',
      timestamp: '2024-01-01T12:00:00Z',
    }

    describe('trackContextUsage', () => {
      beforeEach(() => {
        mockExecuteQuery.mockResolvedValue({ id: 'usage-event-id' })
        manager['updateItemUsageMetrics'] = jest.fn().mockResolvedValue(undefined)
      })

      it('should track usage event successfully', async () => {
        await manager.trackContextUsage(mockUsageEvent)

        // Verify database insert was called
        expect(mockExecuteQuery).toHaveBeenCalledWith(expect.any(Function))

        // Verify usage metrics were updated
        expect(manager['updateItemUsageMetrics']).toHaveBeenCalledWith(
          'insight',
          'insight-1',
          mockUserId,
          mockUsageEvent.timestamp,
          0.8,
          'retrieve_insights'
        )
      })

      it('should emit usage event', async () => {
        const eventSpy = jest.fn()
        manager.subscribe({
          id: 'usage-subscriber',
          callback: eventSpy,
          eventTypes: ['context_usage'],
        })

        await manager.trackContextUsage(mockUsageEvent)

        expect(eventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'context_usage',
            chatId: mockChatId,
            userId: mockUserId,
            usedItems: mockUsageEvent.contextItems,
            intent: 'retrieve_insights',
          })
        )
      })
    })

    describe('getContextUsageStats', () => {
      const mockUsageEvents = [
        {
          chat_id: mockChatId,
          user_id: mockUserId,
          intent: 'retrieve_insights',
          context_items: [
            { itemType: 'insight', itemId: 'insight-1' },
            { itemType: 'metric', itemId: 'metric-1' }
          ],
          created_at: '2024-01-01T10:00:00Z',
        },
        {
          chat_id: mockChatId,
          user_id: mockUserId,
          intent: 'generate_hmw',
          context_items: [
            { itemType: 'insight', itemId: 'insight-1' }
          ],
          created_at: '2024-01-01T11:00:00Z',
        }
      ]

      beforeEach(() => {
        mockExecuteQuery.mockResolvedValue(mockUsageEvents)
        manager.getItemUsageMetrics = jest.fn().mockResolvedValue({
          itemType: 'insight',
          itemId: 'insight-1',
          title: 'Insight 1',
          totalUsages: 5,
          averageUtilization: 0.7,
          performanceScore: 85,
          associatedIntents: ['retrieve_insights', 'generate_hmw'],
          firstUsedAt: '2024-01-01T09:00:00Z',
          lastUsedAt: '2024-01-01T11:00:00Z',
        })
      })

      it('should calculate usage analytics correctly', async () => {
        const analytics = await manager.getContextUsageStats(mockChatId, mockUserId, 24)

        expect(analytics).toMatchObject({
          chatId: mockChatId,
          userId: mockUserId,
          summary: {
            totalItems: 2, // insight-1 and metric-1
            totalUsages: 3, // Total usage events across all items
            averageItemsPerMessage: 1.5, // 3 total items used across 2 messages
            mostUsedType: 'insight',
          },
          itemMetrics: expect.arrayContaining([
            expect.objectContaining({
              itemType: 'insight',
              itemId: 'insight-1',
              performanceScore: 85,
            })
          ]),
          recommendations: expect.any(Array),
        })
      })

      it('should generate usage recommendations', async () => {
        const analytics = await manager.getContextUsageStats(mockChatId, mockUserId, 24)

        expect(analytics.recommendations).toBeDefined()
        expect(Array.isArray(analytics.recommendations)).toBe(true)
      })
    })
  })

  // ===== EVENT SYSTEM =====

  describe('Event System', () => {
    describe('Event Subscription', () => {
      it('should register event subscribers', () => {
        const callback = jest.fn()
        const subscriberId = manager.subscribe({
          id: 'test-sub-1',
          callback,
          eventTypes: ['context_updated'],
        })

        expect(subscriberId).toBe('test-sub-1')
        expect(manager.getEventSubscribers()).toContainEqual({
          id: 'test-sub-1',
          eventTypes: ['context_updated'],
        })
      })

      it('should generate subscriber ID if not provided', () => {
        const callback = jest.fn()
        const subscriberId = manager.subscribe({
          id: '',
          callback,
        })

        expect(subscriberId).toBe('mock-uuid-12345')
      })

      it('should validate subscriber callback', () => {
        expect(() => {
          manager.subscribe({
            id: 'invalid',
            callback: 'not-a-function' as any,
          })
        }).toThrow('Subscriber callback must be a function')
      })
    })

    describe('Event Emission', () => {
      it('should emit events to subscribers', async () => {
        const callback1 = jest.fn()
        const callback2 = jest.fn()

        manager.subscribe({
          id: 'sub-1',
          callback: callback1,
          eventTypes: ['context_updated'],
        })

        manager.subscribe({
          id: 'sub-2',
          callback: callback2,
          eventTypes: ['context_validated'], // Different event type
        })

        const updateEvent: ContextEvent = {
          type: 'context_updated',
          chatId: mockChatId,
          userId: mockUserId,
          operation: {
            type: 'add',
            itemType: 'insight',
            itemId: 'insight-1',
            chatId: mockChatId,
            userId: mockUserId,
            timestamp: '2024-01-01T12:00:00Z',
          },
          previousState: { totalItems: 0, lastUpdated: '2024-01-01T11:00:00Z' },
          newState: { totalItems: 1, lastUpdated: '2024-01-01T12:00:00Z' },
          affectedItems: 1,
          timestamp: '2024-01-01T12:00:00Z',
        }

        await manager.emit(updateEvent)

        // Only callback1 should be called (matching event type)
        expect(callback1).toHaveBeenCalledWith(updateEvent)
        expect(callback2).not.toHaveBeenCalled()
      })

      it('should handle subscriber callback errors gracefully', async () => {
        const failingCallback = jest.fn().mockRejectedValue(new Error('Callback failed'))
        const successCallback = jest.fn()

        manager.subscribe({
          id: 'failing-sub',
          callback: failingCallback,
          eventTypes: ['context_updated'],
        })

        manager.subscribe({
          id: 'success-sub',
          callback: successCallback,
          eventTypes: ['context_updated'],
        })

        const updateEvent: ContextEvent = {
          type: 'context_updated',
          chatId: mockChatId,
          userId: mockUserId,
          operation: {
            type: 'add',
            itemType: 'insight',
            itemId: 'insight-1',
            chatId: mockChatId,
            userId: mockUserId,
            timestamp: '2024-01-01T12:00:00Z',
          },
          previousState: { totalItems: 0, lastUpdated: '2024-01-01T11:00:00Z' },
          newState: { totalItems: 1, lastUpdated: '2024-01-01T12:00:00Z' },
          affectedItems: 1,
          timestamp: '2024-01-01T12:00:00Z',
        }

        // Should not throw even if one callback fails
        await expect(manager.emit(updateEvent)).resolves.toBeUndefined()

        expect(failingCallback).toHaveBeenCalled()
        expect(successCallback).toHaveBeenCalled()
      })
    })

    describe('Event Unsubscription', () => {
      it('should unsubscribe event listeners', () => {
        const callback = jest.fn()
        const subscriberId = manager.subscribe({
          id: 'test-unsub',
          callback,
        })

        expect(manager.unsubscribe(subscriberId)).toBe(true)
        expect(manager.getEventSubscribers()).not.toContainEqual(
          expect.objectContaining({ id: subscriberId })
        )
      })

      it('should return false for non-existent subscriber', () => {
        expect(manager.unsubscribe('non-existent')).toBe(false)
      })

      it('should clear all subscribers', () => {
        manager.subscribe({ id: 'sub-1', callback: jest.fn() })
        manager.subscribe({ id: 'sub-2', callback: jest.fn() })

        expect(manager.getEventSubscribers()).toHaveLength(2)

        const clearedCount = manager.clearAllSubscribers()

        expect(clearedCount).toBe(2)
        expect(manager.getEventSubscribers()).toHaveLength(0)
      })
    })
  })

  // ===== HEALTH CHECK =====

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const health = await manager.getHealth()

      expect(health.status).toBe('healthy')
      expect(health.details).toMatchObject({
        cacheSize: expect.any(Number),
        subscriberCount: expect.any(Number),
      })
    })
  })
})
/**
 * Context Retrieval Service Integration Tests
 * Tests for context retrieval integration with vector search and database operations
 */

import contextRetrievalService, { ContextRetrievalService } from '../context-retrieval'
import type { RetrievalOptions, ContextItem, RetrievalResult } from '../context-retrieval'
import { 
  MockVectorSearchService, 
  MockDatabaseClient, 
  createMockContextItem,
  createMockRetrievalResult,
  MOCK_CONTEXT_ITEMS,
  waitFor,
  measureTime,
  benchmark,
  trackMemoryUsage 
} from './test-utils'

// Mock the dependencies
jest.mock('../../vector-search', () => ({
  __esModule: true,
  default: new MockVectorSearchService()
}))

jest.mock('../../database/client', () => ({
  executeQuery: jest.fn()
}))

jest.mock('../../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  startPerformance: jest.fn(() => 'test-tracking-id'),
  endPerformance: jest.fn()
}))

describe('Context Retrieval Service', () => {
  let mockVectorSearch: MockVectorSearchService
  let mockExecuteQuery: jest.MockedFunction<any>

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    
    // Get mock instances
    const vectorSearchModule = require('../../vector-search')
    mockVectorSearch = vectorSearchModule.default
    
    const dbModule = require('../../database/client')
    mockExecuteQuery = dbModule.executeQuery
  })

  describe('Insight Retrieval', () => {
    test('should retrieve insights with semantic search', async () => {
      // Setup mock vector search results
      const mockInsights = [
        createMockContextItem({
          type: 'insight',
          content: 'Users struggle with onboarding complexity',
          similarity: 0.9
        }),
        createMockContextItem({
          type: 'insight',
          content: 'Customer support tickets indicate feature discovery issues',
          similarity: 0.8
        })
      ]

      mockVectorSearch.setMockResults('onboarding problems', mockInsights)

      const result = await contextRetrievalService.retrieveInsights(
        'onboarding problems',
        { limit: 10, threshold: 0.7 }
      )

      expect(result.items).toHaveLength(2)
      expect(result.items[0].type).toBe('insight')
      expect(result.items[0].similarity).toBe(0.9)
      expect(result.summary.searchType).toBe('semantic')
      expect(result.summary.maxSimilarity).toBe(0.9)
      expect(result.summary.averageSimilarity).toBe(0.85)
    })

    test('should handle empty insight results', async () => {
      mockVectorSearch.setMockResults('nonexistent query', [])

      const result = await contextRetrievalService.retrieveInsights('nonexistent query')

      expect(result.items).toHaveLength(0)
      expect(result.pagination.totalItems).toBe(0)
      expect(result.summary.maxSimilarity).toBe(0)
      expect(result.summary.averageSimilarity).toBe(0)
    })

    test('should apply pagination correctly for insights', async () => {
      const mockInsights = Array.from({ length: 25 }, (_, i) => 
        createMockContextItem({
          type: 'insight',
          content: `Test insight ${i + 1}`,
          similarity: 0.8 - (i * 0.01)
        })
      )

      mockVectorSearch.setMockResults('test query', mockInsights)

      const result = await contextRetrievalService.retrieveInsights(
        'test query',
        { page: 2, pageSize: 10 }
      )

      expect(result.items).toHaveLength(10)
      expect(result.pagination.page).toBe(2)
      expect(result.pagination.pageSize).toBe(10)
      expect(result.pagination.totalItems).toBe(25)
      expect(result.pagination.totalPages).toBe(3)
      expect(result.pagination.hasNext).toBe(true)
      expect(result.pagination.hasPrevious).toBe(true)
    })

    test('should include proper metadata for insights', async () => {
      const mockInsight = createMockContextItem({
        type: 'insight',
        content: 'Test insight with metadata',
        metadata: {
          documentId: 'doc-123',
          confidenceScore: 0.95,
          sourceChunkIds: ['chunk-1', 'chunk-2'],
          createdAt: '2024-01-01T00:00:00Z'
        }
      })

      mockVectorSearch.setMockResults('test', [mockInsight])

      const result = await contextRetrievalService.retrieveInsights('test')

      expect(result.items[0].metadata).toEqual({
        documentId: 'doc-123',
        confidenceScore: 0.95,
        sourceChunkIds: ['chunk-1', 'chunk-2'],
        createdAt: '2024-01-01T00:00:00Z'
      })
    })
  })

  describe('Metrics Retrieval', () => {
    test('should retrieve metrics with text-based search', async () => {
      const mockMetrics = [
        {
          id: 'metric-1',
          name: 'User Retention Rate',
          description: 'Percentage of users who return after first visit',
          current_value: 68,
          target_value: 80,
          unit: '%',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'metric-2',
          name: 'Average Session Duration',
          description: 'Average time users spend in the application',
          current_value: 12,
          target_value: 15,
          unit: 'minutes',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ]

      mockExecuteQuery.mockResolvedValue(mockMetrics)

      const result = await contextRetrievalService.retrieveMetrics('retention')

      expect(result.items).toHaveLength(2)
      expect(result.items[0].type).toBe('metric')
      expect(result.summary.searchType).toBe('text')
      expect(mockExecuteQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should calculate text similarity scores for metrics', async () => {
      const mockMetrics = [
        {
          id: 'metric-1',
          name: 'User Retention Rate',
          description: 'Track user retention',
          current_value: 68,
          target_value: 80,
          unit: '%',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ]

      mockExecuteQuery.mockResolvedValue(mockMetrics)

      const result = await contextRetrievalService.retrieveMetrics('retention')

      expect(result.items[0].similarity).toBe(0.9) // Name match gets higher score
      expect(result.summary.maxSimilarity).toBe(0.9)
    })

    test('should create proper snippets for metrics', async () => {
      const mockMetrics = [
        {
          id: 'metric-1',
          name: 'User Retention Rate',
          description: 'Track user retention over time',
          current_value: 68,
          target_value: 80,
          unit: '%',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ]

      mockExecuteQuery.mockResolvedValue(mockMetrics)

      const result = await contextRetrievalService.retrieveMetrics('retention')

      expect(result.items[0].snippet).toContain('User Retention Rate')
      expect(result.items[0].snippet).toContain('68% → 80%')
      expect(result.items[0].snippet).toContain('Track user retention over time')
    })

    test('should handle metrics without target values', async () => {
      const mockMetrics = [
        {
          id: 'metric-1',
          name: 'Page Views',
          description: 'Total page views',
          current_value: 1000,
          target_value: null,
          unit: 'views',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ]

      mockExecuteQuery.mockResolvedValue(mockMetrics)

      const result = await contextRetrievalService.retrieveMetrics('views')

      expect(result.items[0].snippet).toContain('Current: 1000views')
      expect(result.items[0].snippet).not.toContain('→')
    })
  })

  describe('JTBD Retrieval', () => {
    test('should retrieve JTBDs with semantic search', async () => {
      const mockJTBDs = [
        createMockContextItem({
          type: 'jtbd',
          content: 'When I am a new user, I want to complete onboarding quickly',
          similarity: 0.9,
          metadata: {
            context: 'New user experience',
            priority: 'high'
          }
        }),
        createMockContextItem({
          type: 'jtbd',
          content: 'When I encounter a problem, I want to find help easily',
          similarity: 0.8,
          metadata: {
            context: 'Support experience',
            priority: 'medium'
          }
        })
      ]

      mockVectorSearch.setMockResults('user onboarding', mockJTBDs)

      const result = await contextRetrievalService.retrieveJTBDs('user onboarding')

      expect(result.items).toHaveLength(2)
      expect(result.items[0].type).toBe('jtbd')
      expect(result.items[0].metadata.context).toBe('New user experience')
      expect(result.items[0].metadata.priority).toBe('high')
    })

    test('should create informative JTBD snippets', async () => {
      const mockJTBD = createMockContextItem({
        type: 'jtbd',
        content: 'When I am a user, I want to complete tasks efficiently',
        metadata: {
          context: 'Task management',
          priority: 'high'
        }
      })

      mockVectorSearch.setMockResults('task efficiency', [mockJTBD])

      const result = await contextRetrievalService.retrieveJTBDs('task efficiency')

      expect(result.items[0].snippet).toContain('When I am a user')
      expect(result.items[0].snippet).toContain('Context: Task management')
      expect(result.items[0].snippet).toContain('Priority: high')
    })
  })

  describe('Error Handling', () => {
    test('should handle vector search service errors', async () => {
      mockVectorSearch.searchInsights = jest.fn().mockRejectedValue(
        new Error('Vector search service unavailable')
      )

      await expect(
        contextRetrievalService.retrieveInsights('test query')
      ).rejects.toThrow('Failed to retrieve insights')
    })

    test('should handle database query errors', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('Database connection failed'))

      await expect(
        contextRetrievalService.retrieveMetrics('test query')
      ).rejects.toThrow('Failed to retrieve metrics')
    })

    test('should handle malformed search results gracefully', async () => {
      mockVectorSearch.setMockResults('test', [null, undefined, {}] as any)

      const result = await contextRetrievalService.retrieveInsights('test')

      expect(result.items).toHaveLength(0)
      expect(result.summary.maxSimilarity).toBe(0)
    })

    test('should handle invalid pagination parameters', async () => {
      const mockInsights = [createMockContextItem({ content: 'test' })]
      mockVectorSearch.setMockResults('test', mockInsights)

      const result = await contextRetrievalService.retrieveInsights('test', {
        page: -1,
        pageSize: 0
      })

      // Should use default values for invalid pagination
      expect(result.pagination.page).toBeGreaterThan(0)
      expect(result.pagination.pageSize).toBeGreaterThan(0)
    })
  })

  describe('Performance Tests', () => {
    test('should complete insight retrieval within performance budget', async () => {
      const mockInsights = Array.from({ length: 50 }, (_, i) => 
        createMockContextItem({
          type: 'insight',
          content: `Performance test insight ${i}`,
          similarity: 0.8
        })
      )

      mockVectorSearch.setMockResults('performance test', mockInsights)

      const { duration } = await measureTime(async () => {
        return contextRetrievalService.retrieveInsights('performance test')
      })

      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    test('should handle concurrent retrieval requests', async () => {
      const queries = [
        'insights query 1',
        'insights query 2',
        'insights query 3'
      ]

      queries.forEach(query => {
        mockVectorSearch.setMockResults(query, [
          createMockContextItem({ content: `Result for ${query}` })
        ])
      })

      const promises = queries.map(query => 
        contextRetrievalService.retrieveInsights(query)
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach((result, index) => {
        expect(result.items[0].content).toContain(`Result for ${queries[index]}`)
      })
    })

    test('should maintain memory efficiency with large result sets', async () => {
      const memoryTracker = trackMemoryUsage()
      
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => 
        createMockContextItem({
          content: `Large result item ${i}`.repeat(100),
          type: 'insight'
        })
      )

      mockVectorSearch.setMockResults('large query', largeResultSet)

      await contextRetrievalService.retrieveInsights('large query')

      const memoryDelta = memoryTracker.getDelta()
      expect(memoryDelta.heapUsed).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })

    test('should benchmark retrieval operations', async () => {
      const testData = createMockContextItem({ content: 'benchmark test' })
      mockVectorSearch.setMockResults('benchmark', [testData])

      const benchmarkResult = await benchmark(
        'insight retrieval',
        () => contextRetrievalService.retrieveInsights('benchmark'),
        10
      )

      expect(benchmarkResult.averageTime).toBeLessThan(1000) // Average under 1 second
      expect(benchmarkResult.maxTime).toBeLessThan(3000) // Max under 3 seconds
    })
  })

  describe('Service Health', () => {
    test('should report healthy status when services are available', async () => {
      mockVectorSearch.setMockResults('health check', [
        createMockContextItem({ content: 'health test' })
      ])

      const health = await contextRetrievalService.getHealth()

      expect(health.status).toBe('healthy')
      expect(health.lastCheck).toBeInstanceOf(Date)
      expect(health.details?.responseTime).toBeLessThan(3000)
    })

    test('should report degraded status with slow response times', async () => {
      // Mock slow response
      mockVectorSearch.searchInsights = jest.fn().mockImplementation(async () => {
        await waitFor(4000) // 4 second delay
        return createMockRetrievalResult([])
      })

      const health = await contextRetrievalService.getHealth()

      expect(health.status).toBe('degraded')
      expect(health.details?.responseTime).toBeGreaterThan(3000)
    })

    test('should report unhealthy status when services fail', async () => {
      mockVectorSearch.searchInsights = jest.fn().mockRejectedValue(
        new Error('Service unavailable')
      )

      const health = await contextRetrievalService.getHealth()

      expect(health.status).toBe('unhealthy')
      expect(health.details?.error).toContain('Service unavailable')
    })
  })

  describe('Text Processing and Formatting', () => {
    test('should truncate long content properly', async () => {
      const longContent = 'This is a very long piece of content '.repeat(100)
      const mockItem = createMockContextItem({
        content: longContent,
        type: 'insight'
      })

      mockVectorSearch.setMockResults('long content', [mockItem])

      const result = await contextRetrievalService.retrieveInsights('long content')

      expect(result.items[0].displayText.length).toBeLessThanOrEqual(103) // 100 + '...'
      expect(result.items[0].snippet.length).toBeLessThanOrEqual(153) // 150 + '...'
      expect(result.items[0].displayText).toMatch(/\.\.\.$/m)
    })

    test('should preserve short content without truncation', async () => {
      const shortContent = 'Short insight'
      const mockItem = createMockContextItem({
        content: shortContent,
        type: 'insight'
      })

      mockVectorSearch.setMockResults('short', [mockItem])

      const result = await contextRetrievalService.retrieveInsights('short')

      expect(result.items[0].displayText).toBe(shortContent)
      expect(result.items[0].snippet).toBe(shortContent)
      expect(result.items[0].displayText).not.toContain('...')
    })

    test('should handle special characters in content', async () => {
      const specialContent = 'Content with 🔥 emojis and "quotes" & symbols!'
      const mockItem = createMockContextItem({
        content: specialContent,
        type: 'insight'
      })

      mockVectorSearch.setMockResults('special', [mockItem])

      const result = await contextRetrievalService.retrieveInsights('special')

      expect(result.items[0].content).toBe(specialContent)
      expect(result.items[0].displayText).toBe(specialContent)
    })
  })

  describe('Configuration and Options', () => {
    test('should respect custom retrieval options', async () => {
      const mockItems = Array.from({ length: 100 }, (_, i) => 
        createMockContextItem({ content: `Item ${i}`, similarity: 0.5 + (i * 0.005) })
      )

      mockVectorSearch.setMockResults('custom options', mockItems)

      const result = await contextRetrievalService.retrieveInsights('custom options', {
        limit: 25,
        threshold: 0.7,
        page: 2,
        pageSize: 10,
        userId: 'test-user-123'
      })

      // Should respect the pagination settings
      expect(result.pagination.pageSize).toBe(10)
      expect(result.pagination.page).toBe(2)
      
      // Should filter by threshold (items with similarity >= 0.7)
      result.items.forEach(item => {
        expect(item.similarity).toBeGreaterThanOrEqual(0.7)
      })
    })

    test('should use default options when none provided', async () => {
      const mockItems = [createMockContextItem({ content: 'default test' })]
      mockVectorSearch.setMockResults('default test', mockItems)

      const result = await contextRetrievalService.retrieveInsights('default test')

      expect(result.pagination.page).toBe(1)
      expect(result.pagination.pageSize).toBe(20)
    })

    test('should merge partial options with defaults', async () => {
      const mockItems = [createMockContextItem({ content: 'partial test' })]
      mockVectorSearch.setMockResults('partial test', mockItems)

      const result = await contextRetrievalService.retrieveInsights('partial test', {
        limit: 5  // Only specify limit, others should use defaults
      })

      expect(result.pagination.pageSize).toBe(20) // Default
      expect(result.pagination.page).toBe(1) // Default
    })
  })
})
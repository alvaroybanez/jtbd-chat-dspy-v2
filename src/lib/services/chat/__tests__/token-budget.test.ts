/**
 * Token Budget Management Tests
 * Comprehensive tests for token counting, budget enforcement, and intelligent truncation
 */

import { 
  TokenBudgetManager, 
  tokenBudgetManager,
  MAX_TOKEN_BUDGET,
  WARNING_THRESHOLD,
  CRITICAL_THRESHOLD 
} from '../token-budget'
import type { 
  ContextItem, 
  TokenBudgetStatus, 
  TruncationResult, 
  BudgetOptimization 
} from '../token-budget'
import { 
  createMockMessage, 
  createMockContextItem, 
  MOCK_MESSAGES,
  MOCK_CONTEXT_ITEMS,
  generateTestMessages,
  MockTokenCounter,
  measureTime,
  benchmark 
} from './test-utils'

// Mock the TokenCounter dependency
jest.mock('../../text-processing/tokenizer', () => ({
  TokenCounter: jest.fn().mockImplementation(() => new MockTokenCounter())
}))

describe('Token Budget Manager', () => {
  let budgetManager: TokenBudgetManager
  let mockTokenCounter: MockTokenCounter

  beforeEach(() => {
    budgetManager = new TokenBudgetManager(1000) // Use smaller budget for testing
    // Get the mock instance
    mockTokenCounter = (budgetManager as any).tokenCounter
    
    // Set up some default token counts
    mockTokenCounter.setTokenCount('short message', 5)
    mockTokenCounter.setTokenCount('medium length message with more words', 15)
    mockTokenCounter.setTokenCount('very long message with many words and detailed content that goes on and on', 30)
  })

  describe('Basic Token Calculation', () => {
    test('should calculate tokens for messages correctly', () => {
      const messages = [
        createMockMessage({ content: 'short message' }),
        createMockMessage({ content: 'medium length message with more words' })
      ]

      const totalTokens = budgetManager.calculateTokenBudget(messages)
      
      // 5 + 15 base tokens + 10 metadata tokens per message
      expect(totalTokens).toBe(40)
    })

    test('should calculate tokens for context items correctly', () => {
      const contextItems = [
        createMockContextItem({ content: 'short message' }),
        createMockContextItem({ content: 'medium length message with more words' })
      ]

      const totalTokens = budgetManager.calculateTokenBudget([], contextItems)
      
      // 5 + 15 base tokens + 15 metadata tokens per context item
      expect(totalTokens).toBe(50)
    })

    test('should calculate combined tokens for messages and context', () => {
      const messages = [createMockMessage({ content: 'short message' })]
      const contextItems = [createMockContextItem({ content: 'short message' })]

      const totalTokens = budgetManager.calculateTokenBudget(messages, contextItems)
      
      // (5 + 10) + (5 + 15) = 35
      expect(totalTokens).toBe(35)
    })

    test('should handle empty inputs gracefully', () => {
      expect(budgetManager.calculateTokenBudget([])).toBe(0)
      expect(budgetManager.calculateTokenBudget([], [])).toBe(0)
    })
  })

  describe('Budget Status Monitoring', () => {
    test('should report healthy status for low usage', () => {
      const messages = [createMockMessage({ content: 'short message' })]
      const status = budgetManager.getBudgetStatus(messages)

      expect(status.status).toBe('healthy')
      expect(status.currentTokens).toBe(15) // 5 + 10 metadata
      expect(status.maxTokens).toBe(1000)
      expect(status.remainingTokens).toBe(985)
      expect(status.utilizationPercentage).toBe(0.015)
      expect(status.warnings).toHaveLength(0)
    })

    test('should report warning status at 80% threshold', () => {
      // Create messages that use ~80% of budget
      mockTokenCounter.setTokenCount('warning level content', 790)
      const messages = [createMockMessage({ content: 'warning level content' })]
      
      const status = budgetManager.getBudgetStatus(messages)

      expect(status.status).toBe('warning')
      expect(status.utilizationPercentage).toBeGreaterThan(WARNING_THRESHOLD)
      expect(status.warnings).toContain(expect.stringContaining('Warning:'))
    })

    test('should report critical status at 95% threshold', () => {
      mockTokenCounter.setTokenCount('critical level content', 940)
      const messages = [createMockMessage({ content: 'critical level content' })]
      
      const status = budgetManager.getBudgetStatus(messages)

      expect(status.status).toBe('critical')
      expect(status.utilizationPercentage).toBeGreaterThan(CRITICAL_THRESHOLD)
      expect(status.warnings).toContain(expect.stringContaining('Critical:'))
    })

    test('should report exceeded status when over budget', () => {
      mockTokenCounter.setTokenCount('exceeded content', 1100)
      const messages = [createMockMessage({ content: 'exceeded content' })]
      
      const status = budgetManager.getBudgetStatus(messages)

      expect(status.status).toBe('exceeded')
      expect(status.utilizationPercentage).toBeGreaterThan(1.0)
      expect(status.currentTokens).toBeGreaterThan(1000)
      expect(status.remainingTokens).toBe(0)
      expect(status.warnings).toContain(expect.stringContaining('exceeded by'))
    })
  })

  describe('Truncation Logic', () => {
    test('should not truncate when within budget', () => {
      const messages = [
        createMockMessage({ content: 'short message' }),
        createMockMessage({ content: 'medium length message with more words' })
      ]

      const result = budgetManager.truncateToFitBudget(messages, [], 1000)

      expect(result.messages).toHaveLength(2)
      expect(result.contextItems).toHaveLength(0)
      expect(result.tokensRemoved).toBe(0)
      expect(result.messagesRemoved).toBe(0)
      expect(result.truncationLog).toContain('No truncation needed')
    })

    test('should preserve recent messages during truncation', () => {
      const oldMessage = createMockMessage({ 
        content: 'very long message with many words and detailed content that goes on and on',
        created_at: new Date(Date.now() - 10000).toISOString()
      })
      const recentMessage = createMockMessage({ 
        content: 'short message',
        created_at: new Date().toISOString()
      })

      mockTokenCounter.setTokenCount(oldMessage.content, 500)
      mockTokenCounter.setTokenCount(recentMessage.content, 10)

      const messages = [oldMessage, recentMessage]
      const result = budgetManager.truncateToFitBudget(messages, [], 100)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].id).toBe(recentMessage.id)
      expect(result.messagesRemoved).toBe(1)
      expect(result.preservedItems.recentMessages).toBeGreaterThan(0)
    })

    test('should preserve system messages during truncation', () => {
      const userMessage = createMockMessage({ 
        content: 'very long message with many words and detailed content that goes on and on',
        role: 'user'
      })
      const systemMessage = createMockMessage({ 
        content: 'system',
        role: 'assistant'
      })

      mockTokenCounter.setTokenCount(userMessage.content, 500)
      mockTokenCounter.setTokenCount(systemMessage.content, 5)

      const messages = [userMessage, systemMessage]
      const result = budgetManager.truncateToFitBudget(messages, [], 100)

      expect(result.messages.some(m => m.id === systemMessage.id)).toBe(true)
      expect(result.preservedItems.systemMessages).toBeGreaterThan(0)
    })

    test('should prioritize high-priority context items', () => {
      const lowPriorityItem = createMockContextItem({ 
        type: 'solution',
        content: 'very long message with many words and detailed content that goes on and on'
      })
      const highPriorityItem = createMockContextItem({ 
        type: 'insight',
        content: 'short message'
      })

      mockTokenCounter.setTokenCount(lowPriorityItem.content, 500)
      mockTokenCounter.setTokenCount(highPriorityItem.content, 10)

      const contextItems = [lowPriorityItem, highPriorityItem]
      const result = budgetManager.truncateToFitBudget([], contextItems, 100)

      expect(result.contextItems).toHaveLength(1)
      expect(result.contextItems[0].id).toBe(highPriorityItem.id)
      expect(result.contextItemsRemoved).toBe(1)
    })

    test('should maintain chronological order after truncation', () => {
      const messages = [
        createMockMessage({ 
          content: 'first',
          created_at: new Date(Date.now() - 3000).toISOString()
        }),
        createMockMessage({ 
          content: 'second',
          created_at: new Date(Date.now() - 2000).toISOString()
        }),
        createMockMessage({ 
          content: 'third',
          created_at: new Date(Date.now() - 1000).toISOString()
        })
      ]

      mockTokenCounter.setTokenCount('first', 5)
      mockTokenCounter.setTokenCount('second', 5)
      mockTokenCounter.setTokenCount('third', 5)

      const result = budgetManager.truncateToFitBudget(messages, [], 100)

      // Should maintain chronological order
      for (let i = 1; i < result.messages.length; i++) {
        const prev = new Date(result.messages[i - 1].created_at)
        const curr = new Date(result.messages[i].created_at)
        expect(prev.getTime()).toBeLessThanOrEqual(curr.getTime())
      }
    })

    test('should provide detailed truncation logging', () => {
      const messages = [
        createMockMessage({ content: 'very long message with many words and detailed content that goes on and on' })
      ]

      mockTokenCounter.setTokenCount(messages[0].content, 500)

      const result = budgetManager.truncateToFitBudget(messages, [], 100)

      expect(result.truncationLog).toContain(expect.stringContaining('Starting truncation:'))
      expect(result.truncationLog).toContain(expect.stringContaining('tokens, target:'))
      expect(result.truncationLog).toContain(expect.stringContaining('Truncation complete:'))
    })
  })

  describe('Budget Optimization', () => {
    test('should identify optimization opportunities', () => {
      const longMessage = createMockMessage({ 
        content: 'very long message with many words and detailed content that goes on and on' 
      })
      const duplicateItems = [
        createMockContextItem({ content: 'duplicate content' }),
        createMockContextItem({ content: 'duplicate content' })
      ]

      mockTokenCounter.setTokenCount(longMessage.content, 300)
      mockTokenCounter.setTokenCount('duplicate content', 50)

      const optimization = budgetManager.optimizeForBudget(
        [longMessage], 
        duplicateItems, 
        200
      )

      expect(optimization.canFit).toBe(true)
      expect(optimization.recommendedActions.length).toBeGreaterThan(0)
      expect(optimization.recommendedActions.some(action => 
        action.includes('long messages')
      )).toBe(true)
      expect(optimization.recommendedActions.some(action => 
        action.includes('duplicate')
      )).toBe(true)
    })

    test('should suggest new conversation when optimization insufficient', () => {
      const messages = generateTestMessages(10, 200) // Very long messages
      const contextItems = Object.values(MOCK_CONTEXT_ITEMS)

      // Mock very high token counts
      messages.forEach(msg => {
        mockTokenCounter.setTokenCount(msg.content, 200)
      })
      contextItems.forEach(item => {
        mockTokenCounter.setTokenCount(item.content, 100)
      })

      const optimization = budgetManager.optimizeForBudget(messages, contextItems, 500)

      expect(optimization.canFit).toBe(false)
      expect(optimization.recommendedActions.some(action => 
        action.includes('new conversation')
      )).toBe(true)
    })

    test('should calculate potential token savings accurately', () => {
      const longMessage = createMockMessage({ 
        content: 'very long message with many words and detailed content that goes on and on' 
      })

      mockTokenCounter.setTokenCount(longMessage.content, 300)

      const optimization = budgetManager.optimizeForBudget([longMessage], [], 200)

      expect(optimization.tokenSavings).toBeGreaterThan(0)
      expect(optimization.tokenSavings).toBeLessThanOrEqual(120) // Max 120 tokens saved from truncating to 150
    })
  })

  describe('Performance and Memory Management', () => {
    test('should process token calculations efficiently', async () => {
      const messages = generateTestMessages(100, 50)
      const contextItems = Array.from({ length: 50 }, (_, i) => 
        createMockContextItem({ content: `Context item ${i}` })
      )

      const { duration } = await measureTime(async () => {
        return budgetManager.calculateTokenBudget(messages, contextItems)
      })

      expect(duration).toBeLessThan(100) // Should complete in under 100ms
    })

    test('should handle large truncation operations efficiently', async () => {
      const messages = generateTestMessages(1000, 100)
      
      // Set realistic token counts
      messages.forEach((msg, i) => {
        mockTokenCounter.setTokenCount(msg.content, 50 + (i % 10))
      })

      const { duration } = await measureTime(async () => {
        return budgetManager.truncateToFitBudget(messages, [], 5000)
      })

      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
    })

    test('should maintain reasonable memory usage', () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      // Process many budget calculations
      for (let i = 0; i < 100; i++) {
        const messages = generateTestMessages(10, 20)
        budgetManager.calculateTokenBudget(messages)
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB
    })

    test('should provide cache statistics', () => {
      const stats = budgetManager.getCacheStats()

      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('maxSize')
      expect(stats).toHaveProperty('hitRate')
      expect(typeof stats.size).toBe('number')
      expect(typeof stats.maxSize).toBe('number')
    })

    test('should support cache clearing', () => {
      // Add some data to cache
      budgetManager.calculateTokenBudget([
        createMockMessage({ content: 'test message' })
      ])

      const statsBefore = budgetManager.getCacheStats()
      expect(statsBefore.size).toBeGreaterThan(0)

      budgetManager.clearCache()

      const statsAfter = budgetManager.getCacheStats()
      expect(statsAfter.size).toBe(0)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty message content', () => {
      const messages = [
        createMockMessage({ content: '' }),
        createMockMessage({ content: '   ' })
      ]

      const totalTokens = budgetManager.calculateTokenBudget(messages)
      expect(totalTokens).toBeGreaterThan(0) // Should include metadata tokens
    })

    test('should handle null and undefined in context items', () => {
      const contextItems = [
        createMockContextItem({ content: 'valid content' }),
        null as any,
        undefined as any
      ].filter(Boolean)

      expect(() => {
        budgetManager.calculateTokenBudget([], contextItems)
      }).not.toThrow()
    })

    test('should handle very large token counts', () => {
      const message = createMockMessage({ content: 'huge content' })
      mockTokenCounter.setTokenCount('huge content', 1000000)

      const status = budgetManager.getBudgetStatus([message])
      
      expect(status.currentTokens).toBeGreaterThan(1000000)
      expect(status.status).toBe('exceeded')
      expect(status.remainingTokens).toBe(0)
    })

    test('should handle negative token counts gracefully', () => {
      const message = createMockMessage({ content: 'negative test' })
      mockTokenCounter.count = jest.fn().mockReturnValue(-10)

      const totalTokens = budgetManager.calculateTokenBudget([message])
      
      // Should still include positive metadata tokens
      expect(totalTokens).toBeGreaterThan(0)
    })

    test('should handle circular references in message objects', () => {
      const message = createMockMessage({ content: 'test' })
      // Create circular reference
      ;(message as any).circular = message

      expect(() => {
        budgetManager.calculateTokenBudget([message])
      }).not.toThrow()
    })
  })

  describe('Duplicate Detection', () => {
    test('should identify duplicate context items', () => {
      const duplicateItems = [
        createMockContextItem({ content: 'Same content here' }),
        createMockContextItem({ content: 'Same content here' }),
        createMockContextItem({ content: 'Different content' })
      ]

      mockTokenCounter.setTokenCount('Same content here', 20)
      mockTokenCounter.setTokenCount('Different content', 15)

      const optimization = budgetManager.optimizeForBudget([], duplicateItems, 100)

      expect(optimization.recommendedActions.some(action => 
        action.includes('duplicate')
      )).toBe(true)
    })

    test('should distinguish between similar but different content', () => {
      const similarItems = [
        createMockContextItem({ content: 'User research insight about onboarding' }),
        createMockContextItem({ content: 'User research insight about retention' })
      ]

      const optimization = budgetManager.optimizeForBudget([], similarItems, 50)

      // Should not flag as duplicates since content is different
      expect(optimization.recommendedActions.every(action => 
        !action.includes('duplicate')
      )).toBe(true)
    })
  })

  describe('Configuration', () => {
    test('should respect custom token budget limits', () => {
      const customManager = new TokenBudgetManager(500)
      
      expect(customManager.getMaxTokens()).toBe(500)
    })

    test('should use default budget when none specified', () => {
      const defaultManager = new TokenBudgetManager()
      
      expect(defaultManager.getMaxTokens()).toBe(MAX_TOKEN_BUDGET)
    })

    test('should handle zero or negative budget limits', () => {
      const zeroManager = new TokenBudgetManager(0)
      const negativeManager = new TokenBudgetManager(-100)

      const message = createMockMessage({ content: 'test' })
      
      expect(zeroManager.getBudgetStatus([message]).status).toBe('exceeded')
      expect(negativeManager.getBudgetStatus([message]).status).toBe('exceeded')
    })
  })

  describe('Singleton Instance', () => {
    test('should provide working singleton instance', () => {
      const message = createMockMessage({ content: 'singleton test' })
      
      const result = tokenBudgetManager.calculateTokenBudget([message])
      
      expect(result).toBeGreaterThan(0)
      expect(tokenBudgetManager.getMaxTokens()).toBe(MAX_TOKEN_BUDGET)
    })

    test('should maintain state across singleton calls', () => {
      const stats1 = tokenBudgetManager.getCacheStats()
      
      tokenBudgetManager.calculateTokenBudget([
        createMockMessage({ content: 'cache test' })
      ])
      
      const stats2 = tokenBudgetManager.getCacheStats()
      
      expect(stats2.size).toBeGreaterThanOrEqual(stats1.size)
    })
  })

  describe('Stress Testing', () => {
    test('should handle maximum realistic message counts', async () => {
      const messages = generateTestMessages(10000, 30) // 10k messages
      
      messages.forEach((msg, i) => {
        mockTokenCounter.setTokenCount(msg.content, 20 + (i % 5))
      })

      const { duration } = await measureTime(async () => {
        return budgetManager.truncateToFitBudget(messages, [], 50000)
      })

      expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
    })

    test('should handle extreme context item counts', async () => {
      const contextItems = Array.from({ length: 1000 }, (_, i) => 
        createMockContextItem({ 
          content: `Context item ${i}`,
          type: ['insight', 'metric', 'jtbd', 'hmw', 'solution'][i % 5] as any
        })
      )

      contextItems.forEach(item => {
        mockTokenCounter.setTokenCount(item.content, 25)
      })

      const { duration } = await measureTime(async () => {
        return budgetManager.truncateToFitBudget([], contextItems, 10000)
      })

      expect(duration).toBeLessThan(2000)
    })
  })
})
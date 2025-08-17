/**
 * Chat Service Integration Tests
 * End-to-end integration tests for the complete chat workflow covering
 * intent detection → context retrieval → budget management → response generation
 */

import { detectChatIntent, ChatIntent } from '../intent-detector'
import contextRetrievalService from '../context-retrieval'
import { tokenBudgetManager, TokenBudgetManager } from '../token-budget'
import { 
  MockVectorSearchService, 
  MockDatabaseClient, 
  MockTokenCounter,
  createMockMessage, 
  createMockContextItem,
  createMockIntentResult,
  createMockRetrievalResult,
  MOCK_MESSAGES,
  MOCK_CONTEXT_ITEMS,
  TEST_SCENARIOS,
  generateTestMessages,
  measureTime,
  benchmark,
  trackMemoryUsage,
  waitFor
} from './test-utils'

// Mock all dependencies
jest.mock('../../vector-search')
jest.mock('../../database/client')
jest.mock('../../logger')
jest.mock('../../text-processing/tokenizer')

describe('Chat Service Integration', () => {
  let mockVectorSearch: MockVectorSearchService
  let mockExecuteQuery: jest.MockedFunction<any>
  let mockTokenCounter: MockTokenCounter
  let testBudgetManager: TokenBudgetManager

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup mock dependencies
    mockVectorSearch = require('../../vector-search').default
    mockExecuteQuery = require('../../database/client').executeQuery
    mockTokenCounter = new MockTokenCounter()
    testBudgetManager = new TokenBudgetManager(1000)
    
    // Initialize token counter with realistic values
    setupRealisticTokenCounts()
  })

  function setupRealisticTokenCounts() {
    // Intent detection messages
    mockTokenCounter.setTokenCount('What insights do we have from the user research?', 12)
    mockTokenCounter.setTokenCount('Show me the key metrics we should track', 10)
    mockTokenCounter.setTokenCount('What are our main jobs to be done?', 9)
    mockTokenCounter.setTokenCount('Generate how might we questions for improving onboarding', 11)
    mockTokenCounter.setTokenCount('Create solutions to solve user retention problems', 10)
    
    // Context items
    mockTokenCounter.setTokenCount('Users struggle with the onboarding process, citing complexity and time requirements as main pain points.', 18)
    mockTokenCounter.setTokenCount('Customer support tickets show 60% of issues are related to feature discovery problems.', 15)
    mockTokenCounter.setTokenCount('Average onboarding completion time: 12 minutes (target: 5 minutes)', 12)
    mockTokenCounter.setTokenCount('User retention rate: 68% (target: 80%)', 8)
    
    // Long content for testing truncation
    mockTokenCounter.setTokenCount('very long message content '.repeat(50), 500)
  }

  describe('Complete Chat Workflow', () => {
    test('should execute full workflow: intent → context → budget → response', async () => {
      // 1. Intent Detection Phase
      const userMessage = 'What insights do we have from the user research?'
      const intentResult = detectChatIntent(userMessage)
      
      expect(intentResult.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      expect(intentResult.confidence).toBeGreaterThan(0.7)

      // 2. Context Retrieval Phase
      const mockInsights = [
        createMockContextItem({
          type: 'insight',
          content: 'Users struggle with the onboarding process, citing complexity and time requirements as main pain points.',
          similarity: 0.9
        }),
        createMockContextItem({
          type: 'insight',
          content: 'Customer support tickets show 60% of issues are related to feature discovery problems.',
          similarity: 0.8
        })
      ]

      mockVectorSearch.setMockResults('user research', mockInsights)
      
      const retrievalResult = await contextRetrievalService.retrieveInsights(userMessage)
      
      expect(retrievalResult.items).toHaveLength(2)
      expect(retrievalResult.items[0].type).toBe('insight')

      // 3. Budget Management Phase
      const messages = [createMockMessage({ content: userMessage })]
      const budgetStatus = testBudgetManager.getBudgetStatus(messages, retrievalResult.items)
      
      expect(budgetStatus.status).toBe('healthy')
      expect(budgetStatus.currentTokens).toBeLessThan(1000)

      // 4. Verify end-to-end flow timing
      const totalWorkflow = await measureTime(async () => {
        const intent = detectChatIntent(userMessage)
        const context = await contextRetrievalService.retrieveInsights(userMessage)
        const budget = testBudgetManager.getBudgetStatus(messages, context.items)
        return { intent, context, budget }
      })

      expect(totalWorkflow.duration).toBeLessThan(5000) // Complete workflow under 5s
    })

    test('should handle context-requiring intents with proper workflow', async () => {
      // Test HMW generation workflow
      const userMessage = 'Generate how might we questions for improving onboarding'
      
      // 1. Intent Detection
      const intentResult = detectChatIntent(userMessage)
      expect(intentResult.intent).toBe(ChatIntent.GENERATE_HMW)

      // 2. Context Retrieval (HMW requires context)
      const mockContext = [
        createMockContextItem({ type: 'insight', content: 'Onboarding insight 1' }),
        createMockContextItem({ type: 'metric', content: 'Onboarding metric 1' }),
        createMockContextItem({ type: 'jtbd', content: 'Onboarding JTBD 1' })
      ]

      mockVectorSearch.setMockResults('improving onboarding', mockContext)
      
      const contextResult = await contextRetrievalService.retrieveInsights(userMessage)
      
      expect(contextResult.items).toHaveLength(3)
      
      // 3. Verify context is sufficient for HMW generation
      const budgetStatus = testBudgetManager.getBudgetStatus(
        [createMockMessage({ content: userMessage })],
        contextResult.items
      )
      
      expect(budgetStatus.status).toBe('healthy')
      expect(contextResult.items.some(item => item.type === 'insight')).toBe(true)
    })

    test('should handle multi-step conversation with evolving context', async () => {
      const conversationFlow = [
        { message: 'What insights do we have?', expectedIntent: ChatIntent.RETRIEVE_INSIGHTS },
        { message: 'Show me related metrics', expectedIntent: ChatIntent.RETRIEVE_METRICS },
        { message: 'Generate HMW questions from these insights', expectedIntent: ChatIntent.GENERATE_HMW }
      ]

      const conversationMessages = []
      let accumulatedContext = []

      for (const step of conversationFlow) {
        // Intent detection
        const intent = detectChatIntent(step.message)
        expect(intent.intent).toBe(step.expectedIntent)

        // Add message to conversation
        conversationMessages.push(createMockMessage({ content: step.message }))

        // Context retrieval based on intent
        let newContext = []
        if (intent.intent === ChatIntent.RETRIEVE_INSIGHTS) {
          const mockInsights = [createMockContextItem({ type: 'insight', content: 'Insight data' })]
          mockVectorSearch.setMockResults(step.message, mockInsights)
          const result = await contextRetrievalService.retrieveInsights(step.message)
          newContext = result.items
        } else if (intent.intent === ChatIntent.RETRIEVE_METRICS) {
          mockExecuteQuery.mockResolvedValue([{
            id: 'metric-1',
            name: 'Test Metric',
            description: 'Test description',
            current_value: 50,
            target_value: 75,
            unit: '%',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }])
          const result = await contextRetrievalService.retrieveMetrics(step.message)
          newContext = result.items
        }

        accumulatedContext = [...accumulatedContext, ...newContext]

        // Budget management
        const budget = testBudgetManager.getBudgetStatus(conversationMessages, accumulatedContext)
        expect(budget.status).toBe('healthy') // Should stay healthy throughout
      }

      expect(conversationMessages).toHaveLength(3)
      expect(accumulatedContext.length).toBeGreaterThan(0)
    })
  })

  describe('Budget Constraint Scenarios', () => {
    test('should handle budget exceeded scenario with truncation', async () => {
      // Create a scenario that exceeds budget
      const longMessages = Array.from({ length: 20 }, (_, i) => 
        createMockMessage({ 
          content: 'very long message content '.repeat(10),
          created_at: new Date(Date.now() - (20 - i) * 1000).toISOString()
        })
      )

      const largeContext = Array.from({ length: 30 }, (_, i) => 
        createMockContextItem({ 
          content: 'large context item content '.repeat(5),
          type: ['insight', 'metric', 'jtbd'][i % 3] as any
        })
      )

      // Set high token counts to force truncation
      longMessages.forEach(msg => {
        mockTokenCounter.setTokenCount(msg.content, 200)
      })
      largeContext.forEach(item => {
        mockTokenCounter.setTokenCount(item.content, 100)
      })

      const initialBudget = testBudgetManager.getBudgetStatus(longMessages, largeContext)
      expect(initialBudget.status).toBe('exceeded')

      const truncationResult = testBudgetManager.truncateToFitBudget(longMessages, largeContext, 1000)
      
      expect(truncationResult.tokensRemoved).toBeGreaterThan(0)
      expect(truncationResult.messagesRemoved).toBeGreaterThan(0)
      expect(truncationResult.contextItemsRemoved).toBeGreaterThan(0)

      const finalBudget = testBudgetManager.getBudgetStatus(
        truncationResult.messages, 
        truncationResult.contextItems
      )
      
      expect(finalBudget.currentTokens).toBeLessThanOrEqual(1000)
      expect(finalBudget.status).not.toBe('exceeded')
    })

    test('should preserve critical information during aggressive truncation', async () => {
      const criticalSystemMessage = createMockMessage({
        content: 'assistant system initialization',
        role: 'assistant',
        created_at: new Date(Date.now() - 10000).toISOString()
      })

      const recentUserMessage = createMockMessage({
        content: 'important user question',
        role: 'user',
        created_at: new Date().toISOString()
      })

      const criticalInsight = createMockContextItem({
        type: 'insight',
        content: 'Critical business insight',
        metadata: { priority: 'high' }
      })

      const nonCriticalSolution = createMockContextItem({
        type: 'solution',
        content: 'Nice to have solution idea',
        metadata: { priority: 'low' }
      })

      // Add many filler messages to force truncation
      const fillerMessages = Array.from({ length: 50 }, (_, i) => 
        createMockMessage({
          content: 'filler message content '.repeat(10),
          created_at: new Date(Date.now() - 5000 - (i * 100)).toISOString()
        })
      )

      mockTokenCounter.setTokenCount('assistant system initialization', 10)
      mockTokenCounter.setTokenCount('important user question', 10)
      mockTokenCounter.setTokenCount('Critical business insight', 15)
      mockTokenCounter.setTokenCount('Nice to have solution idea', 15)
      fillerMessages.forEach(msg => {
        mockTokenCounter.setTokenCount(msg.content, 150)
      })

      const allMessages = [criticalSystemMessage, ...fillerMessages, recentUserMessage]
      const allContext = [criticalInsight, nonCriticalSolution]

      const result = testBudgetManager.truncateToFitBudget(allMessages, allContext, 500)

      // Should preserve critical items
      expect(result.messages.some(m => m.id === criticalSystemMessage.id)).toBe(true)
      expect(result.messages.some(m => m.id === recentUserMessage.id)).toBe(true)
      expect(result.contextItems.some(c => c.id === criticalInsight.id)).toBe(true)
      
      // Should remove non-critical items
      expect(result.contextItems.some(c => c.id === nonCriticalSolution.id)).toBe(false)
    })

    test('should provide optimization recommendations for budget issues', async () => {
      const longMessage = createMockMessage({ 
        content: 'extremely long user message '.repeat(50) 
      })
      const duplicateContext = [
        createMockContextItem({ content: 'duplicate insight content' }),
        createMockContextItem({ content: 'duplicate insight content' }),
        createMockContextItem({ content: 'unique insight content' })
      ]

      mockTokenCounter.setTokenCount(longMessage.content, 400)
      duplicateContext.forEach(item => {
        mockTokenCounter.setTokenCount(item.content, 50)
      })

      const optimization = testBudgetManager.optimizeForBudget(
        [longMessage], 
        duplicateContext, 
        300
      )

      expect(optimization.canFit).toBe(true)
      expect(optimization.recommendedActions.length).toBeGreaterThan(0)
      expect(optimization.recommendedActions.some(action => 
        action.includes('long messages')
      )).toBe(true)
      expect(optimization.recommendedActions.some(action => 
        action.includes('duplicate')
      )).toBe(true)
      expect(optimization.tokenSavings).toBeGreaterThan(100)
    })
  })

  describe('Error Recovery and Fallback', () => {
    test('should gracefully handle vector search service failures', async () => {
      mockVectorSearch.searchInsights = jest.fn().mockRejectedValue(
        new Error('Vector search service unavailable')
      )

      await expect(
        contextRetrievalService.retrieveInsights('test query')
      ).rejects.toThrow('Failed to retrieve insights')

      // Should continue with intent detection
      const intent = detectChatIntent('What insights do we have?')
      expect(intent.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
    })

    test('should handle database connection failures gracefully', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('Database connection lost'))

      await expect(
        contextRetrievalService.retrieveMetrics('test query')
      ).rejects.toThrow('Failed to retrieve metrics')

      // Other services should continue working
      const intent = detectChatIntent('Show me metrics')
      expect(intent.intent).toBe(ChatIntent.RETRIEVE_METRICS)
    })

    test('should handle partial service failures in workflow', async () => {
      // Intent detection works
      const intent = detectChatIntent('What insights and metrics do we have?')
      expect(intent.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)

      // Vector search fails
      mockVectorSearch.searchInsights = jest.fn().mockRejectedValue(
        new Error('Service unavailable')
      )

      // Budget management still works
      const messages = [createMockMessage({ content: 'test message' })]
      const budget = testBudgetManager.getBudgetStatus(messages)
      expect(budget.status).toBe('healthy')
    })

    test('should recover from token counting errors', async () => {
      // Mock token counter to throw errors
      mockTokenCounter.count = jest.fn().mockImplementation((text) => {
        if (text.includes('error')) {
          throw new Error('Token counting failed')
        }
        return 10
      })

      const normalMessage = createMockMessage({ content: 'normal message' })
      const errorMessage = createMockMessage({ content: 'error message' })

      // Should handle error gracefully and continue with other messages
      expect(() => {
        testBudgetManager.calculateTokenBudget([normalMessage, errorMessage])
      }).not.toThrow()
    })
  })

  describe('Performance and Scalability', () => {
    test('should handle high-throughput conversation simulation', async () => {
      const conversationLength = 100
      const messages = generateTestMessages(conversationLength, 30)
      
      messages.forEach(msg => {
        mockTokenCounter.setTokenCount(msg.content, 20)
      })

      const { duration } = await measureTime(async () => {
        // Simulate processing each message
        for (const message of messages.slice(-10)) { // Process last 10 messages
          const intent = detectChatIntent(message.content)
          
          if (intent.intent === ChatIntent.RETRIEVE_INSIGHTS) {
            mockVectorSearch.setMockResults(message.content, [
              createMockContextItem({ content: 'Response context' })
            ])
            await contextRetrievalService.retrieveInsights(message.content)
          }
          
          testBudgetManager.getBudgetStatus([message])
        }
      })

      expect(duration).toBeLessThan(5000) // Should process 10 messages in under 5s
    })

    test('should maintain performance with large context sets', async () => {
      const largeContextSet = Array.from({ length: 500 }, (_, i) => 
        createMockContextItem({
          content: `Context item ${i} with varying length content`,
          type: ['insight', 'metric', 'jtbd', 'hmw', 'solution'][i % 5] as any
        })
      )

      largeContextSet.forEach(item => {
        mockTokenCounter.setTokenCount(item.content, 25)
      })

      const { duration } = await measureTime(async () => {
        const message = createMockMessage({ content: 'test with large context' })
        return testBudgetManager.getBudgetStatus([message], largeContextSet)
      })

      expect(duration).toBeLessThan(1000) // Should process large context in under 1s
    })

    test('should benchmark complete workflow performance', async () => {
      const benchmarkResult = await benchmark(
        'complete chat workflow',
        async () => {
          const userMessage = 'What insights do we have about user onboarding?'
          
          // Complete workflow
          const intent = detectChatIntent(userMessage)
          
          mockVectorSearch.setMockResults(userMessage, [
            createMockContextItem({ type: 'insight', content: 'Benchmark insight' })
          ])
          
          const context = await contextRetrievalService.retrieveInsights(userMessage)
          const budget = testBudgetManager.getBudgetStatus(
            [createMockMessage({ content: userMessage })],
            context.items
          )
          
          return { intent, context, budget }
        },
        20 // 20 iterations
      )

      expect(benchmarkResult.averageTime).toBeLessThan(2000) // Average under 2s
      expect(benchmarkResult.maxTime).toBeLessThan(5000) // Max under 5s
    })

    test('should monitor memory usage throughout workflow', async () => {
      const memoryTracker = trackMemoryUsage()
      
      // Simulate extended chat session
      for (let i = 0; i < 50; i++) {
        const message = `Message ${i} with content about user research insights`
        
        detectChatIntent(message)
        
        mockVectorSearch.setMockResults(message, [
          createMockContextItem({ content: `Context for message ${i}` })
        ])
        
        if (i % 5 === 0) { // Every 5th message retrieves context
          await contextRetrievalService.retrieveInsights(message)
        }
        
        testBudgetManager.getBudgetStatus([
          createMockMessage({ content: message })
        ])
      }

      const memoryDelta = memoryTracker.getDelta()
      expect(memoryDelta.heapUsed).toBeLessThan(20 * 1024 * 1024) // Less than 20MB increase
    })
  })

  describe('Real-world Usage Patterns', () => {
    test('should handle typical customer research workflow', async () => {
      const researchWorkflow = [
        'What insights do we have from the latest user interviews?',
        'Show me metrics related to user satisfaction',
        'What are the main jobs to be done for our target users?',
        'Generate how might we questions for improving user experience',
        'Create solutions for the top 3 user pain points'
      ]

      const workflowResults = []

      for (const [index, query] of researchWorkflow.entries()) {
        const startTime = Date.now()
        
        // Intent detection
        const intent = detectChatIntent(query)
        
        // Context retrieval based on intent
        let context = null
        if (intent.intent === ChatIntent.RETRIEVE_INSIGHTS) {
          const mockInsights = [
            createMockContextItem({ type: 'insight', content: 'User interview finding 1' }),
            createMockContextItem({ type: 'insight', content: 'User interview finding 2' })
          ]
          mockVectorSearch.setMockResults(query, mockInsights)
          context = await contextRetrievalService.retrieveInsights(query)
        } else if (intent.intent === ChatIntent.RETRIEVE_METRICS) {
          mockExecuteQuery.mockResolvedValue([{
            id: 'satisfaction-metric',
            name: 'User Satisfaction Score',
            current_value: 7.2,
            target_value: 8.5,
            unit: '/10',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }])
          context = await contextRetrievalService.retrieveMetrics(query)
        } else if (intent.intent === ChatIntent.RETRIEVE_JTBDS) {
          const mockJtbds = [
            createMockContextItem({ type: 'jtbd', content: 'Core user job to be done' })
          ]
          mockVectorSearch.setMockResults(query, mockJtbds)
          context = await contextRetrievalService.retrieveJTBDs(query)
        }

        const processingTime = Date.now() - startTime
        
        workflowResults.push({
          query,
          intent: intent.intent,
          confidence: intent.confidence,
          contextItems: context?.items.length || 0,
          processingTime
        })
      }

      // Verify workflow progression
      expect(workflowResults[0].intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      expect(workflowResults[1].intent).toBe(ChatIntent.RETRIEVE_METRICS)
      expect(workflowResults[2].intent).toBe(ChatIntent.RETRIEVE_JTBDS)
      expect(workflowResults[3].intent).toBe(ChatIntent.GENERATE_HMW)
      expect(workflowResults[4].intent).toBe(ChatIntent.CREATE_SOLUTIONS)

      // All steps should complete reasonably quickly
      workflowResults.forEach(result => {
        expect(result.processingTime).toBeLessThan(3000)
        expect(result.confidence).toBeGreaterThan(0.6)
      })
    })

    test('should handle context accumulation throughout session', async () => {
      const session = {
        messages: [],
        accumulatedContext: [],
        totalTokens: 0
      }

      const sessionQueries = [
        'What insights do we have about user onboarding?',
        'Are there any metrics that relate to these insights?',
        'Based on these insights and metrics, what are the key jobs to be done?'
      ]

      for (const query of sessionQueries) {
        // Add message to session
        const message = createMockMessage({ content: query })
        session.messages.push(message)

        // Detect intent and retrieve context
        const intent = detectChatIntent(query)
        
        let newContext = []
        if (intent.intent === ChatIntent.RETRIEVE_INSIGHTS) {
          newContext = [createMockContextItem({ type: 'insight', content: 'Session insight' })]
        } else if (intent.intent === ChatIntent.RETRIEVE_METRICS) {
          newContext = [createMockContextItem({ type: 'metric', content: 'Session metric' })]
        }

        session.accumulatedContext.push(...newContext)

        // Check budget throughout session
        const budget = testBudgetManager.getBudgetStatus(session.messages, session.accumulatedContext)
        expect(budget.status).toBe('healthy')
        
        session.totalTokens = budget.currentTokens
      }

      expect(session.messages).toHaveLength(3)
      expect(session.accumulatedContext.length).toBeGreaterThan(0)
      expect(session.totalTokens).toBeGreaterThan(0)
      expect(session.totalTokens).toBeLessThan(1000) // Within budget
    })

    test('should handle concurrent user interactions', async () => {
      const concurrentUsers = ['user1', 'user2', 'user3']
      const userQueries = {
        user1: 'What insights do we have about mobile users?',
        user2: 'Show me conversion metrics for the signup flow',
        user3: 'Generate HMW questions for improving retention'
      }

      const promises = concurrentUsers.map(async (userId) => {
        const query = userQueries[userId]
        const intent = detectChatIntent(query)
        
        // Setup mock data for each user
        if (intent.intent === ChatIntent.RETRIEVE_INSIGHTS) {
          mockVectorSearch.setMockResults(query, [
            createMockContextItem({ type: 'insight', content: `${userId} specific insight` })
          ])
          const context = await contextRetrievalService.retrieveInsights(query)
          return { userId, intent, context }
        } else if (intent.intent === ChatIntent.RETRIEVE_METRICS) {
          mockExecuteQuery.mockResolvedValue([{
            id: `${userId}-metric`,
            name: `${userId} Metric`,
            current_value: 50,
            target_value: 75,
            unit: '%',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }])
          const context = await contextRetrievalService.retrieveMetrics(query)
          return { userId, intent, context }
        }
        
        return { userId, intent, context: null }
      })

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.intent).toBeDefined()
        expect(result.userId).toBeDefined()
      })

      // Each user should get their own results
      const user1Result = results.find(r => r.userId === 'user1')
      expect(user1Result?.intent.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
    })
  })
})
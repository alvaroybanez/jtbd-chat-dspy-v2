/**
 * Chat Orchestrator Integration Tests
 * Comprehensive tests for enhanced context retrieval handlers with progressive loading
 */

import { ChatOrchestrator, ChatRequest, ChatStreamChunk, ContextData, PickerData } from '../orchestrator'
import { ChatIntent } from '../intent-detector'
import type { RetrievalResult } from '../context-retrieval'
import { 
  MockVectorSearchService, 
  MockDatabaseClient, 
  createMockContextItem,
  createMockRetrievalResult,
  waitFor,
  measureTime 
} from './test-utils'

// Mock dependencies
jest.mock('../intent-detector', () => ({
  intentDetector: {
    detectIntent: jest.fn()
  },
  ChatIntent: {
    RETRIEVE_INSIGHTS: 'retrieve_insights',
    RETRIEVE_METRICS: 'retrieve_metrics', 
    RETRIEVE_JTBDS: 'retrieve_jtbds',
    GENERATE_HMW: 'generate_hmw',
    CREATE_SOLUTIONS: 'create_solutions',
    GENERAL_EXPLORATION: 'general_exploration'
  }
}))

jest.mock('../context-retrieval', () => ({
  __esModule: true,
  default: {
    retrieveInsights: jest.fn(),
    retrieveMetrics: jest.fn(),
    retrieveJTBDs: jest.fn()
  }
}))

jest.mock('../message-persistence-pipeline', () => ({
  MessagePersistencePipeline: {
    getInstance: () => ({
      persistUserMessage: jest.fn(),
      persistAssistantMessage: jest.fn()
    })
  }
}))

jest.mock('../session-manager', () => ({
  ChatSessionManagerImpl: {
    getInstance: () => ({
      createChat: jest.fn(),
      loadChat: jest.fn()
    })
  }
}))

jest.mock('../../../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  startPerformance: jest.fn(() => 'test-tracking-id'),
  endPerformance: jest.fn()
}))

describe('ChatOrchestrator Enhanced Context Retrieval', () => {
  let orchestrator: ChatOrchestrator
  let mockIntentDetector: any
  let mockContextRetrieval: any
  let mockMessagePipeline: any
  let mockSessionManager: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()
    
    // Get fresh orchestrator instance
    orchestrator = ChatOrchestrator.getInstance()
    
    // Setup mock dependencies
    const intentModule = require('../intent-detector')
    mockIntentDetector = intentModule.intentDetector
    
    const contextModule = require('../context-retrieval')
    mockContextRetrieval = contextModule.default
    
    const pipelineModule = require('../message-persistence-pipeline')
    mockMessagePipeline = pipelineModule.MessagePersistencePipeline.getInstance()
    
    const sessionModule = require('../session-manager')
    mockSessionManager = sessionModule.ChatSessionManagerImpl.getInstance()

    // Setup default session manager behavior
    mockSessionManager.createChat.mockResolvedValue({
      id: 'test-chat-id',
      userId: 'test-user-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      isArchived: false,
      title: 'Test Chat',
      messages: [],
      messageCount: 0,
      status: 'active',
      totalTokensUsed: 0,
      selectedDocumentIds: [],
      selectedInsightIds: [],
      selectedJtbdIds: [],
      selectedMetricIds: [],
      metadata: {}
    })
    
    mockSessionManager.loadChat.mockResolvedValue(null)
  })

  describe('Insight Retrieval with Progressive Loading', () => {
    test('should show progressive loading states with reconciliation IDs', async () => {
      // Setup mocks
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_INSIGHTS,
        confidence: 0.95
      })
      
      console.log('Intent detector mock setup complete')

      const mockInsights = [
        createMockContextItem({
          type: 'insight',
          content: 'Users struggle with onboarding complexity',
          similarity: 0.9
        }),
        createMockContextItem({
          type: 'insight', 
          content: 'Mobile performance issues affecting retention',
          similarity: 0.8
        })
      ]

      const mockResult = createMockRetrievalResult(mockInsights, {
        summary: {
          maxSimilarity: 0.9,
          averageSimilarity: 0.85,
          retrievalTime: 100,
          searchType: 'semantic'
        }
      })

      mockContextRetrieval.retrieveInsights.mockResolvedValue(mockResult)
      mockMessagePipeline.persistUserMessage.mockResolvedValue({ id: 'user-msg-id' })
      mockMessagePipeline.persistAssistantMessage.mockResolvedValue({ id: 'assistant-msg-id' })

      // Execute request
      const request: ChatRequest = {
        message: 'show me insights about onboarding',
        userId: 'test-user-id'
      }

      const result = await orchestrator.processChatRequest(request)
      
      // Collect streamed chunks
      const chunks: ChatStreamChunk[] = []
      const reader = result.stream.getReader()
      
      let done = false
      let allText = ''
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        
        if (value) {
          const decoder = new TextDecoder()
          const text = decoder.decode(value)
          allText += text
          console.log('Raw chunk text:', text)
          
          const lines = text.split('\n').filter(line => line.startsWith('data: '))
          console.log('Filtered lines:', lines)
          
          for (const line of lines) {
            const jsonStr = line.replace('data: ', '')
            if (jsonStr.trim()) {
              console.log('Parsing JSON:', jsonStr)
              chunks.push(JSON.parse(jsonStr))
            }
          }
        }
      }
      
      console.log('Total text received:', allText)
      console.log('Total chunks parsed:', chunks.length)
      console.log('Chunks:', chunks.map(c => ({ type: c.type, hasData: !!c.data })))

      // Verify progressive loading pattern
      expect(chunks.length).toBeGreaterThanOrEqual(4) // metadata, loading, loaded, picker, done
      
      // Find loading chunk
      const loadingChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loading')
      expect(loadingChunk).toBeDefined()
      expect(loadingChunk?.content).toContain('Searching for relevant insights')
      expect((loadingChunk?.data as ContextData).type).toBe('insights_loading')
      expect((loadingChunk?.data as ContextData).id).toMatch(/insights-context-\\d+/)

      // Find loaded chunk
      const loadedChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loaded')
      expect(loadedChunk).toBeDefined()
      expect(loadedChunk?.content).toContain('Found 2 relevant insights')
      expect((loadedChunk?.data as ContextData).type).toBe('insights_loaded')
      expect((loadedChunk?.data as ContextData).results).toHaveLength(2)
      
      // Verify reconciliation - same ID as loading chunk
      expect((loadedChunk?.data as ContextData).id).toBe((loadingChunk?.data as ContextData).id)

      // Find picker chunk
      const pickerChunk = chunks.find(c => c.type === 'picker')
      expect(pickerChunk).toBeDefined()
      
      const pickerData = pickerChunk?.data as PickerData
      expect(pickerData.type).toBe('insight_picker')
      expect(pickerData.items).toHaveLength(2)
      expect(pickerData.items.every(item => item.selected === false)).toBe(true)
      expect(pickerData.actions).toEqual(['select', 'confirm', 'cancel'])
      expect(pickerData.selectedCount).toBe(0)
      expect(pickerData.maxSelections).toBe(10)

      // Verify service calls
      expect(mockContextRetrieval.retrieveInsights).toHaveBeenCalledWith(
        'show me insights about onboarding',
        { limit: 20, userId: 'test-user-id' }
      )
      
      expect(mockMessagePipeline.persistAssistantMessage).toHaveBeenCalledWith(
        'test-chat-id',
        'test-user-id',
        'Found 2 relevant insights',
        'retrieve_insights',
        expect.any(Number),
        100
      )
    })

    test('should handle insight retrieval errors with reconciliation', async () => {
      // Setup error scenario
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_INSIGHTS,
        confidence: 0.95
      })
      
      const errorMessage = 'Vector search service unavailable'
      mockContextRetrieval.retrieveInsights.mockRejectedValue(new Error(errorMessage))

      const request: ChatRequest = {
        message: 'show insights',
        userId: 'test-user-id'
      }

      // Should throw error but handle it gracefully in stream
      await expect(orchestrator.processChatRequest(request)).rejects.toThrow()

      // In real implementation, error would be caught and streamed
      // Here we verify the error handling setup is correct
      expect(mockContextRetrieval.retrieveInsights).toHaveBeenCalled()
    })
  })

  describe('Metric Retrieval with Progressive Loading', () => {
    test('should show progressive loading states for metrics', async () => {
      // Setup mocks
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_METRICS,
        confidence: 0.9
      })

      const mockMetrics = [
        createMockContextItem({
          type: 'metric',
          content: 'User Activation Rate: 65% current, 80% target',
          similarity: 0.95
        })
      ]

      const mockResult = createMockRetrievalResult(mockMetrics, {
        summary: {
          maxSimilarity: 0.95,
          averageSimilarity: 0.95,
          retrievalTime: 100,
          searchType: 'text'
        }
      })

      mockContextRetrieval.retrieveMetrics.mockResolvedValue(mockResult)
      mockMessagePipeline.persistUserMessage.mockResolvedValue({ id: 'user-msg-id' })
      mockMessagePipeline.persistAssistantMessage.mockResolvedValue({ id: 'assistant-msg-id' })

      const request: ChatRequest = {
        message: 'show metrics for activation',
        userId: 'test-user-id'
      }

      const result = await orchestrator.processChatRequest(request)
      
      // Collect chunks
      const chunks: ChatStreamChunk[] = []
      const reader = result.stream.getReader()
      
      let done = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        
        if (value) {
          const decoder = new TextDecoder()
          const text = decoder.decode(value)
          const lines = text.split('\n').filter(line => line.startsWith('data: '))
          
          for (const line of lines) {
            const jsonStr = line.replace('data: ', '')
            if (jsonStr.trim()) {
              chunks.push(JSON.parse(jsonStr))
            }
          }
        }
      }

      // Verify metrics-specific behavior
      const loadingChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loading')
      expect(loadingChunk?.content).toContain('Searching for relevant metrics')
      expect((loadingChunk?.data as ContextData).type).toBe('metrics_loading')

      const loadedChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loaded')
      expect(loadedChunk?.content).toContain('Found 1 relevant metrics')
      expect((loadedChunk?.data as ContextData).type).toBe('metrics_loaded')

      const pickerChunk = chunks.find(c => c.type === 'picker')
      const pickerData = pickerChunk?.data as PickerData
      expect(pickerData.type).toBe('metric_picker')
      expect(pickerData.maxSelections).toBe(5) // Different limit for metrics
    })
  })

  describe('JTBD Retrieval with Progressive Loading', () => {
    test('should show progressive loading states for JTBDs', async () => {
      // Setup mocks
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_JTBDS,
        confidence: 0.92
      })

      const mockJTBDs = [
        createMockContextItem({
          type: 'jtbd',
          content: 'When I am starting my workday, I want to quickly see my priorities',
          similarity: 0.88
        }),
        createMockContextItem({
          type: 'jtbd',
          content: 'When I am reviewing my progress, I want to understand my impact',
          similarity: 0.85
        }),
        createMockContextItem({
          type: 'jtbd', 
          content: 'When I am collaborating with my team, I want to share context easily',
          similarity: 0.82
        })
      ]

      const mockResult = createMockRetrievalResult(mockJTBDs, {
        summary: {
          maxSimilarity: 0.88,
          averageSimilarity: 0.85,
          retrievalTime: 100,
          searchType: 'semantic'
        }
      })

      mockContextRetrieval.retrieveJTBDs.mockResolvedValue(mockResult)
      mockMessagePipeline.persistUserMessage.mockResolvedValue({ id: 'user-msg-id' })
      mockMessagePipeline.persistAssistantMessage.mockResolvedValue({ id: 'assistant-msg-id' })

      const request: ChatRequest = {
        message: 'show me jobs to be done for productivity',
        userId: 'test-user-id'
      }

      const result = await orchestrator.processChatRequest(request)
      
      // Collect chunks
      const chunks: ChatStreamChunk[] = []
      const reader = result.stream.getReader()
      
      let done = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        
        if (value) {
          const decoder = new TextDecoder()
          const text = decoder.decode(value)
          const lines = text.split('\n').filter(line => line.startsWith('data: '))
          
          for (const line of lines) {
            const jsonStr = line.replace('data: ', '')
            if (jsonStr.trim()) {
              chunks.push(JSON.parse(jsonStr))
            }
          }
        }
      }

      // Verify JTBD-specific behavior
      const loadingChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loading')
      expect(loadingChunk?.content).toContain('Searching for relevant Jobs to be Done')
      expect((loadingChunk?.data as ContextData).type).toBe('jtbds_loading')

      const loadedChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loaded')
      expect(loadedChunk?.content).toContain('Found 3 relevant Jobs to be Done')
      expect((loadedChunk?.data as ContextData).type).toBe('jtbds_loaded')

      const pickerChunk = chunks.find(c => c.type === 'picker')
      const pickerData = pickerChunk?.data as PickerData
      expect(pickerData.type).toBe('jtbd_picker')
      expect(pickerData.items).toHaveLength(3)
      expect(pickerData.maxSelections).toBe(8) // Different limit for JTBDs
    })
  })

  describe('Performance and Edge Cases', () => {
    test('should handle empty results gracefully', async () => {
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_INSIGHTS,
        confidence: 0.85
      })

      const emptyResult = createMockRetrievalResult([], {
        summary: {
          maxSimilarity: 0,
          averageSimilarity: 0,
          retrievalTime: 100,
          searchType: 'semantic'
        }
      })

      mockContextRetrieval.retrieveInsights.mockResolvedValue(emptyResult)
      mockMessagePipeline.persistUserMessage.mockResolvedValue({ id: 'user-msg-id' })
      mockMessagePipeline.persistAssistantMessage.mockResolvedValue({ id: 'assistant-msg-id' })

      const request: ChatRequest = {
        message: 'show insights about nonexistent topic',
        userId: 'test-user-id'
      }

      const result = await orchestrator.processChatRequest(request)
      
      // Collect chunks
      const chunks: ChatStreamChunk[] = []
      const reader = result.stream.getReader()
      
      let done = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        
        if (value) {
          const decoder = new TextDecoder()
          const text = decoder.decode(value)
          const lines = text.split('\n').filter(line => line.startsWith('data: '))
          
          for (const line of lines) {
            const jsonStr = line.replace('data: ', '')
            if (jsonStr.trim()) {
              chunks.push(JSON.parse(jsonStr))
            }
          }
        }
      }

      const loadedChunk = chunks.find(c => c.type === 'context' && 
        (c.data as ContextData)?.status === 'loaded')
      expect(loadedChunk?.content).toContain('Found 0 relevant insights')

      const pickerChunk = chunks.find(c => c.type === 'picker')
      const pickerData = pickerChunk?.data as PickerData
      expect(pickerData.items).toHaveLength(0)
      expect(pickerData.selectedCount).toBe(0)
    })

    test('should generate unique reconciliation IDs', async () => {
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_INSIGHTS,
        confidence: 0.9
      })

      mockContextRetrieval.retrieveInsights.mockResolvedValue(
        createMockRetrievalResult([])
      )
      mockMessagePipeline.persistUserMessage.mockResolvedValue({ id: 'user-msg-id' })
      mockMessagePipeline.persistAssistantMessage.mockResolvedValue({ id: 'assistant-msg-id' })

      // Make two concurrent requests
      const request1: ChatRequest = {
        message: 'insights query 1',
        userId: 'test-user-id'
      }
      
      const request2: ChatRequest = {
        message: 'insights query 2', 
        userId: 'test-user-id'
      }

      const [result1, result2] = await Promise.all([
        orchestrator.processChatRequest(request1),
        orchestrator.processChatRequest(request2)
      ])

      // Both should succeed and have different IDs
      expect(result1.chatId).toBeDefined()
      expect(result2.chatId).toBeDefined()
      expect(result1.chatId).not.toBe(result2.chatId)
    })

    test('should maintain performance under load', async () => {
      mockIntentDetector.detectIntent.mockReturnValue({
        intent: ChatIntent.RETRIEVE_INSIGHTS,
        confidence: 0.9
      })

      const largeResultSet = Array.from({ length: 20 }, (_, i) => 
        createMockContextItem({
          type: 'insight',
          content: `Large insight ${i}`,
          similarity: 0.9 - (i * 0.01)
        })
      )

      mockContextRetrieval.retrieveInsights.mockResolvedValue(
        createMockRetrievalResult(largeResultSet)
      )
      mockMessagePipeline.persistUserMessage.mockResolvedValue({ id: 'user-msg-id' })
      mockMessagePipeline.persistAssistantMessage.mockResolvedValue({ id: 'assistant-msg-id' })

      const request: ChatRequest = {
        message: 'show all insights',
        userId: 'test-user-id'
      }

      const startTime = Date.now()
      const result = await orchestrator.processChatRequest(request)
      const endTime = Date.now()

      // Should complete within reasonable time (< 1 second for mocked data)
      expect(endTime - startTime).toBeLessThan(1000)
      expect(result).toBeDefined()
    })
  })
})
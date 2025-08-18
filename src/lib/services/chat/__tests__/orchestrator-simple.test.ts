/**
 * Simple Orchestrator Test to Debug Basic Flow
 */

import { ChatOrchestrator, ChatRequest } from '../orchestrator'

// Mock dependencies
jest.mock('../intent-detector', () => ({
  intentDetector: {
    detectIntent: jest.fn(() => ({
      intent: 'retrieve_insights',
      confidence: 0.95
    }))
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
    retrieveInsights: jest.fn(() => Promise.resolve({
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      },
      summary: {
        maxSimilarity: 0,
        averageSimilarity: 0,
        retrievalTime: 100,
        searchType: 'semantic'
      }
    }))
  }
}))

jest.mock('../message-persistence-pipeline', () => ({
  MessagePersistencePipeline: {
    getInstance: () => ({
      persistUserMessage: jest.fn(() => Promise.resolve({ messageId: 'test-msg-id' })),
      persistAssistantMessage: jest.fn(() => Promise.resolve({ messageId: 'test-assist-msg-id' }))
    })
  }
}))

jest.mock('../session-manager', () => ({
  ChatSessionManagerImpl: {
    getInstance: () => ({
      createChat: jest.fn(() => Promise.resolve({
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
      })),
      loadChat: jest.fn(() => Promise.resolve(null))
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

describe('ChatOrchestrator Simple Test', () => {
  test('should process a basic request without errors', async () => {
    const orchestrator = ChatOrchestrator.getInstance()
    
    const request: ChatRequest = {
      message: 'show me insights',
      userId: 'test-user-id'
    }

    const result = await orchestrator.processChatRequest(request)
    
    expect(result).toBeDefined()
    expect(result.stream).toBeDefined()
    expect(result.chatId).toBe('test-chat-id')
    
    console.log('Basic orchestrator test passed!')
  })
})
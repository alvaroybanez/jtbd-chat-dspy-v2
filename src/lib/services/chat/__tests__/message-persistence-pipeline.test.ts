/**
 * Comprehensive test suite for Message Persistence Pipeline
 * Tests all aspects of message persistence with complete metadata collection
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { MessagePersistencePipeline } from '../message-persistence-pipeline'
import { ChatSessionManagerImpl } from '../session-manager'
import { detectChatIntent } from '../intent-detector'
import { tokenBudgetManager } from '../token-budget'
import { logger } from '../../../logger'
import { 
  ValidationError,
  ChatNotFoundError,
  ChatPersistenceError 
} from '../../../errors'
import type { Message } from '../../../database/types'

// Mock dependencies
jest.mock('../session-manager', () => ({
  ChatSessionManagerImpl: {
    getInstance: jest.fn()
  }
}))
jest.mock('../intent-detector')
jest.mock('../token-budget')
jest.mock('../../../logger')

const mockSessionManager = {
  addMessage: jest.fn(),
  getMessages: jest.fn(),
}

const mockDetectChatIntent = jest.mocked(detectChatIntent)
const mockTokenBudgetManager = jest.mocked(tokenBudgetManager)
const mockLogger = jest.mocked(logger)

// Test data
const testUserId = 'user-123'
const testChatId = 'chat-456'
const testMessageId = 'message-789'

const mockMessage: Message = {
  id: testMessageId,
  chat_id: testChatId,
  role: 'user',
  content: 'Test message content',
  intent: 'retrieve_insights',
  context_items: { test: true },
  processing_time_ms: 150,
  token_count: 25,
  created_at: new Date().toISOString(),
}

describe('MessagePersistencePipeline', () => {
  let pipeline: MessagePersistencePipeline

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock ChatSessionManagerImpl singleton
    const { ChatSessionManagerImpl } = require('../session-manager')
    ChatSessionManagerImpl.getInstance.mockReturnValue(mockSessionManager)
    
    // Default mock implementations
    mockSessionManager.addMessage.mockResolvedValue(mockMessage)
    mockDetectChatIntent.mockReturnValue({
      intent: 'retrieve_insights',
      confidence: 0.85,
      matchedKeywords: ['insights', 'what'],
      rawMessage: 'test message'
    })

    pipeline = MessagePersistencePipeline.getInstance()
  })

  describe('Singleton Pattern', () => {
    test('returns same instance on multiple calls', () => {
      const instance1 = MessagePersistencePipeline.getInstance()
      const instance2 = MessagePersistencePipeline.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('persistUserMessage', () => {
    const validUserMessageData = {
      chatId: testChatId,
      userId: testUserId,
      content: 'What insights do we have about user onboarding?',
      contextItems: {
        insights: ['insight-1', 'insight-2'],
        metrics: ['metric-1']
      },
      metadata: { source: 'web_ui' }
    }

    test('successfully persists user message with all metadata', async () => {
      const result = await pipeline.persistUserMessage(validUserMessageData)

      expect(result.success).toBe(true)
      expect(result.messageId).toBe(testMessageId)
      expect(result.tokensUsed).toBe(13) // ~49 chars / 4
      expect(typeof result.processingTime).toBe('number')

      // Verify intent detection was called
      expect(mockDetectChatIntent).toHaveBeenCalledWith(validUserMessageData.content)

      // Verify session manager was called with correct data
      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          role: 'user',
          content: validUserMessageData.content,
          intent: 'retrieve_insights',
          tokensUsed: 13,
          contextInsights: ['insight-1', 'insight-2'],
          contextMetrics: ['metric-1'],
          metadata: expect.objectContaining({
            source: 'web_ui',
            intentConfidence: 0.85,
            intentKeywords: ['insights', 'what'],
            pipelineVersion: '1.0'
          })
        }),
        testUserId
      )

      // Verify audit logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User message persisted successfully',
        expect.objectContaining({
          chatId: testChatId,
          userId: testUserId,
          messageId: testMessageId,
          intent: 'retrieve_insights',
          confidence: 0.85,
          tokensUsed: 13
        })
      )
    })

    test('handles minimal user message data', async () => {
      const minimalData = {
        chatId: testChatId,
        userId: testUserId,
        content: 'Simple message'
      }

      const result = await pipeline.persistUserMessage(minimalData)

      expect(result.success).toBe(true)
      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          role: 'user',
          content: 'Simple message',
          contextDocumentChunks: [],
          contextInsights: [],
          contextJtbds: [],
          contextMetrics: []
        }),
        testUserId
      )
    })

    test('validates required fields', async () => {
      const testCases = [
        { data: { userId: testUserId, content: 'test' }, expectedError: 'Valid chatId is required' },
        { data: { chatId: testChatId, content: 'test' }, expectedError: 'Valid userId is required' },
        { data: { chatId: testChatId, userId: testUserId }, expectedError: 'Message content is required' },
        { data: { chatId: '', userId: testUserId, content: 'test' }, expectedError: 'Valid chatId is required' },
        { data: { chatId: testChatId, userId: '', content: 'test' }, expectedError: 'Valid userId is required' },
        { data: { chatId: testChatId, userId: testUserId, content: '' }, expectedError: 'Message content is required' },
      ]

      for (const { data, expectedError } of testCases) {
        const result = await pipeline.persistUserMessage(data as any)
        expect(result.success).toBe(false)
        expect(result.error?.code).toBe('VALIDATION_ERROR')
        expect(result.error?.message).toBe(expectedError)
      }
    })

    test('validates message content length', async () => {
      const longContent = 'a'.repeat(10001)
      const result = await pipeline.persistUserMessage({
        chatId: testChatId,
        userId: testUserId,
        content: longContent
      })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(result.error?.message).toBe('Message content too long (max 10000 characters)')
    })

    test('validates context items arrays', async () => {
      const invalidContextData = {
        chatId: testChatId,
        userId: testUserId,
        content: 'test',
        contextItems: {
          insights: ['valid-uuid', 123] // Invalid non-string ID
        }
      }

      const result = await pipeline.persistUserMessage(invalidContextData as any)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(result.error?.message).toBe('insights must be an array of UUID strings')
    })

    test('handles ChatNotFoundError from session manager', async () => {
      mockSessionManager.addMessage.mockRejectedValue(
        new ChatNotFoundError('Chat not found', testChatId)
      )

      const result = await pipeline.persistUserMessage(validUserMessageData)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('CHAT_NOT_FOUND')
      expect(result.error?.message).toBe('Chat not found or inaccessible')
      expect(result.error?.details?.chatId).toBe(testChatId)
    })

    test('handles generic database errors', async () => {
      mockSessionManager.addMessage.mockRejectedValue(new Error('Database connection failed'))

      const result = await pipeline.persistUserMessage(validUserMessageData)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('PERSISTENCE_ERROR')
      expect(result.error?.message).toBe('Failed to persist user message')
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to persist user message',
        expect.objectContaining({
          chatId: testChatId,
          userId: testUserId,
          error: 'Database connection failed'
        })
      )
    })
  })

  describe('persistAssistantMessage', () => {
    const validAssistantMessageData = {
      chatId: testChatId,
      userId: testUserId,
      content: 'Here are the insights I found for your query...',
      intent: 'retrieve_insights',
      contextItems: {
        insights: ['insight-1', 'insight-2'],
        documentChunks: ['chunk-1']
      },
      processingTimeMs: 1250,
      tokensUsed: 75,
      modelUsed: 'gpt-5-nano',
      temperature: 0.7,
      metadata: { generationSource: 'streaming' }
    }

    test('successfully persists assistant message with complete metadata', async () => {
      const result = await pipeline.persistAssistantMessage(validAssistantMessageData)

      expect(result.success).toBe(true)
      expect(result.messageId).toBe(testMessageId)
      expect(result.tokensUsed).toBe(75)
      expect(typeof result.processingTime).toBe('number')

      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          role: 'assistant',
          content: validAssistantMessageData.content,
          intent: 'retrieve_insights',
          processingTimeMs: 1250,
          tokensUsed: 75,
          contextInsights: ['insight-1', 'insight-2'],
          contextDocumentChunks: ['chunk-1'],
          modelUsed: 'gpt-5-nano',
          temperature: 0.7,
          metadata: expect.objectContaining({
            generationSource: 'streaming',
            pipelineVersion: '1.0',
            hasError: false
          })
        }),
        testUserId
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Assistant message persisted successfully',
        expect.objectContaining({
          chatId: testChatId,
          userId: testUserId,
          messageId: testMessageId,
          intent: 'retrieve_insights',
          processingTimeMs: 1250,
          tokensUsed: 75,
          modelUsed: 'gpt-5-nano',
          hasError: false
        })
      )
    })

    test('handles assistant message with error metadata', async () => {
      const errorMessageData = {
        ...validAssistantMessageData,
        errorCode: 'DSPY_TIMEOUT',
        errorMessage: 'DSPy service timed out, using fallback generation'
      }

      const result = await pipeline.persistAssistantMessage(errorMessageData)

      expect(result.success).toBe(true)
      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          errorCode: 'DSPY_TIMEOUT',
          errorMessage: 'DSPy service timed out, using fallback generation',
          metadata: expect.objectContaining({
            hasError: true
          })
        }),
        testUserId
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Assistant message persisted successfully',
        expect.objectContaining({
          hasError: true
        })
      )
    })

    test('validates required assistant message fields', async () => {
      const testCases = [
        { data: { ...validAssistantMessageData, chatId: undefined }, expectedError: 'Valid chatId is required' },
        { data: { ...validAssistantMessageData, userId: undefined }, expectedError: 'Valid userId is required' },
        { data: { ...validAssistantMessageData, content: undefined }, expectedError: 'Message content is required' },
        { data: { ...validAssistantMessageData, intent: undefined }, expectedError: 'Intent is required for assistant messages' },
      ]

      for (const { data, expectedError } of testCases) {
        const result = await pipeline.persistAssistantMessage(data as any)
        expect(result.success).toBe(false)
        expect(result.error?.code).toBe('VALIDATION_ERROR')
        expect(result.error?.message).toBe(expectedError)
      }
    })

    test('validates numeric fields', async () => {
      const negativeTimeData = {
        ...validAssistantMessageData,
        processingTimeMs: -100
      }

      const result1 = await pipeline.persistAssistantMessage(negativeTimeData)
      expect(result1.success).toBe(false)
      expect(result1.error?.message).toBe('Processing time must be non-negative')

      const negativeTokensData = {
        ...validAssistantMessageData,
        tokensUsed: -50
      }

      const result2 = await pipeline.persistAssistantMessage(negativeTokensData)
      expect(result2.success).toBe(false)
      expect(result2.error?.message).toBe('Token count must be non-negative')
    })
  })

  describe('Streaming Message Support', () => {
    const testIntent = 'generate_hmw'
    const testContextItems = {
      insights: ['insight-1'],
      jtbds: ['jtbd-1']
    }

    test('creates and completes streaming message context', async () => {
      // Create streaming context
      const context = pipeline.createStreamingContext(
        testChatId,
        testUserId,
        testIntent,
        testContextItems,
        'gpt-5-nano',
        0.7
      )

      expect(context.chatId).toBe(testChatId)
      expect(context.userId).toBe(testUserId)
      expect(context.intent).toBe(testIntent)
      expect(context.contextItems).toEqual(testContextItems)
      expect(context.modelUsed).toBe('gpt-5-nano')
      expect(context.temperature).toBe(0.7)
      expect(typeof context.startTime).toBe('number')

      // Verify context creation logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created streaming message context',
        expect.objectContaining({
          chatId: testChatId,
          userId: testUserId,
          intent: testIntent,
          contextItemsCount: {
            documentChunks: 0,
            insights: 1,
            jtbds: 1,
            metrics: 0
          }
        })
      )

      // Complete streaming message
      const streamedContent = 'How might we improve the user onboarding experience?'
      const tokensUsed = 85
      const metadata = { streamChunks: 15 }

      // Add small delay to test processing time calculation
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await pipeline.completeStreamingMessage(
        context,
        streamedContent,
        tokensUsed,
        undefined,
        undefined,
        metadata
      )

      expect(result.success).toBe(true)
      expect(result.tokensUsed).toBe(85)

      // Verify message was persisted with streaming metadata
      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          role: 'assistant',
          content: streamedContent,
          intent: testIntent,
          tokensUsed: 85,
          contextInsights: ['insight-1'],
          contextJtbds: ['jtbd-1'],
          modelUsed: 'gpt-5-nano',
          temperature: 0.7,
          metadata: expect.objectContaining({
            streamChunks: 15,
            streamingEnabled: true,
            streamingDurationMs: expect.any(Number)
          })
        }),
        testUserId
      )
    })

    test('completes streaming message with error', async () => {
      const context = pipeline.createStreamingContext(testChatId, testUserId, testIntent)

      const result = await pipeline.completeStreamingMessage(
        context,
        'Partial response before error...',
        40,
        'STREAM_INTERRUPTED',
        'Stream was interrupted by client disconnect'
      )

      expect(result.success).toBe(true)
      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          errorCode: 'STREAM_INTERRUPTED',
          errorMessage: 'Stream was interrupted by client disconnect',
          metadata: expect.objectContaining({
            hasError: true,
            streamingEnabled: true
          })
        }),
        testUserId
      )
    })
  })

  describe('Message Persistence Statistics', () => {
    test('calculates comprehensive statistics from chat messages', async () => {
      const mockMessages: Message[] = [
        { 
          id: 'msg-1', chat_id: testChatId, role: 'user', content: 'Test 1', 
          intent: 'retrieve_insights', context_items: null, processing_time_ms: 100, 
          token_count: 20, created_at: new Date().toISOString() 
        },
        { 
          id: 'msg-2', chat_id: testChatId, role: 'assistant', content: 'Response 1', 
          intent: 'retrieve_insights', context_items: { hasError: false }, processing_time_ms: 500, 
          token_count: 50, created_at: new Date().toISOString() 
        },
        { 
          id: 'msg-3', chat_id: testChatId, role: 'user', content: 'Test 2', 
          intent: 'generate_hmw', context_items: null, processing_time_ms: 150, 
          token_count: 30, created_at: new Date().toISOString() 
        },
        { 
          id: 'msg-4', chat_id: testChatId, role: 'assistant', content: 'Error response', 
          intent: 'generate_hmw', context_items: { hasError: true }, processing_time_ms: 200, 
          token_count: 25, created_at: new Date().toISOString() 
        },
      ]

      mockSessionManager.getMessages.mockResolvedValue(mockMessages)

      const stats = await pipeline.getMessagePersistenceStats(testChatId, testUserId, 24)

      expect(stats.totalMessages).toBe(4)
      expect(stats.userMessages).toBe(2)
      expect(stats.assistantMessages).toBe(2)
      expect(stats.systemMessages).toBe(0)
      expect(stats.averageProcessingTime).toBe(212) // (100+500+150+200)/4 = 212.5 rounded
      expect(stats.totalTokensUsed).toBe(125) // 20+50+30+25
      expect(stats.errorRate).toBe(25) // 1 error out of 4 messages = 25%
      expect(stats.intentsDistribution).toEqual({
        'retrieve_insights': 2,
        'generate_hmw': 2
      })
    })

    test('handles empty message history', async () => {
      mockSessionManager.getMessages.mockResolvedValue([])

      const stats = await pipeline.getMessagePersistenceStats(testChatId, testUserId)

      expect(stats.totalMessages).toBe(0)
      expect(stats.averageProcessingTime).toBe(0)
      expect(stats.totalTokensUsed).toBe(0)
      expect(stats.errorRate).toBe(0)
      expect(stats.intentsDistribution).toEqual({})
    })

    test('handles statistics calculation errors gracefully', async () => {
      mockSessionManager.getMessages.mockRejectedValue(new Error('Database error'))

      const stats = await pipeline.getMessagePersistenceStats(testChatId, testUserId)

      expect(stats.totalMessages).toBe(0)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get message persistence stats',
        expect.objectContaining({
          chatId: testChatId,
          userId: testUserId,
          error: 'Database error'
        })
      )
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('handles unknown errors gracefully', async () => {
      mockSessionManager.addMessage.mockRejectedValue('String error')

      const result = await pipeline.persistUserMessage({
        chatId: testChatId,
        userId: testUserId,
        content: 'test'
      })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('PERSISTENCE_ERROR')
      expect(result.error?.details?.originalError).toBe('Unknown')
    })

    test('measures processing time accurately', async () => {
      // Add a delay to simulate processing time
      mockSessionManager.addMessage.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return mockMessage
      })

      const result = await pipeline.persistUserMessage({
        chatId: testChatId,
        userId: testUserId,
        content: 'test'
      })

      expect(result.processingTime).toBeGreaterThanOrEqual(50)
      expect(result.processingTime).toBeLessThan(200) // Allow for test timing variance
    })
  })

  describe('Performance and Monitoring', () => {
    test('tracks performance metrics in logs', async () => {
      await pipeline.persistUserMessage({
        chatId: testChatId,
        userId: testUserId,
        content: 'Performance test message',
        contextItems: {
          insights: ['insight-1', 'insight-2', 'insight-3'],
          metrics: ['metric-1']
        }
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User message persisted successfully',
        expect.objectContaining({
          processingTime: expect.any(Number),
          contextItemsCount: {
            documentChunks: 0,
            insights: 3,
            jtbds: 0,
            metrics: 1
          }
        })
      )
    })

    test('includes pipeline version in message metadata', async () => {
      await pipeline.persistUserMessage({
        chatId: testChatId,
        userId: testUserId,
        content: 'Version test'
      })

      expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
        testChatId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            pipelineVersion: '1.0',
            persistedAt: expect.any(String)
          })
        }),
        testUserId
      )
    })
  })
})
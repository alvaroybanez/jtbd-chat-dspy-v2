/**
 * Unit tests for Chat Session Manager service
 * Tests all CRUD operations, error handling, and edge cases
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { v4 as uuidv4 } from 'uuid'
import { ChatSessionManagerImpl } from '../session-manager'
import {
  ChatSessionError,
  ChatNotFoundError,
  ValidationError,
} from '../../../errors'
import type {
  ChatContext,
  ChatWithMessagesAndContext,
  MessageInput,
  ListChatsOptions,
} from '../session-types'

// Mock dependencies
jest.mock('../../../database/client')
jest.mock('../../../logger')

const mockExecuteQuery = jest.fn()
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}

// Setup mocks
beforeEach(() => {
  jest.clearAllMocks()
  
  // Mock the database client
  require('../../../database/client').executeQuery = mockExecuteQuery
  require('../../../logger').logger = mockLogger
})

describe('ChatSessionManagerImpl', () => {
  let sessionManager: ChatSessionManagerImpl
  let mockUserId: string
  let mockChatId: string

  beforeEach(() => {
    sessionManager = ChatSessionManagerImpl.getInstance()
    mockUserId = uuidv4()
    mockChatId = uuidv4()
  })

  describe('Singleton Pattern', () => {
    test('returns same instance on multiple calls', () => {
      const instance1 = ChatSessionManagerImpl.getInstance()
      const instance2 = ChatSessionManagerImpl.getInstance()
      
      expect(instance1).toBe(instance2)
    })
  })

  describe('createChat', () => {
    test('successfully creates chat with title and context', async () => {
      const title = 'Test Chat'
      const context: ChatContext = {
        selectedInsightIds: [uuidv4(), uuidv4()],
        selectedMetricIds: [uuidv4()],
      }

      const mockDbResponse = {
        id: mockChatId,
        user_id: mockUserId,
        title,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        status: 'active',
        message_count: 0,
        selected_document_ids: [],
        selected_insight_ids: context.selectedInsightIds,
        selected_jtbd_ids: [],
        selected_metric_ids: context.selectedMetricIds,
        total_tokens_used: 0,
        metadata: {},
      }

      mockExecuteQuery.mockResolvedValueOnce(mockDbResponse)

      const result = await sessionManager.createChat(mockUserId, title, context)

      expect(result).toEqual({
        ...mockDbResponse,
        messages: [],
        messageCount: 0,
        totalTokensUsed: 0,
        selectedDocumentIds: [],
        selectedInsightIds: context.selectedInsightIds,
        selectedJtbdIds: [],
        selectedMetricIds: context.selectedMetricIds,
      })

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat created successfully',
        expect.objectContaining({
          chatId: expect.any(String),
          userId: mockUserId,
          title,
          processingTime: expect.any(Number),
          contextItemsCount: 3,
        })
      )
    })

    test('creates chat with auto-generated title when none provided', async () => {
      const mockDbResponse = {
        id: mockChatId,
        user_id: mockUserId,
        title: expect.stringMatching(/^Chat \d{4}-\d{2}-\d{2}$/),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        status: 'active',
        message_count: 0,
        selected_document_ids: [],
        selected_insight_ids: [],
        selected_jtbd_ids: [],
        selected_metric_ids: [],
        total_tokens_used: 0,
        metadata: {},
      }

      mockExecuteQuery.mockResolvedValueOnce(mockDbResponse)

      const result = await sessionManager.createChat(mockUserId)

      expect(result.title).toMatch(/^Chat \d{4}-\d{2}-\d{2}$/)
      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
    })

    test('throws ValidationError for invalid userId', async () => {
      await expect(
        sessionManager.createChat('')
      ).rejects.toThrow(ValidationError)

      await expect(
        sessionManager.createChat('   ')
      ).rejects.toThrow(ValidationError)
    })

    test('throws ValidationError for invalid title', async () => {
      const longTitle = 'a'.repeat(101) // Exceeds MAX_TITLE_LENGTH (100)

      await expect(
        sessionManager.createChat(mockUserId, longTitle)
      ).rejects.toThrow(ValidationError)
    })

    test('throws ChatSessionError for database failures', async () => {
      mockExecuteQuery.mockRejectedValueOnce(new Error('Database connection failed'))

      await expect(
        sessionManager.createChat(mockUserId, 'Test Chat')
      ).rejects.toThrow(ChatSessionError)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create chat',
        expect.objectContaining({
          userId: mockUserId,
          error: 'Database connection failed',
        })
      )
    })
  })

  describe('loadChat', () => {
    test('successfully loads chat with messages and context', async () => {
      const mockDbResponse = {
        id: mockChatId,
        user_id: mockUserId,
        title: 'Test Chat',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        status: 'active',
        message_count: 2,
        last_message_at: '2024-01-01T01:00:00Z',
        total_tokens_used: 150,
        selected_document_ids: [],
        selected_insight_ids: [uuidv4()],
        selected_jtbd_ids: [],
        selected_metric_ids: [],
        metadata: {},
        chat_messages: [
          {
            id: uuidv4(),
            role: 'user',
            content: 'Hello',
            created_at: '2024-01-01T00:30:00Z',
            intent: null,
            processing_time_ms: null,
            tokens_used: 5,
            context_document_chunks: [],
            context_insights: [],
            context_jtbds: [],
            context_metrics: [],
            model_used: null,
            temperature: null,
            error_code: null,
            error_message: null,
            metadata: {},
          },
          {
            id: uuidv4(),
            role: 'assistant',
            content: 'Hello! How can I help?',
            created_at: '2024-01-01T01:00:00Z',
            intent: 'general_exploration',
            processing_time_ms: 1500,
            tokens_used: 145,
            context_document_chunks: [],
            context_insights: [],
            context_jtbds: [],
            context_metrics: [],
            model_used: 'gpt-4o-mini',
            temperature: 0.7,
            error_code: null,
            error_message: null,
            metadata: {},
          },
        ],
      }

      mockExecuteQuery.mockResolvedValueOnce(mockDbResponse)

      const result = await sessionManager.loadChat(mockChatId, mockUserId)

      expect(result).toEqual({
        id: mockChatId,
        user_id: mockUserId,
        title: 'Test Chat',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'Hello',
            tokens_used: 5,
          }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Hello! How can I help?',
            tokens_used: 145,
          }),
        ],
        messageCount: 2,
        lastMessageAt: '2024-01-01T01:00:00Z',
        status: 'active',
        totalTokensUsed: 150,
        selectedDocumentIds: [],
        selectedInsightIds: [expect.any(String)],
        selectedJtbdIds: [],
        selectedMetricIds: [],
        metadata: {},
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat loaded successfully',
        expect.objectContaining({
          chatId: mockChatId,
          userId: mockUserId,
          messageCount: 2,
        })
      )
    })

    test('throws ChatNotFoundError when chat does not exist', async () => {
      mockExecuteQuery.mockResolvedValueOnce(null)

      await expect(
        sessionManager.loadChat(mockChatId, mockUserId)
      ).rejects.toThrow(ChatNotFoundError)
    })

    test('throws ValidationError for invalid inputs', async () => {
      await expect(
        sessionManager.loadChat('', mockUserId)
      ).rejects.toThrow(ValidationError)

      await expect(
        sessionManager.loadChat(mockChatId, '')
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('listChats', () => {
    test('successfully lists user chats with default pagination', async () => {
      const mockChats = [
        {
          id: uuidv4(),
          user_id: mockUserId,
          title: 'Chat 1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          status: 'active',
          message_count: 5,
          last_message_at: '2024-01-01T01:00:00Z',
          total_tokens_used: 250,
          selected_document_ids: [],
          selected_insight_ids: [],
          selected_jtbd_ids: [],
          selected_metric_ids: [],
          metadata: {},
        },
        {
          id: uuidv4(),
          user_id: mockUserId,
          title: 'Chat 2',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          status: 'active',
          message_count: 3,
          last_message_at: '2024-01-02T01:00:00Z',
          total_tokens_used: 180,
          selected_document_ids: [],
          selected_insight_ids: [],
          selected_jtbd_ids: [],
          selected_metric_ids: [],
          metadata: {},
        },
      ]

      mockExecuteQuery.mockResolvedValueOnce({ data: mockChats, count: 2 })

      const result = await sessionManager.listChats(mockUserId)

      expect(result).toEqual({
        chats: expect.arrayContaining([
          expect.objectContaining({
            title: 'Chat 1',
            messageCount: 5,
            messages: [], // Messages not loaded in list view
          }),
          expect.objectContaining({
            title: 'Chat 2',
            messageCount: 3,
            messages: [], // Messages not loaded in list view
          }),
        ]),
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      })
    })

    test('applies filters and pagination options', async () => {
      const options: ListChatsOptions = {
        page: 2,
        pageSize: 5,
        status: 'archived',
        titleContains: 'test',
        orderBy: 'created_at',
        order: 'asc',
      }

      mockExecuteQuery.mockResolvedValueOnce({ data: [], count: 0 })

      await sessionManager.listChats(mockUserId, options)

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
      // Verify the query was built with correct filters
      // (Implementation details depend on your database query builder)
    })

    test('throws ValidationError for invalid pagination', async () => {
      await expect(
        sessionManager.listChats(mockUserId, { page: 0 })
      ).rejects.toThrow(ValidationError)

      await expect(
        sessionManager.listChats(mockUserId, { pageSize: 101 })
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('updateChatTitle', () => {
    test('successfully updates chat title', async () => {
      const newTitle = 'Updated Chat Title'

      mockExecuteQuery.mockResolvedValueOnce({})

      await sessionManager.updateChatTitle(mockChatId, newTitle, mockUserId)

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat title updated',
        { chatId: mockChatId, userId: mockUserId, title: newTitle }
      )
    })

    test('throws ValidationError for invalid title', async () => {
      await expect(
        sessionManager.updateChatTitle(mockChatId, '', mockUserId)
      ).rejects.toThrow(ValidationError)

      await expect(
        sessionManager.updateChatTitle(mockChatId, 'a'.repeat(101), mockUserId)
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('updateChatContext', () => {
    test('successfully updates chat context', async () => {
      const newContext: ChatContext = {
        selectedInsightIds: [uuidv4(), uuidv4()],
        selectedMetricIds: [uuidv4()],
      }

      mockExecuteQuery.mockResolvedValueOnce({})

      await sessionManager.updateChatContext(mockChatId, newContext, mockUserId)

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat context updated',
        expect.objectContaining({
          chatId: mockChatId,
          userId: mockUserId,
          contextItemsCount: 3,
        })
      )
    })
  })

  describe('archiveChat', () => {
    test('successfully archives chat', async () => {
      mockExecuteQuery.mockResolvedValueOnce({})

      await sessionManager.archiveChat(mockChatId, mockUserId)

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat archived',
        { chatId: mockChatId, userId: mockUserId }
      )
    })
  })

  describe('deleteChat', () => {
    test('successfully deletes chat', async () => {
      mockExecuteQuery.mockResolvedValueOnce({})

      await sessionManager.deleteChat(mockChatId, mockUserId)

      expect(mockExecuteQuery).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat deleted',
        { chatId: mockChatId, userId: mockUserId }
      )
    })
  })

  describe('cleanupArchivedChats', () => {
    test('successfully cleans up archived chats', async () => {
      const olderThan = '2024-01-01T00:00:00Z'
      const mockDeleted = [{ id: uuidv4() }, { id: uuidv4() }]

      mockExecuteQuery.mockResolvedValueOnce(mockDeleted)

      const result = await sessionManager.cleanupArchivedChats(olderThan)

      expect(result).toBe(2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Archived chats cleaned up',
        { deletedCount: 2, olderThan }
      )
    })
  })

  describe('addMessage', () => {
    test('successfully adds message to chat', async () => {
      const messageInput: MessageInput = {
        role: 'user',
        content: 'Test message',
        intent: 'general_exploration',
        tokensUsed: 10,
        contextInsights: [uuidv4()],
      }

      const mockMessageResponse = {
        id: uuidv4(),
        chat_id: mockChatId,
        ...messageInput,
        created_at: '2024-01-01T00:00:00Z',
        metadata: {},
      }

      mockExecuteQuery.mockResolvedValueOnce(mockMessageResponse)

      const result = await sessionManager.addMessage(mockChatId, messageInput, mockUserId)

      expect(result).toEqual(mockMessageResponse)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Message added to chat',
        expect.objectContaining({
          chatId: mockChatId,
          userId: mockUserId,
          role: 'user',
          tokensUsed: 10,
        })
      )
    })

    test('throws ValidationError for invalid message input', async () => {
      const invalidMessage = {
        role: 'invalid_role',
        content: 'Test message',
      } as MessageInput

      await expect(
        sessionManager.addMessage(mockChatId, invalidMessage, mockUserId)
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('getMessages', () => {
    test('successfully retrieves messages with default options', async () => {
      const mockMessages = [
        {
          id: uuidv4(),
          chat_id: mockChatId,
          role: 'user',
          content: 'Hello',
          created_at: '2024-01-01T00:00:00Z',
          tokens_used: 5,
        },
      ]

      mockExecuteQuery.mockResolvedValueOnce(mockMessages)

      const result = await sessionManager.getMessages(mockChatId, {}, mockUserId)

      expect(result).toEqual(mockMessages)
    })

    test('throws ValidationError for excessive message limit', async () => {
      await expect(
        sessionManager.getMessages(mockChatId, { limit: 501 }, mockUserId)
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('getHealth', () => {
    test('returns healthy status when database is accessible', async () => {
      mockExecuteQuery.mockResolvedValueOnce([])

      const health = await sessionManager.getHealth()

      expect(health).toEqual({
        status: 'healthy',
        details: {
          lastChecked: expect.any(String),
          databaseConnectivity: 'ok',
        },
      })
    })

    test('returns unhealthy status when database is inaccessible', async () => {
      mockExecuteQuery.mockRejectedValueOnce(new Error('Connection failed'))

      const health = await sessionManager.getHealth()

      expect(health).toEqual({
        status: 'unhealthy',
        details: {
          lastChecked: expect.any(String),
          error: 'Connection failed',
        },
      })
    })
  })

  describe('Error Handling', () => {
    test('handles database errors gracefully', async () => {
      mockExecuteQuery.mockRejectedValueOnce(new Error('Database error'))

      await expect(
        sessionManager.createChat(mockUserId, 'Test Chat')
      ).rejects.toThrow(ChatSessionError)

      expect(mockLogger.error).toHaveBeenCalled()
    })

    test('preserves original error context', async () => {
      const originalError = new Error('Original database error')
      mockExecuteQuery.mockRejectedValueOnce(originalError)

      try {
        await sessionManager.createChat(mockUserId, 'Test Chat')
      } catch (error) {
        expect(error).toBeInstanceOf(ChatSessionError)
        expect((error as ChatSessionError).cause).toBe(originalError)
      }
    })
  })
})
/**
 * Chat Messages API Endpoint Tests
 * Tests for GET /api/v1/chats/[chatId]/messages
 */

import { NextRequest } from 'next/server'
import { GET as getMessages } from '../route'
import { chatSessionManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ChatNotFoundError, ValidationError } from '@/lib/errors/base'
import { HTTP_STATUS } from '@/lib/config/constants'

// Mock dependencies
jest.mock('@/lib/services/chat')
jest.mock('@/lib/errors/handler')
jest.mock('@/lib/logger')

const mockChatSessionManager = chatSessionManager as jest.Mocked<typeof chatSessionManager>
const mockHandleApiError = handleApiError as jest.MockedFunction<typeof handleApiError>
const mockLogger = logger as jest.Mocked<typeof logger>

// Mock data
const mockUserId = '550e8400-e29b-41d4-a716-446655440000'
const mockChatId = '123e4567-e89b-12d3-a456-426614174000'

const mockMessages = [
  {
    id: 'msg1',
    chatId: mockChatId,
    userId: mockUserId,
    role: 'user' as const,
    content: 'What insights do we have about user onboarding?',
    intent: 'retrieve_insights',
    tokensUsed: 12,
    contextDocumentChunks: ['chunk1'],
    contextInsights: ['insight1'],
    contextJtbds: [],
    contextMetrics: ['metric1'],
    createdAt: '2025-01-18T10:00:00Z',
    updatedAt: '2025-01-18T10:00:00Z',
    metadata: { source: 'web_ui' }
  },
  {
    id: 'msg2',
    chatId: mockChatId,
    userId: mockUserId,
    role: 'assistant' as const,
    content: 'Here are the insights about user onboarding...',
    intent: 'retrieve_insights',
    tokensUsed: 35,
    processingTimeMs: 450,
    modelUsed: 'gpt-5-nano',
    temperature: 0.7,
    contextDocumentChunks: ['chunk1'],
    contextInsights: ['insight1'],
    contextJtbds: [],
    contextMetrics: ['metric1'],
    createdAt: '2025-01-18T10:00:30Z',
    updatedAt: '2025-01-18T10:00:30Z',
    metadata: { generationSource: 'direct_api' }
  },
  {
    id: 'msg3',
    chatId: mockChatId,
    userId: mockUserId,
    role: 'user' as const,
    content: 'Generate HMW questions',
    intent: 'generate_hmw',
    tokensUsed: 8,
    contextDocumentChunks: [],
    contextInsights: ['insight1'],
    contextJtbds: ['jtbd1'],
    contextMetrics: [],
    createdAt: '2025-01-18T10:01:00Z',
    updatedAt: '2025-01-18T10:01:00Z',
    metadata: {}
  }
]

const mockChatWithMessages = {
  id: mockChatId,
  userId: mockUserId,
  title: 'Test Chat',
  status: 'active' as const,
  messageCount: 3,
  totalTokensUsed: 55,
  lastMessageAt: '2025-01-18T10:01:00Z',
  selectedDocumentIds: [],
  selectedInsightIds: ['insight1'],
  selectedJtbdIds: ['jtbd1'],
  selectedMetricIds: ['metric1'],
  createdAt: '2025-01-18T10:00:00Z',
  updatedAt: '2025-01-18T10:01:00Z',
  messages: mockMessages,
  metadata: {}
}

describe('/api/v1/chats/[chatId]/messages - Chat Messages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/v1/chats/[chatId]/messages - Retrieve messages', () => {
    const createRequest = (
      chatId: string = mockChatId,
      searchParams: Record<string, string> = {},
      headers: Record<string, string> = { 'x-user-id': mockUserId }
    ) => {
      const url = new URL(`http://localhost:3000/api/v1/chats/${chatId}/messages`)
      Object.entries(searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
      
      return new NextRequest(url, {
        method: 'GET',
        headers: new Headers(headers)
      })
    }

    beforeEach(() => {
      mockChatSessionManager.loadChat.mockResolvedValue(mockChatWithMessages)
      mockChatSessionManager.getMessages.mockResolvedValue(mockMessages)
    })

    it('should retrieve messages with default parameters', async () => {
      const request = createRequest()
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.loadChat).toHaveBeenCalledWith(mockChatId, mockUserId)
      expect(mockChatSessionManager.getMessages).toHaveBeenCalledWith(
        mockChatId,
        expect.objectContaining({
          limit: 50,
          offset: 0,
          orderBy: 'created_at',
          order: 'asc',
          includeContext: true
        }),
        mockUserId
      )
      
      expect(data.chatId).toBe(mockChatId)
      expect(data.messages).toHaveLength(3)
      expect(data.pagination).toBeDefined()
      expect(data.metadata).toBeDefined()
      expect(data.metadata.totalTokensUsed).toBe(55)
      expect(data.metadata.messagesByRole.user).toBe(2)
      expect(data.metadata.messagesByRole.assistant).toBe(1)
    })

    it('should apply query parameters correctly', async () => {
      const request = createRequest(mockChatId, {
        limit: '10',
        offset: '5',
        orderBy: 'updated_at',
        order: 'desc',
        includeContext: 'false'
      })
      
      const response = await getMessages(request, { params: { chatId: mockChatId } })

      expect(mockChatSessionManager.getMessages).toHaveBeenCalledWith(
        mockChatId,
        expect.objectContaining({
          limit: 10,
          offset: 5,
          orderBy: 'updated_at',
          order: 'desc',
          includeContext: false
        }),
        mockUserId
      )
    })

    it('should filter messages by role', async () => {
      const request = createRequest(mockChatId, { role: 'user' })
      
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(data.messages).toHaveLength(2) // Only user messages
      expect(data.messages.every((msg: any) => msg.role === 'user')).toBe(true)
      expect(data.metadata.messagesByRole.user).toBe(2)
      expect(data.metadata.messagesByRole.assistant).toBe(0)
    })

    it('should filter messages by intent', async () => {
      const request = createRequest(mockChatId, { intent: 'retrieve_insights' })
      
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(data.messages).toHaveLength(2) // Messages with retrieve_insights intent
      expect(data.messages.every((msg: any) => msg.intent === 'retrieve_insights')).toBe(true)
    })

    it('should handle pagination correctly', async () => {
      const request = createRequest(mockChatId, { limit: '2', offset: '1' })
      
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(data.pagination).toEqual({
        limit: 2,
        offset: 1,
        total: 3,
        hasMore: false // 1 + 2 = 3, no more items
      })
      expect(data.messages).toHaveLength(2)
    })

    it('should calculate average processing time correctly', async () => {
      const request = createRequest()
      
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      // Only assistant message has processingTimeMs (450ms)
      expect(data.metadata.averageProcessingTime).toBe(450)
    })

    it('should include message context when requested', async () => {
      const request = createRequest(mockChatId, { includeContext: 'true' })
      
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      const userMessage = data.messages.find((msg: any) => msg.id === 'msg1')
      expect(userMessage.contextDocumentChunks).toEqual(['chunk1'])
      expect(userMessage.contextInsights).toEqual(['insight1'])
      expect(userMessage.contextMetrics).toEqual(['metric1'])
    })

    it('should validate chat ID format', async () => {
      const invalidChatId = 'invalid-uuid'
      
      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const request = createRequest(invalidChatId)
      const response = await getMessages(request, { params: { chatId: invalidChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should require user ID in header', async () => {
      const request = createRequest(mockChatId, {}, {})

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await getMessages(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should validate query parameters', async () => {
      const request = createRequest(mockChatId, {
        limit: '1000', // Exceeds max of 500
        offset: '-1', // Invalid negative value
        orderBy: 'invalid_field',
        order: 'invalid_order',
        role: 'invalid_role',
        includeContext: 'invalid_boolean'
      })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const response = await getMessages(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should handle chat not found', async () => {
      const notFoundError = new ChatNotFoundError('Chat not found', mockChatId)
      mockChatSessionManager.loadChat.mockRejectedValue(notFoundError)

      const request = createRequest()
      
      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({
          code: 'CHAT_NOT_FOUND',
          message: 'Chat not found'
        }), { status: 404 })
      )

      const response = await getMessages(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(notFoundError, request)
    })

    it('should handle empty messages array', async () => {
      mockChatSessionManager.getMessages.mockResolvedValue([])

      const request = createRequest()
      const response = await getMessages(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(data.messages).toHaveLength(0)
      expect(data.pagination.total).toBe(0)
      expect(data.metadata.totalTokensUsed).toBe(0)
      expect(data.metadata.averageProcessingTime).toBeUndefined()
      expect(data.metadata.messagesByRole).toEqual({
        user: 0,
        assistant: 0,
        system: 0
      })
    })

    it('should handle service errors', async () => {
      const serviceError = new Error('Database connection failed')
      mockChatSessionManager.getMessages.mockRejectedValue(serviceError)

      const request = createRequest()
      
      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({
          code: 'DATABASE_ERROR',
          message: 'Database operation failed'
        }), { status: 500 })
      )

      const response = await getMessages(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(serviceError, request)
    })
  })

  describe('Unsupported Methods', () => {
    it('should reject POST method', async () => {
      const response = await (global as any).POST()
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(data.code).toBe('INVALID_INPUT')
      expect(data.message).toContain('POST method not supported')
    })

    it('should reject PUT method', async () => {
      const response = await (global as any).PUT()
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(data.code).toBe('INVALID_INPUT')
      expect(data.message).toContain('PUT method not supported')
    })

    it('should reject PATCH method', async () => {
      const response = await (global as any).PATCH()
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(data.code).toBe('INVALID_INPUT')
      expect(data.message).toContain('PATCH method not supported')
    })

    it('should reject DELETE method', async () => {
      const response = await (global as any).DELETE()
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(data.code).toBe('INVALID_INPUT')
      expect(data.message).toContain('DELETE method not supported')
    })
  })

  describe('Logging', () => {
    beforeEach(() => {
      mockChatSessionManager.loadChat.mockResolvedValue(mockChatWithMessages)
      mockChatSessionManager.getMessages.mockResolvedValue(mockMessages)
    })

    it('should log successful message retrieval', async () => {
      const request = createRequest()

      await getMessages(request, { params: { chatId: mockChatId } })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat messages retrieval request received',
        expect.objectContaining({ chatId: mockChatId })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat messages retrieved successfully',
        expect.objectContaining({ 
          chatId: mockChatId,
          messageCount: 3,
          totalMessages: 3,
          totalTokensUsed: 55
        })
      )
    })

    it('should log errors', async () => {
      const error = new Error('Test error')
      mockChatSessionManager.getMessages.mockRejectedValue(error)

      const request = createRequest()

      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({}), { status: 500 })
      )

      await getMessages(request, { params: { chatId: mockChatId } })

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Chat messages retrieval failed',
        expect.objectContaining({
          chatId: mockChatId,
          error: error.message,
          stack: error.stack
        })
      )
    })
  })
})
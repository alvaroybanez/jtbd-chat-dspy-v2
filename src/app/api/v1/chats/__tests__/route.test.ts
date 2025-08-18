/**
 * Chat History API Endpoints Tests
 * Comprehensive tests for all chat history API endpoints
 */

import { NextRequest } from 'next/server'
import { GET as getChatList, POST as createChat } from '../route'
import { chatSessionManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors/base'
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

const mockChat = {
  id: mockChatId,
  userId: mockUserId,
  title: 'Test Chat',
  status: 'active' as const,
  messageCount: 2,
  totalTokensUsed: 150,
  lastMessageAt: '2025-01-18T10:30:00Z',
  selectedDocumentIds: ['doc1', 'doc2'],
  selectedInsightIds: ['insight1'],
  selectedJtbdIds: [],
  selectedMetricIds: ['metric1'],
  createdAt: '2025-01-18T10:00:00Z',
  updatedAt: '2025-01-18T10:30:00Z',
  messages: [],
  metadata: {}
}

const mockPaginatedChats = {
  chats: [mockChat],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false
  }
}

describe('/api/v1/chats - Chat List and Creation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/v1/chats - List chats', () => {
    const createRequest = (
      searchParams: Record<string, string> = {},
      headers: Record<string, string> = { 'x-user-id': mockUserId }
    ) => {
      const url = new URL('http://localhost:3000/api/v1/chats')
      Object.entries(searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
      
      return new NextRequest(url, {
        method: 'GET',
        headers: new Headers(headers)
      })
    }

    it('should list chats with default pagination', async () => {
      mockChatSessionManager.listChats.mockResolvedValue(mockPaginatedChats)

      const request = createRequest()
      const response = await getChatList(request)
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.listChats).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          status: 'active',
          orderBy: 'updated_at',
          order: 'desc'
        })
      )
      expect(data.chats).toHaveLength(1)
      expect(data.chats[0].id).toBe(mockChatId)
      expect(data.pagination).toBeDefined()
    })

    it('should apply query parameters correctly', async () => {
      mockChatSessionManager.listChats.mockResolvedValue(mockPaginatedChats)

      const request = createRequest({
        page: '2',
        pageSize: '10',
        status: 'archived',
        titleContains: 'test',
        orderBy: 'created_at',
        order: 'asc'
      })
      
      const response = await getChatList(request)

      expect(mockChatSessionManager.listChats).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          status: 'archived',
          titleContains: 'test',
          orderBy: 'created_at',
          order: 'asc'
        })
      )
    })

    it('should validate query parameters', async () => {
      const request = createRequest({
        page: '0', // Invalid: must be >= 1
        pageSize: '150' // Invalid: exceeds max of 100
      })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const response = await getChatList(request)
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should require user ID in header', async () => {
      const request = createRequest({}, {}) // No x-user-id header

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await getChatList(request)
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed')
      mockChatSessionManager.listChats.mockRejectedValue(dbError)

      const request = createRequest()
      
      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({
          code: 'DATABASE_ERROR',
          message: 'Database operation failed'
        }), { status: 500 })
      )

      const response = await getChatList(request)
      
      expect(mockHandleApiError).toHaveBeenCalledWith(dbError, request)
    })
  })

  describe('POST /api/v1/chats - Create chat', () => {
    const createRequest = (
      body: any,
      headers: Record<string, string> = { 
        'content-type': 'application/json',
        'x-user-id': mockUserId 
      }
    ) => {
      return new NextRequest('http://localhost:3000/api/v1/chats', {
        method: 'POST',
        headers: new Headers(headers),
        body: JSON.stringify(body)
      })
    }

    it('should create chat with minimal data', async () => {
      mockChatSessionManager.createChat.mockResolvedValue(mockChat)

      const request = createRequest({})
      const response = await createChat(request)
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.CREATED)
      expect(mockChatSessionManager.createChat).toHaveBeenCalledWith(
        mockUserId,
        undefined,
        undefined
      )
      expect(data.id).toBe(mockChatId)
      expect(data.title).toBe('Test Chat')
      expect(response.headers.get('X-Chat-ID')).toBe(mockChatId)
    })

    it('should create chat with title and initial context', async () => {
      const requestBody = {
        title: 'My Custom Chat',
        initialContext: {
          selectedDocumentIds: ['doc1'],
          selectedInsightIds: ['insight1'],
          selectedJtbdIds: ['jtbd1'],
          selectedMetricIds: ['metric1']
        }
      }

      mockChatSessionManager.createChat.mockResolvedValue({
        ...mockChat,
        title: 'My Custom Chat'
      })

      const request = createRequest(requestBody)
      const response = await createChat(request)
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.CREATED)
      expect(mockChatSessionManager.createChat).toHaveBeenCalledWith(
        mockUserId,
        'My Custom Chat',
        expect.objectContaining({
          selectedDocumentIds: ['doc1'],
          selectedInsightIds: ['insight1'],
          selectedJtbdIds: ['jtbd1'],
          selectedMetricIds: ['metric1']
        })
      )
      expect(data.title).toBe('My Custom Chat')
    })

    it('should accept user ID from request body', async () => {
      const requestBody = {
        title: 'Test Chat',
        user_id: mockUserId
      }

      mockChatSessionManager.createChat.mockResolvedValue(mockChat)

      const request = createRequest(requestBody, { 'content-type': 'application/json' })
      const response = await createChat(request)

      expect(response.status).toBe(HTTP_STATUS.CREATED)
      expect(mockChatSessionManager.createChat).toHaveBeenCalledWith(
        mockUserId,
        'Test Chat',
        undefined
      )
    })

    it('should validate required user ID', async () => {
      const request = createRequest({}, { 'content-type': 'application/json' })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await createChat(request)
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should validate content type', async () => {
      const request = createRequest({}, { 'content-type': 'text/plain' })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await createChat(request)
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should validate JSON format', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/chats', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-user-id': mockUserId
        }),
        body: 'invalid json'
      })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await createChat(request)
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should validate chat title length', async () => {
      const requestBody = {
        title: 'a'.repeat(101), // Exceeds 100 character limit
        user_id: mockUserId
      }

      const request = createRequest(requestBody)

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const response = await createChat(request)
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should validate context item UUIDs', async () => {
      const requestBody = {
        initialContext: {
          selectedDocumentIds: ['invalid-uuid']
        }
      }

      const request = createRequest(requestBody)

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const response = await createChat(request)
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should handle service errors', async () => {
      const serviceError = new Error('Chat creation failed')
      mockChatSessionManager.createChat.mockRejectedValue(serviceError)

      const request = createRequest({})
      
      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({
          code: 'CHAT_CREATION_ERROR',
          message: 'Failed to create chat'
        }), { status: 500 })
      )

      const response = await createChat(request)
      
      expect(mockHandleApiError).toHaveBeenCalledWith(serviceError, request)
    })
  })

  describe('Unsupported Methods', () => {
    it('should reject PUT method', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/chats', {
        method: 'PUT'
      })

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
      mockChatSessionManager.listChats.mockResolvedValue(mockPaginatedChats)
      mockChatSessionManager.createChat.mockResolvedValue(mockChat)
    })

    it('should log successful chat list retrieval', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/chats', {
        headers: new Headers({ 'x-user-id': mockUserId })
      })

      await getChatList(request)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat list request received',
        expect.any(Object)
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat list retrieved successfully',
        expect.any(Object)
      )
    })

    it('should log successful chat creation', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/chats', {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          'x-user-id': mockUserId
        }),
        body: JSON.stringify({ title: 'Test Chat' })
      })

      await createChat(request)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat creation request received',
        expect.any(Object)
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat created successfully',
        expect.any(Object)
      )
    })

    it('should log errors', async () => {
      const error = new Error('Test error')
      mockChatSessionManager.listChats.mockRejectedValue(error)

      const request = new NextRequest('http://localhost:3000/api/v1/chats', {
        headers: new Headers({ 'x-user-id': mockUserId })
      })

      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({}), { status: 500 })
      )

      await getChatList(request)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Chat list retrieval failed',
        expect.objectContaining({
          error: error.message,
          stack: error.stack
        })
      )
    })
  })
})
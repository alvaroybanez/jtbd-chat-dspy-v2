/**
 * Chat-Specific API Endpoints Tests
 * Tests for GET/PATCH/DELETE /api/v1/chats/[chatId]
 */

import { NextRequest } from 'next/server'
import { GET as getChat, PATCH as updateChat, DELETE as archiveChat } from '../route'
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

const mockMessage1 = {
  id: 'msg1',
  chatId: mockChatId,
  userId: mockUserId,
  role: 'user' as const,
  content: 'Hello',
  intent: 'general_exploration',
  tokensUsed: 10,
  createdAt: '2025-01-18T10:00:00Z',
  updatedAt: '2025-01-18T10:00:00Z',
  contextDocumentChunks: [],
  contextInsights: [],
  contextJtbds: [],
  contextMetrics: [],
  metadata: {}
}

const mockMessage2 = {
  id: 'msg2',
  chatId: mockChatId,
  userId: mockUserId,
  role: 'assistant' as const,
  content: 'Hello! How can I help?',
  intent: 'general_exploration',
  tokensUsed: 15,
  processingTimeMs: 250,
  modelUsed: 'gpt-5-nano',
  temperature: 0.7,
  createdAt: '2025-01-18T10:00:30Z',
  updatedAt: '2025-01-18T10:00:30Z',
  contextDocumentChunks: [],
  contextInsights: [],
  contextJtbds: [],
  contextMetrics: [],
  metadata: {}
}

const mockChatWithMessages = {
  id: mockChatId,
  userId: mockUserId,
  title: 'Test Chat',
  status: 'active' as const,
  messageCount: 2,
  totalTokensUsed: 25,
  lastMessageAt: '2025-01-18T10:00:30Z',
  selectedDocumentIds: ['doc1'],
  selectedInsightIds: ['insight1'],
  selectedJtbdIds: [],
  selectedMetricIds: ['metric1'],
  createdAt: '2025-01-18T10:00:00Z',
  updatedAt: '2025-01-18T10:00:30Z',
  messages: [mockMessage1, mockMessage2],
  metadata: {}
}

describe('/api/v1/chats/[chatId] - Chat-Specific Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/v1/chats/[chatId] - Retrieve chat', () => {
    const createRequest = (
      chatId: string = mockChatId,
      headers: Record<string, string> = { 'x-user-id': mockUserId }
    ) => {
      return new NextRequest(`http://localhost:3000/api/v1/chats/${chatId}`, {
        method: 'GET',
        headers: new Headers(headers)
      })
    }

    it('should retrieve chat with messages', async () => {
      mockChatSessionManager.loadChat.mockResolvedValue(mockChatWithMessages)

      const request = createRequest()
      const response = await getChat(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.loadChat).toHaveBeenCalledWith(mockChatId, mockUserId)
      expect(data.id).toBe(mockChatId)
      expect(data.messages).toHaveLength(2)
      expect(data.messages[0].content).toBe('Hello')
      expect(data.messages[1].content).toBe('Hello! How can I help?')
      expect(data.selectedDocumentIds).toEqual(['doc1'])
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
      const response = await getChat(request, { params: { chatId: invalidChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should require user ID in header', async () => {
      const request = createRequest(mockChatId, {})

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await getChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
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

      const response = await getChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(notFoundError, request)
    })
  })

  describe('PATCH /api/v1/chats/[chatId] - Update chat', () => {
    const createRequest = (
      chatId: string = mockChatId,
      body: any,
      headers: Record<string, string> = { 
        'content-type': 'application/json',
        'x-user-id': mockUserId 
      }
    ) => {
      return new NextRequest(`http://localhost:3000/api/v1/chats/${chatId}`, {
        method: 'PATCH',
        headers: new Headers(headers),
        body: JSON.stringify(body)
      })
    }

    it('should update chat title', async () => {
      const updatedChat = { ...mockChatWithMessages, title: 'Updated Chat Title' }
      mockChatSessionManager.updateChatTitle.mockResolvedValue(undefined)
      mockChatSessionManager.loadChat.mockResolvedValue(updatedChat)

      const request = createRequest(mockChatId, { title: 'Updated Chat Title' })
      const response = await updateChat(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.updateChatTitle).toHaveBeenCalledWith(
        mockChatId,
        'Updated Chat Title',
        mockUserId
      )
      expect(data.title).toBe('Updated Chat Title')
      expect(data.updated.title).toBe(true)
      expect(data.updated.context).toBe(false)
    })

    it('should update chat context', async () => {
      const updatedChat = { ...mockChatWithMessages, selectedDocumentIds: ['doc1', 'doc2'] }
      mockChatSessionManager.updateChatContext.mockResolvedValue(undefined)
      mockChatSessionManager.loadChat.mockResolvedValue(updatedChat)

      const requestBody = {
        context: {
          selectedDocumentIds: ['doc1', 'doc2'],
          selectedInsightIds: ['insight1', 'insight2']
        }
      }

      const request = createRequest(mockChatId, requestBody)
      const response = await updateChat(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.updateChatContext).toHaveBeenCalledWith(
        mockChatId,
        expect.objectContaining({
          selectedDocumentIds: ['doc1', 'doc2'],
          selectedInsightIds: ['insight1', 'insight2']
        }),
        mockUserId
      )
      expect(data.updated.context).toBe(true)
      expect(data.updated.title).toBe(false)
    })

    it('should update both title and context', async () => {
      const updatedChat = { 
        ...mockChatWithMessages, 
        title: 'New Title',
        selectedDocumentIds: ['doc1', 'doc2'] 
      }
      mockChatSessionManager.updateChatTitle.mockResolvedValue(undefined)
      mockChatSessionManager.updateChatContext.mockResolvedValue(undefined)
      mockChatSessionManager.loadChat.mockResolvedValue(updatedChat)

      const requestBody = {
        title: 'New Title',
        context: {
          selectedDocumentIds: ['doc1', 'doc2']
        }
      }

      const request = createRequest(mockChatId, requestBody)
      const response = await updateChat(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.updateChatTitle).toHaveBeenCalled()
      expect(mockChatSessionManager.updateChatContext).toHaveBeenCalled()
      expect(data.updated.title).toBe(true)
      expect(data.updated.context).toBe(true)
    })

    it('should require at least one field to update', async () => {
      const request = createRequest(mockChatId, {}) // Empty update

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await updateChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should validate title length', async () => {
      const request = createRequest(mockChatId, { title: 'a'.repeat(101) })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const response = await updateChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should validate context item UUIDs', async () => {
      const requestBody = {
        context: {
          selectedDocumentIds: ['invalid-uuid']
        }
      }

      const request = createRequest(mockChatId, requestBody)

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: error.message
        }), { status: 400 })
      )

      const response = await updateChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should validate content type', async () => {
      const request = createRequest(mockChatId, { title: 'Test' }, { 'content-type': 'text/plain' })

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await updateChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })
  })

  describe('DELETE /api/v1/chats/[chatId] - Archive chat', () => {
    const createRequest = (
      chatId: string = mockChatId,
      headers: Record<string, string> = { 'x-user-id': mockUserId }
    ) => {
      return new NextRequest(`http://localhost:3000/api/v1/chats/${chatId}`, {
        method: 'DELETE',
        headers: new Headers(headers)
      })
    }

    it('should archive chat successfully', async () => {
      mockChatSessionManager.archiveChat.mockResolvedValue(undefined)

      const request = createRequest()
      const response = await archiveChat(request, { params: { chatId: mockChatId } })
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.OK)
      expect(mockChatSessionManager.archiveChat).toHaveBeenCalledWith(mockChatId, mockUserId)
      expect(data.id).toBe(mockChatId)
      expect(data.status).toBe('archived')
      expect(data.archivedAt).toBeDefined()
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
      const response = await archiveChat(request, { params: { chatId: invalidChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalled()
    })

    it('should require user ID in header', async () => {
      const request = createRequest(mockChatId, {})

      mockHandleApiError.mockImplementation((error) => 
        new Response(JSON.stringify({
          code: 'INVALID_INPUT',
          message: error.message
        }), { status: 400 })
      )

      const response = await archiveChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(
        expect.any(ValidationError),
        expect.any(NextRequest)
      )
    })

    it('should handle chat not found', async () => {
      const notFoundError = new ChatNotFoundError('Chat not found', mockChatId)
      mockChatSessionManager.archiveChat.mockRejectedValue(notFoundError)

      const request = createRequest()
      
      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({
          code: 'CHAT_NOT_FOUND',
          message: 'Chat not found'
        }), { status: 404 })
      )

      const response = await archiveChat(request, { params: { chatId: mockChatId } })
      
      expect(mockHandleApiError).toHaveBeenCalledWith(notFoundError, request)
    })
  })

  describe('Logging', () => {
    beforeEach(() => {
      mockChatSessionManager.loadChat.mockResolvedValue(mockChatWithMessages)
      mockChatSessionManager.updateChatTitle.mockResolvedValue(undefined)
      mockChatSessionManager.archiveChat.mockResolvedValue(undefined)
    })

    it('should log successful chat retrieval', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/chats/${mockChatId}`, {
        headers: new Headers({ 'x-user-id': mockUserId })
      })

      await getChat(request, { params: { chatId: mockChatId } })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat retrieval request received',
        expect.objectContaining({ chatId: mockChatId })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat retrieved successfully',
        expect.objectContaining({ 
          chatId: mockChatId,
          messageCount: 2 
        })
      )
    })

    it('should log successful chat update', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/chats/${mockChatId}`, {
        method: 'PATCH',
        headers: new Headers({
          'content-type': 'application/json',
          'x-user-id': mockUserId
        }),
        body: JSON.stringify({ title: 'New Title' })
      })

      await updateChat(request, { params: { chatId: mockChatId } })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat update request received',
        expect.objectContaining({ chatId: mockChatId })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat updated successfully',
        expect.objectContaining({ chatId: mockChatId })
      )
    })

    it('should log successful chat archival', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v1/chats/${mockChatId}`, {
        method: 'DELETE',
        headers: new Headers({ 'x-user-id': mockUserId })
      })

      await archiveChat(request, { params: { chatId: mockChatId } })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat archive request received',
        expect.objectContaining({ chatId: mockChatId })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat archived successfully',
        expect.objectContaining({ chatId: mockChatId })
      )
    })

    it('should log errors', async () => {
      const error = new Error('Test error')
      mockChatSessionManager.loadChat.mockRejectedValue(error)

      const request = new NextRequest(`http://localhost:3000/api/v1/chats/${mockChatId}`, {
        headers: new Headers({ 'x-user-id': mockUserId })
      })

      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({}), { status: 500 })
      )

      await getChat(request, { params: { chatId: mockChatId } })

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Chat retrieval failed',
        expect.objectContaining({
          chatId: mockChatId,
          error: error.message,
          stack: error.stack
        })
      )
    })
  })
})
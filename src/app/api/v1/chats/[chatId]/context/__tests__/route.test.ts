/**
 * Chat Context Update API Endpoint Tests
 * Tests for POST /api/v1/chats/[chatId]/context
 */

import { NextRequest } from 'next/server'
import { POST as updateContext } from '../route'
import { chatSessionManager, contextManager } from '@/lib/services/chat'
import { handleApiError } from '@/lib/errors/handler'
import { logger } from '@/lib/logger'
import { ChatNotFoundError, ValidationError, ContextError } from '@/lib/errors/base'
import { HTTP_STATUS } from '@/lib/config/constants'

// Mock dependencies
jest.mock('@/lib/services/chat')
jest.mock('@/lib/errors/handler')
jest.mock('@/lib/logger')

const mockChatSessionManager = chatSessionManager as jest.Mocked<typeof chatSessionManager>
const mockContextManager = contextManager as jest.Mocked<typeof contextManager>
const mockHandleApiError = handleApiError as jest.MockedFunction<typeof handleApiError>
const mockLogger = logger as jest.Mocked<typeof logger>

// Mock data
const mockUserId = '550e8400-e29b-41d4-a716-446655440000'
const mockChatId = '123e4567-e89b-12d3-a456-426614174000'
const mockDocumentId = '987fcdeb-51a2-43d7-b123-456789abcdef'
const mockInsightId = '456e7890-f123-45g6-h789-012345678901'

const mockChat = {
  id: mockChatId,
  userId: mockUserId,
  title: 'Test Chat',
  status: 'active' as const,
  messageCount: 0,
  totalTokensUsed: 0,
  selectedDocumentIds: [],
  selectedInsightIds: [],
  selectedJtbdIds: [],
  selectedMetricIds: [],
  createdAt: '2025-01-18T10:00:00Z',
  updatedAt: '2025-01-18T10:00:00Z',
  messages: [],
  metadata: {}
}

const mockContextState = {
  chatId: mockChatId,
  userId: mockUserId,
  documents: [{
    id: mockDocumentId,
    type: 'document' as const,
    title: 'Test Document',
    content: 'This is a test document content',
    addedAt: '2025-01-18T10:00:00Z',
    metadata: {}
  }],
  insights: [{
    id: mockInsightId,
    type: 'insight' as const,
    title: 'Test Insight',
    content: 'This is a test insight',
    addedAt: '2025-01-18T10:00:00Z',
    metadata: {}
  }],
  jtbds: [],
  metrics: [],
  totalItems: 2,
  lastUpdated: '2025-01-18T10:00:00Z'
}

const mockContextOperationResult = {
  success: true,
  operation: {
    type: 'add',
    chatId: mockChatId,
    userId: mockUserId,
    timestamp: '2025-01-18T10:00:00Z'
  },
  affectedItems: 1,
  newState: mockContextState,
  warnings: []
}

describe('/api/v1/chats/[chatId]/context - Context Update', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/v1/chats/[chatId]/context - Update context', () => {
    const createRequest = (
      chatId: string = mockChatId,
      body: any,
      headers: Record<string, string> = { 
        'content-type': 'application/json',
        'x-user-id': mockUserId 
      }
    ) => {
      return new NextRequest(`http://localhost:3000/api/v1/chats/${chatId}/context`, {
        method: 'POST',
        headers: new Headers(headers),
        body: JSON.stringify(body)
      })
    }

    beforeEach(() => {
      mockChatSessionManager.loadChat.mockResolvedValue(mockChat)
    })

    describe('Add operation', () => {
      it('should add single context item', async () => {
        mockContextManager.addToContext.mockResolvedValue(mockContextOperationResult)

        const requestBody = {
          operation: 'add',
          itemType: 'document',
          itemId: mockDocumentId
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(response.status).toBe(HTTP_STATUS.OK)
        expect(mockContextManager.addToContext).toHaveBeenCalledWith(
          mockChatId,
          expect.objectContaining({
            itemType: 'document',
            itemId: mockDocumentId,
            userId: mockUserId
          })
        )
        expect(data.success).toBe(true)
        expect(data.operation).toBe('add')
        expect(data.affectedItems).toBe(1)
        expect(data.newState.totalItems).toBe(2)
      })

      it('should require itemType and itemId for add operation', async () => {
        const requestBody = {
          operation: 'add'
          // Missing itemType and itemId
        }

        const request = createRequest(mockChatId, requestBody)

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'INVALID_INPUT',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(
          expect.any(ValidationError),
          expect.any(NextRequest)
        )
      })
    })

    describe('Remove operation', () => {
      it('should remove single context item', async () => {
        const removeResult = {
          ...mockContextOperationResult,
          operation: {
            ...mockContextOperationResult.operation,
            type: 'remove'
          },
          newState: {
            ...mockContextState,
            documents: [],
            totalItems: 1
          }
        }
        mockContextManager.removeFromContext.mockResolvedValue(removeResult)

        const requestBody = {
          operation: 'remove',
          itemType: 'document',
          itemId: mockDocumentId
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(response.status).toBe(HTTP_STATUS.OK)
        expect(mockContextManager.removeFromContext).toHaveBeenCalledWith(
          mockChatId,
          'document',
          mockDocumentId,
          mockUserId
        )
        expect(data.operation).toBe('remove')
        expect(data.newState.totalItems).toBe(1)
      })
    })

    describe('Bulk operation', () => {
      it('should handle bulk operations', async () => {
        const bulkResult = {
          ...mockContextOperationResult,
          affectedItems: 2,
          newState: {
            ...mockContextState,
            totalItems: 3
          }
        }
        mockContextManager.addMultipleToContext.mockResolvedValue(bulkResult)

        const requestBody = {
          operation: 'bulk',
          operations: [
            { type: 'add', itemType: 'document', itemId: mockDocumentId },
            { type: 'add', itemType: 'insight', itemId: mockInsightId }
          ]
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(response.status).toBe(HTTP_STATUS.OK)
        expect(mockContextManager.addMultipleToContext).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: [
              { type: 'add', itemType: 'document', itemId: mockDocumentId },
              { type: 'add', itemType: 'insight', itemId: mockInsightId }
            ],
            chatId: mockChatId,
            userId: mockUserId
          })
        )
        expect(data.operation).toBe('bulk')
        expect(data.affectedItems).toBe(2)
      })

      it('should require operations array for bulk operation', async () => {
        const requestBody = {
          operation: 'bulk'
          // Missing operations array
        }

        const request = createRequest(mockChatId, requestBody)

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'INVALID_INPUT',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(
          expect.any(ValidationError),
          expect.any(NextRequest)
        )
      })
    })

    describe('Replace operation', () => {
      it('should replace entire context', async () => {
        mockContextManager.clearContext.mockResolvedValue(mockContextOperationResult)
        mockContextManager.addMultipleToContext.mockResolvedValue(mockContextOperationResult)

        const requestBody = {
          operation: 'replace',
          context: {
            selectedDocumentIds: [mockDocumentId],
            selectedInsightIds: [mockInsightId],
            selectedJtbdIds: [],
            selectedMetricIds: []
          }
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(response.status).toBe(HTTP_STATUS.OK)
        expect(mockContextManager.clearContext).toHaveBeenCalledWith(mockChatId, mockUserId)
        expect(mockContextManager.addMultipleToContext).toHaveBeenCalledWith(
          expect.objectContaining({
            operations: [
              { type: 'add', itemType: 'document', itemId: mockDocumentId },
              { type: 'add', itemType: 'insight', itemId: mockInsightId }
            ]
          })
        )
        expect(data.operation).toBe('replace')
      })

      it('should handle replace with empty context', async () => {
        const emptyContextState = {
          ...mockContextState,
          documents: [],
          insights: [],
          totalItems: 0
        }

        mockContextManager.clearContext.mockResolvedValue({
          ...mockContextOperationResult,
          newState: emptyContextState
        })
        mockContextManager.getChatContext.mockResolvedValue(emptyContextState)

        const requestBody = {
          operation: 'replace',
          context: {
            selectedDocumentIds: [],
            selectedInsightIds: [],
            selectedJtbdIds: [],
            selectedMetricIds: []
          }
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(response.status).toBe(HTTP_STATUS.OK)
        expect(mockContextManager.clearContext).toHaveBeenCalled()
        expect(mockContextManager.getChatContext).toHaveBeenCalled()
        expect(data.newState.totalItems).toBe(0)
      })

      it('should require context object for replace operation', async () => {
        const requestBody = {
          operation: 'replace'
          // Missing context object
        }

        const request = createRequest(mockChatId, requestBody)

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'INVALID_INPUT',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(
          expect.any(ValidationError),
          expect.any(NextRequest)
        )
      })
    })

    describe('Validation', () => {
      it('should validate chat ID format', async () => {
        const invalidChatId = 'invalid-uuid'
        
        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'VALIDATION_ERROR',
            message: error.message
          }), { status: 400 })
        )

        const request = createRequest(invalidChatId, { operation: 'add' })
        const response = await updateContext(request, { params: { chatId: invalidChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalled()
      })

      it('should require user ID', async () => {
        const request = createRequest(mockChatId, { operation: 'add' }, { 'content-type': 'application/json' })

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'INVALID_INPUT',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(
          expect.any(ValidationError),
          expect.any(NextRequest)
        )
      })

      it('should validate content type', async () => {
        const request = createRequest(mockChatId, { operation: 'add' }, { 'content-type': 'text/plain' })

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'INVALID_INPUT',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(
          expect.any(ValidationError),
          expect.any(NextRequest)
        )
      })

      it('should validate JSON format', async () => {
        const request = new NextRequest(`http://localhost:3000/api/v1/chats/${mockChatId}/context`, {
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

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(
          expect.any(ValidationError),
          expect.any(NextRequest)
        )
      })

      it('should validate operation type', async () => {
        const requestBody = {
          operation: 'invalid_operation'
        }

        const request = createRequest(mockChatId, requestBody)

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'VALIDATION_ERROR',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalled()
      })

      it('should validate item IDs as UUIDs', async () => {
        const requestBody = {
          operation: 'add',
          itemType: 'document',
          itemId: 'invalid-uuid'
        }

        const request = createRequest(mockChatId, requestBody)

        mockHandleApiError.mockImplementation((error) => 
          new Response(JSON.stringify({
            code: 'VALIDATION_ERROR',
            message: error.message
          }), { status: 400 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalled()
      })
    })

    describe('Error Handling', () => {
      it('should handle chat not found', async () => {
        const notFoundError = new ChatNotFoundError('Chat not found', mockChatId)
        mockChatSessionManager.loadChat.mockRejectedValue(notFoundError)

        const request = createRequest(mockChatId, { operation: 'add', itemType: 'document', itemId: mockDocumentId })
        
        mockHandleApiError.mockImplementation(() => 
          new Response(JSON.stringify({
            code: 'CHAT_NOT_FOUND',
            message: 'Chat not found'
          }), { status: 404 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(notFoundError, request)
      })

      it('should handle context manager errors', async () => {
        const contextError = new ContextError('Context operation failed')
        mockContextManager.addToContext.mockRejectedValue(contextError)

        const request = createRequest(mockChatId, { operation: 'add', itemType: 'document', itemId: mockDocumentId })
        
        mockHandleApiError.mockImplementation(() => 
          new Response(JSON.stringify({
            code: 'CONTEXT_ERROR',
            message: 'Context operation failed'
          }), { status: 500 })
        )

        const response = await updateContext(request, { params: { chatId: mockChatId } })
        
        expect(mockHandleApiError).toHaveBeenCalledWith(contextError, request)
      })
    })

    describe('Response Format', () => {
      it('should return processing time in response', async () => {
        mockContextManager.addToContext.mockResolvedValue(mockContextOperationResult)

        const requestBody = {
          operation: 'add',
          itemType: 'document',
          itemId: mockDocumentId
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(data.processingTimeMs).toBeDefined()
        expect(typeof data.processingTimeMs).toBe('number')
        expect(data.processingTimeMs).toBeGreaterThan(0)
      })

      it('should include warnings if present', async () => {
        const resultWithWarnings = {
          ...mockContextOperationResult,
          warnings: ['Item not found in cache', 'Fallback used']
        }
        mockContextManager.addToContext.mockResolvedValue(resultWithWarnings)

        const requestBody = {
          operation: 'add',
          itemType: 'document',
          itemId: mockDocumentId
        }

        const request = createRequest(mockChatId, requestBody)
        const response = await updateContext(request, { params: { chatId: mockChatId } })
        const data = await response.json()

        expect(data.warnings).toEqual(['Item not found in cache', 'Fallback used'])
      })
    })
  })

  describe('Unsupported Methods', () => {
    it('should reject GET method', async () => {
      const response = await (global as any).GET()
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(data.code).toBe('INVALID_INPUT')
      expect(data.message).toContain('GET method not supported')
    })

    it('should reject PUT method', async () => {
      const response = await (global as any).PUT()
      const data = await response.json()

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(data.code).toBe('INVALID_INPUT')
      expect(data.message).toContain('PUT method not supported')
    })
  })

  describe('Logging', () => {
    beforeEach(() => {
      mockContextManager.addToContext.mockResolvedValue(mockContextOperationResult)
    })

    it('should log successful context update', async () => {
      const requestBody = {
        operation: 'add',
        itemType: 'document',
        itemId: mockDocumentId
      }

      const request = createRequest(mockChatId, requestBody)

      await updateContext(request, { params: { chatId: mockChatId } })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Chat context update request received',
        expect.objectContaining({ chatId: mockChatId })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Context update completed successfully',
        expect.objectContaining({ 
          chatId: mockChatId,
          operation: 'add',
          affectedItems: 1
        })
      )
    })

    it('should log errors with processing time', async () => {
      const error = new Error('Test error')
      mockContextManager.addToContext.mockRejectedValue(error)

      const requestBody = {
        operation: 'add',
        itemType: 'document',
        itemId: mockDocumentId
      }

      const request = createRequest(mockChatId, requestBody)

      mockHandleApiError.mockImplementation(() => 
        new Response(JSON.stringify({}), { status: 500 })
      )

      await updateContext(request, { params: { chatId: mockChatId } })

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Context update failed',
        expect.objectContaining({
          chatId: mockChatId,
          processingTimeMs: expect.any(Number),
          error: error.message,
          stack: error.stack
        })
      )
    })
  })
})
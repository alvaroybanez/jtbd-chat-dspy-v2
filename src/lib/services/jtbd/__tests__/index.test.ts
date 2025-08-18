/**
 * JTBD Service Unit Tests
 * Comprehensive test coverage for JTBD creation, validation, and storage
 */

import jtbdService from '../index'
import embeddingService from '../../embeddings'
import { executeQuery } from '../../../database/client'
import { ValidationError } from '../../../errors/base'
import { DatabaseError } from '../../../errors/database'
import { ERROR_CODES } from '../../../config/constants'
import type { CreateJTBDRequest, UUID } from '../../../database/types'

// Mock dependencies
jest.mock('../../embeddings')
jest.mock('../../../database/client')
jest.mock('../../../logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  startPerformance: jest.fn(() => 'test-tracking-id'),
  endPerformance: jest.fn(() => 100)
}))

const mockEmbeddingService = embeddingService as jest.Mocked<typeof embeddingService>
const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>

describe('JTBD Service', () => {
  const mockUserId: UUID = '123e4567-e89b-12d3-a456-426614174000'
  const mockJTBDId: UUID = '987fcdeb-51a2-43d7-b123-456789abcdef'

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default successful embedding generation
    mockEmbeddingService.generateEmbedding.mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      tokenCount: 10,
      text: 'test text'
    })

    // Mock executeQuery to return different values based on the operation
    mockExecuteQuery.mockImplementation(async (operation) => {
      // Execute the operation with a mock client to see what it's trying to do
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis()
      }

      try {
        const result = await operation(mockClient)
        return result.data
      } catch (error) {
        // Default successful responses
        if (mockClient.insert.mock.calls.length > 0) {
          // Insert operation
          return {
            id: mockJTBDId,
            statement: 'Test JTBD statement',
            context: null,
            priority: null,
            created_at: new Date().toISOString()
          }
        } else if (mockClient.ilike.mock.calls.length > 0) {
          // Duplicate check - return null (no duplicate)
          return null
        } else {
          // Default return
          return null
        }
      }
    })
  })

  describe('createJTBD', () => {
    const validRequest: CreateJTBDRequest = {
      statement: 'Help users achieve their fitness goals consistently',
      context: 'Users struggle with maintaining workout routines over time',
      priority: 3
    }

    test('should create JTBD with all fields successfully', async () => {
      const result = await jtbdService.createJTBD(validRequest, {
        userId: mockUserId,
        generateEmbedding: true
      })

      expect(result).toEqual({
        id: mockJTBDId,
        statement: 'Test JTBD statement',
        context: null,
        priority: null,
        embedding_generated: true,
        created_at: expect.any(String)
      })

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        `${validRequest.statement} ${validRequest.context}`
      )
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO jtbds'),
        expect.arrayContaining([
          mockUserId,
          validRequest.statement,
          validRequest.context,
          expect.any(String), // JSON stringified embedding
          validRequest.priority
        ])
      )
    })

    test('should create JTBD with minimal required fields', async () => {
      const minimalRequest: CreateJTBDRequest = {
        statement: 'Simple JTBD statement'
      }

      await jtbdService.createJTBD(minimalRequest, {
        userId: mockUserId
      })

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        minimalRequest.statement
      )
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO jtbds'),
        expect.arrayContaining([
          mockUserId,
          minimalRequest.statement,
          null, // no context
          expect.any(String),
          null  // no priority
        ])
      )
    })

    test('should create JTBD without embedding when disabled', async () => {
      await jtbdService.createJTBD(validRequest, {
        userId: mockUserId,
        generateEmbedding: false
      })

      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled()
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO jtbds'),
        expect.arrayContaining([
          mockUserId,
          validRequest.statement,
          validRequest.context,
          null, // no embedding
          validRequest.priority
        ])
      )
    })

    test('should handle embedding generation failure gracefully', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'))

      const result = await jtbdService.createJTBD(validRequest, {
        userId: mockUserId,
        generateEmbedding: true
      })

      expect(result.embedding_generated).toBe(false)
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO jtbds'),
        expect.arrayContaining([
          mockUserId,
          validRequest.statement,
          validRequest.context,
          null, // no embedding due to failure
          validRequest.priority
        ])
      )
    })

    describe('Input Validation', () => {
      test('should reject empty statement', async () => {
        const invalidRequest: CreateJTBDRequest = {
          statement: ''
        }

        await expect(jtbdService.createJTBD(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject statement that is too long', async () => {
        const invalidRequest: CreateJTBDRequest = {
          statement: 'A'.repeat(501) // Exceeds 500 character limit
        }

        await expect(jtbdService.createJTBD(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject context that is too long', async () => {
        const invalidRequest: CreateJTBDRequest = {
          statement: 'Valid statement',
          context: 'B'.repeat(1001) // Exceeds 1000 character limit
        }

        await expect(jtbdService.createJTBD(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject invalid priority values', async () => {
        const testCases = [0, 6, -1, 3.5, NaN]

        for (const invalidPriority of testCases) {
          const invalidRequest: CreateJTBDRequest = {
            statement: 'Valid statement',
            priority: invalidPriority
          }

          await expect(jtbdService.createJTBD(invalidRequest, {
            userId: mockUserId
          })).rejects.toThrow(ValidationError)
        }
      })

      test('should accept valid priority values', async () => {
        const validPriorities = [1, 2, 3, 4, 5]

        for (const priority of validPriorities) {
          const validRequest: CreateJTBDRequest = {
            statement: 'Valid statement',
            priority
          }

          await jtbdService.createJTBD(validRequest, {
            userId: mockUserId
          })
        }

        expect(mockExecuteQuery).toHaveBeenCalledTimes(validPriorities.length)
      })

      test('should trim whitespace from statement and context', async () => {
        const requestWithWhitespace: CreateJTBDRequest = {
          statement: '  Statement with spaces  ',
          context: '  Context with spaces  '
        }

        await jtbdService.createJTBD(requestWithWhitespace, {
          userId: mockUserId
        })

        expect(mockExecuteQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO jtbds'),
          expect.arrayContaining([
            mockUserId,
            'Statement with spaces', // trimmed
            'Context with spaces',   // trimmed
            expect.any(String),
            null
          ])
        )
      })
    })

    describe('Duplicate Detection', () => {
      test('should detect duplicate JTBDs for same user', async () => {
        // Mock duplicate detection query to return existing JTBD
        mockExecuteQuery
          .mockResolvedValueOnce({
            data: [{ id: 'existing-jtbd-id' }],
            error: null,
            success: true
          })

        await expect(jtbdService.createJTBD(validRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)

        // Should have called duplicate check but not insert
        expect(mockExecuteQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT id FROM jtbds WHERE'),
          expect.arrayContaining([mockUserId, validRequest.statement])
        )
      })

      test('should allow same statement for different users', async () => {
        const differentUserId = '456e7890-e89b-12d3-a456-426614174111'

        // Mock no duplicates found
        mockExecuteQuery
          .mockResolvedValueOnce({
            data: [],
            error: null,
            success: true
          })
          .mockResolvedValueOnce({
            data: [{
              id: mockJTBDId,
              statement: validRequest.statement,
              context: validRequest.context,
              priority: validRequest.priority,
              created_at: new Date().toISOString()
            }],
            error: null,
            success: true
          })

        const result = await jtbdService.createJTBD(validRequest, {
          userId: differentUserId
        })

        expect(result.id).toBe(mockJTBDId)
        expect(mockExecuteQuery).toHaveBeenCalledTimes(2) // duplicate check + insert
      })

      test('should continue if duplicate check fails', async () => {
        // Mock duplicate check failure
        mockExecuteQuery
          .mockRejectedValueOnce(new Error('Database error'))
          .mockResolvedValueOnce({
            data: [{
              id: mockJTBDId,
              statement: validRequest.statement,
              context: validRequest.context,
              priority: validRequest.priority,
              created_at: new Date().toISOString()
            }],
            error: null,
            success: true
          })

        const result = await jtbdService.createJTBD(validRequest, {
          userId: mockUserId
        })

        expect(result.id).toBe(mockJTBDId)
        expect(mockExecuteQuery).toHaveBeenCalledTimes(2) // failed duplicate check + successful insert
      })
    })

    describe('Database Error Handling', () => {
      test('should throw DatabaseError when insert fails', async () => {
        mockExecuteQuery
          .mockResolvedValueOnce({ data: [], error: null, success: true }) // duplicate check passes
          .mockResolvedValueOnce({ data: [], error: null, success: true })  // insert returns empty

        await expect(jtbdService.createJTBD(validRequest, {
          userId: mockUserId
        })).rejects.toThrow(DatabaseError)
      })

      test('should throw DatabaseError when insert query fails', async () => {
        mockExecuteQuery
          .mockResolvedValueOnce({ data: [], error: null, success: true }) // duplicate check passes
          .mockRejectedValueOnce(new Error('Database connection failed'))    // insert fails

        await expect(jtbdService.createJTBD(validRequest, {
          userId: mockUserId
        })).rejects.toThrow(Error)
      })
    })
  })

  describe('getJTBD', () => {
    test('should retrieve JTBD by ID and user', async () => {
      const mockJTBD = {
        id: mockJTBDId,
        user_id: mockUserId,
        statement: 'Test JTBD',
        context: 'Test context',
        embedding: new Array(1536).fill(0.1),
        priority: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      mockExecuteQuery.mockResolvedValue({
        data: [mockJTBD],
        error: null,
        success: true
      })

      const result = await jtbdService.getJTBD(mockJTBDId, mockUserId)

      expect(result).toEqual(mockJTBD)
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [mockJTBDId, mockUserId]
      )
    })

    test('should return null when JTBD not found', async () => {
      mockExecuteQuery.mockResolvedValue({
        data: [],
        error: null,
        success: true
      })

      const result = await jtbdService.getJTBD(mockJTBDId, mockUserId)

      expect(result).toBeNull()
    })

    test('should throw DatabaseError on query failure', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('Database error'))

      await expect(jtbdService.getJTBD(mockJTBDId, mockUserId))
        .rejects.toThrow(DatabaseError)
    })
  })

  describe('listJTBDs', () => {
    test('should list JTBDs for user with default pagination', async () => {
      const mockJTBDs = [
        {
          id: mockJTBDId,
          user_id: mockUserId,
          statement: 'JTBD 1',
          context: null,
          embedding: new Array(1536).fill(0.1),
          priority: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]

      mockExecuteQuery.mockResolvedValue({
        data: mockJTBDs,
        error: null,
        success: true
      })

      const result = await jtbdService.listJTBDs(mockUserId)

      expect(result).toEqual(mockJTBDs)
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [mockUserId, 50, 0] // default limit and offset
      )
    })

    test('should respect custom pagination options', async () => {
      mockExecuteQuery.mockResolvedValue({
        data: [],
        error: null,
        success: true
      })

      await jtbdService.listJTBDs(mockUserId, { limit: 10, offset: 20 })

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        [mockUserId, 10, 20]
      )
    })

    test('should throw DatabaseError on query failure', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('Database error'))

      await expect(jtbdService.listJTBDs(mockUserId))
        .rejects.toThrow(DatabaseError)
    })
  })

  describe('healthCheck', () => {
    test('should return healthy status when database is accessible', async () => {
      mockExecuteQuery.mockResolvedValue({
        data: [{ test: 1 }],
        error: null,
        success: true
      })

      const result = await jtbdService.healthCheck()

      expect(result).toEqual({
        status: 'healthy',
        details: 'JTBD service operational'
      })
    })

    test('should return unhealthy status on database failure', async () => {
      mockExecuteQuery.mockRejectedValue(new Error('Connection failed'))

      const result = await jtbdService.healthCheck()

      expect(result.status).toBe('unhealthy')
      expect(result.details).toContain('Health check failed')
    })

    test('should return unhealthy status on unexpected database response', async () => {
      mockExecuteQuery.mockResolvedValue({
        data: [],
        error: null,
        success: true
      })

      const result = await jtbdService.healthCheck()

      expect(result).toEqual({
        status: 'unhealthy',
        details: 'Database connectivity issue'
      })
    })
  })

  describe('Edge Cases and Performance', () => {
    test('should handle concurrent JTBD creation requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => 
        jtbdService.createJTBD(
          { statement: `JTBD ${i}` },
          { userId: mockUserId }
        )
      )

      await Promise.all(requests)

      expect(mockExecuteQuery).toHaveBeenCalledTimes(10) // 5 duplicate checks + 5 inserts
    })

    test('should handle very long valid inputs', async () => {
      const longRequest: CreateJTBDRequest = {
        statement: 'A'.repeat(500), // Maximum allowed length
        context: 'B'.repeat(1000),  // Maximum allowed length
      }

      await jtbdService.createJTBD(longRequest, { userId: mockUserId })

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO jtbds'),
        expect.arrayContaining([
          mockUserId,
          longRequest.statement,
          longRequest.context,
          expect.any(String),
          null
        ])
      )
    })

    test('should perform under time constraints', async () => {
      const startTime = Date.now()
      
      await jtbdService.createJTBD(
        { statement: 'Performance test JTBD' },
        { userId: mockUserId }
      )

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete in reasonable time (excluding actual database/API calls)
      expect(duration).toBeLessThan(100)
    })
  })
})
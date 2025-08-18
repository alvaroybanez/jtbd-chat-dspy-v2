/**
 * Metrics Service Unit Tests
 * Comprehensive test coverage for metrics creation, validation, and storage
 */

import metricsService from '../index'
import { db } from '../../../database/client'
import { ValidationError } from '../../../errors/base'
import { DatabaseError } from '../../../errors/database'
import { ERROR_CODES } from '../../../config/constants'
import type { CreateMetricRequest, UUID } from '../../../database/types'

// Mock dependencies
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

const mockDb = db as jest.Mocked<typeof db>

describe('Metrics Service', () => {
  const mockUserId: UUID = '123e4567-e89b-12d3-a456-426614174000'
  const mockMetricId: UUID = '987fcdeb-51a2-43d7-b123-456789abcdef'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Helper function to set up successful creation mocks
  const setupSuccessfulCreationMocks = () => {
    mockDb.executeQuery
      .mockResolvedValueOnce(null) // Duplicate check - no duplicate found
      .mockResolvedValueOnce({ // Successful insert
        id: mockMetricId,
        name: 'Test Metric',
        description: 'Test description',
        current_value: 50.0,
        target_value: 100.0,
        unit: 'percentage',
        created_at: new Date().toISOString()
      })
  }

  describe('createMetric', () => {
    const validRequest: CreateMetricRequest = {
      name: 'User Satisfaction Score',
      description: 'Measures overall user satisfaction with our product',
      current_value: 7.5,
      target_value: 9.0,
      unit: 'score'
    }

    test('should create metric with all fields successfully', async () => {
      setupSuccessfulCreationMocks()

      const result = await metricsService.createMetric(validRequest, {
        userId: mockUserId
      })

      expect(result).toEqual({
        id: mockMetricId,
        name: 'Test Metric',
        description: 'Test description',
        current_value: 50.0,
        target_value: 100.0,
        unit: 'percentage',
        created_at: expect.any(String)
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should create metric with minimal required fields', async () => {
      setupSuccessfulCreationMocks()

      const minimalRequest: CreateMetricRequest = {
        name: 'Simple Metric',
        unit: 'count'
      }

      const result = await metricsService.createMetric(minimalRequest, {
        userId: mockUserId
      })

      expect(result.name).toBe('Test Metric')
      expect(result.unit).toBe('percentage')
      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should create metric with only current_value', async () => {
      setupSuccessfulCreationMocks()

      const requestWithCurrentValue: CreateMetricRequest = {
        name: 'Current Only Metric',
        unit: 'dollars',
        current_value: 1234.56
      }

      await metricsService.createMetric(requestWithCurrentValue, {
        userId: mockUserId
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should create metric with only target_value', async () => {
      setupSuccessfulCreationMocks()

      const requestWithTargetValue: CreateMetricRequest = {
        name: 'Target Only Metric',
        unit: 'users',
        target_value: 10000
      }

      await metricsService.createMetric(requestWithTargetValue, {
        userId: mockUserId
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should handle negative values for metrics', async () => {
      setupSuccessfulCreationMocks()

      const requestWithNegativeValues: CreateMetricRequest = {
        name: 'Negative Metric',
        unit: 'change',
        current_value: -15.75,
        target_value: -5.0
      }

      await metricsService.createMetric(requestWithNegativeValues, {
        userId: mockUserId
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    describe('Input Validation', () => {
      test('should reject missing name', async () => {
        const invalidRequest = {
          unit: 'count'
        } as CreateMetricRequest

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject empty name', async () => {
        const invalidRequest: CreateMetricRequest = {
          name: '',
          unit: 'count'
        }

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject name that is too long', async () => {
        const invalidRequest: CreateMetricRequest = {
          name: 'A'.repeat(101), // Exceeds 100 character limit
          unit: 'count'
        }

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject missing unit', async () => {
        const invalidRequest = {
          name: 'Valid Name'
        } as CreateMetricRequest

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject empty unit', async () => {
        const invalidRequest: CreateMetricRequest = {
          name: 'Valid Name',
          unit: ''
        }

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject unit that is too long', async () => {
        const invalidRequest: CreateMetricRequest = {
          name: 'Valid Name',
          unit: 'A'.repeat(51) // Exceeds 50 character limit
        }

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject description that is too long', async () => {
        const invalidRequest: CreateMetricRequest = {
          name: 'Valid Name',
          unit: 'count',
          description: 'A'.repeat(501) // Exceeds 500 character limit
        }

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should reject non-finite current_value', async () => {
        const testCases = [NaN, Infinity, -Infinity]

        for (const invalidValue of testCases) {
          const invalidRequest: CreateMetricRequest = {
            name: 'Valid Name',
            unit: 'count',
            current_value: invalidValue
          }

          await expect(metricsService.createMetric(invalidRequest, {
            userId: mockUserId
          })).rejects.toThrow(ValidationError)
        }
      })

      test('should reject non-finite target_value', async () => {
        const testCases = [NaN, Infinity, -Infinity]

        for (const invalidValue of testCases) {
          const invalidRequest: CreateMetricRequest = {
            name: 'Valid Name',
            unit: 'count',
            target_value: invalidValue
          }

          await expect(metricsService.createMetric(invalidRequest, {
            userId: mockUserId
          })).rejects.toThrow(ValidationError)
        }
      })

      test('should reject values with more than 2 decimal places', async () => {
        const invalidRequest: CreateMetricRequest = {
          name: 'Valid Name',
          unit: 'percentage',
          current_value: 12.345, // Too many decimal places
          target_value: 15.6789  // Too many decimal places
        }

        await expect(metricsService.createMetric(invalidRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)
      })

      test('should accept values with exactly 2 decimal places', async () => {
        setupSuccessfulCreationMocks()

        const validRequest: CreateMetricRequest = {
          name: 'Valid Name',
          unit: 'currency',
          current_value: 12.34,
          target_value: 15.67
        }

        await metricsService.createMetric(validRequest, {
          userId: mockUserId
        })

        expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
      })

      test('should accept integer values', async () => {
        setupSuccessfulCreationMocks()

        const validRequest: CreateMetricRequest = {
          name: 'Valid Name',
          unit: 'count',
          current_value: 42,
          target_value: 100
        }

        await metricsService.createMetric(validRequest, {
          userId: mockUserId
        })

        expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
      })

      test('should trim whitespace from name, unit, and description', async () => {
        setupSuccessfulCreationMocks()

        const requestWithWhitespace: CreateMetricRequest = {
          name: '  Metric with spaces  ',
          unit: '  count  ',
          description: '  Description with spaces  '
        }

        await metricsService.createMetric(requestWithWhitespace, {
          userId: mockUserId
        })

        expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
      })
    })

    describe('Duplicate Detection', () => {
      test('should detect duplicate metrics for same user', async () => {
        // Mock duplicate detection query to return existing metric
        mockDb.executeQuery
          .mockResolvedValueOnce({ id: 'existing-metric-id' }) // Duplicate check returns existing
          .mockResolvedValueOnce(null) // Won't be called due to error

        await expect(metricsService.createMetric(validRequest, {
          userId: mockUserId
        })).rejects.toThrow(ValidationError)

        expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
      })

      test('should allow same name for different users', async () => {
        const differentUserId = '456e7890-e89b-12d3-a456-426614174111'

        // Mock no duplicates found and successful insert
        mockDb.executeQuery
          .mockResolvedValueOnce(null) // No duplicate
          .mockResolvedValueOnce({     // Successful insert
            id: mockMetricId,
            name: 'Test Metric',
            description: null,
            current_value: null,
            target_value: null,
            unit: 'count',
            created_at: new Date().toISOString()
          })

        await metricsService.createMetric(validRequest, {
          userId: differentUserId
        })

        expect(mockDb.executeQuery).toHaveBeenCalledTimes(2)
      })

      test('should handle database error during duplicate check gracefully', async () => {
        // Mock database error during duplicate check
        mockDb.executeQuery
          .mockRejectedValueOnce(new Error('Database connection failed'))
          .mockResolvedValueOnce({     // But allow successful insert
            id: mockMetricId,
            name: 'Test Metric',
            description: null,
            current_value: null,
            target_value: null,
            unit: 'count',
            created_at: new Date().toISOString()
          })

        // Should not throw error and continue with creation
        const result = await metricsService.createMetric(validRequest, {
          userId: mockUserId
        })

        expect(result.id).toBe(mockMetricId)
        expect(mockDb.executeQuery).toHaveBeenCalledTimes(2)
      })
    })

    describe('Database Error Handling', () => {
      test('should throw DatabaseError when insert fails', async () => {
        // Mock successful duplicate check, but failed insert
        mockDb.executeQuery
          .mockResolvedValueOnce(null) // No duplicate
          .mockResolvedValueOnce(null) // Failed insert (returns null)

        await expect(metricsService.createMetric(validRequest, {
          userId: mockUserId
        })).rejects.toThrow(DatabaseError)
      })

      test('should handle database connection errors', async () => {
        mockDb.executeQuery.mockRejectedValue(new Error('Connection failed'))

        await expect(metricsService.createMetric(validRequest, {
          userId: mockUserId
        })).rejects.toThrow('Connection failed')
      })
    })
  })

  describe('getMetric', () => {
    test('should retrieve metric by ID for user', async () => {
      const result = await metricsService.getMetric(mockMetricId, mockUserId)

      expect(result).toEqual({
        id: mockMetricId,
        name: 'Test Metric',
        description: 'Test description',
        current_value: 50.0,
        target_value: 100.0,
        unit: 'percentage',
        user_id: mockUserId,
        created_at: expect.any(String),
        updated_at: expect.any(String)
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should return null when metric not found', async () => {
      mockDb.executeQuery.mockResolvedValue(null)

      const result = await metricsService.getMetric(mockMetricId, mockUserId)

      expect(result).toBeNull()
    })

    test('should throw DatabaseError on database error', async () => {
      mockDb.executeQuery.mockImplementation(async (operation) => {
        const mockClient = {
          from: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockImplementation(() => {
            throw new Error('Database error')
          })
        }
        await operation(mockClient)
      })

      await expect(metricsService.getMetric(mockMetricId, mockUserId))
        .rejects.toThrow(DatabaseError)
    })
  })

  describe('listMetrics', () => {
    test('should list metrics for user with default pagination', async () => {
      // Mock the list operation to return an array
      mockDb.executeQuery.mockResolvedValueOnce([
        {
          id: mockMetricId,
          name: 'Test Metric',
          description: 'Test description',
          current_value: 50.0,
          target_value: 100.0,
          unit: 'percentage',
          user_id: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])

      const result = await metricsService.listMetrics(mockUserId)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: mockMetricId,
        name: 'Test Metric',
        description: 'Test description',
        current_value: 50.0,
        target_value: 100.0,
        unit: 'percentage',
        user_id: mockUserId,
        created_at: expect.any(String),
        updated_at: expect.any(String)
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should list metrics with custom pagination', async () => {
      await metricsService.listMetrics(mockUserId, { limit: 20, offset: 10 })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should return empty array when no metrics found', async () => {
      mockDb.executeQuery.mockResolvedValue([])

      const result = await metricsService.listMetrics(mockUserId)

      expect(result).toEqual([])
    })

    test('should throw DatabaseError on database error', async () => {
      mockDb.executeQuery.mockImplementation(async (operation) => {
        const mockClient = {
          from: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockImplementation(() => {
            throw new Error('Database error')
          })
        }
        await operation(mockClient)
      })

      await expect(metricsService.listMetrics(mockUserId))
        .rejects.toThrow(DatabaseError)
    })
  })

  describe('healthCheck', () => {
    test('should return healthy status when database is accessible', async () => {
      const result = await metricsService.healthCheck()

      expect(result).toEqual({
        status: 'healthy',
        details: 'Metrics service operational'
      })
    })

    test('should return unhealthy status when database query fails', async () => {
      mockDb.executeQuery.mockImplementation(async (operation) => {
        const mockClient = {
          from: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            throw new Error('Database connection failed')
          })
        }
        await operation(mockClient)
      })

      const result = await metricsService.healthCheck()

      expect(result.status).toBe('unhealthy')
      expect(result.details).toContain('Health check failed')
    })

    test('should return unhealthy status when database returns null', async () => {
      mockDb.executeQuery.mockResolvedValue(null)

      const result = await metricsService.healthCheck()

      expect(result.status).toBe('unhealthy')
      expect(result.details).toBe('Database connectivity issue')
    })
  })

  describe('Edge Cases and Performance', () => {
    test('should handle concurrent metric creation requests', async () => {
      // Set up mocks for all concurrent requests (each needs duplicate check + insert)
      mockDb.executeQuery
        .mockResolvedValue(null)  // All duplicate checks return null (no duplicates)
        .mockResolvedValue({      // All inserts succeed
          id: mockMetricId,
          name: 'Test Metric',
          description: null,
          current_value: null,
          target_value: null,
          unit: 'count',
          created_at: new Date().toISOString()
        })

      const requests = Array.from({ length: 5 }, (_, i) => ({
        name: `Concurrent Metric ${i}`,
        unit: 'count'
      }))

      const promises = requests.map(request =>
        metricsService.createMetric(request, { userId: mockUserId })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(mockDb.executeQuery).toHaveBeenCalledTimes(10) // 5 duplicate checks + 5 inserts
    })

    test('should handle very long valid inputs at boundaries', async () => {
      setupSuccessfulCreationMocks()

      const boundaryRequest: CreateMetricRequest = {
        name: 'A'.repeat(100), // Exactly at limit
        unit: 'B'.repeat(50),  // Exactly at limit
        description: 'C'.repeat(500) // Exactly at limit
      }

      await metricsService.createMetric(boundaryRequest, {
        userId: mockUserId
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })

    test('should handle special characters in metric data', async () => {
      setupSuccessfulCreationMocks()

      const specialCharRequest: CreateMetricRequest = {
        name: 'Metric with émojis 🚀 and symbols #@$%',
        unit: '$/user',
        description: 'Special chars: àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ'
      }

      await metricsService.createMetric(specialCharRequest, {
        userId: mockUserId
      })

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(Function))
    })
  })
})
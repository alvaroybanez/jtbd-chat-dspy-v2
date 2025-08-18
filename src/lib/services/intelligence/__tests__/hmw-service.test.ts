/**
 * Integration tests for HMW Generation Service
 */

import { HMWGenerationService } from '../hmw-service'
import type { 
  HMWContext, 
  GenerateHMWResponse
} from '../types'
import { DSPyServiceError, FallbackGenerationError } from '../types'

// Mock dependencies
const mockDspyClient = {
  generateHMW: jest.fn(),
  checkHealth: jest.fn()
}

const mockFallbackService = {
  generateHMWs: jest.fn()
}

// Mock config and logger
jest.mock('../../../config', () => ({
  config: {
    openai: { model: 'gpt-5-nano' },
    dspy: { fallbackEnabled: true }
  }
}))

jest.mock('../../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  startPerformance: jest.fn(() => 'track-id'),
  endPerformance: jest.fn()
}))

import { logger } from '../../../logger'

describe('HMWGenerationService', () => {
  let service: HMWGenerationService
  const mockContext: HMWContext = {
    insights: [
      { id: 'i1', content: 'Users struggle with checkout' }
    ],
    metrics: [
      { id: 'm1', name: 'Conversion Rate', unit: '%', current_value: 2, target_value: 5 }
    ],
    jtbds: [
      { id: 'j1', statement: 'When buying online, I want a fast checkout' }
    ]
  }

  beforeEach(() => {
    service = new HMWGenerationService(mockDspyClient as any, mockFallbackService as any)
    jest.clearAllMocks()
  })

  describe('generateHMW', () => {
    it('should use DSPy service when available', async () => {
      const mockDspyResponse: GenerateHMWResponse = {
        hmws: [
          {
            question: 'How might we streamline the checkout process?',
            score: 8.5,
            source_references: {
              insight_ids: ['i1'],
              metric_ids: ['m1'],
              jtbd_ids: ['j1']
            },
            confidence: 0.9
          }
        ],
        meta: {
          duration_ms: 1500,
          retries: 0,
          model_used: 'gpt-5-nano',
          generation_method: 'dspy',
          timestamp: '2024-01-01T00:00:00Z'
        },
        total_hmws: 1
      }

      mockDspyClient.generateHMW.mockResolvedValue(mockDspyResponse)

      const result = await service.generateHMW(mockContext, { count: 1 })

      expect(mockDspyClient.generateHMW).toHaveBeenCalledWith({
        context: mockContext,
        count: 1,
        temperature: 0.7
      })

      expect(result).toEqual(mockDspyResponse)
      expect(mockFallbackService.generateHMWs).not.toHaveBeenCalled()

      expect(logger.info).toHaveBeenCalledWith(
        'HMW generation completed via DSPy',
        expect.objectContaining({
          method: 'dspy',
          hmwCount: 1
        })
      )
    })

    it('should fall back to local generation when DSPy fails', async () => {
      const dspyError = new DSPyServiceError('Connection timeout', 'DSPY_TIMEOUT')
      mockDspyClient.generateHMW.mockRejectedValue(dspyError)

      const mockFallbackResults = [
        {
          question: 'How might we improve checkout speed?',
          score: 7.2,
          source_references: {
            insight_ids: ['i1'],
            metric_ids: ['m1'], 
            jtbd_ids: ['j1']
          },
          confidence: 0.7
        }
      ]

      mockFallbackService.generateHMWs.mockResolvedValue(mockFallbackResults)

      const result = await service.generateHMW(mockContext, { count: 1 })

      expect(mockDspyClient.generateHMW).toHaveBeenCalled()
      expect(mockFallbackService.generateHMWs).toHaveBeenCalledWith(mockContext, 1, 0.7)

      expect(result.hmws).toEqual(mockFallbackResults)
      expect(result.meta.generation_method).toBe('fallback')

      expect(logger.warn).toHaveBeenCalledWith(
        'DSPy HMW generation failed, falling back to local generation',
        expect.objectContaining({
          dspyErrorCode: 'DSPY_TIMEOUT'
        })
      )

      expect(logger.info).toHaveBeenCalledWith(
        'HMW generation completed via fallback',
        expect.objectContaining({
          method: 'fallback'
        })
      )
    })

    it('should use fallback when forceFallback is true', async () => {
      const mockFallbackResults = [
        {
          question: 'How might we enhance user experience?',
          score: 6.8,
          source_references: {
            insight_ids: ['i1'],
            metric_ids: ['m1'],
            jtbd_ids: ['j1']
          },
          confidence: 0.7
        }
      ]

      mockFallbackService.generateHMWs.mockResolvedValue(mockFallbackResults)

      const result = await service.generateHMW(mockContext, { 
        count: 1, 
        forceFallback: true 
      })

      expect(mockDspyClient.generateHMW).not.toHaveBeenCalled()
      expect(mockFallbackService.generateHMWs).toHaveBeenCalledWith(mockContext, 1, 0.7)

      expect(result.hmws).toEqual(mockFallbackResults)
      expect(result.meta.generation_method).toBe('fallback')
    })

    it('should skip DSPy when skipDSPy is true', async () => {
      const mockFallbackResults = [
        {
          question: 'How might we optimize the process?',
          score: 7.0,
          source_references: {
            insight_ids: ['i1'],
            metric_ids: ['m1'],
            jtbd_ids: ['j1']
          },
          confidence: 0.7
        }
      ]

      mockFallbackService.generateHMWs.mockResolvedValue(mockFallbackResults)

      await service.generateHMW(mockContext, { 
        count: 1, 
        skipDSPy: true 
      })

      expect(mockDspyClient.generateHMW).not.toHaveBeenCalled()
      expect(mockFallbackService.generateHMWs).toHaveBeenCalled()
    })

    it('should handle both DSPy and fallback failures', async () => {
      const dspyError = new DSPyServiceError('Service unavailable', 'SERVICE_UNAVAILABLE')
      const fallbackError = new FallbackGenerationError('OpenAI quota exceeded', 'QUOTA_EXCEEDED')

      mockDspyClient.generateHMW.mockRejectedValue(dspyError)
      mockFallbackService.generateHMWs.mockRejectedValue(fallbackError)

      await expect(
        service.generateHMW(mockContext, { count: 1 })
      ).rejects.toThrow('OpenAI quota exceeded')

      expect(logger.error).toHaveBeenCalledWith(
        'HMW generation failed completely',
        expect.objectContaining({
          error: 'OpenAI quota exceeded'
        })
      )
    })

    it('should pass custom temperature and count', async () => {
      const mockDspyResponse: GenerateHMWResponse = {
        hmws: [],
        meta: {
          duration_ms: 1000,
          retries: 0,
          model_used: 'gpt-5-nano',
          generation_method: 'dspy',
          timestamp: '2024-01-01T00:00:00Z'
        },
        total_hmws: 0
      }

      mockDspyClient.generateHMW.mockResolvedValue(mockDspyResponse)

      await service.generateHMW(mockContext, { 
        count: 10, 
        temperature: 1.2 
      })

      expect(mockDspyClient.generateHMW).toHaveBeenCalledWith({
        context: mockContext,
        count: 10,
        temperature: 1.2
      })
    })
  })

  describe('isDSPyAvailable', () => {
    it('should return true when DSPy service is healthy', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        dspy_configured: true
      })

      const available = await service.isDSPyAvailable()

      expect(available).toBe(true)
      expect(mockDspyClient.checkHealth).toHaveBeenCalled()
    })

    it('should return false when DSPy service is unhealthy', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'unhealthy',
        dspy_configured: true
      })

      const available = await service.isDSPyAvailable()

      expect(available).toBe(false)
    })

    it('should return false when DSPy is not configured', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        dspy_configured: false
      })

      const available = await service.isDSPyAvailable()

      expect(available).toBe(false)
    })

    it('should return false when health check fails', async () => {
      mockDspyClient.checkHealth.mockRejectedValue(new Error('Connection failed'))

      const available = await service.isDSPyAvailable()

      expect(available).toBe(false)
    })
  })

  describe('validateContext', () => {
    it('should pass validation with valid context', () => {
      expect(() => service.validateContext(mockContext)).not.toThrow()
    })

    it('should fail validation with empty context', () => {
      const emptyContext: HMWContext = {
        insights: [],
        metrics: [],
        jtbds: []
      }

      expect(() => service.validateContext(emptyContext))
        .toThrow('At least one context type')
    })

    it('should fail validation with invalid insight', () => {
      const invalidContext: HMWContext = {
        insights: [{ id: '', content: 'Some content' }], // Invalid empty id
        metrics: [],
        jtbds: []
      }

      expect(() => service.validateContext(invalidContext))
        .toThrow('All insights must have id and content')
    })

    it('should fail validation with invalid metric', () => {
      const invalidContext: HMWContext = {
        insights: [],
        metrics: [{ id: 'm1', name: '', unit: '%' }], // Invalid empty name
        jtbds: []
      }

      expect(() => service.validateContext(invalidContext))
        .toThrow('All metrics must have id, name, and unit')
    })

    it('should fail validation with invalid JTBD', () => {
      const invalidContext: HMWContext = {
        insights: [],
        metrics: [],
        jtbds: [{ id: 'j1', statement: '' }] // Invalid empty statement
      }

      expect(() => service.validateContext(invalidContext))
        .toThrow('All JTBDs must have id and statement')
    })
  })

  describe('getServiceStatus', () => {
    it('should return hybrid strategy when DSPy is available', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        dspy_configured: true
      })

      const status = await service.getServiceStatus()

      expect(status.dspy_available).toBe(true)
      expect(status.recommended_strategy).toBe('hybrid')
    })

    it('should return fallback strategy when DSPy is unavailable', async () => {
      mockDspyClient.checkHealth.mockRejectedValue(new Error('Service down'))

      const status = await service.getServiceStatus()

      expect(status.dspy_available).toBe(false)
      expect(status.recommended_strategy).toBe('fallback')
    })
  })
})
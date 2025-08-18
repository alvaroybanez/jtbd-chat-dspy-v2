/**
 * Integration tests for Solution Generation Service
 */

import { SolutionGenerationService } from '../solution-service'
import type { HMWItem, SolutionContext, CreateSolutionsResponse, MetaInfo, SolutionResult } from '../types'
import { DSPyServiceError, SolutionGenerationError } from '../types'

// Mock the client and fallback service
jest.mock('../client')
jest.mock('../solution-fallback')

// Mock config and logger
jest.mock('../../../config', () => ({
  config: {
    dspy: {
      maxRetries: 2,
      timeout: 30000
    },
    openai: {
      model: 'gpt-5-nano'
    }
  }
}))

jest.mock('../../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  startPerformance: jest.fn(() => 'track-id'),
  endPerformance: jest.fn()
}))

import { dspyClient } from '../client'
import { solutionFallbackService } from '../solution-fallback'
import { logger, startPerformance, endPerformance } from '../../../logger'

describe('SolutionGenerationService', () => {
  let service: SolutionGenerationService
  let mockDspyClient: jest.Mocked<typeof dspyClient>
  let mockFallbackService: jest.Mocked<typeof solutionFallbackService>

  const mockMetrics = [
    {
      id: 'metric-1',
      name: 'User Engagement',
      description: 'Monthly active users',
      current_value: 1000,
      target_value: 1500,
      unit: 'count'
    },
    {
      id: 'metric-2',
      name: 'Revenue Growth',
      description: 'Monthly recurring revenue',
      current_value: 50000,
      target_value: 75000,
      unit: 'dollars'
    }
  ]

  const mockHMWs: HMWItem[] = [
    {
      id: 'hmw-1',
      question: 'How might we improve user onboarding experience?',
      score: 8.5
    },
    {
      id: 'hmw-2',
      question: 'How might we increase feature adoption rates?',
      score: 7.8
    }
  ]

  const mockContext: SolutionContext = {
    insights: [
      { id: 'insight-1', content: 'Users struggle with complex setup process' },
      { id: 'insight-2', content: 'Feature discovery is a major pain point' }
    ],
    metrics: mockMetrics,
    jtbds: [
      { id: 'jtbd-1', statement: 'When I start using a new tool, I want to see value quickly' }
    ],
    hmws: mockHMWs
  }

  const mockSolutionResults: SolutionResult[] = [
    {
      title: 'Interactive Onboarding Tour',
      description: 'Guided walkthrough with interactive elements and progress tracking',
      impact_score: 8,
      effort_score: 4,
      final_score: 2.0,
      assigned_metrics: ['metric-1'],
      source_references: {
        insight_ids: ['insight-1'],
        metric_ids: ['metric-1'],
        jtbd_ids: ['jtbd-1']
      },
      confidence: 0.9
    }
  ]

  const mockMetaInfo: MetaInfo = {
    duration_ms: 2500,
    retries: 0,
    model_used: 'gpt-5-nano',
    generation_method: 'dspy',
    timestamp: new Date().toISOString()
  }

  const mockDspyResponse: CreateSolutionsResponse = {
    solutions: mockSolutionResults,
    meta: mockMetaInfo,
    total_solutions: 1,
    fallback_metric_used: false
  }

  beforeEach(() => {
    service = new SolutionGenerationService()
    mockDspyClient = dspyClient as jest.Mocked<typeof dspyClient>
    mockFallbackService = solutionFallbackService as jest.Mocked<typeof solutionFallbackService>
    jest.clearAllMocks()
  })

  describe('createSolutions', () => {
    it('should use DSPy service when available', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })
      mockDspyClient.createSolutions.mockResolvedValue(mockDspyResponse)

      const result = await service.createSolutions(mockHMWs, mockContext)

      expect(mockDspyClient.checkHealth).toHaveBeenCalled()
      expect(mockDspyClient.createSolutions).toHaveBeenCalledWith({
        hmws: mockHMWs,
        context: mockContext,
        count: 5,
        temperature: 0.7
      })
      expect(result).toEqual(mockDspyResponse)
      expect(result.meta.generation_method).toBe('dspy')
    })

    it('should fallback when DSPy service is unhealthy', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'unhealthy',
        service: 'intelligence',
        dspy_configured: false,
        timestamp: new Date().toISOString()
      })
      mockFallbackService.generateSolutions.mockResolvedValue(mockSolutionResults)

      const result = await service.createSolutions(mockHMWs, mockContext)

      expect(mockDspyClient.checkHealth).toHaveBeenCalled()
      expect(mockDspyClient.createSolutions).not.toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).toHaveBeenCalledWith(
        mockHMWs,
        mockContext,
        5,
        0.7
      )
      expect(result.meta.generation_method).toBe('fallback')
    })

    it('should fallback when DSPy service throws error', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })
      mockDspyClient.createSolutions.mockRejectedValue(new DSPyServiceError('Service timeout'))
      mockFallbackService.generateSolutions.mockResolvedValue(mockSolutionResults)

      const result = await service.createSolutions(mockHMWs, mockContext)

      expect(mockDspyClient.createSolutions).toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).toHaveBeenCalled()
      expect(result.meta.generation_method).toBe('fallback')
      expect(logger.warn).toHaveBeenCalledWith(
        'DSPy solution generation failed, activating fallback',
        expect.any(Object)
      )
    })

    it('should use forced fallback mode', async () => {
      mockFallbackService.generateSolutions.mockResolvedValue(mockSolutionResults)

      const result = await service.createSolutions(
        mockHMWs,
        mockContext,
        {},
        { forceFallback: true }
      )

      expect(mockDspyClient.checkHealth).not.toHaveBeenCalled()
      expect(mockDspyClient.createSolutions).not.toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).toHaveBeenCalled()
      expect(result.meta.generation_method).toBe('fallback')
    })

    it('should skip DSPy when requested', async () => {
      mockFallbackService.generateSolutions.mockResolvedValue(mockSolutionResults)

      const result = await service.createSolutions(
        mockHMWs,
        mockContext,
        {},
        { skipDSPy: true }
      )

      expect(mockDspyClient.checkHealth).not.toHaveBeenCalled()
      expect(mockDspyClient.createSolutions).not.toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).toHaveBeenCalled()
      expect(result.meta.generation_method).toBe('fallback')
    })

    it('should validate context before generation', async () => {
      // Missing metrics
      const invalidContext = { ...mockContext, metrics: [] }

      await expect(
        service.createSolutions(mockHMWs, invalidContext)
      ).rejects.toThrow(SolutionGenerationError)

      expect(mockDspyClient.createSolutions).not.toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).not.toHaveBeenCalled()
    })

    it('should validate HMW question format', async () => {
      const invalidHMWs: HMWItem[] = [
        {
          id: 'hmw-1',
          question: 'What can we do to improve user engagement?', // Invalid format
          score: 8.0
        }
      ]

      await expect(
        service.createSolutions(invalidHMWs, mockContext)
      ).rejects.toThrow(SolutionGenerationError)

      expect(mockDspyClient.createSolutions).not.toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).not.toHaveBeenCalled()
    })

    it('should handle empty HMWs array', async () => {
      await expect(
        service.createSolutions([], mockContext)
      ).rejects.toThrow(SolutionGenerationError)

      expect(mockDspyClient.createSolutions).not.toHaveBeenCalled()
      expect(mockFallbackService.generateSolutions).not.toHaveBeenCalled()
    })

    it('should pass through custom options', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })
      mockDspyClient.createSolutions.mockResolvedValue(mockDspyResponse)

      await service.createSolutions(mockHMWs, mockContext, {
        count: 3,
        temperature: 0.9
      })

      expect(mockDspyClient.createSolutions).toHaveBeenCalledWith({
        hmws: mockHMWs,
        context: mockContext,
        count: 3,
        temperature: 0.9
      })
    })

    it('should log performance metrics', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })
      mockDspyClient.createSolutions.mockResolvedValue(mockDspyResponse)

      await service.createSolutions(mockHMWs, mockContext)

      expect(startPerformance).toHaveBeenCalledWith('solution_generation_orchestration')
      expect(endPerformance).toHaveBeenCalledWith('track-id', true, expect.any(Object))
      expect(logger.info).toHaveBeenCalledWith(
        'Solution generation orchestration completed',
        expect.objectContaining({
          solutionCount: 1,
          requestedCount: 5,
          generationMethod: 'dspy'
        })
      )
    })

    it('should handle health check failures gracefully', async () => {
      mockDspyClient.checkHealth.mockRejectedValue(new Error('Network error'))
      mockFallbackService.generateSolutions.mockResolvedValue(mockSolutionResults)

      const result = await service.createSolutions(mockHMWs, mockContext)

      expect(mockFallbackService.generateSolutions).toHaveBeenCalled()
      expect(result.meta.generation_method).toBe('fallback')
    })

    it('should detect fallback metric usage', async () => {
      const solutionsWithSameMetric = [
        { ...mockSolutionResults[0], assigned_metrics: ['metric-1'] },
        { ...mockSolutionResults[0], assigned_metrics: ['metric-1'] }
      ]

      mockFallbackService.generateSolutions.mockResolvedValue(solutionsWithSameMetric)

      const result = await service.createSolutions(
        mockHMWs,
        mockContext,
        {},
        { forceFallback: true }
      )

      expect(result.fallback_metric_used).toBe(true)
    })

    it('should throw error when both DSPy and fallback fail', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })
      mockDspyClient.createSolutions.mockRejectedValue(new Error('DSPy failed'))
      mockFallbackService.generateSolutions.mockRejectedValue(new Error('Fallback failed'))

      await expect(
        service.createSolutions(mockHMWs, mockContext)
      ).rejects.toThrow(SolutionGenerationError)

      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('isDSPyAvailable', () => {
    it('should return true when DSPy is healthy and configured', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })

      const result = await service.isDSPyAvailable()
      expect(result).toBe(true)
    })

    it('should return false when DSPy is unhealthy', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'unhealthy',
        service: 'intelligence',
        dspy_configured: true,
        timestamp: new Date().toISOString()
      })

      const result = await service.isDSPyAvailable()
      expect(result).toBe(false)
    })

    it('should return false when DSPy is not configured', async () => {
      mockDspyClient.checkHealth.mockResolvedValue({
        status: 'healthy',
        service: 'intelligence',
        dspy_configured: false,
        timestamp: new Date().toISOString()
      })

      const result = await service.isDSPyAvailable()
      expect(result).toBe(false)
    })

    it('should return false when health check fails', async () => {
      mockDspyClient.checkHealth.mockRejectedValue(new Error('Connection failed'))

      const result = await service.isDSPyAvailable()
      expect(result).toBe(false)
    })
  })

  describe('validateContext', () => {
    it('should pass validation with valid context', () => {
      expect(() => service.validateContext(mockHMWs, mockContext)).not.toThrow()
    })

    it('should throw error for invalid HMW format', () => {
      const invalidHMWs: HMWItem[] = [{
        id: 'hmw-1',
        question: 'What should we do?', // Invalid format
        score: 5.0
      }]

      expect(() => service.validateContext(invalidHMWs, mockContext))
        .toThrow(SolutionGenerationError)
    })

    it('should throw error when no metrics provided', () => {
      const contextWithoutMetrics = { ...mockContext, metrics: [] }

      expect(() => service.validateContext(mockHMWs, contextWithoutMetrics))
        .toThrow(SolutionGenerationError)
    })

    it('should throw error when no HMWs provided', () => {
      expect(() => service.validateContext([], mockContext))
        .toThrow(SolutionGenerationError)
    })
  })

  describe('getConfig', () => {
    it('should return configuration for debugging', () => {
      const config = service.getConfig()

      expect(config).toHaveProperty('defaultOptions')
      expect(config).toHaveProperty('dspyConfig')
      expect(config).toHaveProperty('openaiModel')
      expect(config.openaiModel).toBe('gpt-5-nano')
    })
  })
})
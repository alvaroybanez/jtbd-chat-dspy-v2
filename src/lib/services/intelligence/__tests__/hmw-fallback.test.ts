/**
 * Unit tests for HMW Fallback Service
 */

import { HMWFallbackService } from '../hmw-fallback'
import type { HMWContext } from '../types'
import { FallbackGenerationError } from '../types'

// Mock AI SDK
jest.mock('ai', () => ({
  generateText: jest.fn()
}))

jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn(() => 'mock-model')
}))

// Mock config and logger
jest.mock('../../../config', () => ({
  config: {
    openai: {
      model: 'gpt-5-nano'
    }
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

import { generateText } from 'ai'
import { logger, startPerformance, endPerformance } from '../../../logger'

describe('HMWFallbackService', () => {
  let service: HMWFallbackService
  let mockGenerateText: jest.MockedFunction<typeof generateText>

  beforeEach(() => {
    service = new HMWFallbackService()
    mockGenerateText = generateText as jest.MockedFunction<typeof generateText>
    jest.clearAllMocks()
  })

  describe('generateHMWs', () => {
    const mockContext: HMWContext = {
      insights: [
        { id: 'insight-1', content: 'Users struggle with navigation' },
        { id: 'insight-2', content: 'Payment process is confusing' }
      ],
      metrics: [
        { 
          id: 'metric-1', 
          name: 'Conversion Rate', 
          unit: '%',
          current_value: 2.5,
          target_value: 5.0,
          description: 'Website conversion rate'
        }
      ],
      jtbds: [
        { 
          id: 'jtbd-1', 
          statement: 'When I want to buy something online, I want a seamless checkout process',
          context: 'E-commerce users'
        }
      ]
    }

    it('should generate HMW questions successfully', async () => {
      const mockResponse = {
        text: `1. How might we simplify the navigation structure?
2. How might we improve the payment process clarity?
3. How might we increase conversion rates?
4. How might we streamline the checkout experience?
5. How might we better guide users through the purchase flow?`,
        usage: { totalTokens: 150 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 5, 0.7)

      expect(result).toHaveLength(5)
      // Results are sorted by score, so we check that all questions are valid HMWs
      result.forEach(hmw => {
        expect(hmw.question).toMatch(/^How might we .+\?$/)
        expect(hmw.score).toBeGreaterThan(0)
        expect(hmw.score).toBeLessThanOrEqual(10)
        expect(hmw.confidence).toBe(0.7)
      })
      expect(result[0].source_references.insight_ids).toContain('insight-1')

      expect(mockGenerateText).toHaveBeenCalledWith({
        model: 'mock-model',
        system: expect.stringContaining('You are an expert product strategist'),
        prompt: expect.stringContaining('INSIGHTS:'),
        temperature: 0.7,
        maxTokens: 1000,
        maxRetries: 2
      })

      expect(logger.info).toHaveBeenCalledWith(
        'HMW fallback generation completed',
        expect.objectContaining({
          requestedCount: 5,
          generatedCount: 5
        })
      )
    })

    it('should normalize HMW questions correctly', async () => {
      const mockResponse = {
        text: `1. we could improve the navigation
2. What if we simplified the checkout?
3. might we optimize conversion rates?
4. How might we enhance user experience
5. Could we streamline the payment flow?`,
        usage: { totalTokens: 120 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 5)

      // Results are sorted by score, so just verify normalization worked
      const questions = result.map(r => r.question)
      expect(questions).toContain('How might we improve the navigation?')
      expect(questions).toContain('How might we simplified the checkout?')
      expect(questions).toContain('How might we optimize conversion rates?')
      expect(questions).toContain('How might we enhance user experience?')
      expect(questions).toContain('How might we streamline the payment flow?')
    })

    it('should calculate relevance scores based on context alignment', async () => {
      const mockResponse = {
        text: `1. How might we improve navigation and payment experience?
2. How might we create better cooking recipes?`,
        usage: { totalTokens: 80 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 2)

      // HMW with context keywords should score higher than unrelated one
      const contextAlignedHMW = result.find(r => r.question.includes('navigation') || r.question.includes('payment'))
      const unrelatedHMW = result.find(r => r.question.includes('cooking'))
      
      if (contextAlignedHMW && unrelatedHMW) {
        expect(contextAlignedHMW.score).toBeGreaterThan(unrelatedHMW.score)
        expect(contextAlignedHMW.score).toBeGreaterThan(5.0) // Should get bonus for alignment
      }
    })

    it('should add quality indicator bonuses', async () => {
      const mockResponse = {
        text: `1. How might we improve and optimize user experience?
2. How might we create new features?`,
        usage: { totalTokens: 70 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 2)

      // HMW with quality indicators should score higher
      const qualityHMW = result.find(r => r.question.includes('improve') || r.question.includes('optimize'))
      const regularHMW = result.find(r => !r.question.includes('improve') && !r.question.includes('optimize'))
      
      if (qualityHMW && regularHMW) {
        expect(qualityHMW.score).toBeGreaterThan(regularHMW.score)
      }
    })

    it('should sort results by score and limit to requested count', async () => {
      const mockResponse = {
        text: `1. How might we create unrelated features?
2. How might we improve navigation and conversion rates?
3. How might we optimize payment processing?`,
        usage: { totalTokens: 90 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 2) // Request only 2

      expect(result).toHaveLength(2)
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score)
      // Second result should have higher score due to context alignment
      expect(result[0].question).toContain('navigation')
    })

    it('should handle empty context gracefully', async () => {
      const emptyContext: HMWContext = {
        insights: [],
        metrics: [],
        jtbds: []
      }

      await expect(service.generateHMWs(emptyContext)).rejects.toThrow('At least one context type')
    })

    it('should handle AI generation failures', async () => {
      mockGenerateText.mockRejectedValue(new Error('OpenAI API error'))

      await expect(service.generateHMWs(mockContext)).rejects.toThrow('Failed to generate HMW questions')

      expect(logger.error).toHaveBeenCalledWith(
        'HMW fallback generation failed',
        expect.objectContaining({
          error: 'OpenAI API error'
        })
      )
    })

    it('should parse malformed responses gracefully', async () => {
      const mockResponse = {
        text: `Some random text without proper format
Another line
1. How might we do something?
More random text`,
        usage: { totalTokens: 60 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 5)

      // Should parse all text lines that are long enough after numbering removal
      expect(result.length).toBeGreaterThan(0)
      result.forEach(hmw => {
        expect(hmw.question).toMatch(/^How might we .+\?$/)
      })
    })

    it('should create proper source references', async () => {
      const mockResponse = {
        text: '1. How might we improve user experience?',
        usage: { totalTokens: 40 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(mockContext, 1)

      expect(result[0].source_references).toEqual({
        insight_ids: ['insight-1', 'insight-2'],
        metric_ids: ['metric-1'],
        jtbd_ids: ['jtbd-1']
      })
    })

    it('should handle insights-only context', async () => {
      const insightsOnlyContext: HMWContext = {
        insights: [{ id: 'i1', content: 'Users need better help' }],
        metrics: [],
        jtbds: []
      }

      const mockResponse = {
        text: '1. How might we provide better help?',
        usage: { totalTokens: 35 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      const result = await service.generateHMWs(insightsOnlyContext, 1)

      expect(result).toHaveLength(1)
      expect(result[0].source_references.insight_ids).toEqual(['i1'])
      expect(result[0].source_references.metric_ids).toEqual([])
      expect(result[0].source_references.jtbd_ids).toEqual([])
    })

    it('should track performance metrics', async () => {
      const mockResponse = {
        text: '1. How might we test performance?',
        usage: { totalTokens: 30 }
      }

      mockGenerateText.mockResolvedValue(mockResponse as any)

      await service.generateHMWs(mockContext, 1)

      expect(startPerformance).toHaveBeenCalledWith('hmw_fallback_generation')
      expect(endPerformance).toHaveBeenCalledWith(
        'track-id',
        true,
        expect.objectContaining({
          count: 1,
          requestedCount: 1
        })
      )
    })
  })
})
/**
 * Unit tests for Solution Fallback Service
 */

import { SolutionFallbackService } from '../solution-fallback'
import type { SolutionContext, HMWItem, MetricItem } from '../types'
import { SolutionGenerationError } from '../types'

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
    error: jest.fn(),
    debug: jest.fn()
  },
  startPerformance: jest.fn(() => 'track-id'),
  endPerformance: jest.fn()
}))

import { generateText } from 'ai'
import { logger, startPerformance, endPerformance } from '../../../logger'

describe('SolutionFallbackService', () => {
  let service: SolutionFallbackService
  let mockGenerateText: jest.MockedFunction<typeof generateText>

  const mockMetrics: MetricItem[] = [
    {
      id: 'metric-1',
      name: 'User Engagement',
      description: 'Monthly active user engagement rate',
      current_value: 65,
      target_value: 80,
      unit: 'percentage'
    },
    {
      id: 'metric-2',
      name: 'Conversion Rate',
      description: 'User conversion to paid accounts',
      current_value: 12,
      target_value: 18,
      unit: 'percentage'
    }
  ]

  const mockHMWs: HMWItem[] = [
    {
      id: 'hmw-1',
      question: 'How might we increase user engagement through gamification?',
      score: 8.5
    },
    {
      id: 'hmw-2', 
      question: 'How might we improve our onboarding conversion rates?',
      score: 7.2
    }
  ]

  const mockContext: SolutionContext = {
    insights: [
      { id: 'insight-1', content: 'Users abandon onboarding after 3rd step' },
      { id: 'insight-2', content: 'Power users spend 5x more time in the dashboard' }
    ],
    metrics: mockMetrics,
    jtbds: [
      { id: 'jtbd-1', statement: 'When I start using a new product, I want to see value quickly' }
    ],
    hmws: mockHMWs
  }

  beforeEach(() => {
    service = new SolutionFallbackService()
    mockGenerateText = generateText as jest.MockedFunction<typeof generateText>
    jest.clearAllMocks()
  })

  describe('generateSolutions', () => {
    it('should generate solutions with proper structure', async () => {
      const mockAIResponse = `
TITLE: Gamified Progress Tracker
DESCRIPTION: Implement a progress tracking system with achievement badges and milestones to increase user engagement through interactive elements and visual feedback loops.
IMPACT: 8
EFFORT: 5
REASONING: High impact due to proven engagement benefits, moderate effort for implementation

TITLE: Smart Onboarding Assistant  
DESCRIPTION: Create an AI-powered onboarding guide that adapts to user behavior and provides personalized recommendations to improve conversion rates.
IMPACT: 7
EFFORT: 6
REASONING: Solid impact on conversions, higher effort due to AI integration complexity
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 150, completionTokens: 200, totalTokens: 350 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, mockContext, 2, 0.7)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        title: expect.any(String),
        description: expect.any(String),
        impact_score: expect.any(Number),
        effort_score: expect.any(Number),
        final_score: expect.any(Number),
        assigned_metrics: expect.any(Array),
        source_references: {
          insight_ids: expect.any(Array),
          metric_ids: expect.any(Array),
          jtbd_ids: expect.any(Array)
        }
      })

      // Verify scores are within valid range
      result.forEach(solution => {
        expect(solution.impact_score).toBeGreaterThanOrEqual(1)
        expect(solution.impact_score).toBeLessThanOrEqual(10)
        expect(solution.effort_score).toBeGreaterThanOrEqual(1)
        expect(solution.effort_score).toBeLessThanOrEqual(10)
        expect(solution.assigned_metrics.length).toBeGreaterThan(0)
      })
    })

    it('should assign metrics intelligently based on solution content', async () => {
      const mockAIResponse = `
TITLE: User Engagement Tracker
DESCRIPTION: Build a user engagement tracking system to monitor and improve user engagement rates and metrics.
IMPACT: 9
EFFORT: 4
REASONING: Direct impact on engagement metrics measurement
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, mockContext, 1)

      // Should assign at least one metric
      expect(result[0].assigned_metrics.length).toBeGreaterThan(0)
      expect(result[0].source_references.metric_ids).toEqual(result[0].assigned_metrics)
    })

    it('should calculate final scores correctly', async () => {
      const mockAIResponse = `
TITLE: Test Solution
DESCRIPTION: A test solution for scoring validation.
IMPACT: 8
EFFORT: 4
REASONING: Simple calculation test
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, mockContext, 1)

      expect(result[0].final_score).toBe(2.0) // 8/4 = 2.0
    })

    it('should handle malformed AI responses gracefully', async () => {
      const mockAIResponse = `
This is a malformed response without proper structure.
Some random text that doesn't follow the expected format.
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 50, completionTokens: 75, totalTokens: 125 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, mockContext, 2)

      // Should still return solutions (fallback solutions)
      expect(result).toHaveLength(2)
      result.forEach(solution => {
        expect(solution.title).toBeDefined()
        expect(solution.description).toBeDefined()
        expect(solution.assigned_metrics.length).toBeGreaterThan(0)
      })
    })

    it('should throw error when no HMWs provided', async () => {
      await expect(
        service.generateSolutions([], mockContext, 3)
      ).rejects.toThrow(SolutionGenerationError)
      
      expect(mockGenerateText).not.toHaveBeenCalled()
    })

    it('should throw error when no metrics provided', async () => {
      const contextWithoutMetrics = { ...mockContext, metrics: [] }
      
      await expect(
        service.generateSolutions(mockHMWs, contextWithoutMetrics, 3)
      ).rejects.toThrow(SolutionGenerationError)
      
      expect(mockGenerateText).not.toHaveBeenCalled()
    })

    it('should handle AI generation errors', async () => {
      mockGenerateText.mockRejectedValue(new Error('AI service failed'))

      await expect(
        service.generateSolutions(mockHMWs, mockContext, 2)
      ).rejects.toThrow(SolutionGenerationError)

      expect(logger.error).toHaveBeenCalled()
    })

    it('should sort solutions by final score descending', async () => {
      const mockAIResponse = `
TITLE: Low Impact Solution
DESCRIPTION: A solution with low impact but high effort.
IMPACT: 3
EFFORT: 8
REASONING: Low priority solution

TITLE: High Impact Solution  
DESCRIPTION: A solution with high impact and low effort.
IMPACT: 9
EFFORT: 2
REASONING: High priority solution
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, mockContext, 2)

      expect(result[0].final_score).toBeGreaterThan(result[1].final_score)
      expect(result[0].title).toBe('High Impact Solution')
    })

    it('should log performance metrics', async () => {
      const mockAIResponse = `
TITLE: Test Solution
DESCRIPTION: Test description
IMPACT: 5
EFFORT: 5
REASONING: Test reasoning
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 }
      } as any)

      await service.generateSolutions(mockHMWs, mockContext, 1)

      expect(startPerformance).toHaveBeenCalledWith('solution_fallback_generation')
      expect(endPerformance).toHaveBeenCalledWith('track-id', true, expect.any(Object))
      expect(logger.info).toHaveBeenCalledWith(
        'Solution fallback generation completed',
        expect.objectContaining({
          requestedCount: 1,
          generatedCount: 1
        })
      )
    })

    it('should enforce minimum solution count with fallback generation', async () => {
      const mockAIResponse = `
TITLE: Only One Solution
DESCRIPTION: AI only generated one solution
IMPACT: 5
EFFORT: 5
REASONING: Single solution response
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 50, completionTokens: 75, totalTokens: 125 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, mockContext, 3)

      // Should pad to requested count with fallback solutions
      expect(result).toHaveLength(3)
      // Check that additional solutions were generated (they may be fallback or parsed)
      expect(result[1].title).toBeDefined()
      expect(result[2].title).toBeDefined()
      expect(result[1].assigned_metrics.length).toBeGreaterThan(0)
      expect(result[2].assigned_metrics.length).toBeGreaterThan(0)
    })

    it('should assign fallback metric when intelligent assignment fails', async () => {
      const contextWithOneMetric: SolutionContext = {
        ...mockContext,
        metrics: [mockMetrics[0]]
      }

      const mockAIResponse = `
TITLE: Unrelated Solution
DESCRIPTION: This solution doesn't match any metric keywords at all.
IMPACT: 5
EFFORT: 5
REASONING: No keyword matches
      `

      mockGenerateText.mockResolvedValue({
        text: mockAIResponse,
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 }
      } as any)

      const result = await service.generateSolutions(mockHMWs, contextWithOneMetric, 1)

      expect(result[0].assigned_metrics).toEqual(['metric-1']) // Should fallback to available metric
    })
  })
})
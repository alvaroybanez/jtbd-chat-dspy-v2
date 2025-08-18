/**
 * Solution Generation Orchestration Service
 * Coordinates between DSPy service and fallback generation for solutions
 */

import { config } from '../../config'
import { logger, startPerformance, endPerformance } from '../../logger'
import { dspyClient } from './client'
import { solutionFallbackService } from './solution-fallback'
import type {
  CreateSolutionsRequest,
  CreateSolutionsResponse,
  SolutionContext,
  SolutionGenerationOptions,
  HMWItem,
  MetaInfo,
  SolutionResult
} from './types'
import { 
  DSPyServiceError, 
  SolutionGenerationError,
  CreateSolutionsRequestSchema
} from './types'

export interface SolutionGenerationServiceOptions {
  forceFallback?: boolean
  skipDSPy?: boolean
  timeout?: number
  maxRetries?: number
}

export class SolutionGenerationService {
  private readonly defaultOptions: SolutionGenerationOptions = {
    count: 5,
    temperature: 0.7,
    maxRetries: config.dspy?.maxRetries || 2,
    timeout: config.dspy?.timeout || 30000
  }

  /**
   * Generate solutions with DSPy-first strategy and automatic fallback
   */
  async createSolutions(
    hmws: HMWItem[],
    context: SolutionContext,
    options: Partial<SolutionGenerationOptions> = {},
    serviceOptions: SolutionGenerationServiceOptions = {}
  ): Promise<CreateSolutionsResponse> {
    const trackingId = startPerformance('solution_generation_orchestration')
    const finalOptions = { ...this.defaultOptions, ...options }

    try {
      // Validate context
      this.validateContext(hmws, context)

      // Prepare request
      const request: CreateSolutionsRequest = {
        hmws,
        context,
        count: finalOptions.count,
        temperature: finalOptions.temperature
      }

      let response: CreateSolutionsResponse
      let usedFallback = false

      // Determine generation strategy
      if (serviceOptions.forceFallback || serviceOptions.skipDSPy) {
        logger.info('Using forced fallback for solution generation', {
          forceFallback: serviceOptions.forceFallback,
          skipDSPy: serviceOptions.skipDSPy
        })
        response = await this.generateWithFallback(request)
        usedFallback = true
      } else {
        // Try DSPy first, fallback on failure
        try {
          const isDSPyAvailable = await this.isDSPyAvailable()
          
          if (!isDSPyAvailable) {
            logger.warn('DSPy service unavailable, using fallback for solution generation')
            response = await this.generateWithFallback(request)
            usedFallback = true
          } else {
            response = await dspyClient.createSolutions(request)
            logger.info('DSPy solution generation successful')
          }
        } catch (error) {
          logger.warn('DSPy solution generation failed, activating fallback', {
            error: error instanceof Error ? error.message : String(error)
          })
          response = await this.generateWithFallback(request)
          usedFallback = true
        }
      }

      // Update metadata to reflect actual generation method
      response.meta = {
        ...response.meta,
        generation_method: usedFallback ? 'fallback' : 'dspy'
      }

      endPerformance(trackingId, true, {
        solutionCount: response.solutions.length,
        requestedCount: finalOptions.count,
        generationMethod: response.meta.generation_method,
        fallbackUsed: usedFallback
      })

      logger.info('Solution generation orchestration completed', {
        solutionCount: response.solutions.length,
        requestedCount: finalOptions.count,
        generationMethod: response.meta.generation_method,
        duration: response.meta.duration_ms
      })

      return response

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      logger.error('Solution generation orchestration failed', {
        error: error instanceof Error ? error.message : String(error),
        hmwCount: hmws.length,
        contextSize: this.getContextSize(context)
      })

      // Re-throw known errors
      if (error instanceof SolutionGenerationError || error instanceof DSPyServiceError) {
        throw error
      }

      throw new SolutionGenerationError(
        'Solution generation orchestration failed',
        'ORCHESTRATION_FAILED',
        error
      )
    }
  }

  /**
   * Generate solutions using fallback service only
   */
  private async generateWithFallback(request: CreateSolutionsRequest): Promise<CreateSolutionsResponse> {
    const startTime = Date.now()

    try {
      const solutions = await solutionFallbackService.generateSolutions(
        request.hmws,
        request.context,
        request.count || 5,
        request.temperature || 0.7
      )

      const meta: MetaInfo = {
        duration_ms: Date.now() - startTime,
        retries: 0,
        model_used: config.openai.model,
        generation_method: 'fallback',
        timestamp: new Date().toISOString()
      }

      return {
        solutions,
        meta,
        total_solutions: solutions.length,
        fallback_metric_used: this.checkFallbackMetricUsage(solutions, request.context)
      }

    } catch (error) {
      logger.error('Fallback solution generation failed', {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new SolutionGenerationError(
        'Fallback solution generation failed',
        'FALLBACK_FAILED',
        error
      )
    }
  }

  /**
   * Check if DSPy service is available
   */
  async isDSPyAvailable(): Promise<boolean> {
    try {
      const health = await dspyClient.checkHealth()
      return health.status === 'healthy' && health.dspy_configured
    } catch (error) {
      logger.debug('DSPy health check failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Validate solution generation context
   */
  validateContext(hmws: HMWItem[], context: SolutionContext): void {
    try {
      // Validate using schema
      CreateSolutionsRequestSchema.parse({
        hmws,
        context,
        count: 5,
        temperature: 0.7
      })
    } catch (error) {
      throw new SolutionGenerationError(
        'Invalid context for solution generation',
        'INVALID_CONTEXT',
        error
      )
    }

    // Additional business logic validation
    if (hmws.length === 0) {
      throw new SolutionGenerationError(
        'At least one HMW question is required for solution generation',
        'NO_HMWS_PROVIDED'
      )
    }

    if (context.metrics.length === 0) {
      throw new SolutionGenerationError(
        'At least one metric is required for solution generation',
        'NO_METRICS_PROVIDED'
      )
    }

    // Validate HMW format
    for (const hmw of hmws) {
      if (!hmw.question.toLowerCase().trim().startsWith('how might we')) {
        throw new SolutionGenerationError(
          `Invalid HMW question format: "${hmw.question}". Must start with "How might we"`,
          'INVALID_HMW_FORMAT'
        )
      }
    }

    logger.debug('Solution context validation passed', {
      hmwCount: hmws.length,
      contextSize: this.getContextSize(context)
    })
  }

  /**
   * Get context size for logging
   */
  private getContextSize(context: SolutionContext): Record<string, number> {
    return {
      insights: context.insights.length,
      metrics: context.metrics.length,
      jtbds: context.jtbds.length,
      hmws: context.hmws.length
    }
  }

  /**
   * Check if fallback metric assignment was used
   */
  private checkFallbackMetricUsage(solutions: SolutionResult[], context: SolutionContext): boolean {
    if (context.metrics.length <= 1) {
      return true // If only one metric available, it's likely fallback
    }

    // Check if all solutions use the same single metric (common fallback pattern)
    const allSingleMetric = solutions.every(s => s.assigned_metrics.length === 1)
    const sameMetric = allSingleMetric && solutions.every(s => 
      s.assigned_metrics[0] === solutions[0].assigned_metrics[0]
    )

    return sameMetric
  }

  /**
   * Get current configuration for debugging
   */
  getConfig(): Record<string, any> {
    return {
      defaultOptions: this.defaultOptions,
      dspyConfig: dspyClient.getConfig(),
      openaiModel: config.openai.model
    }
  }
}

// Export singleton instance
export const solutionService = new SolutionGenerationService()
export default solutionService
/**
 * HMW Generation Service
 * Orchestrates HMW generation between DSPy service and fallback
 */

import { config } from '../../config'
import { logger, startPerformance, endPerformance } from '../../logger'
import { dspyClient, DSPyIntelligenceClient } from './client'
import { hmwFallbackService, HMWFallbackService } from './hmw-fallback'
import type {
  HMWContext,
  GenerateHMWRequest,
  GenerateHMWResponse,
  HMWResult,
  MetaInfo
} from './types'
import { DSPyServiceError, FallbackGenerationError } from './types'

export interface HMWGenerationOptions {
  count?: number
  temperature?: number
  forceFallback?: boolean
  skipDSPy?: boolean
}

export class HMWGenerationService {
  private readonly dspyClient: DSPyIntelligenceClient
  private readonly fallbackService: HMWFallbackService

  constructor(
    dspyClient?: DSPyIntelligenceClient,
    fallbackService?: HMWFallbackService
  ) {
    this.dspyClient = dspyClient || dspyClient
    this.fallbackService = fallbackService || hmwFallbackService
  }

  /**
   * Generate HMW questions using DSPy-first, fallback-second strategy
   */
  async generateHMW(
    context: HMWContext,
    options: HMWGenerationOptions = {}
  ): Promise<GenerateHMWResponse> {
    const trackingId = startPerformance('hmw_generation_orchestration')
    const startTime = Date.now()

    const {
      count = 5,
      temperature = 0.7,
      forceFallback = false,
      skipDSPy = false
    } = options

    try {
      // Use fallback if explicitly requested or DSPy is disabled
      if (forceFallback || skipDSPy || !config.dspy.fallbackEnabled) {
        return await this.generateWithFallback(context, count, temperature, startTime)
      }

      // Try DSPy first
      try {
        const dspyRequest: GenerateHMWRequest = {
          context,
          count,
          temperature
        }

        const dspyResponse = await this.dspyClient.generateHMW(dspyRequest)

        endPerformance(trackingId, true, {
          method: 'dspy',
          hmwCount: dspyResponse.hmws.length,
          requestedCount: count
        })

        logger.info('HMW generation completed via DSPy', {
          hmwCount: dspyResponse.hmws.length,
          requestedCount: count,
          duration: Date.now() - startTime,
          method: 'dspy'
        })

        return dspyResponse

      } catch (dspyError) {
        // Log DSPy failure and fall back
        logger.warn('DSPy HMW generation failed, falling back to local generation', {
          error: dspyError instanceof Error ? dspyError.message : String(dspyError),
          dspyErrorCode: dspyError instanceof DSPyServiceError ? dspyError.code : 'UNKNOWN'
        })

        return await this.generateWithFallback(context, count, temperature, startTime)
      }

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      logger.error('HMW generation failed completely', {
        error: error instanceof Error ? error.message : String(error),
        context: {
          insights: context.insights.length,
          metrics: context.metrics.length,
          jtbds: context.jtbds.length
        }
      })

      if (error instanceof FallbackGenerationError || error instanceof DSPyServiceError) {
        throw error
      }

      throw new FallbackGenerationError(
        'HMW generation failed',
        'HMW_GENERATION_FAILED',
        error
      )
    }
  }

  /**
   * Generate HMWs using fallback service
   */
  private async generateWithFallback(
    context: HMWContext,
    count: number,
    temperature: number,
    startTime: number
  ): Promise<GenerateHMWResponse> {
    const fallbackResults = await this.fallbackService.generateHMWs(
      context,
      count,
      temperature
    )

    const meta: MetaInfo = {
      duration_ms: Date.now() - startTime,
      retries: 0,
      model_used: config.openai.model,
      generation_method: 'fallback',
      timestamp: new Date().toISOString()
    }

    const response: GenerateHMWResponse = {
      hmws: fallbackResults,
      meta,
      total_hmws: fallbackResults.length
    }

    logger.info('HMW generation completed via fallback', {
      hmwCount: response.hmws.length,
      requestedCount: count,
      duration: meta.duration_ms,
      method: 'fallback'
    })

    return response
  }

  /**
   * Check if DSPy service is available
   */
  async isDSPyAvailable(): Promise<boolean> {
    try {
      const health = await this.dspyClient.checkHealth()
      return health.status === 'healthy' && health.dspy_configured
    } catch {
      return false
    }
  }

  /**
   * Get service status
   */
  async getServiceStatus(): Promise<{
    dspy_available: boolean
    fallback_enabled: boolean
    service_url: string
    recommended_strategy: 'dspy' | 'fallback' | 'hybrid'
  }> {
    const dspyAvailable = await this.isDSPyAvailable()
    
    let recommendedStrategy: 'dspy' | 'fallback' | 'hybrid'
    if (!config.dspy.fallbackEnabled) {
      recommendedStrategy = dspyAvailable ? 'dspy' : 'fallback'
    } else {
      recommendedStrategy = dspyAvailable ? 'hybrid' : 'fallback'
    }

    return {
      dspy_available: dspyAvailable,
      fallback_enabled: config.dspy.fallbackEnabled,
      service_url: config.dspy.serviceUrl,
      recommended_strategy: recommendedStrategy
    }
  }

  /**
   * Validate HMW context
   */
  validateContext(context: HMWContext): void {
    const hasInsights = context.insights.length > 0
    const hasMetrics = context.metrics.length > 0  
    const hasJTBDs = context.jtbds.length > 0

    if (!hasInsights && !hasMetrics && !hasJTBDs) {
      throw new FallbackGenerationError(
        'At least one context type (insights, metrics, jtbds) must be provided',
        'INVALID_CONTEXT'
      )
    }

    // Validate individual context items
    for (const insight of context.insights) {
      if (!insight.id || !insight.content) {
        throw new FallbackGenerationError(
          'All insights must have id and content',
          'INVALID_INSIGHT'
        )
      }
    }

    for (const metric of context.metrics) {
      if (!metric.id || !metric.name || !metric.unit) {
        throw new FallbackGenerationError(
          'All metrics must have id, name, and unit',
          'INVALID_METRIC'
        )
      }
    }

    for (const jtbd of context.jtbds) {
      if (!jtbd.id || !jtbd.statement) {
        throw new FallbackGenerationError(
          'All JTBDs must have id and statement',
          'INVALID_JTBD'
        )
      }
    }
  }

  /**
   * Transform context for logging and debugging
   */
  private getContextSummary(context: HMWContext): {
    insights_count: number
    metrics_count: number
    jtbds_count: number
    total_content_length: number
  } {
    const totalContentLength = 
      context.insights.reduce((sum, i) => sum + i.content.length, 0) +
      context.metrics.reduce((sum, m) => sum + (m.name + (m.description || '')).length, 0) +
      context.jtbds.reduce((sum, j) => sum + (j.statement + (j.context || '')).length, 0)

    return {
      insights_count: context.insights.length,
      metrics_count: context.metrics.length,
      jtbds_count: context.jtbds.length,
      total_content_length: totalContentLength
    }
  }
}

// Export singleton instance
export const hmwService = new HMWGenerationService()
export default hmwService
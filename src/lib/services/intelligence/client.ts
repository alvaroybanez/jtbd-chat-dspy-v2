/**
 * DSPy Intelligence Service Client
 * HTTP client for communicating with the Python DSPy service
 */

import { config } from '../../config'
import { logger, startPerformance, endPerformance } from '../../logger'
import type {
  GenerateHMWRequest,
  GenerateHMWResponse
} from './types'
import { DSPyServiceError } from './types'

export interface DSPyClientOptions {
  serviceUrl: string
  apiKey: string
  timeout: number
  maxRetries: number
}

export class DSPyIntelligenceClient {
  private readonly options: DSPyClientOptions
  private readonly headers: Record<string, string>

  constructor(options?: Partial<DSPyClientOptions>) {
    this.options = {
      serviceUrl: config.dspy.serviceUrl,
      apiKey: config.dspy.apiKey,
      timeout: config.dspy.timeout,
      maxRetries: config.dspy.maxRetries,
      ...options
    }

    this.headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.options.apiKey,
      'User-Agent': 'JTBD-Assistant-TypeScript-Client/1.0'
    }
  }

  /**
   * Generate HMW questions using DSPy service
   */
  async generateHMW(request: GenerateHMWRequest): Promise<GenerateHMWResponse> {
    const trackingId = startPerformance('dspy_hmw_generation')

    try {
      const response = await this.makeRequest<GenerateHMWResponse>(
        'POST',
        '/api/intelligence/generate_hmw',
        request
      )

      endPerformance(trackingId, true, {
        hmwCount: response.hmws.length,
        requestedCount: request.count || 5,
        generationMethod: response.meta.generation_method
      })

      logger.info('DSPy HMW generation successful', {
        hmwCount: response.hmws.length,
        requestedCount: request.count || 5,
        duration: response.meta.duration_ms,
        retries: response.meta.retries
      })

      return response

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      logger.error('DSPy HMW generation failed', {
        serviceUrl: this.options.serviceUrl,
        error: error instanceof Error ? error.message : String(error)
      })

      if (error instanceof DSPyServiceError) {
        throw error
      }

      throw new DSPyServiceError(
        'Failed to generate HMW questions via DSPy service',
        'DSPY_GENERATION_FAILED',
        error
      )
    }
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy'
    service: string
    dspy_configured: boolean
    timestamp: string
  }> {
    try {
      const response = await this.makeRequest<{
        status: string
        service: string
        dspy_configured: boolean
        timestamp: string
      }>('GET', '/health')

      return {
        status: response.status === 'ok' ? 'healthy' : 'unhealthy',
        service: response.service,
        dspy_configured: response.dspy_configured,
        timestamp: response.timestamp
      }

    } catch (error) {
      logger.warn('DSPy service health check failed', {
        serviceUrl: this.options.serviceUrl,
        error: error instanceof Error ? error.message : String(error)
      })

      throw new DSPyServiceError(
        'DSPy service health check failed',
        'HEALTH_CHECK_FAILED',
        error
      )
    }
  }

  /**
   * Make HTTP request with timeout and retry logic
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: any
  ): Promise<T> {
    const url = `${this.options.serviceUrl}${endpoint}`
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          let errorData: any = {}
          
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { message: errorText }
          }

          throw new DSPyServiceError(
            errorData.message || `HTTP ${response.status}: ${response.statusText}`,
            this.mapHttpStatusToCode(response.status),
            errorData
          )
        }

        const data = await response.json()
        return data as T

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Handle AbortError (timeout)
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new DSPyServiceError(
            `Request timed out after ${this.options.timeout}ms`,
            'DSPY_TIMEOUT'
          )
        }

        // Handle network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
          lastError = new DSPyServiceError(
            'Failed to connect to DSPy service',
            'DSPY_CONNECTION_FAILED',
            error
          )
        }

        // Don't retry on last attempt
        if (attempt === this.options.maxRetries) {
          break
        }

        // Don't retry certain errors
        if (this.isNonRetryableError(lastError)) {
          break
        }

        // Wait before retrying
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        logger.warn('Retrying DSPy request', {
          attempt: attempt + 1,
          maxRetries: this.options.maxRetries,
          delay,
          error: lastError.message
        })

        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('Unknown error in DSPy request')
  }

  /**
   * Map HTTP status codes to error codes
   */
  private mapHttpStatusToCode(status: number): string {
    switch (status) {
      case 400:
        return 'INVALID_REQUEST'
      case 401:
        return 'UNAUTHORIZED'
      case 403:
        return 'FORBIDDEN'
      case 404:
        return 'ENDPOINT_NOT_FOUND'
      case 422:
        return 'VALIDATION_ERROR'
      case 429:
        return 'RATE_LIMITED'
      case 500:
        return 'INTERNAL_SERVER_ERROR'
      case 502:
      case 503:
      case 504:
        return 'SERVICE_UNAVAILABLE'
      default:
        return 'HTTP_ERROR'
    }
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    if (error instanceof DSPyServiceError) {
      const nonRetryableCodes = [
        'INVALID_REQUEST',
        'UNAUTHORIZED', 
        'FORBIDDEN',
        'VALIDATION_ERROR',
        'ENDPOINT_NOT_FOUND'
      ]
      return nonRetryableCodes.includes(error.code)
    }
    return false
  }

  /**
   * Get client configuration (for debugging)
   */
  getConfig(): Omit<DSPyClientOptions, 'apiKey'> {
    return {
      serviceUrl: this.options.serviceUrl,
      apiKey: '[REDACTED]',
      timeout: this.options.timeout,
      maxRetries: this.options.maxRetries
    }
  }
}

// Export singleton instance
export const dspyClient = new DSPyIntelligenceClient()
export default dspyClient
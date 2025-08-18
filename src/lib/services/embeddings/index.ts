/**
 * OpenAI Embedding Service
 * Provides text embedding generation using OpenAI's text-embedding-3-small model
 * Includes batch processing, caching, retry logic, and cost tracking
 */

import { openai } from '@ai-sdk/openai'
import { embed, embedMany } from 'ai'
import type { EmbeddingModel } from 'ai'
import { config } from '../../config'
import { OPENAI_MODELS, RETRY_CONFIG, TIMEOUTS } from '../../config/constants'
import { EmbeddingError } from '../types'
import { logger, startPerformance, endPerformance } from '../../logger'
import type {
  EmbeddingInput,
  EmbeddingResult,
  BatchEmbeddingOptions,
  EmbeddingCostInfo,
  EmbeddingService
} from '../types'
import {
  DEFAULT_BATCH_OPTIONS,
  EMBEDDING_MODELS
} from '../types'
import { EmbeddingCache } from './cache'
import { BatchProcessor } from './batch'

/**
 * AI SDK V1/V2 compatibility adapter for single embeddings
 * TODO: Remove when AI SDK V2 fully supports embedding models
 */
function createCompatibleModel(model: EmbeddingModel<string>): EmbeddingModel<string> {
  return model
}

/**
 * OpenAI Embedding Service Implementation
 * Handles single and batch embedding generation with comprehensive error handling
 */
class OpenAIEmbeddingService implements EmbeddingService {
  private cache: EmbeddingCache
  private batchProcessor: BatchProcessor
  private model = openai.embedding(config.openai.embeddingModel)
  private readonly maxInputLength = EMBEDDING_MODELS['text-embedding-3-small'].maxTokens
  private readonly costPer1kTokens = EMBEDDING_MODELS['text-embedding-3-small'].costPer1kTokens

  constructor() {
    this.cache = new EmbeddingCache()
    this.batchProcessor = new BatchProcessor(this.cache)
  }

  /**
   * Generate embedding for a single text input
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const trackingId = startPerformance('embedding_generation')

    try {
      // Validate input
      this.validateInput(text)

      // Check cache first
      const cachedEmbedding = await this.cache.get(text)
      if (cachedEmbedding) {
        endPerformance(trackingId, true, { source: 'cache' })
        
        return {
          embedding: cachedEmbedding,
          tokenCount: this.estimateTokenCount(text),
          text,
          metadata: { source: 'cache', model: config.openai.embeddingModel }
        }
      }

      // Generate embedding using AI SDK
      const result = await this.retryWithBackoff(async () => {
        return await embed({
          model: createCompatibleModel(this.model),
          value: text,
        })
      })

      const embeddingResult: EmbeddingResult = {
        embedding: result.embedding,
        tokenCount: result.usage.tokens,
        text,
        metadata: {
          source: 'openai',
          model: config.openai.embeddingModel,
          dimensions: result.embedding.length,
          usage: result.usage
        }
      }

      // Cache the result
      await this.cache.set(text, result.embedding)

      endPerformance(trackingId, true, {
        tokenCount: result.usage.tokens,
        dimensions: result.embedding.length
      })

      logger.info('Embedding generated successfully', {
        textLength: text.length,
        tokenCount: result.usage.tokens,
        dimensions: result.embedding.length,
        model: config.openai.embeddingModel
      })

      return embeddingResult

    } catch (error) {
      endPerformance(trackingId, false, { error: error instanceof Error ? error.message : String(error) })
      
      throw new EmbeddingError(
        'Failed to generate embedding',
        'EMBEDDING_GENERATION_FAILED',
        {
          textLength: text.length,
          model: config.openai.embeddingModel,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Generate embeddings for multiple text inputs with batch processing
   */
  async generateBatchEmbeddings(
    inputs: EmbeddingInput[],
    options: BatchEmbeddingOptions = {}
  ): Promise<EmbeddingResult[]> {
    const mergedOptions = { ...DEFAULT_BATCH_OPTIONS, ...options }
    const trackingId = startPerformance('batch_embedding_generation')

    try {
      // Validate all inputs
      for (const input of inputs) {
        this.validateInput(input.text)
      }

      // Use batch processor for efficient processing
      const results = await this.batchProcessor.processBatch(inputs, mergedOptions)

      endPerformance(trackingId, true, {
        inputCount: inputs.length,
        outputCount: results.length,
        batchSize: mergedOptions.batchSize
      })

      logger.info('Batch embedding generation completed', {
        inputCount: inputs.length,
        outputCount: results.length,
        batchSize: mergedOptions.batchSize,
        cacheHits: results.filter(r => r.metadata?.source === 'cache').length
      })

      return results

    } catch (error) {
      endPerformance(trackingId, false, { 
        error: error instanceof Error ? error.message : String(error),
        inputCount: inputs.length 
      })
      
      throw new EmbeddingError(
        'Failed to generate batch embeddings',
        'BATCH_EMBEDDING_FAILED',
        {
          inputCount: inputs.length,
          batchSize: mergedOptions.batchSize,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Estimate cost for embedding generation
   */
  async estimateCost(texts: string[]): Promise<EmbeddingCostInfo> {
    const totalTokens = texts.reduce((sum, text) => sum + this.estimateTokenCount(text), 0)
    const estimatedCost = (totalTokens / 1000) * this.costPer1kTokens

    return {
      totalTokens,
      estimatedCost,
      modelUsed: config.openai.embeddingModel
    }
  }

  /**
   * Validate input text
   */
  validateInput(text: string): boolean {
    if (!text || typeof text !== 'string') {
      throw new EmbeddingError(
        'Input text must be a non-empty string',
        'INVALID_INPUT_TEXT',
        { input: typeof text }
      )
    }

    if (text.trim().length === 0) {
      throw new EmbeddingError(
        'Input text cannot be empty or whitespace only',
        'EMPTY_INPUT_TEXT',
        { textLength: text.length }
      )
    }

    const estimatedTokens = this.estimateTokenCount(text)
    if (estimatedTokens > this.maxInputLength) {
      throw new EmbeddingError(
        `Input text exceeds maximum token limit of ${this.maxInputLength}`,
        'INPUT_TOO_LONG',
        { 
          estimatedTokens,
          maxTokens: this.maxInputLength,
          textLength: text.length 
        }
      )
    }

    return true
  }

  /**
   * Estimate token count for text (rough approximation)
   * More accurate token counting would require the actual tokenizer
   */
  private estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    // This is a conservative estimate; actual tokenization may vary
    return Math.ceil(text.length / 4)
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = RETRY_CONFIG.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add timeout to the operation
        const result = await Promise.race([
          operation(),
          this.createTimeoutPromise(TIMEOUTS.OPENAI_API)
        ])
        
        return result

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break
        }

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          break
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt),
          RETRY_CONFIG.MAX_DELAY
        )
        const jitter = delay * RETRY_CONFIG.JITTER_FACTOR * Math.random()
        
        logger.warn('Retrying embedding operation', {
          attempt: attempt + 1,
          maxRetries,
          delay: delay + jitter,
          error: lastError.message
        })

        await new Promise(resolve => setTimeout(resolve, delay + jitter))
      }
    }

    throw lastError || new Error('Unknown error in retry operation')
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    
    // Don't retry validation errors, auth errors, or quota exceeded
    return (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('quota') ||
      message.includes('billing')
    )
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    lastCheck: Date
    cacheSize: number
    details?: Record<string, unknown>
  }> {
    try {
      // Test with a simple embedding
      const testText = 'health check'
      const start = Date.now()
      
      await this.generateEmbedding(testText)
      
      const responseTime = Date.now() - start
      const cacheSize = await this.cache.size()

      return {
        status: responseTime < 5000 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        cacheSize,
        details: {
          responseTime,
          model: config.openai.embeddingModel,
          maxInputLength: this.maxInputLength
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        cacheSize: await this.cache.size(),
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear()
    logger.info('Embedding cache cleared')
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    size: number
    hitRate?: number
    totalRequests?: number
  }> {
    return {
      size: await this.cache.size()
    }
  }
}

// Create and export singleton instance
const embeddingService = new OpenAIEmbeddingService()

export { embeddingService as default, OpenAIEmbeddingService }
export type { EmbeddingInput, EmbeddingResult, BatchEmbeddingOptions, EmbeddingCostInfo }
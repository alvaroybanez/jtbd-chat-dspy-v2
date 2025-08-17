/**
 * Batch Processing for Embeddings
 * Handles efficient batch generation of embeddings with automatic chunking,
 * cache integration, and parallel processing
 */

import { openai } from '@ai-sdk/openai'
import { embedMany } from 'ai'
import { config } from '../../config'
import { RETRY_CONFIG, TIMEOUTS } from '../../config/constants'
import { EmbeddingError } from '../types'
import { logger, startPerformance, endPerformance } from '../../logger'
import type {
  EmbeddingInput,
  EmbeddingResult,
  BatchEmbeddingOptions,
  EmbeddingCostInfo
} from '../types'
import { DEFAULT_BATCH_OPTIONS } from '../types'
import type { EmbeddingCache } from './cache'

interface BatchMetrics {
  totalInputs: number
  cacheHits: number
  apiCalls: number
  totalTokens: number
  estimatedCost: number
  processingTime: number
}

/**
 * Batch processor for efficient embedding generation
 */
export class BatchProcessor {
  private model = openai.embedding(config.openai.embeddingModel)
  private readonly costPer1kTokens = 0.00002 // text-embedding-3-small cost

  constructor(private cache: EmbeddingCache) {}

  /**
   * Process a batch of embedding inputs with cache integration
   */
  async processBatch(
    inputs: EmbeddingInput[],
    options: BatchEmbeddingOptions
  ): Promise<EmbeddingResult[]> {
    const trackingId = startPerformance('batch_processing')
    const startTime = Date.now()

    const metrics: BatchMetrics = {
      totalInputs: inputs.length,
      cacheHits: 0,
      apiCalls: 0,
      totalTokens: 0,
      estimatedCost: 0,
      processingTime: 0
    }

    try {
      // Step 1: Check cache for existing embeddings
      const { cached, uncached } = await this.separateCachedInputs(inputs)
      metrics.cacheHits = cached.length

      logger.info('Batch processing started', {
        totalInputs: inputs.length,
        cacheHits: cached.length,
        uncachedInputs: uncached.length,
        batchSize: options.batchSize
      })

      // Step 2: Process uncached inputs in batches
      const freshResults = uncached.length > 0 
        ? await this.processUncachedBatches(uncached, options, metrics)
        : []

      // Step 3: Combine cached and fresh results, maintaining original order
      const allResults = this.combineResults(inputs, cached, freshResults)

      // Step 4: Update metrics
      metrics.processingTime = Date.now() - startTime
      metrics.estimatedCost = (metrics.totalTokens / 1000) * this.costPer1kTokens

      endPerformance(trackingId, true, {
        totalInputs: metrics.totalInputs,
        cacheHits: metrics.cacheHits,
        apiCalls: metrics.apiCalls,
        totalTokens: metrics.totalTokens,
        estimatedCost: metrics.estimatedCost
      })

      logger.info('Batch processing completed', metrics)

      return allResults

    } catch (error) {
      metrics.processingTime = Date.now() - startTime
      
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        ...metrics
      })

      throw new EmbeddingError(
        'Batch processing failed',
        'BATCH_PROCESSING_FAILED',
        {
          ...metrics,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Separate inputs into cached and uncached groups
   */
  private async separateCachedInputs(
    inputs: EmbeddingInput[]
  ): Promise<{
    cached: EmbeddingResult[]
    uncached: EmbeddingInput[]
  }> {
    const cached: EmbeddingResult[] = []
    const uncached: EmbeddingInput[] = []

    await Promise.all(
      inputs.map(async (input) => {
        const cachedEmbedding = await this.cache.get(input.text)
        
        if (cachedEmbedding) {
          cached.push({
            id: input.id,
            embedding: cachedEmbedding,
            tokenCount: this.estimateTokenCount(input.text),
            text: input.text,
            metadata: {
              ...input.metadata,
              source: 'cache',
              model: config.openai.embeddingModel
            }
          })
        } else {
          uncached.push(input)
        }
      })
    )

    return { cached, uncached }
  }

  /**
   * Process uncached inputs in optimized batches
   */
  private async processUncachedBatches(
    uncached: EmbeddingInput[],
    options: BatchEmbeddingOptions,
    metrics: BatchMetrics
  ): Promise<EmbeddingResult[]> {
    const batches = this.createBatches(uncached, options.batchSize!)
    const results: EmbeddingResult[] = []

    // Process batches with controlled concurrency
    const concurrency = Math.min(3, batches.length) // Max 3 concurrent batches
    const batchPromises: Promise<EmbeddingResult[]>[] = []

    for (let i = 0; i < batches.length; i += concurrency) {
      const batchGroup = batches.slice(i, i + concurrency)
      
      const groupPromises = batchGroup.map((batch, index) => 
        this.processSingleBatch(batch, i + index, options, metrics)
      )

      const groupResults = await Promise.all(groupPromises)
      results.push(...groupResults.flat())
    }

    return results
  }

  /**
   * Process a single batch of embeddings
   */
  private async processSingleBatch(
    batch: EmbeddingInput[],
    batchIndex: number,
    options: BatchEmbeddingOptions,
    metrics: BatchMetrics
  ): Promise<EmbeddingResult[]> {
    const batchTrackingId = startPerformance(`batch_${batchIndex}`)

    try {
      const texts = batch.map(input => input.text)
      
      // Generate embeddings using AI SDK
      const result = await this.retryWithBackoff(async () => {
        return await embedMany({
          model: this.model,
          values: texts,
        })
      }, options.retries!)

      // Update metrics
      metrics.apiCalls++
      metrics.totalTokens += result.usage.tokens

      // Create results and cache embeddings
      const batchResults: EmbeddingResult[] = []
      
      for (let i = 0; i < batch.length; i++) {
        const input = batch[i]
        const embedding = result.embeddings[i]

        const embeddingResult: EmbeddingResult = {
          id: input.id,
          embedding,
          tokenCount: Math.round(result.usage.tokens / batch.length), // Estimate per item
          text: input.text,
          metadata: {
            ...input.metadata,
            source: 'openai',
            model: config.openai.embeddingModel,
            dimensions: embedding.length,
            batchIndex,
            batchSize: batch.length
          }
        }

        batchResults.push(embeddingResult)

        // Cache the embedding
        await this.cache.set(input.text, embedding)
      }

      endPerformance(batchTrackingId, true, {
        batchSize: batch.length,
        totalTokens: result.usage.tokens,
        avgTokensPerItem: Math.round(result.usage.tokens / batch.length)
      })

      logger.debug('Batch processed successfully', {
        batchIndex,
        batchSize: batch.length,
        totalTokens: result.usage.tokens,
        dimensions: result.embeddings[0].length
      })

      return batchResults

    } catch (error) {
      endPerformance(batchTrackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        batchIndex,
        batchSize: batch.length
      })

      throw new EmbeddingError(
        `Batch ${batchIndex} processing failed`,
        'SINGLE_BATCH_FAILED',
        {
          batchIndex,
          batchSize: batch.length,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Create optimized batches from inputs
   */
  private createBatches(inputs: EmbeddingInput[], batchSize: number): EmbeddingInput[][] {
    const batches: EmbeddingInput[][] = []
    
    for (let i = 0; i < inputs.length; i += batchSize) {
      batches.push(inputs.slice(i, i + batchSize))
    }

    return batches
  }

  /**
   * Combine cached and fresh results in original input order
   */
  private combineResults(
    originalInputs: EmbeddingInput[],
    cachedResults: EmbeddingResult[],
    freshResults: EmbeddingResult[]
  ): EmbeddingResult[] {
    // Create lookup maps
    const cachedMap = new Map<string, EmbeddingResult>()
    const freshMap = new Map<string, EmbeddingResult>()

    for (const result of cachedResults) {
      cachedMap.set(result.text, result)
    }

    for (const result of freshResults) {
      freshMap.set(result.text, result)
    }

    // Rebuild results in original order
    return originalInputs.map((input) => {
      const cached = cachedMap.get(input.text)
      if (cached) return cached

      const fresh = freshMap.get(input.text)
      if (fresh) return fresh

      throw new EmbeddingError(
        'Result not found for input',
        'RESULT_NOT_FOUND',
        { inputText: input.text }
      )
    })
  }

  /**
   * Estimate token count for text
   */
  private estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4)
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number
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
        
        logger.warn('Retrying batch operation', {
          attempt: attempt + 1,
          maxRetries,
          delay: delay + jitter,
          error: lastError.message
        })

        await new Promise(resolve => setTimeout(resolve, delay + jitter))
      }
    }

    throw lastError || new Error('Unknown error in batch retry operation')
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    
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
        reject(new Error(`Batch operation timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
  }

  /**
   * Estimate cost for batch processing
   */
  async estimateBatchCost(inputs: EmbeddingInput[]): Promise<EmbeddingCostInfo> {
    const totalTokens = inputs.reduce((sum, input) => 
      sum + this.estimateTokenCount(input.text), 0
    )
    
    const estimatedCost = (totalTokens / 1000) * this.costPer1kTokens

    return {
      totalTokens,
      estimatedCost,
      modelUsed: config.openai.embeddingModel
    }
  }

  /**
   * Get optimal batch size based on input characteristics
   */
  getOptimalBatchSize(inputs: EmbeddingInput[]): number {
    if (inputs.length === 0) return DEFAULT_BATCH_OPTIONS.batchSize!

    // Calculate average text length
    const avgLength = inputs.reduce((sum, input) => sum + input.text.length, 0) / inputs.length
    
    // Adjust batch size based on text length
    if (avgLength > 2000) {
      return Math.min(50, DEFAULT_BATCH_OPTIONS.batchSize!) // Smaller batches for long texts
    } else if (avgLength < 500) {
      return Math.min(200, inputs.length) // Larger batches for short texts
    } else {
      return Math.min(DEFAULT_BATCH_OPTIONS.batchSize!, inputs.length)
    }
  }
}
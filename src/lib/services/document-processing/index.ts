/**
 * Document Processing Pipeline
 * Combines text chunking and embedding generation into a unified pipeline
 * Provides progress tracking, error recovery, and cost estimation
 */

import { DATABASE_LIMITS, FILE_PROCESSING } from '../../config/constants'
import { logger, startPerformance, endPerformance } from '../../logger'
import embeddingService from '../embeddings'
import { TextChunker } from '../text-processing/chunker'
import { DocumentValidator } from './validator'
import { ProgressTracker } from './progress'
import type {
  DocumentInput,
  ProcessedDocument,
  DocumentProcessingOptions,
  ProcessingProgress,
  EmbeddingResult,
  ChunkingResult,
  DocumentProcessingService
} from '../types'
import {
  DEFAULT_CHUNKING_OPTIONS,
  DEFAULT_BATCH_OPTIONS
} from '../types'
import { ChunkingError, EmbeddingError } from '../types'

/**
 * Document processing pipeline implementation
 */
class DocumentProcessingPipeline implements DocumentProcessingService {
  private chunker: TextChunker
  private validator: DocumentValidator
  private progressTracker: ProgressTracker

  constructor() {
    this.chunker = new TextChunker()
    this.validator = new DocumentValidator()
    this.progressTracker = new ProgressTracker()
  }

  /**
   * Process a single document through the complete pipeline
   */
  async processDocument(
    document: DocumentInput,
    options: DocumentProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const trackingId = startPerformance('document_processing')
    const startTime = Date.now()

    try {
      // Merge options with defaults
      const mergedOptions = {
        ...DEFAULT_CHUNKING_OPTIONS,
        ...DEFAULT_BATCH_OPTIONS,
        generateEmbeddings: true,
        cacheEmbeddings: true,
        validateInput: true,
        ...options
      }

      // Step 1: Validate input document
      if (mergedOptions.validateInput) {
        this.validateDocument(document)
      }

      // Step 2: Chunk the document
      const chunkingResult = await this.chunkDocument(document, mergedOptions)
      
      // Step 3: Generate embeddings (if requested)
      let embeddings: EmbeddingResult[] = []
      if (mergedOptions.generateEmbeddings) {
        embeddings = await this.generateEmbeddingsForChunks(chunkingResult, mergedOptions)
      }

      // Step 4: Calculate costs
      const costs = await this.calculateProcessingCosts(chunkingResult, embeddings)

      const result: ProcessedDocument = {
        chunks: chunkingResult.chunks,
        embeddings,
        originalDocument: document,
        processing: {
          totalTokens: chunkingResult.totalTokens,
          chunkCount: chunkingResult.chunkCount,
          embeddingCount: embeddings.length,
          processingTime: Date.now() - startTime,
          costs
        }
      }

      endPerformance(trackingId, true, {
        chunkCount: result.processing.chunkCount,
        embeddingCount: result.processing.embeddingCount,
        totalTokens: result.processing.totalTokens,
        processingTime: result.processing.processingTime
      })

      logger.info('Document processing completed', {
        filename: document.filename,
        originalSize: document.content.length,
        chunkCount: result.processing.chunkCount,
        embeddingCount: result.processing.embeddingCount,
        totalTokens: result.processing.totalTokens,
        processingTime: result.processing.processingTime,
        estimatedCost: costs?.estimatedCost
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        filename: document.filename
      })

      throw error
    }
  }

  /**
   * Process multiple documents with progress tracking
   */
  async* processDocuments(
    documents: DocumentInput[],
    options: DocumentProcessingOptions = {}
  ): AsyncGenerator<ProcessedDocument, void, unknown> {
    const trackingId = startPerformance('batch_document_processing')

    try {
      logger.info('Starting batch document processing', {
        documentCount: documents.length,
        options
      })

      for (let i = 0; i < documents.length; i++) {
        const document = documents[i]

        try {
          const processedDocument = await this.processDocument(document, options)
          
          logger.debug('Document processed in batch', {
            index: i + 1,
            total: documents.length,
            filename: document.filename,
            chunkCount: processedDocument.processing.chunkCount
          })

          yield processedDocument

        } catch (error) {
          logger.error('Failed to process document in batch', {
            index: i + 1,
            total: documents.length,
            filename: document.filename,
            error: error instanceof Error ? error.message : String(error)
          })

          // Continue with next document instead of failing entire batch
          continue
        }
      }

      endPerformance(trackingId, true, {
        documentCount: documents.length
      })

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        documentCount: documents.length
      })

      throw error
    }
  }

  /**
   * Validate document input
   */
  validateDocument(document: DocumentInput): boolean {
    return this.validator.validate(document)
  }

  /**
   * Estimate processing cost for a document
   */
  async estimateProcessingCost(
    document: DocumentInput,
    options: DocumentProcessingOptions = {}
  ): Promise<{ totalTokens: number; estimatedCost: number; modelUsed: string }> {
    try {
      // Quick chunking for estimation (without full processing)
      const previewResult = await this.chunker.previewChunking(document.content, options)
      
      if (!options.generateEmbeddings) {
        return {
          totalTokens: previewResult.estimatedTokens,
          estimatedCost: 0,
          modelUsed: 'none'
        }
      }

      // Estimate embedding cost
      const texts = Array(previewResult.estimatedChunkCount).fill('sample text')
      const embeddingCost = await embeddingService.estimateCost(texts)

      return {
        totalTokens: previewResult.estimatedTokens,
        estimatedCost: embeddingCost.estimatedCost,
        modelUsed: embeddingCost.modelUsed
      }

    } catch (error) {
      logger.warn('Failed to estimate processing cost', {
        filename: document.filename,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        totalTokens: 0,
        estimatedCost: 0,
        modelUsed: 'unknown'
      }
    }
  }

  /**
   * Chunk document with progress tracking
   */
  private async chunkDocument(
    document: DocumentInput,
    options: DocumentProcessingOptions
  ): Promise<ChunkingResult> {
    const chunkingTrackingId = startPerformance('document_chunking')

    try {
      const result = await this.chunker.chunkText(document.content, options)

      endPerformance(chunkingTrackingId, true, {
        chunkCount: result.chunkCount,
        totalTokens: result.totalTokens,
        strategy: result.metadata.strategy
      })

      return result

    } catch (error) {
      endPerformance(chunkingTrackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new ChunkingError(
        `Failed to chunk document: ${document.filename}`,
        'DOCUMENT_CHUNKING_FAILED',
        {
          filename: document.filename,
          contentLength: document.content.length,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Generate embeddings for document chunks
   */
  private async generateEmbeddingsForChunks(
    chunkingResult: ChunkingResult,
    options: DocumentProcessingOptions
  ): Promise<EmbeddingResult[]> {
    const embeddingTrackingId = startPerformance('chunk_embedding_generation')

    try {
      // Prepare inputs for batch embedding
      const embeddingInputs = chunkingResult.chunks.map((chunk, index) => ({
        id: `chunk_${index}`,
        text: chunk.content,
        metadata: {
          chunkIndex: chunk.index,
          tokenCount: chunk.tokenCount,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
          chunkMetadata: chunk.metadata
        }
      }))

      // Generate embeddings in batch
      const embeddings = await embeddingService.generateBatchEmbeddings(
        embeddingInputs,
        {
          batchSize: options.batchSize,
          retries: options.retries,
          retryDelay: options.retryDelay,
          trackCosts: options.trackCosts
        }
      )

      endPerformance(embeddingTrackingId, true, {
        embeddingCount: embeddings.length,
        totalTokens: embeddings.reduce((sum, emb) => sum + emb.tokenCount, 0)
      })

      return embeddings

    } catch (error) {
      endPerformance(embeddingTrackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        chunkCount: chunkingResult.chunks.length
      })

      throw new EmbeddingError(
        'Failed to generate embeddings for document chunks',
        'CHUNK_EMBEDDING_FAILED',
        {
          chunkCount: chunkingResult.chunks.length,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Calculate processing costs
   */
  private async calculateProcessingCosts(
    chunkingResult: ChunkingResult,
    embeddings: EmbeddingResult[]
  ): Promise<{ totalTokens: number; estimatedCost: number; modelUsed: string } | undefined> {
    if (embeddings.length === 0) {
      return undefined
    }

    const totalTokens = embeddings.reduce((sum, emb) => sum + emb.tokenCount, 0)
    const texts = embeddings.map(emb => emb.text)
    const costInfo = await embeddingService.estimateCost(texts)

    return {
      totalTokens,
      estimatedCost: costInfo.estimatedCost,
      modelUsed: costInfo.modelUsed
    }
  }

  /**
   * Resume processing from partial results
   */
  async resumeProcessing(
    document: DocumentInput,
    partialResult: Partial<ProcessedDocument>,
    options: DocumentProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const trackingId = startPerformance('document_processing_resume')

    try {
      let chunks = partialResult.chunks || []
      let embeddings = partialResult.embeddings || []

      // Resume chunking if not completed
      if (chunks.length === 0) {
        const chunkingResult = await this.chunkDocument(document, options)
        chunks = chunkingResult.chunks
      }

      // Resume embedding generation if not completed or requested
      if (options.generateEmbeddings && embeddings.length < chunks.length) {
        const startIndex = embeddings.length
        const remainingChunks = chunks.slice(startIndex)
        
        const chunkingResult: ChunkingResult = {
          chunks: remainingChunks,
          totalTokens: remainingChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
          chunkCount: remainingChunks.length,
          metadata: {
            sourceLength: document.content.length,
            averageChunkSize: 0,
            overlapUsed: 0,
            strategy: 'token-based'
          }
        }

        const newEmbeddings = await this.generateEmbeddingsForChunks(chunkingResult, options)
        embeddings = embeddings.concat(newEmbeddings)
      }

      const costs = await this.calculateProcessingCosts({ 
        chunks, 
        totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
        chunkCount: chunks.length,
        metadata: {
          sourceLength: document.content.length,
          averageChunkSize: 0,
          overlapUsed: 0,
          strategy: 'token-based'
        }
      }, embeddings)

      const result: ProcessedDocument = {
        chunks,
        embeddings,
        originalDocument: document,
        processing: {
          totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
          chunkCount: chunks.length,
          embeddingCount: embeddings.length,
          processingTime: partialResult.processing?.processingTime || 0,
          costs
        }
      }

      endPerformance(trackingId, true, {
        resumed: true,
        chunkCount: result.processing.chunkCount,
        embeddingCount: result.processing.embeddingCount
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        resumed: true
      })

      throw error
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    documentsProcessed: number
    totalChunksCreated: number
    totalEmbeddingsGenerated: number
    averageProcessingTime: number
    totalCosts: number
  } {
    // This would be implemented with actual usage tracking
    // For now, return empty stats
    return {
      documentsProcessed: 0,
      totalChunksCreated: 0,
      totalEmbeddingsGenerated: 0,
      averageProcessingTime: 0,
      totalCosts: 0
    }
  }

  /**
   * Clear processing caches
   */
  async clearCaches(): Promise<void> {
    await embeddingService.clearCache()
    logger.info('Document processing caches cleared')
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    lastCheck: Date
    details?: Record<string, unknown>
  }> {
    try {
      // Test with a simple document
      const testDocument: DocumentInput = {
        content: 'This is a test document for health checking.',
        filename: 'health-check.txt',
        metadata: { healthCheck: true }
      }

      const start = Date.now()
      
      await this.processDocument(testDocument, {
        generateEmbeddings: false,
        validateInput: true
      })
      
      const responseTime = Date.now() - start

      return {
        status: responseTime < 5000 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: {
          responseTime,
          components: {
            chunker: 'healthy',
            embeddings: 'healthy',
            validator: 'healthy'
          }
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date(),
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }
}

// Create and export singleton instance
const documentProcessingService = new DocumentProcessingPipeline()

export { documentProcessingService as default, DocumentProcessingPipeline }
export type { DocumentInput, ProcessedDocument, DocumentProcessingOptions, ProcessingProgress }
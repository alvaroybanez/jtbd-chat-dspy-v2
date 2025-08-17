/**
 * Text Chunking Service
 * Intelligent text splitting with configurable strategies and smart boundary detection
 * Optimized for semantic coherence and embedding generation
 */

import { DATABASE_LIMITS } from '../../config/constants'
import { ChunkingError } from '../types'
import { logger, startPerformance, endPerformance } from '../../logger'
import type {
  TextChunk,
  ChunkingOptions,
  ChunkingResult,
  ChunkingStrategy,
  TextChunkingService
} from '../types'
import { DEFAULT_CHUNKING_OPTIONS } from '../types'
import { TokenCounter } from './tokenizer'
import { ChunkingStrategies } from './strategies'

/**
 * Text Chunker with multiple strategies and smart boundary detection
 */
export class TextChunker implements TextChunkingService {
  private tokenCounter: TokenCounter
  private strategies: ChunkingStrategies

  constructor() {
    this.tokenCounter = new TokenCounter()
    this.strategies = new ChunkingStrategies(this.tokenCounter)
  }

  /**
   * Chunk text using specified strategy with smart boundary detection
   */
  async chunkText(text: string, options: ChunkingOptions = {}): Promise<ChunkingResult> {
    const trackingId = startPerformance('text_chunking')
    const mergedOptions = { ...DEFAULT_CHUNKING_OPTIONS, ...options }

    try {
      // Validate input
      this.validateInput(text, mergedOptions)

      // Normalize text (remove excessive whitespace, normalize line endings)
      const normalizedText = this.normalizeText(text)

      // Apply chunking strategy
      const chunks = await this.applyChunkingStrategy(normalizedText, mergedOptions)

      // Validate chunks
      this.validateChunks(chunks)

      // Calculate metadata
      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)
      const averageChunkSize = chunks.length > 0 ? totalTokens / chunks.length : 0
      const overlapUsed = this.calculateActualOverlap(chunks, mergedOptions.overlapPercentage!)

      const result: ChunkingResult = {
        chunks,
        totalTokens,
        chunkCount: chunks.length,
        metadata: {
          sourceLength: text.length,
          averageChunkSize,
          overlapUsed,
          strategy: mergedOptions.strategy!
        }
      }

      endPerformance(trackingId, true, {
        chunkCount: chunks.length,
        totalTokens,
        averageChunkSize,
        strategy: mergedOptions.strategy
      })

      logger.info('Text chunking completed', {
        sourceLength: text.length,
        chunkCount: chunks.length,
        totalTokens,
        averageChunkSize: Math.round(averageChunkSize),
        strategy: mergedOptions.strategy
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        strategy: mergedOptions.strategy
      })

      throw new ChunkingError(
        'Text chunking failed',
        'CHUNKING_FAILED',
        {
          textLength: text.length,
          strategy: mergedOptions.strategy,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Validate chunks for consistency and requirements
   */
  validateChunks(chunks: TextChunk[]): boolean {
    if (chunks.length === 0) {
      throw new ChunkingError(
        'No chunks generated from input text',
        'NO_CHUNKS_GENERATED'
      )
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      // Validate chunk structure
      if (!chunk.content || typeof chunk.content !== 'string') {
        throw new ChunkingError(
          `Chunk ${i} has invalid content`,
          'INVALID_CHUNK_CONTENT',
          { chunkIndex: i }
        )
      }

      // Validate token count
      if (chunk.tokenCount <= 0 || chunk.tokenCount > DATABASE_LIMITS.MAX_CHUNK_TOKENS) {
        throw new ChunkingError(
          `Chunk ${i} has invalid token count: ${chunk.tokenCount}`,
          'INVALID_TOKEN_COUNT',
          { chunkIndex: i, tokenCount: chunk.tokenCount }
        )
      }

      // Validate index sequence
      if (chunk.index !== i) {
        throw new ChunkingError(
          `Chunk ${i} has incorrect index: ${chunk.index}`,
          'INVALID_CHUNK_INDEX',
          { chunkIndex: i, expectedIndex: i, actualIndex: chunk.index }
        )
      }

      // Validate position markers
      if (chunk.startIndex < 0 || chunk.endIndex <= chunk.startIndex) {
        throw new ChunkingError(
          `Chunk ${i} has invalid position markers`,
          'INVALID_POSITION_MARKERS',
          { chunkIndex: i, startIndex: chunk.startIndex, endIndex: chunk.endIndex }
        )
      }
    }

    return true
  }

  /**
   * Optimize chunks to target token count
   */
  async optimizeChunks(chunks: TextChunk[], targetTokens: number): Promise<TextChunk[]> {
    const trackingId = startPerformance('chunk_optimization')

    try {
      const optimized: TextChunk[] = []
      let currentIndex = 0

      for (const chunk of chunks) {
        if (chunk.tokenCount <= targetTokens) {
          // Chunk is within target, keep as-is
          optimized.push({
            ...chunk,
            index: currentIndex++
          })
        } else {
          // Chunk is too large, split it further
          const subChunks = await this.splitLargeChunk(chunk, targetTokens)
          for (const subChunk of subChunks) {
            optimized.push({
              ...subChunk,
              index: currentIndex++
            })
          }
        }
      }

      endPerformance(trackingId, true, {
        originalChunkCount: chunks.length,
        optimizedChunkCount: optimized.length,
        targetTokens
      })

      logger.debug('Chunks optimized', {
        originalCount: chunks.length,
        optimizedCount: optimized.length,
        targetTokens
      })

      return optimized

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new ChunkingError(
        'Chunk optimization failed',
        'OPTIMIZATION_FAILED',
        {
          originalChunkCount: chunks.length,
          targetTokens,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Merge small chunks to meet minimum token requirements
   */
  mergeSmallChunks(chunks: TextChunk[], minTokens: number): TextChunk[] {
    const merged: TextChunk[] = []
    let currentChunk: TextChunk | null = null

    for (const chunk of chunks) {
      if (!currentChunk) {
        currentChunk = { ...chunk }
      } else if (currentChunk.tokenCount + chunk.tokenCount <= DATABASE_LIMITS.MAX_CHUNK_TOKENS) {
        // Merge with current chunk
        const mergedContent = currentChunk.content + '\n\n' + chunk.content
        const mergedTokenCount = this.tokenCounter.count(mergedContent)

        currentChunk = {
          content: mergedContent,
          index: currentChunk.index,
          tokenCount: mergedTokenCount,
          startIndex: currentChunk.startIndex,
          endIndex: chunk.endIndex,
          metadata: {
            ...currentChunk.metadata,
            merged: true,
            originalChunkCount: (currentChunk.metadata?.originalChunkCount || 1) + 1
          }
        }
      } else {
        // Current chunk is complete, start new one
        if (currentChunk.tokenCount >= minTokens) {
          merged.push(currentChunk)
        }
        currentChunk = { ...chunk }
      }
    }

    // Add final chunk if it exists
    if (currentChunk && currentChunk.tokenCount >= minTokens) {
      merged.push(currentChunk)
    }

    // Reindex merged chunks
    return merged.map((chunk, index) => ({
      ...chunk,
      index
    }))
  }

  /**
   * Validate input text and options
   */
  private validateInput(text: string, options: ChunkingOptions): void {
    if (!text || typeof text !== 'string') {
      throw new ChunkingError(
        'Input text must be a non-empty string',
        'INVALID_INPUT_TEXT'
      )
    }

    if (text.trim().length === 0) {
      throw new ChunkingError(
        'Input text cannot be empty or whitespace only',
        'EMPTY_INPUT_TEXT'
      )
    }

    if (options.maxTokens! <= 0 || options.maxTokens! > DATABASE_LIMITS.MAX_CHUNK_TOKENS) {
      throw new ChunkingError(
        `Invalid maxTokens: ${options.maxTokens}. Must be between 1 and ${DATABASE_LIMITS.MAX_CHUNK_TOKENS}`,
        'INVALID_MAX_TOKENS',
        { maxTokens: options.maxTokens }
      )
    }

    if (options.minTokens! < 0 || options.minTokens! >= options.maxTokens!) {
      throw new ChunkingError(
        `Invalid minTokens: ${options.minTokens}. Must be between 0 and ${options.maxTokens}`,
        'INVALID_MIN_TOKENS',
        { minTokens: options.minTokens, maxTokens: options.maxTokens }
      )
    }

    if (options.overlapPercentage! < 0 || options.overlapPercentage! >= 1) {
      throw new ChunkingError(
        `Invalid overlapPercentage: ${options.overlapPercentage}. Must be between 0 and 1`,
        'INVALID_OVERLAP_PERCENTAGE',
        { overlapPercentage: options.overlapPercentage }
      )
    }
  }

  /**
   * Normalize text for consistent processing
   */
  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')   // Handle old Mac line endings
      .replace(/\n{3,}/g, '\n\n') // Reduce excessive line breaks
      .replace(/[ \t]+/g, ' ')     // Normalize whitespace
      .trim()
  }

  /**
   * Apply the specified chunking strategy
   */
  private async applyChunkingStrategy(
    text: string,
    options: ChunkingOptions
  ): Promise<TextChunk[]> {
    switch (options.strategy) {
      case 'sentence-based':
        return this.strategies.sentenceBased(text, options)
      
      case 'paragraph-based':
        return this.strategies.paragraphBased(text, options)
      
      case 'section-based':
        return this.strategies.sectionBased(text, options)
      
      case 'token-based':
      default:
        return this.strategies.tokenBased(text, options)
    }
  }

  /**
   * Split a large chunk into smaller chunks
   */
  private async splitLargeChunk(chunk: TextChunk, targetTokens: number): Promise<TextChunk[]> {
    // Use sentence-based splitting for more coherent results
    const options: ChunkingOptions = {
      maxTokens: targetTokens,
      minTokens: Math.floor(targetTokens * 0.5),
      overlapPercentage: 0.1,
      preserveSentences: true,
      strategy: 'sentence-based'
    }

    const result = await this.chunkText(chunk.content, options)
    
    // Update positions and metadata for sub-chunks
    return result.chunks.map((subChunk, index) => ({
      ...subChunk,
      metadata: {
        ...subChunk.metadata,
        parentChunk: chunk.index,
        subChunkIndex: index,
        splitReason: 'size_optimization'
      }
    }))
  }

  /**
   * Calculate actual overlap percentage used
   */
  private calculateActualOverlap(chunks: TextChunk[], targetOverlap: number): number {
    if (chunks.length <= 1) return 0

    let totalOverlap = 0
    let overlapPairs = 0

    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i]
      const nextChunk = chunks[i + 1]

      // Check if chunks have overlapping positions
      if (nextChunk.startIndex < currentChunk.endIndex) {
        const overlapSize = currentChunk.endIndex - nextChunk.startIndex
        const overlapPercentage = overlapSize / (currentChunk.endIndex - currentChunk.startIndex)
        totalOverlap += overlapPercentage
        overlapPairs++
      }
    }

    return overlapPairs > 0 ? totalOverlap / overlapPairs : 0
  }

  /**
   * Get chunking statistics
   */
  getStats(): {
    totalChunksCreated: number
    averageChunkSize: number
    strategiesUsed: Record<ChunkingStrategy, number>
  } {
    // This would be implemented with actual usage tracking
    // For now, return empty stats
    return {
      totalChunksCreated: 0,
      averageChunkSize: 0,
      strategiesUsed: {
        'token-based': 0,
        'sentence-based': 0,
        'paragraph-based': 0,
        'section-based': 0
      }
    }
  }

  /**
   * Preview chunking results without full processing
   */
  async previewChunking(
    text: string,
    options: ChunkingOptions = {}
  ): Promise<{
    estimatedChunkCount: number
    estimatedTokens: number
    strategy: ChunkingStrategy
    previewChunks: Array<{ content: string; estimatedTokens: number }>
  }> {
    const mergedOptions = { ...DEFAULT_CHUNKING_OPTIONS, ...options }
    const normalizedText = this.normalizeText(text)
    
    // Quick estimation without full processing
    const totalTokens = this.tokenCounter.count(normalizedText)
    const estimatedChunkCount = Math.ceil(totalTokens / mergedOptions.maxTokens!)
    
    // Create preview chunks (first 3 chunks)
    const previewLimit = Math.min(3, estimatedChunkCount)
    const previewChunks: Array<{ content: string; estimatedTokens: number }> = []
    
    const avgChunkSize = Math.floor(normalizedText.length / estimatedChunkCount)
    
    for (let i = 0; i < previewLimit; i++) {
      const start = i * avgChunkSize
      const end = Math.min((i + 1) * avgChunkSize, normalizedText.length)
      const content = normalizedText.slice(start, end)
      
      previewChunks.push({
        content: content.slice(0, 200) + (content.length > 200 ? '...' : ''),
        estimatedTokens: this.tokenCounter.count(content)
      })
    }

    return {
      estimatedChunkCount,
      estimatedTokens: totalTokens,
      strategy: mergedOptions.strategy!,
      previewChunks
    }
  }
}
/**
 * Token Counter Service
 * Provides accurate token counting for text using approximation algorithms
 * Optimized for OpenAI's tokenization patterns
 */

import type { TokenInfo } from '../types'
import { logger } from '../../logger'

/**
 * Token counter with multiple estimation methods
 */
export class TokenCounter {
  private readonly modelName: string = 'text-embedding-3-small'
  
  // Token counting cache for performance
  private cache = new Map<string, number>()
  private readonly maxCacheSize = 1000

  constructor() {
    // Clear cache periodically to prevent memory leaks
    setInterval(() => this.cleanupCache(), 60 * 60 * 1000) // Every hour
  }

  /**
   * Count tokens in text using estimation algorithm
   */
  count(text: string): number {
    if (!text || typeof text !== 'string') {
      return 0
    }

    // Check cache first
    const cacheKey = this.createCacheKey(text)
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    // Calculate token count
    const tokenCount = this.estimateTokens(text)
    
    // Cache result if cache isn't full
    if (this.cache.size < this.maxCacheSize) {
      this.cache.set(cacheKey, tokenCount)
    }

    return tokenCount
  }

  /**
   * Get detailed token information
   */
  getTokenInfo(text: string): TokenInfo {
    return {
      count: this.count(text),
      model: this.modelName,
      encoding: 'cl100k_base' // OpenAI's encoding for newer models
    }
  }

  /**
   * Estimate tokens for multiple texts
   */
  countBatch(texts: string[]): number[] {
    return texts.map(text => this.count(text))
  }

  /**
   * Get total token count for multiple texts
   */
  countTotal(texts: string[]): number {
    return texts.reduce((total, text) => total + this.count(text), 0)
  }

  /**
   * Estimate if text fits within token limit
   */
  fitsWithinLimit(text: string, limit: number): boolean {
    return this.count(text) <= limit
  }

  /**
   * Truncate text to fit within token limit
   */
  truncateToLimit(text: string, limit: number): string {
    const currentTokens = this.count(text)
    if (currentTokens <= limit) {
      return text
    }

    // Binary search to find the right truncation point
    let left = 0
    let right = text.length
    let bestLength = 0

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const truncated = text.slice(0, mid)
      const tokens = this.count(truncated)

      if (tokens <= limit) {
        bestLength = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    // Find the last complete word
    const truncated = text.slice(0, bestLength)
    const lastSpaceIndex = truncated.lastIndexOf(' ')
    
    return lastSpaceIndex > 0 ? truncated.slice(0, lastSpaceIndex) : truncated
  }

  /**
   * Advanced token estimation algorithm
   * Based on analysis of OpenAI's tokenization patterns
   */
  private estimateTokens(text: string): number {
    // Normalize text for consistent counting
    const normalized = text.trim()
    if (normalized.length === 0) {
      return 0
    }

    // Base character-to-token ratio (conservative estimate)
    let tokenCount = Math.ceil(normalized.length / 4)

    // Adjustments based on text characteristics
    tokenCount = this.adjustForPunctuation(normalized, tokenCount)
    tokenCount = this.adjustForNumbers(normalized, tokenCount)
    tokenCount = this.adjustForSpecialTokens(normalized, tokenCount)
    tokenCount = this.adjustForLanguagePatterns(normalized, tokenCount)

    // Ensure minimum token count
    return Math.max(1, Math.round(tokenCount))
  }

  /**
   * Adjust token count for punctuation patterns
   */
  private adjustForPunctuation(text: string, baseCount: number): number {
    // Heavy punctuation typically increases token count
    const punctuationCount = (text.match(/[.,!?;:()\[\]{}"'-]/g) || []).length
    const punctuationRatio = punctuationCount / text.length

    if (punctuationRatio > 0.1) {
      return baseCount * 1.1 // 10% increase for heavy punctuation
    } else if (punctuationRatio > 0.05) {
      return baseCount * 1.05 // 5% increase for moderate punctuation
    }

    return baseCount
  }

  /**
   * Adjust token count for numbers and numeric patterns
   */
  private adjustForNumbers(text: string, baseCount: number): number {
    // Numbers, especially long ones, can affect tokenization
    const numberMatches = text.match(/\d+/g) || []
    const longNumbers = numberMatches.filter(num => num.length > 4).length

    if (longNumbers > 0) {
      return baseCount * 1.15 // 15% increase for long numbers
    }

    const numberDensity = numberMatches.length / (text.split(' ').length || 1)
    if (numberDensity > 0.2) {
      return baseCount * 1.1 // 10% increase for number-heavy text
    }

    return baseCount
  }

  /**
   * Adjust for special tokens and patterns
   */
  private adjustForSpecialTokens(text: string, baseCount: number): number {
    let adjustmentFactor = 1.0

    // URLs and email addresses
    const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/gi
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
    
    const urls = (text.match(urlPattern) || []).length
    const emails = (text.match(emailPattern) || []).length

    if (urls > 0 || emails > 0) {
      adjustmentFactor *= 1.2 // URLs and emails increase token count
    }

    // Code-like patterns
    const codePatterns = [
      /```[\s\S]*?```/g, // Code blocks
      /`[^`]+`/g,        // Inline code
      /[a-zA-Z_]\w*\([^)]*\)/g // Function calls
    ]

    let codeMatches = 0
    for (const pattern of codePatterns) {
      codeMatches += (text.match(pattern) || []).length
    }

    if (codeMatches > 0) {
      adjustmentFactor *= 1.25 // Code increases token count significantly
    }

    // Markdown patterns
    const markdownPatterns = [
      /#{1,6}\s/g,       // Headers
      /\*\*[^*]+\*\*/g,  // Bold
      /\*[^*]+\*/g,      // Italic
      /\[[^\]]+\]\([^)]+\)/g // Links
    ]

    let markdownMatches = 0
    for (const pattern of markdownPatterns) {
      markdownMatches += (text.match(pattern) || []).length
    }

    if (markdownMatches > 0) {
      adjustmentFactor *= 1.1 // Markdown slightly increases token count
    }

    return baseCount * adjustmentFactor
  }

  /**
   * Adjust for language-specific patterns
   */
  private adjustForLanguagePatterns(text: string, baseCount: number): number {
    // Check for non-English characters
    const nonEnglishChars = (text.match(/[^\x00-\x7F]/g) || []).length
    const nonEnglishRatio = nonEnglishChars / text.length

    if (nonEnglishRatio > 0.1) {
      return baseCount * 1.3 // Non-English text typically requires more tokens
    }

    // Check for very long words (might be compound words or technical terms)
    const words = text.split(/\s+/)
    const longWords = words.filter(word => word.length > 12).length
    const longWordRatio = longWords / words.length

    if (longWordRatio > 0.1) {
      return baseCount * 1.15 // Many long words might increase token count
    }

    return baseCount
  }

  /**
   * Create cache key for text
   */
  private createCacheKey(text: string): string {
    // Use first 100 chars + length + hash-like suffix for cache key
    if (text.length <= 100) {
      return text
    }

    const prefix = text.slice(0, 100)
    const suffix = text.slice(-20)
    return `${prefix}...${suffix}[${text.length}]`
  }

  /**
   * Clean up cache periodically
   */
  private cleanupCache(): void {
    if (this.cache.size > this.maxCacheSize * 0.8) {
      // Remove oldest entries (simple FIFO)
      const entries = Array.from(this.cache.entries())
      const toKeep = entries.slice(-Math.floor(this.maxCacheSize * 0.5))
      
      this.cache.clear()
      for (const [key, value] of toKeep) {
        this.cache.set(key, value)
      }

      logger.debug('Token counter cache cleaned up', {
        previousSize: entries.length,
        currentSize: this.cache.size
      })
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number
    maxSize: number
    hitRate?: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    }
  }

  /**
   * Clear cache manually
   */
  clearCache(): void {
    this.cache.clear()
    logger.debug('Token counter cache cleared manually')
  }

  /**
   * Validate token count estimation accuracy
   * This would be used in testing to compare against actual tokenizer
   */
  validateEstimation(text: string, actualTokens: number): {
    estimated: number
    actual: number
    accuracy: number
    error: number
  } {
    const estimated = this.count(text)
    const error = Math.abs(estimated - actualTokens)
    const accuracy = 1 - (error / Math.max(actualTokens, 1))

    return {
      estimated,
      actual: actualTokens,
      accuracy,
      error
    }
  }
}
/**
 * Embedding Cache Implementation
 * In-memory cache for embedding results to reduce API calls and costs
 * Uses LRU eviction policy with configurable size limits
 */

import { createHash } from 'crypto'
import type { Vector, EmbeddingCache as IEmbeddingCache } from '../types'
import { logger } from '../../logger'

interface CacheEntry {
  embedding: Vector
  timestamp: number
  accessCount: number
  lastAccessed: number
}

interface CacheStats {
  hits: number
  misses: number
  evictions: number
  totalRequests: number
}

/**
 * LRU Cache for embeddings with size and TTL management
 */
export class EmbeddingCache implements IEmbeddingCache {
  private cache = new Map<string, CacheEntry>()
  private readonly maxSize: number
  private readonly ttlMs: number
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0
  }

  constructor(
    maxSize: number = 10000, // Max 10k embeddings in cache
    ttlHours: number = 24 // Cache for 24 hours by default
  ) {
    this.maxSize = maxSize
    this.ttlMs = ttlHours * 60 * 60 * 1000

    // Clean up expired entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000)
  }

  /**
   * Get embedding from cache
   */
  async get(text: string): Promise<Vector | null> {
    this.stats.totalRequests++
    
    const key = this.createKey(text)
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    // Update access information
    entry.accessCount++
    entry.lastAccessed = Date.now()
    this.stats.hits++

    logger.debug('Cache hit for embedding', {
      key: key.substring(0, 8),
      accessCount: entry.accessCount,
      age: Date.now() - entry.timestamp
    })

    return entry.embedding
  }

  /**
   * Store embedding in cache
   */
  async set(text: string, embedding: Vector): Promise<void> {
    const key = this.createKey(text)
    const now = Date.now()

    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      await this.evictLRU()
    }

    const entry: CacheEntry = {
      embedding,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now
    }

    this.cache.set(key, entry)

    logger.debug('Embedding cached', {
      key: key.substring(0, 8),
      dimensions: embedding.length,
      cacheSize: this.cache.size
    })
  }

  /**
   * Clear all cached embeddings
   */
  async clear(): Promise<void> {
    const previousSize = this.cache.size
    this.cache.clear()
    this.resetStats()

    logger.info('Embedding cache cleared', {
      previousSize,
      currentSize: 0
    })
  }

  /**
   * Get current cache size
   */
  async size(): Promise<number> {
    return this.cache.size
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & {
    hitRate: number
    evictionRate: number
    cacheSize: number
    maxSize: number
  } {
    const hitRate = this.stats.totalRequests > 0 
      ? this.stats.hits / this.stats.totalRequests 
      : 0

    const evictionRate = this.stats.totalRequests > 0 
      ? this.stats.evictions / this.stats.totalRequests 
      : 0

    return {
      ...this.stats,
      hitRate,
      evictionRate,
      cacheSize: this.cache.size,
      maxSize: this.maxSize
    }
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage(): {
    estimatedBytes: number
    entryCount: number
    averageEmbeddingSize: number
  } {
    if (this.cache.size === 0) {
      return {
        estimatedBytes: 0,
        entryCount: 0,
        averageEmbeddingSize: 0
      }
    }

    // Estimate memory usage
    // Each embedding is typically 1536 float64 numbers = 1536 * 8 = 12,288 bytes
    // Plus overhead for key, timestamp, etc. ≈ 200 bytes per entry
    const averageEmbeddingSize = 1536 * 8 // 8 bytes per float64
    const overheadPerEntry = 200
    const estimatedBytes = this.cache.size * (averageEmbeddingSize + overheadPerEntry)

    return {
      estimatedBytes,
      entryCount: this.cache.size,
      averageEmbeddingSize
    }
  }

  /**
   * Create cache key from text
   */
  private createKey(text: string): string {
    // Use SHA-256 hash for consistent key generation
    return createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttlMs
  }

  /**
   * Evict least recently used entry
   */
  private async evictLRU(): Promise<void> {
    if (this.cache.size === 0) return

    let oldestKey: string | null = null
    let oldestAccess = Date.now()

    // Find the least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++

      logger.debug('Cache entry evicted (LRU)', {
        key: oldestKey.substring(0, 8),
        age: Date.now() - oldestAccess,
        newCacheSize: this.cache.size
      })
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let expiredCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        expiredCount++
      }
    }

    if (expiredCount > 0) {
      logger.info('Cache cleanup completed', {
        expiredCount,
        remainingEntries: this.cache.size,
        cleanupTime: Date.now() - now
      })
    }
  }

  /**
   * Reset cache statistics
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    }
  }

  /**
   * Preload embeddings (useful for warming up cache)
   */
  async preload(textEmbeddingPairs: Array<{ text: string; embedding: Vector }>): Promise<number> {
    let loaded = 0

    for (const { text, embedding } of textEmbeddingPairs) {
      await this.set(text, embedding)
      loaded++
    }

    logger.info('Cache preloaded', {
      loaded,
      totalCacheSize: this.cache.size
    })

    return loaded
  }

  /**
   * Export cache contents (for persistence)
   */
  export(): Array<{ text: string; embedding: Vector; metadata: Omit<CacheEntry, 'embedding'> }> {
    const exports: Array<{ text: string; embedding: Vector; metadata: Omit<CacheEntry, 'embedding'> }> = []

    for (const [key, entry] of this.cache.entries()) {
      exports.push({
        text: key, // Note: This is the hash, not original text
        embedding: entry.embedding,
        metadata: {
          timestamp: entry.timestamp,
          accessCount: entry.accessCount,
          lastAccessed: entry.lastAccessed
        }
      })
    }

    return exports
  }

  /**
   * Import cache contents (for persistence restore)
   */
  async import(data: Array<{ text: string; embedding: Vector; metadata: Omit<CacheEntry, 'embedding'> }>): Promise<number> {
    let imported = 0

    for (const { text, embedding, metadata } of data) {
      // Skip expired entries
      if (Date.now() - metadata.timestamp > this.ttlMs) {
        continue
      }

      const entry: CacheEntry = {
        embedding,
        ...metadata
      }

      this.cache.set(text, entry)
      imported++
    }

    logger.info('Cache imported', {
      imported,
      skipped: data.length - imported,
      totalCacheSize: this.cache.size
    })

    return imported
  }
}
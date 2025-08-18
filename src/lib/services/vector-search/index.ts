/**
 * Vector Search Service
 * Unified interface for semantic search across all vector-enabled entities
 * Integrates with Supabase pgvector for high-performance similarity search
 */

import { db } from '../../database/client'
import { VECTOR_SEARCH, DATABASE_LIMITS } from '../../config/constants'
import { VectorSearchError } from '../types'
import { logger, startPerformance, endPerformance } from '../../logger'
import embeddingService from '../embeddings'
import type {
  Vector,
  VectorSearchOptions,
  VectorSearchResult,
  UnifiedSearchOptions,
  UnifiedSearchResult,
  SearchResult,
  InsightSearchResult,
  DocumentSearchResult,
  JTBDSearchResult,
  MetricSearchResult,
  VectorSearchService
} from '../types'
import { DEFAULT_SEARCH_OPTIONS } from '../types'

/**
 * Implementation of vector search across all entities
 */
class VectorSearchServiceImpl implements VectorSearchService {
  private readonly similarityThreshold = VECTOR_SEARCH.SIMILARITY_THRESHOLD
  private readonly maxResults = DATABASE_LIMITS.MAX_SEARCH_RESULTS

  /**
   * Search insights by semantic similarity
   */
  async searchInsights(
    query: string | Vector,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<InsightSearchResult['data']>> {
    const trackingId = startPerformance('search_insights')
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options }

    try {
      const queryEmbedding = await this.getQueryEmbedding(query)
      
      const results = await db.executeVectorSearch<InsightSearchResult['data'][]>(
        'search_insights',
        queryEmbedding,
        mergedOptions.threshold,
        mergedOptions.limit,
        mergedOptions.userId
      )

      const searchResults = this.transformInsightResults(results, queryEmbedding, mergedOptions)

      endPerformance(trackingId, true, {
        resultCount: searchResults.results.length,
        maxSimilarity: searchResults.maxSimilarity,
        threshold: mergedOptions.threshold
      })

      logger.info('Insight search completed', {
        queryType: typeof query,
        resultCount: searchResults.results.length,
        threshold: mergedOptions.threshold,
        userId: mergedOptions.userId
      })

      return searchResults

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Insight search failed',
        'INSIGHT_SEARCH_FAILED',
        {
          queryType: typeof query,
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Search document chunks by semantic similarity
   */
  async searchDocuments(
    query: string | Vector,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<DocumentSearchResult['data']>> {
    const trackingId = startPerformance('search_documents')
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options }

    try {
      const queryEmbedding = await this.getQueryEmbedding(query)
      
      const results = await db.executeVectorSearch<DocumentSearchResult['data'][]>(
        'search_document_chunks',
        queryEmbedding,
        mergedOptions.threshold,
        mergedOptions.limit,
        mergedOptions.userId
      )

      const searchResults = this.transformDocumentResults(results, queryEmbedding, mergedOptions)

      endPerformance(trackingId, true, {
        resultCount: searchResults.results.length,
        maxSimilarity: searchResults.maxSimilarity,
        threshold: mergedOptions.threshold
      })

      logger.info('Document search completed', {
        queryType: typeof query,
        resultCount: searchResults.results.length,
        threshold: mergedOptions.threshold,
        userId: mergedOptions.userId
      })

      return searchResults

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Document search failed',
        'DOCUMENT_SEARCH_FAILED',
        {
          queryType: typeof query,
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Search JTBDs by semantic similarity
   */
  async searchJTBDs(
    query: string | Vector,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<JTBDSearchResult['data']>> {
    const trackingId = startPerformance('search_jtbds')
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options }

    try {
      const queryEmbedding = await this.getQueryEmbedding(query)
      
      const results = await db.executeVectorSearch<JTBDSearchResult['data'][]>(
        'search_jtbds',
        queryEmbedding,
        mergedOptions.threshold,
        mergedOptions.limit,
        mergedOptions.userId
      )

      const searchResults = this.transformJTBDResults(results, queryEmbedding, mergedOptions)

      endPerformance(trackingId, true, {
        resultCount: searchResults.results.length,
        maxSimilarity: searchResults.maxSimilarity,
        threshold: mergedOptions.threshold
      })

      logger.info('JTBD search completed', {
        queryType: typeof query,
        resultCount: searchResults.results.length,
        threshold: mergedOptions.threshold,
        userId: mergedOptions.userId
      })

      return searchResults

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'JTBD search failed',
        'JTBD_SEARCH_FAILED',
        {
          queryType: typeof query,
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Search metrics (note: metrics don't have embeddings, so this searches by name/description)
   */
  async searchMetrics(
    query: string | Vector,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<MetricSearchResult['data']>> {
    const trackingId = startPerformance('search_metrics')
    const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options }

    try {
      // For metrics, we'll do a text-based search since they don't have embeddings
      // This is a simplified implementation - in a full system, you might want to add embeddings to metrics too
      const results = await this.textSearchMetrics(query, mergedOptions)

      endPerformance(trackingId, true, {
        resultCount: results.results.length,
        threshold: mergedOptions.threshold
      })

      logger.info('Metric search completed', {
        queryType: typeof query,
        resultCount: results.results.length,
        threshold: mergedOptions.threshold,
        userId: mergedOptions.userId
      })

      return results

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Metric search failed',
        'METRIC_SEARCH_FAILED',
        {
          queryType: typeof query,
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Unified search across all entities
   */
  async unifiedSearch(
    query: string | Vector,
    options: UnifiedSearchOptions = {}
  ): Promise<UnifiedSearchResult> {
    const trackingId = startPerformance('unified_search')
    const searchStartTime = Date.now()

    try {
      const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options }
      const entitiesToSearch = options.entities || ['insights', 'documents', 'jtbds', 'metrics']
      const entityWeights = options.weights || {}

      // Perform searches in parallel for better performance
      const searchPromises: Array<Promise<any>> = []
      const searchTypes: string[] = []

      if (entitiesToSearch.includes('insights')) {
        searchPromises.push(this.searchInsights(query, mergedOptions))
        searchTypes.push('insights')
      }

      if (entitiesToSearch.includes('documents')) {
        searchPromises.push(this.searchDocuments(query, mergedOptions))
        searchTypes.push('documents')
      }

      if (entitiesToSearch.includes('jtbds')) {
        searchPromises.push(this.searchJTBDs(query, mergedOptions))
        searchTypes.push('jtbds')
      }

      if (entitiesToSearch.includes('metrics')) {
        searchPromises.push(this.searchMetrics(query, mergedOptions))
        searchTypes.push('metrics')
      }

      const searchResults = await Promise.all(searchPromises)

      // Combine and weight results
      const combined = this.combineSearchResults(
        searchResults,
        searchTypes,
        entityWeights,
        options.groupByEntity
      )

      const result: UnifiedSearchResult = {
        insights: searchTypes.includes('insights') ? searchResults[searchTypes.indexOf('insights')] : this.createEmptyResult(),
        documents: searchTypes.includes('documents') ? searchResults[searchTypes.indexOf('documents')] : this.createEmptyResult(),
        jtbds: searchTypes.includes('jtbds') ? searchResults[searchTypes.indexOf('jtbds')] : this.createEmptyResult(),
        metrics: searchTypes.includes('metrics') ? searchResults[searchTypes.indexOf('metrics')] : this.createEmptyResult(),
        combined,
        summary: {
          totalResults: combined.length,
          entitiesSearched: entitiesToSearch,
          maxSimilarity: Math.max(...combined.map(r => r.similarity), 0),
          searchTime: Date.now() - searchStartTime
        }
      }

      endPerformance(trackingId, true, {
        totalResults: result.summary.totalResults,
        entitiesSearched: entitiesToSearch.length,
        searchTime: result.summary.searchTime
      })

      logger.info('Unified search completed', {
        queryType: typeof query,
        entitiesSearched: entitiesToSearch,
        totalResults: result.summary.totalResults,
        searchTime: result.summary.searchTime,
        userId: mergedOptions.userId
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Unified search failed',
        'UNIFIED_SEARCH_FAILED',
        {
          queryType: typeof query,
          options,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Get or generate query embedding
   */
  private async getQueryEmbedding(query: string | Vector): Promise<Vector> {
    if (Array.isArray(query)) {
      // Already an embedding
      if (query.length !== VECTOR_SEARCH.EMBEDDING_DIMENSIONS) {
        throw new VectorSearchError(
          `Invalid embedding dimensions: expected ${VECTOR_SEARCH.EMBEDDING_DIMENSIONS}, got ${query.length}`,
          'INVALID_EMBEDDING_DIMENSIONS',
          { expectedDimensions: VECTOR_SEARCH.EMBEDDING_DIMENSIONS, actualDimensions: query.length }
        )
      }
      return query
    }

    // Generate embedding from text
    const embeddingResult = await embeddingService.generateEmbedding(query)
    return embeddingResult.embedding
  }

  /**
   * Transform insight search results
   */
  private transformInsightResults(
    results: InsightSearchResult['data'][],
    queryEmbedding: Vector,
    options: VectorSearchOptions
  ): VectorSearchResult<InsightSearchResult['data']> {
    const searchResults: SearchResult<InsightSearchResult['data']>[] = results.map(result => ({
      id: result.id,
      content: result.content,
      similarity: (result as any).similarity ?? 0,
      metadata: {
        document_id: result.document_id,
        confidence_score: result.confidence_score,
        created_at: result.created_at
      },
      data: result
    }))

    return this.createSearchResult(searchResults, queryEmbedding, options, 'insights')
  }

  /**
   * Transform document search results
   */
  private transformDocumentResults(
    results: DocumentSearchResult['data'][],
    queryEmbedding: Vector,
    options: VectorSearchOptions
  ): VectorSearchResult<DocumentSearchResult['data']> {
    const searchResults: SearchResult<DocumentSearchResult['data']>[] = results.map(result => ({
      id: result.id,
      content: result.content,
      similarity: (result as any).similarity ?? 0,
      metadata: {
        document_id: result.document_id,
        chunk_index: result.chunk_index,
        token_count: result.token_count,
        created_at: result.created_at
      },
      data: result
    }))

    return this.createSearchResult(searchResults, queryEmbedding, options, 'documents')
  }

  /**
   * Transform JTBD search results
   */
  private transformJTBDResults(
    results: JTBDSearchResult['data'][],
    queryEmbedding: Vector,
    options: VectorSearchOptions
  ): VectorSearchResult<JTBDSearchResult['data']> {
    const searchResults: SearchResult<JTBDSearchResult['data']>[] = results.map(result => ({
      id: result.id,
      content: result.statement,
      similarity: (result as any).similarity ?? 0,
      metadata: {
        context: result.context,
        priority: result.priority,
        created_at: result.created_at,
        updated_at: result.updated_at
      },
      data: result
    }))

    return this.createSearchResult(searchResults, queryEmbedding, options, 'jtbds')
  }

  /**
   * Text-based search for metrics (placeholder implementation)
   */
  private async textSearchMetrics(
    query: string | Vector,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult<MetricSearchResult['data']>> {
    // This is a simplified implementation
    // In a real system, you might want to add embeddings to metrics or use full-text search
    
    const searchText = typeof query === 'string' ? query.toLowerCase() : ''
    
    // Mock implementation - in reality, this would query the database
    const mockResults: MetricSearchResult['data'][] = []

    const searchResults: SearchResult<MetricSearchResult['data']>[] = mockResults.map(result => ({
      id: result.id,
      content: result.name,
      similarity: 0.8, // Mock similarity
      metadata: {
        description: result.description,
        current_value: result.current_value,
        target_value: result.target_value,
        unit: result.unit
      },
      data: result
    }))

    return {
      results: searchResults,
      totalResults: searchResults.length,
      maxSimilarity: Math.max(...searchResults.map(r => r.similarity), 0),
      minSimilarity: Math.min(...searchResults.map(r => r.similarity), 1),
      averageSimilarity: searchResults.length > 0 
        ? searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length 
        : 0,
      threshold: options.threshold!,
      query: {
        text: typeof query === 'string' ? query : undefined,
        embedding: typeof query === 'string' ? [] : query,
        options
      }
    }
  }

  /**
   * Create search result object
   */
  private createSearchResult<T>(
    results: SearchResult<T>[],
    queryEmbedding: Vector,
    options: VectorSearchOptions,
    entityType: string
  ): VectorSearchResult<T> {
    // Sort by similarity (highest first)
    const sortedResults = results.sort((a, b) => b.similarity - a.similarity)

    return {
      results: sortedResults,
      totalResults: sortedResults.length,
      maxSimilarity: Math.max(...sortedResults.map(r => r.similarity), 0),
      minSimilarity: Math.min(...sortedResults.map(r => r.similarity), 1),
      averageSimilarity: sortedResults.length > 0 
        ? sortedResults.reduce((sum, r) => sum + r.similarity, 0) / sortedResults.length 
        : 0,
      threshold: options.threshold!,
      query: {
        embedding: queryEmbedding,
        options
      }
    }
  }

  /**
   * Combine search results from multiple entities
   */
  private combineSearchResults(
    searchResults: VectorSearchResult<any>[],
    searchTypes: string[],
    weights: Record<string, number>,
    groupByEntity?: boolean
  ): SearchResult[] {
    const combined: SearchResult[] = []

    for (let i = 0; i < searchResults.length; i++) {
      const results = searchResults[i]
      const entityType = searchTypes[i]
      const weight = weights[entityType] || 1.0

      for (const result of results.results) {
        combined.push({
          ...result,
          similarity: result.similarity * weight,
          metadata: {
            ...result.metadata,
            entityType,
            originalSimilarity: result.similarity,
            weight
          }
        })
      }
    }

    // Sort by weighted similarity
    return combined.sort((a, b) => b.similarity - a.similarity)
  }

  /**
   * Create empty search result
   */
  private createEmptyResult(): VectorSearchResult<any> {
    return {
      results: [],
      totalResults: 0,
      maxSimilarity: 0,
      minSimilarity: 1,
      averageSimilarity: 0,
      threshold: this.similarityThreshold,
      query: {
        embedding: [],
        options: DEFAULT_SEARCH_OPTIONS
      }
    }
  }

  /**
   * Get search service health
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    lastCheck: Date
    details?: Record<string, unknown>
  }> {
    try {
      // Test with a simple search
      const testQuery = 'health check'
      const start = Date.now()
      
      await this.searchInsights(testQuery, { limit: 1 })
      
      const responseTime = Date.now() - start

      return {
        status: responseTime < 5000 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: {
          responseTime,
          threshold: this.similarityThreshold,
          maxResults: this.maxResults
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
const vectorSearchService = new VectorSearchServiceImpl()

export { vectorSearchService as default, VectorSearchServiceImpl }
export type { VectorSearchOptions, VectorSearchResult, UnifiedSearchOptions, UnifiedSearchResult }
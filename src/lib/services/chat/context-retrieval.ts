/**
 * Context Retrieval Service for JTBD Assistant Platform
 * Unified context retrieval leveraging VectorSearchService for chat integration
 * Formats results for chat UI picker components with pagination support
 */

import vectorSearchService from '../vector-search'
import { executeQuery } from '../../database/client'
import { DATABASE_LIMITS, VECTOR_SEARCH } from '../../config/constants'
import { logger, startPerformance, endPerformance } from '../../logger'
import { VectorSearchError } from '../types'
import type { Vector, Metric, Database } from '../../database/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  VectorSearchOptions,
  InsightSearchResult,
  MetricSearchResult,
  JTBDSearchResult
} from '../types'

// ===== CONTEXT RETRIEVAL TYPES =====

export interface RetrievalOptions {
  limit?: number
  threshold?: number
  userId?: string
  page?: number
  pageSize?: number
}

export interface ContextItem {
  id: string
  content: string
  type: 'insight' | 'metric' | 'jtbd'
  similarity?: number
  metadata: Record<string, unknown>
  displayText: string
  snippet: string
}

export interface RetrievalResult {
  items: ContextItem[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrevious: boolean
  }
  summary: {
    maxSimilarity: number
    averageSimilarity: number
    retrievalTime: number
    searchType: 'semantic' | 'text'
  }
}

// ===== CONSTANTS =====

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  limit: 20,
  threshold: VECTOR_SEARCH.SIMILARITY_THRESHOLD,
  userId: '',
  page: 1,
  pageSize: 20
}

const MAX_SNIPPET_LENGTH = 150
const MAX_DISPLAY_TEXT_LENGTH = 100

/**
 * Context Retrieval Service Implementation
 */
class ContextRetrievalService {
  /**
   * Retrieve insights using semantic search
   */
  async retrieveInsights(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const trackingId = startPerformance('retrieve_insights')
    const retrievalStartTime = Date.now()
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

    try {
      logger.debug('Starting insight retrieval', {
        query: query.substring(0, 100),
        options: mergedOptions
      })

      // Use vector search service for semantic search
      const searchOptions: VectorSearchOptions = {
        threshold: mergedOptions.threshold,
        limit: mergedOptions.limit,
        userId: mergedOptions.userId,
        includeMetadata: true
      }

      const searchResult = await vectorSearchService.searchInsights(query, searchOptions)
      
      // Transform results to context items
      const contextItems: ContextItem[] = searchResult.results
        .filter(result => result.data != null)
        .map(result => 
          this.transformInsightToContextItem(result.data!, result.similarity)
        )

      // Apply pagination
      const paginatedResult = this.paginateResults(
        contextItems,
        mergedOptions.page,
        mergedOptions.pageSize
      )

      const result: RetrievalResult = {
        items: paginatedResult.items,
        pagination: paginatedResult.pagination,
        summary: {
          maxSimilarity: searchResult.maxSimilarity,
          averageSimilarity: searchResult.averageSimilarity,
          retrievalTime: Date.now() - retrievalStartTime,
          searchType: 'semantic'
        }
      }

      endPerformance(trackingId, true, {
        resultCount: result.items.length,
        totalResults: result.pagination.totalItems,
        maxSimilarity: result.summary.maxSimilarity
      })

      logger.info('Insight retrieval completed', {
        query: query.substring(0, 50),
        resultCount: result.items.length,
        retrievalTime: result.summary.retrievalTime
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Failed to retrieve insights',
        'INSIGHT_RETRIEVAL_FAILED',
        {
          query: query.substring(0, 100),
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Retrieve metrics using text-based search
   */
  async retrieveMetrics(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const trackingId = startPerformance('retrieve_metrics')
    const retrievalStartTime = Date.now()
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

    try {
      logger.debug('Starting metric retrieval', {
        query: query.substring(0, 100),
        options: mergedOptions
      })

      // Perform text-based search for metrics (they don't have embeddings)
      const searchResults = await this.textSearchMetrics(query, mergedOptions)

      // Apply pagination
      const paginatedResult = this.paginateResults(
        searchResults,
        mergedOptions.page,
        mergedOptions.pageSize
      )

      const result: RetrievalResult = {
        items: paginatedResult.items,
        pagination: paginatedResult.pagination,
        summary: {
          maxSimilarity: Math.max(...searchResults.map(item => item.similarity || 0), 0),
          averageSimilarity: searchResults.length > 0 
            ? searchResults.reduce((sum, item) => sum + (item.similarity || 0), 0) / searchResults.length 
            : 0,
          retrievalTime: Date.now() - retrievalStartTime,
          searchType: 'text'
        }
      }

      endPerformance(trackingId, true, {
        resultCount: result.items.length,
        totalResults: result.pagination.totalItems
      })

      logger.info('Metric retrieval completed', {
        query: query.substring(0, 50),
        resultCount: result.items.length,
        retrievalTime: result.summary.retrievalTime
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Failed to retrieve metrics',
        'METRIC_RETRIEVAL_FAILED',
        {
          query: query.substring(0, 100),
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Retrieve JTBDs using semantic search
   */
  async retrieveJTBDs(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const trackingId = startPerformance('retrieve_jtbds')
    const retrievalStartTime = Date.now()
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

    try {
      logger.debug('Starting JTBD retrieval', {
        query: query.substring(0, 100),
        options: mergedOptions
      })

      // Use vector search service for semantic search
      const searchOptions: VectorSearchOptions = {
        threshold: mergedOptions.threshold,
        limit: mergedOptions.limit,
        userId: mergedOptions.userId,
        includeMetadata: true
      }

      const searchResult = await vectorSearchService.searchJTBDs(query, searchOptions)
      
      // Transform results to context items
      const contextItems: ContextItem[] = searchResult.results
        .filter(result => result.data != null)
        .map(result => 
          this.transformJTBDToContextItem(result.data!, result.similarity)
        )

      // Apply pagination
      const paginatedResult = this.paginateResults(
        contextItems,
        mergedOptions.page,
        mergedOptions.pageSize
      )

      const result: RetrievalResult = {
        items: paginatedResult.items,
        pagination: paginatedResult.pagination,
        summary: {
          maxSimilarity: searchResult.maxSimilarity,
          averageSimilarity: searchResult.averageSimilarity,
          retrievalTime: Date.now() - retrievalStartTime,
          searchType: 'semantic'
        }
      }

      endPerformance(trackingId, true, {
        resultCount: result.items.length,
        totalResults: result.pagination.totalItems,
        maxSimilarity: result.summary.maxSimilarity
      })

      logger.info('JTBD retrieval completed', {
        query: query.substring(0, 50),
        resultCount: result.items.length,
        retrievalTime: result.summary.retrievalTime
      })

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      throw new VectorSearchError(
        'Failed to retrieve JTBDs',
        'JTBD_RETRIEVAL_FAILED',
        {
          query: query.substring(0, 100),
          options: mergedOptions,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Transform insight data to context item format
   */
  private transformInsightToContextItem(
    insight: InsightSearchResult['data'],
    similarity: number
  ): ContextItem {
    const displayText = this.truncateText(insight.content, MAX_DISPLAY_TEXT_LENGTH)
    const snippet = this.truncateText(insight.content, MAX_SNIPPET_LENGTH)

    return {
      id: insight.id,
      content: insight.content,
      type: 'insight',
      similarity,
      metadata: {
        documentId: insight.document_id,
        confidenceScore: insight.confidence_score,
        sourceChunkIds: insight.source_chunk_ids,
        createdAt: insight.created_at
      },
      displayText,
      snippet
    }
  }

  /**
   * Transform JTBD data to context item format
   */
  private transformJTBDToContextItem(
    jtbd: JTBDSearchResult['data'],
    similarity: number
  ): ContextItem {
    const displayText = this.truncateText(jtbd.statement, MAX_DISPLAY_TEXT_LENGTH)
    const snippet = this.createJTBDSnippet(jtbd)

    return {
      id: jtbd.id,
      content: jtbd.statement,
      type: 'jtbd',
      similarity,
      metadata: {
        context: jtbd.context,
        priority: jtbd.priority,
        createdAt: jtbd.created_at,
        updatedAt: jtbd.updated_at
      },
      displayText,
      snippet
    }
  }

  /**
   * Transform metric data to context item format
   */
  private transformMetricToContextItem(
    metric: Metric,
    similarity?: number
  ): ContextItem {
    const displayText = this.truncateText(metric.name, MAX_DISPLAY_TEXT_LENGTH)
    const snippet = this.createMetricSnippet(metric)

    return {
      id: metric.id,
      content: metric.name,
      type: 'metric',
      similarity,
      metadata: {
        description: metric.description,
        currentValue: metric.current_value,
        targetValue: metric.target_value,
        unit: metric.unit,
        createdAt: metric.created_at,
        updatedAt: metric.updated_at
      },
      displayText,
      snippet
    }
  }

  /**
   * Perform text-based search for metrics
   */
  private async textSearchMetrics(
    query: string,
    options: RetrievalOptions
  ): Promise<ContextItem[]> {
    const searchTerm = query.toLowerCase().trim()
    
    const results = await executeQuery(
      async (client: SupabaseClient<Database, 'public'>) => {
        return await client
          .from('metrics')
          .select('*')
          .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
          .limit(options.limit!)
          .order('created_at', { ascending: false })
      }
    )

    if (!results || !Array.isArray(results)) {
      return []
    }

    return (results as Metric[]).map(metric => {
      // Calculate simple text similarity score
      const nameMatch = metric.name.toLowerCase().includes(searchTerm)
      const descMatch = metric.description?.toLowerCase().includes(searchTerm)
      const similarity = nameMatch ? 0.9 : (descMatch ? 0.7 : 0.5)

      return this.transformMetricToContextItem(metric, similarity)
    })
  }

  /**
   * Apply pagination to results
   */
  private paginateResults<T>(
    items: T[],
    page: number,
    pageSize: number
  ): {
    items: T[]
    pagination: RetrievalResult['pagination']
  } {
    const totalItems = items.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedItems = items.slice(startIndex, endIndex)

    return {
      items: paginatedItems,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    }
  }

  /**
   * Create snippet for JTBD display
   */
  private createJTBDSnippet(jtbd: JTBDSearchResult['data']): string {
    let snippet = jtbd.statement
    
    if (jtbd.context) {
      snippet += ` | Context: ${jtbd.context}`
    }
    
    if (jtbd.priority) {
      snippet += ` | Priority: ${jtbd.priority}`
    }

    return this.truncateText(snippet, MAX_SNIPPET_LENGTH)
  }

  /**
   * Create snippet for metric display
   */
  private createMetricSnippet(metric: Metric): string {
    let snippet = metric.name
    
    if (metric.current_value !== null && metric.target_value !== null) {
      snippet += ` | ${metric.current_value}${metric.unit} → ${metric.target_value}${metric.unit}`
    } else if (metric.current_value !== null) {
      snippet += ` | Current: ${metric.current_value}${metric.unit}`
    }
    
    if (metric.description) {
      snippet += ` | ${metric.description}`
    }

    return this.truncateText(snippet, MAX_SNIPPET_LENGTH)
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text
    }
    
    return text.substring(0, maxLength - 3).trim() + '...'
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
      const testQuery = 'health check'
      const start = Date.now()
      
      // Test with a simple insight retrieval
      await this.retrieveInsights(testQuery, { limit: 1 })
      
      const responseTime = Date.now() - start

      return {
        status: responseTime < 3000 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: {
          responseTime,
          defaultLimit: DEFAULT_OPTIONS.limit,
          defaultThreshold: DEFAULT_OPTIONS.threshold
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
const contextRetrievalService = new ContextRetrievalService()

export { contextRetrievalService as default, ContextRetrievalService }
export type { 
  RetrievalOptions as ContextRetrievalOptions, 
  ContextItem as ContextRetrievalItem, 
  RetrievalResult as ContextRetrievalResult 
}
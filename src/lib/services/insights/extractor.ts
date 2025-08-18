/**
 * Insight Extraction Service
 * Extracts meaningful insights from document chunks using AI
 */

import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { logger, startPerformance, endPerformance } from '../../logger'
import { executeQuery } from '../../database/client'
import embeddingService from '../embeddings'
import type { 
  InsightInsert, 
  UUID,
  DocumentChunk
} from '../../database/types'
import type { TextChunk } from '../types'
import { OPENAI_MODELS, SCORING } from '../../config/constants'
import { DatabaseError } from '../../errors/database'
import { ServiceError } from '../../errors/base'

export interface ExtractedInsight {
  content: string
  confidenceScore: number
  sourceChunkIds: UUID[]
}

export interface InsightExtractionOptions {
  maxInsights?: number
  minConfidenceScore?: number
  mergeRelatedInsights?: boolean
}

export interface InsightExtractionResult {
  insights: ExtractedInsight[]
  totalInsights: number
  processingTime: number
  chunksProcessed: number
}

/**
 * Insight extraction service implementation
 */
class InsightExtractionService {
  /**
   * Extract insights from document chunks
   */
  async extractInsights(
    documentId: UUID,
    userId: UUID,
    chunks: TextChunk[],
    options: InsightExtractionOptions = {}
  ): Promise<InsightExtractionResult> {
    const trackingId = startPerformance('insight_extraction')
    const startTime = Date.now()

    try {
      const {
        maxInsights = 10,
        minConfidenceScore = 0.6,
        mergeRelatedInsights = true
      } = options

      logger.info('Starting insight extraction', {
        documentId,
        chunksToProcess: chunks.length,
        maxInsights,
        minConfidenceScore
      })

      // Step 1: Combine chunks into larger segments for better context
      const segments = this.createInsightSegments(chunks)

      // Step 2: Extract insights from each segment
      const extractedInsights: ExtractedInsight[] = []
      
      for (const segment of segments) {
        try {
          const segmentInsights = await this.extractInsightsFromSegment(
            segment.content,
            segment.chunkIds,
            minConfidenceScore
          )
          extractedInsights.push(...segmentInsights)
        } catch (error) {
          logger.warn('Failed to extract insights from segment', {
            documentId,
            segmentLength: segment.content.length,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      // Step 3: Merge related insights if requested
      const finalInsights = mergeRelatedInsights 
        ? await this.mergeRelatedInsights(extractedInsights)
        : extractedInsights

      // Step 4: Take top insights up to maxInsights
      const topInsights = finalInsights
        .filter(insight => insight.confidenceScore >= minConfidenceScore)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, maxInsights)

      // Step 5: Store insights in database
      const storedInsights = await this.storeInsights(
        topInsights,
        documentId,
        userId
      )

      const processingTime = Date.now() - startTime

      const result: InsightExtractionResult = {
        insights: storedInsights,
        totalInsights: storedInsights.length,
        processingTime,
        chunksProcessed: chunks.length
      }

      endPerformance(trackingId, true, {
        documentId,
        insightsExtracted: result.totalInsights,
        chunksProcessed: result.chunksProcessed,
        processingTime: result.processingTime
      })

      logger.info('Insight extraction completed', result)

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        documentId,
        chunksToProcess: chunks.length,
        processingTime: Date.now() - startTime
      })

      throw error
    }
  }

  /**
   * Create insight segments by combining related chunks
   */
  private createInsightSegments(chunks: TextChunk[]): Array<{
    content: string
    chunkIds: UUID[]
  }> {
    // For now, create segments by grouping consecutive chunks
    // In the future, this could use semantic similarity to group related chunks
    const segments: Array<{ content: string; chunkIds: UUID[] }> = []
    const segmentSize = 3 // Group 3 chunks together for better context

    for (let i = 0; i < chunks.length; i += segmentSize) {
      const segmentChunks = chunks.slice(i, i + segmentSize)
      const content = segmentChunks.map(chunk => chunk.content).join('\n\n')
      const chunkIds = segmentChunks.map(chunk => chunk.metadata?.chunkId || `chunk_${chunk.index}`).filter(Boolean) as UUID[]

      segments.push({
        content,
        chunkIds
      })
    }

    return segments
  }

  /**
   * Extract insights from a text segment using AI
   */
  private async extractInsightsFromSegment(
    content: string,
    sourceChunkIds: UUID[],
    minConfidenceScore: number
  ): Promise<ExtractedInsight[]> {
    try {
      const prompt = `
Analyze the following text and extract 2-3 key insights that would be valuable for understanding user needs, pain points, or opportunities.

For each insight:
1. Make it actionable and specific
2. Focus on user behavior, needs, or problems
3. Avoid generic statements
4. Ensure it's supported by the content

Text to analyze:
${content}

Return the insights as a JSON array with this format:
[
  {
    "insight": "Specific, actionable insight",
    "confidence": 0.8
  }
]

Only include insights with confidence >= ${minConfidenceScore}.
`

      const { text } = await generateText({
        model: openai(OPENAI_MODELS.CHAT_PRIMARY),
        prompt,
        temperature: OPENAI_MODELS.TEMPERATURE_FACTUAL,
        maxTokens: OPENAI_MODELS.MAX_TOKENS_GENERATION
      })

      // Parse AI response
      const insights = this.parseInsightResponse(text)

      // Convert to our format
      return insights
        .filter(insight => insight.confidence >= minConfidenceScore)
        .map(insight => ({
          content: insight.insight,
          confidenceScore: insight.confidence,
          sourceChunkIds
        }))

    } catch (error) {
      logger.warn('Failed to extract insights from segment', {
        contentLength: content.length,
        sourceChunkIds,
        error: error instanceof Error ? error.message : String(error)
      })

      return []
    }
  }

  /**
   * Parse AI response to extract insights
   */
  private parseInsightResponse(response: string): Array<{
    insight: string
    confidence: number
  }> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('No JSON array found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }

      return parsed.map(item => ({
        insight: String(item.insight || item.content || '').trim(),
        confidence: Math.max(0, Math.min(1, Number(item.confidence || 0.5)))
      })).filter(item => item.insight.length > 0)

    } catch (error) {
      logger.warn('Failed to parse insight response', {
        response: response.substring(0, 200),
        error: error instanceof Error ? error.message : String(error)
      })

      // Fallback: extract insights from text manually
      return this.extractInsightsFromText(response)
    }
  }

  /**
   * Fallback method to extract insights from plain text
   */
  private extractInsightsFromText(text: string): Array<{
    insight: string
    confidence: number
  }> {
    const insights: Array<{ insight: string; confidence: number }> = []
    
    // Look for lines that seem like insights (bullets, numbered lists, etc.)
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 20)
    
    for (const line of lines) {
      if (line.match(/^[-*•]\s/) || line.match(/^\d+\.\s/) || line.toLowerCase().includes('insight')) {
        const cleanInsight = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim()
        if (cleanInsight.length > 10) {
          insights.push({
            insight: cleanInsight,
            confidence: 0.6 // Default confidence for extracted insights
          })
        }
      }
    }

    return insights.slice(0, 3) // Limit to 3 insights
  }

  /**
   * Merge semantically similar insights
   */
  private async mergeRelatedInsights(insights: ExtractedInsight[]): Promise<ExtractedInsight[]> {
    if (insights.length <= 1) {
      return insights
    }

    try {
      // Generate embeddings for all insights
      const insightTexts = insights.map(insight => insight.content)
      const embeddings = await embeddingService.generateBatchEmbeddings(
        insightTexts.map((text, index) => ({ id: `insight_${index}`, text }))
      )

      // Implement similarity-based merging
      const similarityThreshold = 0.85 // High threshold to avoid false merges
      const merged: ExtractedInsight[] = []
      const processed = new Set<number>()

      for (let i = 0; i < insights.length; i++) {
        if (processed.has(i)) continue

        const baseInsight = insights[i]
        const similarIndices = [i]
        
        // Find similar insights
        for (let j = i + 1; j < insights.length; j++) {
          if (processed.has(j)) continue

          const similarity = this.calculateCosineSimilarity(
            embeddings[i].embedding,
            embeddings[j].embedding
          )

          if (similarity >= similarityThreshold) {
            similarIndices.push(j)
          }
        }

        // Mark all similar insights as processed
        similarIndices.forEach(idx => processed.add(idx))

        if (similarIndices.length > 1) {
          // Merge similar insights
          const similarInsights = similarIndices.map(idx => insights[idx])
          const mergedInsight = this.mergeSimilarInsights(similarInsights)
          merged.push(mergedInsight)
          
          logger.debug('Merged similar insights', {
            originalCount: similarIndices.length,
            similarity: similarIndices.length > 1 ? 'above_threshold' : 'unique',
            mergedContent: mergedInsight.content.substring(0, 100)
          })
        } else {
          // Keep unique insight as-is
          merged.push(baseInsight)
        }
      }

      logger.debug('Insight merging completed', {
        originalCount: insights.length,
        mergedCount: merged.length,
        reductionPercentage: Math.round((1 - merged.length / insights.length) * 100)
      })

      return merged

    } catch (error) {
      logger.warn('Failed to merge related insights', {
        insightCount: insights.length,
        error: error instanceof Error ? error.message : String(error)
      })

      return insights
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same length')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i]
      normA += vectorA[i] * vectorA[i]
      normB += vectorB[i] * vectorB[i]
    }

    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)

    if (normA === 0 || normB === 0) {
      return 0
    }

    return dotProduct / (normA * normB)
  }

  /**
   * Merge similar insights into a single insight
   */
  private mergeSimilarInsights(insights: ExtractedInsight[]): ExtractedInsight {
    if (insights.length === 1) {
      return insights[0]
    }

    // Use the insight with highest confidence as the base
    const sortedByConfidence = [...insights].sort((a, b) => b.confidenceScore - a.confidenceScore)
    const baseInsight = sortedByConfidence[0]

    // Combine all source chunk IDs
    const allSourceChunkIds = insights.reduce((acc, insight) => {
      insight.sourceChunkIds.forEach(id => {
        if (!acc.includes(id)) {
          acc.push(id)
        }
      })
      return acc
    }, [] as UUID[])

    // Calculate average confidence score
    const averageConfidence = insights.reduce((sum, insight) => sum + insight.confidenceScore, 0) / insights.length

    // For content, we keep the highest confidence insight's content
    // In a more sophisticated implementation, we could use AI to merge the content
    return {
      content: baseInsight.content,
      confidenceScore: Math.min(0.95, averageConfidence), // Cap at 0.95 to indicate merged content
      sourceChunkIds: allSourceChunkIds
    }
  }

  /**
   * Store insights in database with embeddings
   */
  private async storeInsights(
    insights: ExtractedInsight[],
    documentId: UUID,
    userId: UUID
  ): Promise<ExtractedInsight[]> {
    if (insights.length === 0) {
      return []
    }

    try {
      // Generate embeddings for insights
      const embeddingInputs = insights.map((insight, index) => ({
        id: `insight_${index}`,
        text: insight.content
      }))

      const embeddings = await embeddingService.generateBatchEmbeddings(embeddingInputs)

      // Prepare insight data for database
      const insightInserts: InsightInsert[] = insights.map((insight, index) => ({
        document_id: documentId,
        user_id: userId,
        content: insight.content,
        embedding: embeddings[index].embedding,
        source_chunk_ids: insight.sourceChunkIds,
        confidence_score: insight.confidenceScore
      }))

      // Insert insights into database
      await executeQuery<null>(
        async (client) => {
          return await client
            .from('insights')
            .insert(insightInserts)
        }
      )

      logger.debug('Insights stored successfully', {
        documentId,
        insightCount: insights.length
      })

      return insights

    } catch (error) {
      throw new DatabaseError(
        'Failed to store insights in database',
        'RETRY',
        {
          operation: 'INSERT',
          table: 'insights',
          documentId,
          userId,
          insightCount: insights.length,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Get health status of insight extraction service
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    lastCheck: Date
    details?: Record<string, unknown>
  }> {
    try {
      // Test insight extraction with sample content
      const testContent = "Users frequently mention difficulty finding the search feature. Many abandon the process after failing to locate it within 30 seconds."
      
      const testInsights = await this.extractInsightsFromSegment(
        testContent,
        ['test-chunk-id'] as UUID[],
        0.5
      )

      return {
        status: testInsights.length > 0 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: {
          testInsightsExtracted: testInsights.length,
          aiModelUsed: OPENAI_MODELS.CHAT_PRIMARY
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

// Export singleton instance
const insightExtractionService = new InsightExtractionService()
export default insightExtractionService
export { InsightExtractionService }
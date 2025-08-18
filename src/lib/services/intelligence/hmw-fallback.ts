/**
 * HMW Fallback Generator using AI SDK v5
 * Provides local generation of How Might We questions when DSPy service is unavailable
 */

import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { config } from '../../config'
import { logger, startPerformance, endPerformance } from '../../logger'
import type {
  HMWContext,
  HMWResult,
  SourceReferences,
  FallbackHMWResult
} from './types'
import { FallbackGenerationError } from './types'

export class HMWFallbackService {
  constructor() { }

  /**
   * Generate HMW questions using OpenAI direct API
   */
  async generateHMWs(
    context: HMWContext,
    count: number = 5,
    temperature: number = 0.7
  ): Promise<HMWResult[]> {
    const trackingId = startPerformance('hmw_fallback_generation')

    try {
      // Validate we have some context
      if (!this.hasValidContext(context)) {
        throw new FallbackGenerationError(
          'At least one context type (insights, metrics, jtbds) must be provided',
          'INVALID_CONTEXT'
        )
      }

      // Generate HMWs using AI SDK
      const result = await generateText({
        model: openai(config.openai.model),
        system: this.buildSystemPrompt(),
        prompt: this.buildUserPrompt(context, count),
        temperature,
        maxTokens: 1000,
        maxRetries: 2
      })

      // Parse and process results
      const rawHMWs = this.parseHMWsFromText(result.text)
      const normalizedHMWs = this.normalizeHMWs(rawHMWs)
      const scoredHMWs = this.scoreHMWs(normalizedHMWs, context)

      // Format as HMWResult objects
      const hmwResults = this.formatAsHMWResults(scoredHMWs, context, count)

      endPerformance(trackingId, true, {
        count: hmwResults.length,
        requestedCount: count,
        usage: result.usage
      })

      logger.info('HMW fallback generation completed', {
        requestedCount: count,
        generatedCount: hmwResults.length,
        contextTypes: this.getContextTypes(context),
        tokenUsage: result.usage
      })

      return hmwResults

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      logger.error('HMW fallback generation failed', {
        error: error instanceof Error ? error.message : String(error),
        contextTypes: this.getContextTypes(context),
        count
      })

      if (error instanceof FallbackGenerationError) {
        throw error
      }

      throw new FallbackGenerationError(
        'Failed to generate HMW questions using fallback',
        'FALLBACK_GENERATION_FAILED',
        error
      )
    }
  }

  /**
   * Build system prompt for HMW generation
   */
  private buildSystemPrompt(): string {
    return `You are an expert product strategist specializing in generating How Might We (HMW) questions.

Your role is to analyze customer insights, metrics, and jobs-to-be-done (JTBDs) to create actionable HMW questions that:
- Start with exactly "How might we" (proper capitalization)
- End with a question mark
- Are specific and actionable
- Build directly on the provided context
- Suggest concrete improvement opportunities

Guidelines:
1. Every question MUST start with "How might we" - no exceptions
2. Focus on the most impactful opportunities from the context
3. Make questions specific enough to be actionable
4. Vary the approaches (improve metrics, address jobs, leverage insights)
5. Return exactly the requested number of questions
6. Each question on a new line, numbered

Format each response as:
1. How might we [specific actionable question]?
2. How might we [specific actionable question]?
...

Do not include explanations, reasoning, or additional text - only the numbered HMW questions.`
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(context: HMWContext, count: number): string {
    const contextSections: string[] = []

    // Add insights section
    if (context.insights.length > 0) {
      contextSections.push('INSIGHTS:')
      context.insights.forEach((insight, i) => {
        contextSections.push(`${i + 1}. ${insight.content}`)
      })
      contextSections.push('')
    }

    // Add metrics section
    if (context.metrics.length > 0) {
      contextSections.push('METRICS:')
      context.metrics.forEach((metric, i) => {
        const description = metric.description ? ` - ${metric.description}` : ''
        const values = metric.current_value !== undefined && metric.target_value !== undefined
          ? ` (Current: ${metric.current_value}, Target: ${metric.target_value})`
          : ''
        contextSections.push(`${i + 1}. ${metric.name} (${metric.unit})${description}${values}`)
      })
      contextSections.push('')
    }

    // Add JTBDs section
    if (context.jtbds.length > 0) {
      contextSections.push('JOBS-TO-BE-DONE:')
      context.jtbds.forEach((jtbd, i) => {
        const contextInfo = jtbd.context ? ` (Context: ${jtbd.context})` : ''
        const priority = jtbd.priority ? ` [Priority: ${jtbd.priority}/5]` : ''
        contextSections.push(`${i + 1}. ${jtbd.statement}${contextInfo}${priority}`)
      })
      contextSections.push('')
    }

    const contextText = contextSections.join('\n')

    return `Based on the following context, generate exactly ${count} How Might We questions:

${contextText}

Generate ${count} actionable HMW questions that directly address opportunities from this context. Each question must start with "How might we" and end with "?". Number each question.`
  }

  /**
   * Parse HMW questions from generated text
   */
  private parseHMWsFromText(text: string): string[] {
    const lines = text.split('\n')
    const hmws: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        // Remove numbering (1., 2., etc.)
        const cleaned = trimmed.replace(/^\d+\.\s*/, '')
        if (cleaned.length > 15) { // Minimum reasonable HMW length
          hmws.push(cleaned)
        }
      }
    }

    return hmws
  }

  /**
   * Normalize HMW questions to ensure proper format
   */
  private normalizeHMWs(rawHMWs: string[]): string[] {
    return rawHMWs.map(hmw => this.normalizeHMWQuestion(hmw))
  }

  /**
   * Normalize a single HMW question
   */
  private normalizeHMWQuestion(question: string): string {
    let normalized = question.trim()

    // Check if already starts with "How might we"
    if (normalized.toLowerCase().startsWith('how might we')) {
      // Ensure proper capitalization
      normalized = normalized.replace(/^how might we/i, 'How might we')
    } else {
      // Remove common prefixes and add "How might we"
      const prefixesToRemove = [
        /^we could\s+/i,
        /^we might\s+/i,
        /^what if we\s+/i,
        /^could we\s+/i,
        /^might we\s+/i
      ]

      for (const prefix of prefixesToRemove) {
        normalized = normalized.replace(prefix, '')
      }

      // Convert to lowercase and add "How might we" prefix
      normalized = normalized.toLowerCase().trim()
      normalized = `How might we ${normalized}`
    }

    // Ensure question ends with ?
    if (!normalized.endsWith('?')) {
      normalized += '?'
    }

    return normalized
  }

  /**
   * Score HMWs based on context relevance
   */
  private scoreHMWs(hmws: string[], context: HMWContext): FallbackHMWResult[] {
    return hmws.map(question => ({
      question,
      score: this.calculateRelevanceScore(question, context),
      reasoning: 'Generated using fallback OpenAI direct API'
    }))
  }

  /**
   * Calculate relevance score for an HMW question
   */
  private calculateRelevanceScore(question: string, context: HMWContext): number {
    let score = 5.0 // Base score
    const questionLower = question.toLowerCase()

    // Collect all context text
    const allContextText = [
      ...context.insights.map(i => i.content),
      ...context.metrics.map(m => `${m.name} ${m.description || ''} ${m.unit}`),
      ...context.jtbds.map(j => `${j.statement} ${j.context || ''}`)
    ]

    // Calculate keyword alignment
    let keywordMatches = 0
    let totalKeywords = 0

    for (const contextItem of allContextText) {
      if (contextItem) {
        const words = contextItem.toLowerCase().split(/\s+/)
        totalKeywords += words.length

        for (const word of words) {
          if (word.length > 3 && questionLower.includes(word)) {
            keywordMatches++
          }
        }
      }
    }

    // Add alignment bonus (max 3 points)
    if (totalKeywords > 0) {
      const alignmentRatio = keywordMatches / totalKeywords
      score += alignmentRatio * 3.0
    }

    // Add quality indicator bonuses
    const qualityIndicators = [
      'improve', 'enhance', 'increase', 'reduce', 'optimize',
      'solve', 'address', 'help', 'enable', 'support',
      'better', 'more', 'less', 'faster', 'easier'
    ]

    for (const indicator of qualityIndicators) {
      if (questionLower.includes(indicator)) {
        score += 0.5
      }
    }

    // Clamp score to valid range
    return Math.max(0.0, Math.min(10.0, score))
  }

  /**
   * Format scored HMWs as HMWResult objects
   */
  private formatAsHMWResults(
    scoredHMWs: FallbackHMWResult[],
    context: HMWContext,
    requestedCount: number
  ): HMWResult[] {
    // Sort by score descending and take requested count
    const sorted = scoredHMWs
      .sort((a, b) => b.score - a.score)
      .slice(0, requestedCount)

    return sorted.map(hmw => ({
      question: hmw.question,
      score: Math.round(hmw.score * 100) / 100, // Round to 2 decimal places
      source_references: this.createSourceReferences(context),
      confidence: 0.7 // Moderate confidence for fallback generation
    }))
  }

  /**
   * Create source references from context
   */
  private createSourceReferences(context: HMWContext): SourceReferences {
    return {
      insight_ids: context.insights.map(i => i.id),
      metric_ids: context.metrics.map(m => m.id),
      jtbd_ids: context.jtbds.map(j => j.id)
    }
  }

  /**
   * Check if context has valid content
   */
  private hasValidContext(context: HMWContext): boolean {
    return (
      context.insights.length > 0 ||
      context.metrics.length > 0 ||
      context.jtbds.length > 0
    )
  }

  /**
   * Get context types for logging
   */
  private getContextTypes(context: HMWContext): string[] {
    const types: string[] = []
    if (context.insights.length > 0) types.push(`insights:${context.insights.length}`)
    if (context.metrics.length > 0) types.push(`metrics:${context.metrics.length}`)
    if (context.jtbds.length > 0) types.push(`jtbds:${context.jtbds.length}`)
    return types
  }
}

// Export singleton instance
export const hmwFallbackService = new HMWFallbackService()
export default hmwFallbackService
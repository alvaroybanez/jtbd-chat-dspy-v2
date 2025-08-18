/**
 * Solution Fallback Generator using AI SDK v5
 * Provides local generation of prioritized solutions when DSPy service is unavailable
 */

import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import { config } from '../../config'
import { logger, startPerformance, endPerformance } from '../../logger'
import type {
  SolutionContext,
  SolutionResult,
  SourceReferences,
  FallbackSolutionResult,
  HMWItem,
  MetricItem
} from './types'
import { SolutionGenerationError } from './types'

/**
 * AI SDK V1/V2 compatibility adapter for language models
 * TODO: Remove when AI SDK V2 fully supports language models
 */
function createCompatibleLanguageModel(model: any): LanguageModel {
  return model as LanguageModel
}

export class SolutionFallbackService {
  constructor() { }

  /**
   * Generate solutions using OpenAI direct API
   */
  async generateSolutions(
    hmws: HMWItem[],
    context: SolutionContext,
    count: number = 5,
    temperature: number = 0.7
  ): Promise<SolutionResult[]> {
    const trackingId = startPerformance('solution_fallback_generation')

    try {
      // Validate we have required context
      if (!this.hasValidContext(hmws, context)) {
        throw new SolutionGenerationError(
          'At least one HMW question and one metric must be provided',
          'INVALID_CONTEXT'
        )
      }

      // Generate solutions using AI SDK
      const result = await generateText({
        model: createCompatibleLanguageModel(openai(config.openai.model)),
        system: this.buildSystemPrompt(),
        prompt: this.buildUserPrompt(hmws, context, count),
        temperature,
        maxOutputTokens: 2000,
        maxRetries: 2
      })

      // Parse and process results
      const rawSolutions = this.parseSolutionsFromText(result.text)
      const scoredSolutions = this.scoreAndAssignMetrics(rawSolutions, context)

      // Format as SolutionResult objects
      const solutionResults = this.formatAsSolutionResults(scoredSolutions, context, hmws, count)

      endPerformance(trackingId, true, {
        count: solutionResults.length,
        requestedCount: count,
        usage: result.usage
      })

      logger.info('Solution fallback generation completed', {
        requestedCount: count,
        generatedCount: solutionResults.length,
        contextTypes: this.getContextTypes(context),
        hmwCount: hmws.length,
        tokenUsage: result.usage
      })

      return solutionResults

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      logger.error('Solution fallback generation failed', {
        error: error instanceof Error ? error.message : String(error),
        contextTypes: this.getContextTypes(context),
        hmwCount: hmws.length,
        count
      })

      if (error instanceof SolutionGenerationError) {
        throw error
      }

      throw new SolutionGenerationError(
        'Failed to generate solutions using fallback',
        'FALLBACK_GENERATION_FAILED',
        error
      )
    }
  }

  /**
   * Build system prompt for solution generation
   */
  private buildSystemPrompt(): string {
    return `You are an expert product strategist and innovation consultant specializing in Jobs-to-be-Done (JTBD) methodology. Your role is to transform "How Might We" questions into actionable, prioritized solutions.

Key Guidelines:
1. Generate practical, implementable solutions that directly address the HMW questions
2. Each solution should be specific and actionable, not generic advice
3. Focus on user value and business impact
4. Consider both immediate wins and long-term strategic value
5. Assign impact scores (1-10) based on potential value, reach, and strategic importance
6. Assign effort scores (1-10) based on implementation complexity, resources needed, and timeline
7. Solutions should align with available metrics and support measurable outcomes

Response Format:
For each solution, provide:
- TITLE: Clear, concise solution name (5-50 chars)
- DESCRIPTION: Detailed explanation of the solution and implementation approach (50-500 chars)  
- IMPACT: Score from 1-10 (10 = highest impact)
- EFFORT: Score from 1-10 (10 = highest effort/complexity)
- REASONING: Brief explanation of scoring rationale

Ensure solutions are diverse, covering different approaches and timeframes.`
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(hmws: HMWItem[], context: SolutionContext, count: number): string {
    const hmwList = hmws.map((hmw, index) => `${index + 1}. ${hmw.question}`).join('\n')
    
    const metricsText = context.metrics.length > 0
      ? context.metrics.map(m => `- ${m.name}: ${m.description || 'No description'} (${m.unit})`).join('\n')
      : 'No metrics provided'

    const insightsText = context.insights.length > 0
      ? context.insights.slice(0, 3).map(i => `- ${i.content.substring(0, 100)}...`).join('\n')
      : 'No insights provided'

    const jtbdsText = context.jtbds.length > 0
      ? context.jtbds.slice(0, 3).map(j => `- ${j.statement.substring(0, 100)}...`).join('\n')
      : 'No JTBDs provided'

    return `Generate ${count} prioritized solutions based on the following context:

HMW QUESTIONS:
${hmwList}

AVAILABLE METRICS (solutions must align with these):
${metricsText}

KEY INSIGHTS:
${insightsText}

JOBS-TO-BE-DONE:
${jtbdsText}

Please provide ${count} diverse, actionable solutions that address these HMW questions. Each solution should:
1. Directly solve one or more HMW questions
2. Align with the available metrics for measurement
3. Consider the insights and JTBD context provided
4. Include realistic impact and effort scoring

Format each solution clearly with TITLE, DESCRIPTION, IMPACT, EFFORT, and REASONING sections.`
  }

  /**
   * Parse solutions from AI response text
   */
  private parseSolutionsFromText(text: string): FallbackSolutionResult[] {
    const solutions: FallbackSolutionResult[] = []
    
    // Split text into solution blocks (looking for TITLE: patterns)
    const solutionBlocks = text.split(/(?=TITLE:|^\d+\.|\n\d+\.)/gi).filter(block => block.trim().length > 0)
    
    for (const block of solutionBlocks) {
      try {
        const solution = this.parseSingleSolution(block)
        if (solution) {
          solutions.push(solution)
        }
      } catch (error) {
        logger.warn('Failed to parse solution block', { 
          block: block.substring(0, 100),
          error: error instanceof Error ? error.message : String(error)
        })
        continue
      }
    }

    return solutions
  }

  /**
   * Parse a single solution from text block
   */
  private parseSingleSolution(block: string): FallbackSolutionResult | null {
    // Extract title
    const titleMatch = block.match(/TITLE:\s*(.+?)(?:\n|DESCRIPTION:|$)/is)
    const title = titleMatch?.[1]?.trim()

    // Extract description  
    const descMatch = block.match(/DESCRIPTION:\s*(.+?)(?:\n|IMPACT:|$)/is)
    const description = descMatch?.[1]?.trim()

    // Extract impact score
    const impactMatch = block.match(/IMPACT:\s*(\d+)/i)
    const impact_score = impactMatch ? parseInt(impactMatch[1]) : null

    // Extract effort score
    const effortMatch = block.match(/EFFORT:\s*(\d+)/i)
    const effort_score = effortMatch ? parseInt(effortMatch[1]) : null

    // Extract reasoning
    const reasoningMatch = block.match(/REASONING:\s*(.+?)(?:\n\n|$)/is)
    const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided'

    // Validate required fields
    if (!title || !description || impact_score === null || effort_score === null) {
      return null
    }

    return {
      title: title.substring(0, 100),
      description: description.substring(0, 1000),
      impact_score: Math.max(1, Math.min(10, impact_score)),
      effort_score: Math.max(1, Math.min(10, effort_score)),
      assigned_metrics: [], // Will be assigned in next step
      reasoning
    }
  }

  /**
   * Score solutions and assign metrics intelligently
   */
  private scoreAndAssignMetrics(
    solutions: FallbackSolutionResult[],
    context: SolutionContext
  ): FallbackSolutionResult[] {
    return solutions.map(solution => {
      // Intelligent metric assignment based on solution content
      const assignedMetrics = this.assignMetricsToSolution(solution, context.metrics)
      
      return {
        ...solution,
        assigned_metrics: assignedMetrics
      }
    })
  }

  /**
   * Intelligently assign metrics to a solution based on content relevance
   */
  private assignMetricsToSolution(solution: FallbackSolutionResult, metrics: MetricItem[]): string[] {
    const solutionText = `${solution.title} ${solution.description}`.toLowerCase()
    const relevanceScores: Array<{ id: string; score: number }> = []

    for (const metric of metrics) {
      let score = 0.0
      const metricText = `${metric.name} ${metric.description || ''}`.toLowerCase()

      // Keyword matching
      const metricWords = metricText.split().filter(word => word.length > 3)
      for (const word of metricWords) {
        if (solutionText.includes(word)) {
          score += 1.0
        }
      }

      // Bonus for common metric terms and solution alignment
      const metricTerms: Record<string, number> = {
        'engagement': 0.8, 'conversion': 0.9, 'revenue': 0.9, 'sales': 0.9,
        'satisfaction': 0.7, 'retention': 0.8, 'growth': 0.9, 'adoption': 0.8,
        'efficiency': 0.7, 'performance': 0.7, 'quality': 0.6, 'experience': 0.7,
        'cost': 0.8, 'time': 0.6, 'usage': 0.7, 'completion': 0.6, 'success': 0.7
      }

      for (const [term, weight] of Object.entries(metricTerms)) {
        if (metricText.includes(term) && solutionText.includes(term)) {
          score += weight
        }
      }

      relevanceScores.push({ id: metric.id, score })
    }

    // Sort by relevance and return top metric(s)
    relevanceScores.sort((a, b) => b.score - a.score)
    
    // Return at least one metric (most relevant), but can return multiple if highly relevant
    const assignedMetrics = [relevanceScores[0].id]
    
    // Add additional highly relevant metrics
    for (let i = 1; i < Math.min(3, relevanceScores.length); i++) {
      if (relevanceScores[i].score >= 2.0) {
        assignedMetrics.push(relevanceScores[i].id)
      }
    }

    return assignedMetrics
  }

  /**
   * Format solutions as API response format
   */
  private formatAsSolutionResults(
    solutions: FallbackSolutionResult[],
    context: SolutionContext,
    hmws: HMWItem[],
    requestedCount: number
  ): SolutionResult[] {
    const results: SolutionResult[] = []

    // Ensure we have at least the requested count
    const solutionsToUse = solutions.length >= requestedCount 
      ? solutions.slice(0, requestedCount)
      : solutions

    // If we don't have enough, generate fallback solutions
    while (solutionsToUse.length < requestedCount) {
      solutionsToUse.push(this.createFallbackSolution(hmws, context, solutionsToUse.length + 1))
    }

    for (const solution of solutionsToUse) {
      const sourceReferences: SourceReferences = {
        insight_ids: context.insights.slice(0, 2).map(i => i.id),
        metric_ids: solution.assigned_metrics,
        jtbd_ids: context.jtbds.slice(0, 2).map(j => j.id)
      }

      results.push({
        title: solution.title,
        description: solution.description,
        impact_score: solution.impact_score,
        effort_score: solution.effort_score,
        final_score: parseFloat((solution.impact_score / solution.effort_score).toFixed(2)),
        assigned_metrics: solution.assigned_metrics,
        source_references: sourceReferences,
        confidence: 0.7 // Fallback confidence score
      })
    }

    // Sort by final score (impact/effort ratio) descending
    results.sort((a, b) => b.final_score - a.final_score)

    return results
  }

  /**
   * Create a fallback solution when parsing fails
   */
  private createFallbackSolution(
    hmws: HMWItem[],
    context: SolutionContext,
    index: number
  ): FallbackSolutionResult {
    const hmw = hmws[index % hmws.length]
    const fallbackMetricId = context.metrics[0]?.id || 'fallback-metric'

    return {
      title: `Solution ${index}: ${hmw.question.substring(12, 50)}...`,
      description: `Strategic approach to address: ${hmw.question}. This solution focuses on leveraging available insights and aligning with key metrics for measurable impact.`,
      impact_score: Math.max(1, Math.min(10, 6 + Math.floor(Math.random() * 3))), // 6-8 range
      effort_score: Math.max(1, Math.min(10, 4 + Math.floor(Math.random() * 3))), // 4-6 range  
      assigned_metrics: [fallbackMetricId],
      reasoning: 'Generated as fallback when AI parsing failed'
    }
  }

  /**
   * Check if we have valid context for generation
   */
  private hasValidContext(hmws: HMWItem[], context: SolutionContext): boolean {
    return hmws.length > 0 && context.metrics.length > 0
  }

  /**
   * Get context types for logging
   */
  private getContextTypes(context: SolutionContext): string[] {
    const types: string[] = []
    if (context.insights.length > 0) types.push(`insights(${context.insights.length})`)
    if (context.metrics.length > 0) types.push(`metrics(${context.metrics.length})`)
    if (context.jtbds.length > 0) types.push(`jtbds(${context.jtbds.length})`)
    if (context.hmws.length > 0) types.push(`hmws(${context.hmws.length})`)
    return types
  }
}

// Export singleton instance
export const solutionFallbackService = new SolutionFallbackService()
export default solutionFallbackService
/**
 * Chat Intent Detection Service for JTBD Assistant Platform
 * Keyword-based intent detection with confidence scoring
 */

import { INTENT_KEYWORDS } from '../../config/constants'
import { logger } from '../../logger'
import { BaseError } from '../../errors/base'

export enum ChatIntent {
  RETRIEVE_INSIGHTS = 'retrieve_insights',
  RETRIEVE_METRICS = 'retrieve_metrics',
  RETRIEVE_JTBDS = 'retrieve_jtbds',
  GENERATE_HMW = 'generate_hmw',
  CREATE_SOLUTIONS = 'create_solutions',
  GENERAL_EXPLORATION = 'general_exploration'
}

export interface IntentDetectionResult {
  intent: ChatIntent
  confidence: number
  matchedKeywords: string[]
  rawMessage: string
  context?: {
    alternativeIntents?: Array<{ intent: ChatIntent; confidence: number }>
    processingTime: number
  }
}

const THRESHOLDS = { HIGH: 0.8, MEDIUM: 0.6, LOW: 0.4, MIN: 0.3 } as const
const WEIGHTS = { EXACT: 1.0, PARTIAL: 0.7, POSITION: 0.1, MULTI: 0.2 } as const

class ChatIntentDetector {
  private readonly keywordMap = new Map<string, ChatIntent>()

  constructor() {
    // Build keyword mappings
    INTENT_KEYWORDS.INSIGHTS.forEach(k => this.keywordMap.set(k.toLowerCase(), ChatIntent.RETRIEVE_INSIGHTS))
    INTENT_KEYWORDS.METRICS.forEach(k => this.keywordMap.set(k.toLowerCase(), ChatIntent.RETRIEVE_METRICS))
    INTENT_KEYWORDS.JTBDS.forEach(k => this.keywordMap.set(k.toLowerCase(), ChatIntent.RETRIEVE_JTBDS))
    INTENT_KEYWORDS.HMW.forEach(k => this.keywordMap.set(k.toLowerCase(), ChatIntent.GENERATE_HMW))
    INTENT_KEYWORDS.SOLUTIONS.forEach(k => this.keywordMap.set(k.toLowerCase(), ChatIntent.CREATE_SOLUTIONS))
  }

  public detectIntent(message: string): IntentDetectionResult {
    const startTime = Date.now()
    
    try {
      if (!message?.trim()) {
        return this.createDefault(message || '', startTime)
      }

      const normalized = message.toLowerCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ')
      const matches: Array<{ keyword: string; intent: ChatIntent; score: number }> = []

      // Find exact matches first
      this.keywordMap.forEach((intent, keyword) => {
        const index = normalized.indexOf(keyword)
        if (index !== -1) {
          const score = WEIGHTS.EXACT + (index <= 10 ? WEIGHTS.POSITION : 0)
          matches.push({ keyword, intent, score })
        }
      })

      // Fallback to partial matches
      if (matches.length === 0) {
        const words = normalized.split(' ')
        this.keywordMap.forEach((intent, keyword) => {
          if (words.some(w => w.includes(keyword) || keyword.includes(w))) {
            matches.push({ keyword, intent, score: WEIGHTS.PARTIAL })
          }
        })
      }

      if (matches.length === 0) {
        logger.debug('No keyword matches found', { message })
        return this.createDefault(message, startTime)
      }

      // Calculate intent scores
      const scores = new Map<ChatIntent, number>()
      for (const match of matches) {
        const current = scores.get(match.intent) || 0
        scores.set(match.intent, current + match.score)
      }

      // Apply multi-keyword boost
      scores.forEach((score, intent) => {
        const count = matches.filter(m => m.intent === intent).length
        if (count > 1) {
          scores.set(intent, score + WEIGHTS.MULTI * (count - 1))
        }
      })

      // Select best intent
      const [bestIntent, bestScore] = Array.from(scores.entries()).reduce((a, b) => a[1] > b[1] ? a : b)
      
      // Calculate confidence
      let confidence = Math.min(bestScore, 1.0)
      if (matches.some(m => m.score === WEIGHTS.PARTIAL)) confidence *= 0.8
      
      const sortedScores = Array.from(scores.values()).sort((a, b) => b - a)
      if (sortedScores.length > 1 && sortedScores[1] > sortedScores[0] * 0.7) {
        confidence *= 0.9
      }

      confidence = Math.max(confidence, THRESHOLDS.MIN)

      const result: IntentDetectionResult = {
        intent: bestIntent,
        confidence,
        matchedKeywords: matches.filter(m => m.intent === bestIntent).map(m => m.keyword),
        rawMessage: message,
        context: {
          alternativeIntents: Array.from(scores.entries())
            .filter(([intent]) => intent !== bestIntent)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 2)
            .map(([intent, score]) => ({ intent, confidence: Math.min(score * 0.8, 0.9) })),
          processingTime: Date.now() - startTime
        }
      }

      logger.debug('Intent detected', {
        intent: result.intent,
        confidence: result.confidence,
        processingTime: result.context?.processingTime
      })

      return result

    } catch (error) {
      logger.error('Intent detection failed', error, { message })
      return this.createDefault(message, startTime)
    }
  }

  private createDefault(message: string, startTime: number): IntentDetectionResult {
    return {
      intent: ChatIntent.GENERAL_EXPLORATION,
      confidence: THRESHOLDS.LOW,
      matchedKeywords: [],
      rawMessage: message,
      context: { processingTime: Date.now() - startTime }
    }
  }
}

// Singleton export
export const intentDetector = new ChatIntentDetector()

// Convenience functions
export function detectChatIntent(message: string): IntentDetectionResult {
  return intentDetector.detectIntent(message)
}

export function requiresContext(intent: ChatIntent): boolean {
  return [ChatIntent.GENERATE_HMW, ChatIntent.CREATE_SOLUTIONS].includes(intent)
}

export function isRetrievalIntent(intent: ChatIntent): boolean {
  return [
    ChatIntent.RETRIEVE_INSIGHTS,
    ChatIntent.RETRIEVE_METRICS,
    ChatIntent.RETRIEVE_JTBDS
  ].includes(intent)
}

export class IntentDetectionError extends BaseError {
  constructor(message: string, context: Record<string, unknown> = {}, cause?: Error) {
    super('INTENT_DETECTION_ERROR', message, 'NONE', context, cause)
  }
}
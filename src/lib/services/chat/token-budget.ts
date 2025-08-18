/**
 * Token Budget Management Service
 * Provides token counting, budget enforcement, and intelligent message truncation
 * for the JTBD Assistant Platform chat system
 */

import { TokenCounter } from '../text-processing/tokenizer'
import { logger } from '../../logger'
import type { Message, MessageRole } from '../../database/types'

// Maximum token budget as per requirements
const MAX_TOKEN_BUDGET = 4000
const WARNING_THRESHOLD = 0.8 // 80%
const CRITICAL_THRESHOLD = 0.95 // 95%

// Minimum tokens to preserve for context items
const MIN_CONTEXT_TOKENS = 500
const MIN_RECENT_MESSAGES = 2 // Always preserve last user message and response

export interface ContextItem {
  id: string
  type: 'insight' | 'metric' | 'jtbd' | 'hmw' | 'solution'
  content: string
  metadata?: Record<string, unknown>
}

export interface TokenBudgetStatus {
  currentTokens: number
  maxTokens: number
  remainingTokens: number
  utilizationPercentage: number
  status: 'healthy' | 'warning' | 'critical' | 'exceeded'
  warnings: string[]
}

export interface TruncationResult {
  messages: Message[]
  contextItems: ContextItem[]
  tokensRemoved: number
  messagesRemoved: number
  contextItemsRemoved: number
  preservedItems: {
    recentMessages: number
    systemMessages: number
    contextItems: number
  }
  truncationLog: string[]
}

export interface BudgetOptimization {
  canFit: boolean
  recommendedActions: string[]
  tokenSavings: number
  optimizedMessages?: Message[]
  optimizedContextItems?: ContextItem[]
}

/**
 * Token Budget Manager
 * Handles token counting, budget enforcement, and intelligent truncation
 */
export class TokenBudgetManager {
  private readonly tokenCounter: TokenCounter
  private readonly maxTokens: number

  constructor(maxTokens = MAX_TOKEN_BUDGET) {
    this.tokenCounter = new TokenCounter()
    this.maxTokens = maxTokens
  }

  /**
   * Calculate total token usage for messages and context items
   */
  calculateTokenBudget(
    messages: Message[],
    contextItems: ContextItem[] = []
  ): number {
    const messageTokens = this.calculateMessageTokens(messages)
    const contextTokens = this.calculateContextTokens(contextItems)
    
    return messageTokens + contextTokens
  }

  /**
   * Get detailed budget status with warnings
   */
  getBudgetStatus(
    messages: Message[],
    contextItems: ContextItem[] = []
  ): TokenBudgetStatus {
    const currentTokens = this.calculateTokenBudget(messages, contextItems)
    const remainingTokens = Math.max(0, this.maxTokens - currentTokens)
    const utilizationPercentage = currentTokens / this.maxTokens
    
    const warnings: string[] = []
    let status: TokenBudgetStatus['status'] = 'healthy'
    
    if (utilizationPercentage >= 1.0) {
      status = 'exceeded'
      warnings.push(`Token budget exceeded by ${currentTokens - this.maxTokens} tokens`)
    } else if (utilizationPercentage >= CRITICAL_THRESHOLD) {
      status = 'critical'
      warnings.push(`Critical: ${Math.round(utilizationPercentage * 100)}% of token budget used`)
    } else if (utilizationPercentage >= WARNING_THRESHOLD) {
      status = 'warning'
      warnings.push(`Warning: ${Math.round(utilizationPercentage * 100)}% of token budget used`)
    }

    return {
      currentTokens,
      maxTokens: this.maxTokens,
      remainingTokens,
      utilizationPercentage,
      status,
      warnings
    }
  }

  /**
   * Truncate messages and context items to fit within budget
   */
  truncateToFitBudget(
    messages: Message[],
    contextItems: ContextItem[] = [],
    maxTokens = this.maxTokens
  ): TruncationResult {
    const truncationLog: string[] = []
    const workingMessages = [...messages]
    const workingContextItems = [...contextItems]
    
    const initialTokens = this.calculateTokenBudget(workingMessages, workingContextItems)
    
    if (initialTokens <= maxTokens) {
      return {
        messages: workingMessages,
        contextItems: workingContextItems,
        tokensRemoved: 0,
        messagesRemoved: 0,
        contextItemsRemoved: 0,
        preservedItems: {
          recentMessages: Math.min(messages.length, MIN_RECENT_MESSAGES),
          systemMessages: messages.filter(m => this.isSystemMessage(m)).length,
          contextItems: contextItems.length
        },
        truncationLog: ['No truncation needed']
      }
    }

    truncationLog.push(`Starting truncation: ${initialTokens} tokens, target: ${maxTokens}`)

    // Step 1: Preserve essential items
    const recentMessages = this.getRecentMessages(workingMessages, MIN_RECENT_MESSAGES)
    const systemMessages = workingMessages.filter(m => this.isSystemMessage(m))
    const priorityContextItems = this.getPriorityContextItems(workingContextItems)

    // Step 2: Calculate tokens for essential items
    const essentialTokens = 
      this.calculateMessageTokens(recentMessages) +
      this.calculateMessageTokens(systemMessages) +
      this.calculateContextTokens(priorityContextItems)

    truncationLog.push(`Essential items: ${essentialTokens} tokens`)

    // Step 3: Remove older messages first
    const remainingMessages = workingMessages.filter(
      m => !recentMessages.includes(m) && !systemMessages.includes(m)
    )
    
    let currentTokens = essentialTokens
    const keptMessages = [...recentMessages, ...systemMessages]
    let messagesRemoved = 0

    // Add older messages until we approach the limit
    for (let i = remainingMessages.length - 1; i >= 0; i--) {
      const message = remainingMessages[i]
      const messageTokens = this.tokenCounter.count(message.content)
      
      if (currentTokens + messageTokens <= maxTokens - MIN_CONTEXT_TOKENS) {
        keptMessages.push(message)
        currentTokens += messageTokens
      } else {
        messagesRemoved++
      }
    }

    // Step 4: Add context items if space allows
    const remainingContextItems = workingContextItems.filter(
      item => !priorityContextItems.includes(item)
    )
    
    const keptContextItems = [...priorityContextItems]
    let contextItemsRemoved = 0

    for (const item of remainingContextItems) {
      const itemTokens = this.tokenCounter.count(item.content)
      
      if (currentTokens + itemTokens <= maxTokens) {
        keptContextItems.push(item)
        currentTokens += itemTokens
      } else {
        contextItemsRemoved++
      }
    }

    // Sort messages back to chronological order
    const finalMessages = keptMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const finalTokens = this.calculateTokenBudget(finalMessages, keptContextItems)
    const tokensRemoved = initialTokens - finalTokens

    truncationLog.push(
      `Truncation complete: ${finalTokens} tokens (removed ${tokensRemoved})`
    )
    
    logger.info('Token budget truncation performed', {
      initialTokens,
      finalTokens,
      tokensRemoved,
      messagesRemoved,
      contextItemsRemoved,
      targetTokens: maxTokens
    })

    return {
      messages: finalMessages,
      contextItems: keptContextItems,
      tokensRemoved,
      messagesRemoved,
      contextItemsRemoved,
      preservedItems: {
        recentMessages: recentMessages.length,
        systemMessages: systemMessages.length,
        contextItems: priorityContextItems.length
      },
      truncationLog
    }
  }

  /**
   * Optimize content for budget constraints
   */
  optimizeForBudget(
    messages: Message[],
    contextItems: ContextItem[] = [],
    targetTokens = this.maxTokens
  ): BudgetOptimization {
    const currentTokens = this.calculateTokenBudget(messages, contextItems)
    const recommendedActions: string[] = []
    let tokenSavings = 0

    if (currentTokens <= targetTokens) {
      return {
        canFit: true,
        recommendedActions: ['Content fits within budget'],
        tokenSavings: 0
      }
    }

    const excessTokens = currentTokens - targetTokens

    // Analyze optimization opportunities
    const longMessages = messages.filter(m => 
      this.tokenCounter.count(m.content) > 200
    )
    
    const duplicateContextItems = this.findDuplicateContextItems(contextItems)
    const lowPriorityItems = contextItems.filter(item => 
      item.type === 'solution' || item.type === 'hmw'
    )

    // Generate recommendations
    if (longMessages.length > 0) {
      const potentialSavings = longMessages.reduce((sum, m) => 
        sum + Math.max(0, this.tokenCounter.count(m.content) - 150), 0
      )
      recommendedActions.push(
        `Truncate ${longMessages.length} long messages (potential savings: ${potentialSavings} tokens)`
      )
      tokenSavings += Math.min(potentialSavings, excessTokens)
    }

    if (duplicateContextItems.length > 0) {
      const duplicateSavings = duplicateContextItems.reduce((sum, item) => 
        sum + this.tokenCounter.count(item.content), 0
      )
      recommendedActions.push(
        `Remove ${duplicateContextItems.length} duplicate context items (savings: ${duplicateSavings} tokens)`
      )
      tokenSavings += duplicateSavings
    }

    if (lowPriorityItems.length > 0 && tokenSavings < excessTokens) {
      const lowPrioritySavings = lowPriorityItems.reduce((sum, item) => 
        sum + this.tokenCounter.count(item.content), 0
      )
      recommendedActions.push(
        `Consider removing ${lowPriorityItems.length} low-priority items (savings: ${lowPrioritySavings} tokens)`
      )
      tokenSavings += lowPrioritySavings
    }

    const canFit = tokenSavings >= excessTokens

    if (!canFit) {
      recommendedActions.push(
        'Consider starting a new conversation to manage token budget'
      )
    }

    return {
      canFit,
      recommendedActions,
      tokenSavings: Math.min(tokenSavings, excessTokens)
    }
  }

  /**
   * Calculate tokens for all messages
   */
  private calculateMessageTokens(messages: Message[]): number {
    return messages.reduce((total, message) => {
      const contentTokens = this.tokenCounter.count(message.content)
      // Add small overhead for role and metadata
      const metadataTokens = 10
      return total + contentTokens + metadataTokens
    }, 0)
  }

  /**
   * Calculate tokens for context items
   */
  private calculateContextTokens(contextItems: ContextItem[]): number {
    return contextItems.reduce((total, item) => {
      const contentTokens = this.tokenCounter.count(item.content)
      // Add overhead for type and metadata
      const metadataTokens = 15
      return total + contentTokens + metadataTokens
    }, 0)
  }

  /**
   * Get the most recent messages
   */
  private getRecentMessages(messages: Message[], count: number): Message[] {
    return messages
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, count)
  }

  /**
   * Check if message is a system message
   */
  private isSystemMessage(message: Message): boolean {
    return message.role === 'assistant' && (
      message.content.includes('assistant') ||
      message.content.includes('system') ||
      message.content.length < 50
    )
  }

  /**
   * Get priority context items (insights, metrics, JTBDs)
   */
  private getPriorityContextItems(contextItems: ContextItem[]): ContextItem[] {
    const priorityTypes = ['insight', 'metric', 'jtbd']
    return contextItems.filter(item => priorityTypes.includes(item.type))
  }

  /**
   * Find duplicate context items
   */
  private findDuplicateContextItems(contextItems: ContextItem[]): ContextItem[] {
    const seen = new Set<string>()
    const duplicates: ContextItem[] = []
    
    for (const item of contextItems) {
      const key = `${item.type}:${item.content.slice(0, 100)}`
      if (seen.has(key)) {
        duplicates.push(item)
      } else {
        seen.add(key)
      }
    }
    
    return duplicates
  }

  /**
   * Get cache statistics from the underlying token counter
   */
  getCacheStats() {
    return this.tokenCounter.getCacheStats()
  }

  /**
   * Clear the token counter cache
   */
  clearCache(): void {
    this.tokenCounter.clearCache()
  }

  /**
   * Get current max token limit
   */
  getMaxTokens(): number {
    return this.maxTokens
  }
}

// Export singleton instance
export const tokenBudgetManager = new TokenBudgetManager()

// Export types and constants
export { MAX_TOKEN_BUDGET, WARNING_THRESHOLD, CRITICAL_THRESHOLD }
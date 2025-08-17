/**
 * Token Budget Integration Example
 * Shows how to integrate token budget management into the chat API
 */

import { tokenBudgetManager, type ContextItem } from './token-budget'
import type { Message } from '../../database/types'
import { logger } from '../../logger'

export interface ChatProcessingResult {
  messages: Message[]
  contextItems: ContextItem[]
  budgetInfo: {
    totalTokens: number
    utilizationPercentage: number
    status: string
    warnings: string[]
  }
  truncationInfo?: {
    messagesRemoved: number
    contextItemsRemoved: number
    tokensRemoved: number
    truncationLog: string[]
  }
  optimization?: {
    canFit: boolean
    recommendedActions: string[]
    tokenSavings: number
  }
}

/**
 * Process chat messages with token budget management
 */
export async function processChatWithBudget(
  messages: Message[],
  contextItems: ContextItem[] = [],
  maxTokens?: number
): Promise<ChatProcessingResult> {
  const startTime = Date.now()
  
  try {
    // Calculate current budget status
    const budgetStatus = tokenBudgetManager.getBudgetStatus(messages, contextItems)
    
    logger.info('Chat token budget status', {
      currentTokens: budgetStatus.currentTokens,
      maxTokens: budgetStatus.maxTokens,
      utilization: budgetStatus.utilizationPercentage,
      status: budgetStatus.status,
      messageCount: messages.length,
      contextItemCount: contextItems.length
    })

    let finalMessages = messages
    let finalContextItems = contextItems
    let truncationInfo: ChatProcessingResult['truncationInfo']
    let optimization: ChatProcessingResult['optimization']

    // Handle different budget status levels
    switch (budgetStatus.status) {
      case 'exceeded':
        // Force truncation to fit within budget
        const truncationResult = tokenBudgetManager.truncateToFitBudget(
          messages,
          contextItems,
          maxTokens
        )
        
        finalMessages = truncationResult.messages
        finalContextItems = truncationResult.contextItems
        
        truncationInfo = {
          messagesRemoved: truncationResult.messagesRemoved,
          contextItemsRemoved: truncationResult.contextItemsRemoved,
          tokensRemoved: truncationResult.tokensRemoved,
          truncationLog: truncationResult.truncationLog
        }
        
        logger.warn('Token budget exceeded, truncation applied', truncationInfo)
        break
        
      case 'critical':
        // Get optimization recommendations but don't truncate yet
        const criticalOptimization = tokenBudgetManager.optimizeForBudget(
          messages,
          contextItems,
          maxTokens || budgetStatus.maxTokens
        )
        
        optimization = {
          canFit: criticalOptimization.canFit,
          recommendedActions: criticalOptimization.recommendedActions,
          tokenSavings: criticalOptimization.tokenSavings
        }
        
        logger.warn('Token budget critical', {
          canOptimize: optimization.canFit,
          potentialSavings: optimization.tokenSavings,
          recommendations: optimization.recommendedActions
        })
        break
        
      case 'warning':
        // Provide optimization suggestions
        const warningOptimization = tokenBudgetManager.optimizeForBudget(
          messages,
          contextItems,
          budgetStatus.maxTokens * 0.9 // Target 90% for warning level
        )
        
        optimization = {
          canFit: warningOptimization.canFit,
          recommendedActions: warningOptimization.recommendedActions,
          tokenSavings: warningOptimization.tokenSavings
        }
        
        logger.info('Token budget warning', {
          recommendations: optimization.recommendedActions
        })
        break
        
      default:
        // Healthy status, no action needed
        logger.debug('Token budget healthy', {
          remainingTokens: budgetStatus.remainingTokens
        })
    }

    // Final budget calculation
    const finalBudgetStatus = tokenBudgetManager.getBudgetStatus(
      finalMessages,
      finalContextItems
    )

    const result: ChatProcessingResult = {
      messages: finalMessages,
      contextItems: finalContextItems,
      budgetInfo: {
        totalTokens: finalBudgetStatus.currentTokens,
        utilizationPercentage: finalBudgetStatus.utilizationPercentage,
        status: finalBudgetStatus.status,
        warnings: finalBudgetStatus.warnings
      },
      truncationInfo,
      optimization
    }

    const processingTime = Date.now() - startTime
    
    logger.info('Chat budget processing completed', {
      processingTimeMs: processingTime,
      finalTokens: finalBudgetStatus.currentTokens,
      finalStatus: finalBudgetStatus.status,
      truncationApplied: !!truncationInfo
    })

    return result

  } catch (error) {
    logger.error('Error processing chat budget', {
      error: error instanceof Error ? error.message : 'Unknown error',
      messageCount: messages.length,
      contextItemCount: contextItems.length
    })
    
    // Fallback: return original data with error status
    return {
      messages,
      contextItems,
      budgetInfo: {
        totalTokens: 0,
        utilizationPercentage: 0,
        status: 'error',
        warnings: ['Failed to calculate token budget']
      }
    }
  }
}

/**
 * Helper function to check if new content can be added to chat
 */
export function canAddToChat(
  messages: Message[],
  contextItems: ContextItem[],
  newContentTokens: number,
  maxTokens?: number
): {
  canAdd: boolean
  remainingTokens: number
  recommendation?: string
} {
  const currentTokens = tokenBudgetManager.calculateTokenBudget(messages, contextItems)
  const budgetLimit = maxTokens || tokenBudgetManager.getMaxTokens()
  const remainingTokens = budgetLimit - currentTokens
  
  if (newContentTokens <= remainingTokens) {
    return {
      canAdd: true,
      remainingTokens: remainingTokens - newContentTokens
    }
  }
  
  // Check if truncation would allow the new content
  const truncationResult = tokenBudgetManager.truncateToFitBudget(
    messages,
    contextItems,
    budgetLimit - newContentTokens
  )
  
  const tokensAfterTruncation = tokenBudgetManager.calculateTokenBudget(
    truncationResult.messages,
    truncationResult.contextItems
  )
  
  if (tokensAfterTruncation + newContentTokens <= budgetLimit) {
    return {
      canAdd: true,
      remainingTokens: budgetLimit - tokensAfterTruncation - newContentTokens,
      recommendation: `Content can be added after removing ${truncationResult.messagesRemoved} messages and ${truncationResult.contextItemsRemoved} context items`
    }
  }
  
  return {
    canAdd: false,
    remainingTokens: 0,
    recommendation: 'Content too large even after truncation. Consider starting a new conversation.'
  }
}

/**
 * Get budget health metrics for monitoring
 */
export function getBudgetHealthMetrics(
  messages: Message[],
  contextItems: ContextItem[]
): {
  healthScore: number // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  recommendations: string[]
  cachePerformance: {
    size: number
    maxSize: number
    utilizationPercentage: number
  }
} {
  const status = tokenBudgetManager.getBudgetStatus(messages, contextItems)
  const cacheStats = tokenBudgetManager.getCacheStats()
  
  let healthScore: number
  let riskLevel: 'low' | 'medium' | 'high' | 'critical'
  const recommendations: string[] = []
  
  // Calculate health score (inverse of utilization)
  healthScore = Math.max(0, 100 - (status.utilizationPercentage * 100))
  
  // Determine risk level
  if (status.utilizationPercentage >= 0.95) {
    riskLevel = 'critical'
    recommendations.push('Immediate truncation recommended')
    recommendations.push('Consider starting new conversation')
  } else if (status.utilizationPercentage >= 0.8) {
    riskLevel = 'high'
    recommendations.push('Monitor token usage closely')
    recommendations.push('Remove non-essential context items')
  } else if (status.utilizationPercentage >= 0.6) {
    riskLevel = 'medium'
    recommendations.push('Review context item relevance')
  } else {
    riskLevel = 'low'
    recommendations.push('Token usage healthy')
  }
  
  // Cache performance recommendations
  const cacheUtilization = cacheStats.size / cacheStats.maxSize
  if (cacheUtilization > 0.8) {
    recommendations.push('Token cache nearing capacity')
  }
  
  return {
    healthScore: Math.round(healthScore),
    riskLevel,
    recommendations,
    cachePerformance: {
      size: cacheStats.size,
      maxSize: cacheStats.maxSize,
      utilizationPercentage: Math.round(cacheUtilization * 100)
    }
  }
}

/**
 * Utility function to format budget status for user display
 */
export function formatBudgetStatusForUser(result: ChatProcessingResult): string {
  const { budgetInfo, truncationInfo, optimization } = result
  
  let message = `Token usage: ${budgetInfo.totalTokens} (${Math.round(budgetInfo.utilizationPercentage * 100)}%)`
  
  if (truncationInfo) {
    message += `\n⚠️ Conversation was automatically trimmed to fit budget. Removed ${truncationInfo.messagesRemoved} messages.`
  } else if (optimization && !optimization.canFit) {
    message += `\n💡 Consider ${optimization.recommendedActions[0]?.toLowerCase()} to optimize token usage.`
  } else if (budgetInfo.status === 'warning') {
    message += '\n⚡ Approaching token limit. Some older messages may be removed soon.'
  }
  
  return message
}
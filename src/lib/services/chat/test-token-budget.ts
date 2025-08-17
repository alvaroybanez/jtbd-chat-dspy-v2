/**
 * Token Budget Manager Demonstration
 * Shows the key functionality of the token budget management system
 */

import { TokenBudgetManager, type ContextItem } from './token-budget'
import type { Message } from '../../database/types'

// Create mock data for testing
function createMockMessage(
  content: string,
  role: 'user' | 'assistant' = 'user',
  createdAt = new Date().toISOString()
): Message {
  return {
    id: `msg-${Math.random()}`,
    chat_id: 'chat-test',
    role,
    content,
    intent: null,
    context_items: null,
    processing_time_ms: null,
    token_count: null,
    created_at: createdAt
  }
}

function createMockContextItem(
  content: string,
  type: ContextItem['type'] = 'insight'
): ContextItem {
  return {
    id: `ctx-${Math.random()}`,
    type,
    content,
    metadata: {}
  }
}

/**
 * Demonstration of token budget management functionality
 */
export function demonstrateTokenBudgetManager(): void {
  console.log('=== Token Budget Manager Demonstration ===\n')
  
  // Create a budget manager with a small limit for testing
  const budgetManager = new TokenBudgetManager(500)
  
  // 1. Basic token calculation
  console.log('1. Basic Token Calculation:')
  const simpleMessages = [
    createMockMessage('Hello, I need help with my JTBD analysis.'),
    createMockMessage('What insights do we have from the user research?', 'assistant')
  ]
  
  const basicTokens = budgetManager.calculateTokenBudget(simpleMessages)
  console.log(`   Messages: ${simpleMessages.length}`)
  console.log(`   Total tokens: ${basicTokens}`)
  console.log()
  
  // 2. Budget status monitoring
  console.log('2. Budget Status Monitoring:')
  const status = budgetManager.getBudgetStatus(simpleMessages)
  console.log(`   Current tokens: ${status.currentTokens}`)
  console.log(`   Max tokens: ${status.maxTokens}`)
  console.log(`   Utilization: ${Math.round(status.utilizationPercentage * 100)}%`)
  console.log(`   Status: ${status.status}`)
  console.log(`   Warnings: ${status.warnings.join(', ') || 'None'}`)
  console.log()
  
  // 3. Context items integration
  console.log('3. Context Items Integration:')
  const contextItems = [
    createMockContextItem('Users struggle with the onboarding process, citing complexity and time requirements.', 'insight'),
    createMockContextItem('Average onboarding completion time: 12 minutes (target: 5 minutes)', 'metric'),
    createMockContextItem('When I am a new user, I want to complete onboarding quickly so I can start using the app.', 'jtbd')
  ]
  
  const totalTokens = budgetManager.calculateTokenBudget(simpleMessages, contextItems)
  console.log(`   Messages: ${simpleMessages.length}`)
  console.log(`   Context items: ${contextItems.length}`)
  console.log(`   Total tokens: ${totalTokens}`)
  console.log()
  
  // 4. Truncation demonstration
  console.log('4. Truncation Demonstration:')
  const longContent = 'This is a very long message that contains extensive details about user research findings, including specific quotes from interviews, statistical analysis of user behavior patterns, and comprehensive recommendations for product improvements. '.repeat(5)
  
  const manyMessages = [
    createMockMessage('Old message 1', 'user', new Date(Date.now() - 10000).toISOString()),
    createMockMessage(longContent, 'user', new Date(Date.now() - 8000).toISOString()),
    createMockMessage(longContent, 'assistant', new Date(Date.now() - 6000).toISOString()),
    createMockMessage('Recent important message', 'user', new Date(Date.now() - 2000).toISOString()),
    createMockMessage('Latest response', 'assistant', new Date().toISOString())
  ]
  
  const beforeTruncation = budgetManager.calculateTokenBudget(manyMessages, contextItems)
  console.log(`   Before truncation: ${beforeTruncation} tokens`)
  
  const truncationResult = budgetManager.truncateToFitBudget(manyMessages, contextItems)
  console.log(`   After truncation: ${budgetManager.calculateTokenBudget(truncationResult.messages, truncationResult.contextItems)} tokens`)
  console.log(`   Messages removed: ${truncationResult.messagesRemoved}`)
  console.log(`   Context items removed: ${truncationResult.contextItemsRemoved}`)
  console.log(`   Tokens saved: ${truncationResult.tokensRemoved}`)
  console.log()
  
  // 5. Optimization recommendations
  console.log('5. Optimization Recommendations:')
  const optimization = budgetManager.optimizeForBudget(manyMessages, contextItems, 300)
  console.log(`   Can fit in 300 tokens: ${optimization.canFit}`)
  console.log(`   Potential token savings: ${optimization.tokenSavings}`)
  console.log('   Recommendations:')
  optimization.recommendedActions.forEach((action, i) => {
    console.log(`     ${i + 1}. ${action}`)
  })
  console.log()
  
  // 6. Cache statistics
  console.log('6. Cache Performance:')
  const cacheStats = budgetManager.getCacheStats()
  console.log(`   Cache size: ${cacheStats.size}/${cacheStats.maxSize}`)
  console.log(`   Cache utilization: ${Math.round((cacheStats.size / cacheStats.maxSize) * 100)}%`)
  console.log()
  
  console.log('=== Demonstration Complete ===')
}

// Export the demonstration function for use in other files
export { demonstrateTokenBudgetManager as default }
# Token Budget Management Usage Guide

The Token Budget Manager provides comprehensive token counting, budget enforcement, and intelligent truncation for the JTBD Assistant Platform chat system.

## Key Features

- **Token Budget Enforcement**: 4000 token maximum (configurable)
- **Intelligent Truncation**: Preserves recent messages and priority context items
- **Budget Status Monitoring**: Warning at 80%, critical at 95%
- **Context Item Management**: Prioritizes insights, metrics, and JTBDs
- **Performance Optimization**: Cached token counting for efficiency

## Basic Usage

```typescript
import { tokenBudgetManager, type ContextItem } from './token-budget'
import type { Message } from '../../database/types'

// Calculate current token usage
const messages: Message[] = [...] // Your chat messages
const contextItems: ContextItem[] = [...] // Selected context items

const totalTokens = tokenBudgetManager.calculateTokenBudget(messages, contextItems)

// Check budget status
const status = tokenBudgetManager.getBudgetStatus(messages, contextItems)
console.log(`Token usage: ${status.currentTokens}/${status.maxTokens} (${Math.round(status.utilizationPercentage * 100)}%)`)

if (status.warnings.length > 0) {
  console.warn('Budget warnings:', status.warnings)
}
```

## Truncation Strategy

When token budget is exceeded, the manager uses intelligent truncation:

```typescript
const truncationResult = tokenBudgetManager.truncateToFitBudget(messages, contextItems)

// Updated arrays that fit within budget
const { messages: truncatedMessages, contextItems: truncatedContext } = truncationResult

console.log(`Removed ${truncationResult.messagesRemoved} messages and ${truncationResult.contextItemsRemoved} context items`)
console.log(`Saved ${truncationResult.tokensRemoved} tokens`)
```

### Truncation Priority Order

1. **Always Preserved**:
   - Last 2 messages (most recent user message + assistant response)
   - System/assistant messages
   - Priority context items (insights, metrics, JTBDs)

2. **Truncated First**:
   - Older conversation messages
   - Low-priority context items (solutions, HMW questions)
   - Duplicate context items

## Context Item Types

```typescript
export interface ContextItem {
  id: string
  type: 'insight' | 'metric' | 'jtbd' | 'hmw' | 'solution'
  content: string
  metadata?: Record<string, unknown>
}
```

### Priority Levels
- **High Priority**: `insight`, `metric`, `jtbd` (always preserved)
- **Low Priority**: `hmw`, `solution` (truncated when needed)

## Budget Optimization

Get recommendations for reducing token usage:

```typescript
const optimization = tokenBudgetManager.optimizeForBudget(messages, contextItems, 3000)

if (!optimization.canFit) {
  console.log('Optimization recommendations:')
  optimization.recommendedActions.forEach(action => console.log(`- ${action}`))
  console.log(`Potential savings: ${optimization.tokenSavings} tokens`)
}
```

## Budget Status Levels

| Status | Threshold | Description |
|--------|-----------|-------------|
| `healthy` | < 80% | Normal operation |
| `warning` | 80-95% | Approaching limit |
| `critical` | 95-100% | Near capacity |
| `exceeded` | > 100% | Over budget |

## Integration with Chat System

```typescript
import { tokenBudgetManager } from '../lib/services/chat'

export async function processChat(messages: Message[], contextItems: ContextItem[]) {
  // Check budget status
  const status = tokenBudgetManager.getBudgetStatus(messages, contextItems)
  
  // Handle different status levels
  switch (status.status) {
    case 'exceeded':
      // Force truncation
      const result = tokenBudgetManager.truncateToFitBudget(messages, contextItems)
      return {
        messages: result.messages,
        contextItems: result.contextItems,
        warning: `Conversation truncated to fit budget. Removed ${result.messagesRemoved} messages.`
      }
      
    case 'critical':
      // Warn user
      return {
        messages,
        contextItems,
        warning: 'Token budget critical. Consider starting a new conversation.'
      }
      
    case 'warning':
      // Suggest optimization
      const optimization = tokenBudgetManager.optimizeForBudget(messages, contextItems)
      return {
        messages,
        contextItems,
        info: `Token usage at ${Math.round(status.utilizationPercentage * 100)}%. ${optimization.recommendedActions[0]}`
      }
      
    default:
      return { messages, contextItems }
  }
}
```

## Performance Considerations

- **Token Counting Cache**: Automatically caches token counts for performance
- **Batch Operations**: Efficient for multiple messages/context items
- **Memory Management**: Cache automatically cleans up to prevent memory leaks

```typescript
// Cache management
const stats = tokenBudgetManager.getCacheStats()
console.log(`Cache: ${stats.size}/${stats.maxSize} entries`)

// Manual cache clearing if needed
tokenBudgetManager.clearCache()
```

## Configuration

```typescript
// Custom token budget (default: 4000)
const customBudgetManager = new TokenBudgetManager(2000)

// Constants
import { MAX_TOKEN_BUDGET, WARNING_THRESHOLD, CRITICAL_THRESHOLD } from './token-budget'
```

## Error Handling

The token budget manager handles edge cases gracefully:

- Empty or null content
- Malformed messages
- Very small token budgets
- Large numbers of messages

All operations are safe and will not throw exceptions under normal usage.
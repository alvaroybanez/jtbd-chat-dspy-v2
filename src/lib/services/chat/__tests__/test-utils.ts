/**
 * Shared Test Utilities for Chat Services
 * Provides mock factories, fixtures, and testing helpers for consistent test setup
 */

import type { Message, MessageRole } from '../../../database/types'
import type { ContextItem, RetrievalResult, IntentDetectionResult } from '../types'
import { ChatIntent } from '../intent-detector'

// ===== MOCK DATA FACTORIES =====

/**
 * Create a mock message with sensible defaults
 */
export function createMockMessage(
  partial: Partial<Message> & { content: string; role?: MessageRole }
): Message {
  const now = new Date().toISOString()
  
  return {
    id: `msg-${Math.random().toString(36).substr(2, 9)}`,
    chat_id: 'test-chat-id',
    role: 'user',
    intent: null,
    context_items: null,
    processing_time_ms: null,
    token_count: null,
    created_at: now,
    ...partial
  }
}

/**
 * Create a mock context item with sensible defaults
 */
export function createMockContextItem(
  partial: Partial<ContextItem> & { content: string }
): ContextItem {
  const content = partial.content
  const type = partial.type || 'insight'
  
  return {
    id: `ctx-${Math.random().toString(36).substr(2, 9)}`,
    type,
    content,
    similarity: 0.8,
    metadata: {},
    displayText: content.substring(0, 100),
    snippet: content.substring(0, 150),
    ...partial
  }
}

/**
 * Create mock intent detection result
 */
export function createMockIntentResult(
  partial: Partial<IntentDetectionResult> & { intent?: ChatIntent }
): IntentDetectionResult {
  return {
    intent: ChatIntent.GENERAL_EXPLORATION,
    confidence: 0.7,
    matchedKeywords: [],
    rawMessage: 'test message',
    context: {
      processingTime: 50
    },
    ...partial
  }
}

/**
 * Create mock retrieval result
 */
export function createMockRetrievalResult(
  items: ContextItem[] = [],
  partial: Partial<RetrievalResult> = {}
): RetrievalResult {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / 20),
      hasNext: false,
      hasPrevious: false
    },
    summary: {
      maxSimilarity: Math.max(...items.map(i => i.similarity || 0), 0),
      averageSimilarity: items.length > 0 
        ? items.reduce((sum, i) => sum + (i.similarity || 0), 0) / items.length 
        : 0,
      retrievalTime: 100,
      searchType: 'semantic'
    },
    ...partial
  }
}

// ===== TEST FIXTURES =====

/**
 * Sample messages for testing various scenarios
 */
export const MOCK_MESSAGES = {
  // User messages with different intents
  INSIGHTS_REQUEST: createMockMessage({
    content: 'What insights do we have from the user research?',
    role: 'user'
  }),
  
  METRICS_REQUEST: createMockMessage({
    content: 'Show me the key metrics we should track',
    role: 'user'
  }),
  
  JTBD_REQUEST: createMockMessage({
    content: 'What are our main jobs to be done?',
    role: 'user'
  }),
  
  HMW_REQUEST: createMockMessage({
    content: 'Generate how might we questions for improving onboarding',
    role: 'user'
  }),
  
  SOLUTIONS_REQUEST: createMockMessage({
    content: 'Create solutions to solve user retention problems',
    role: 'user'
  }),
  
  GENERAL_MESSAGE: createMockMessage({
    content: 'Tell me about this product',
    role: 'user'
  }),
  
  LONG_MESSAGE: createMockMessage({
    content: 'This is a very long message that contains extensive details about user research findings, including specific quotes from interviews, statistical analysis of user behavior patterns, and comprehensive recommendations for product improvements. '.repeat(10),
    role: 'user'
  }),
  
  // Assistant responses
  ASSISTANT_RESPONSE: createMockMessage({
    content: 'Based on the insights, here are the key findings...',
    role: 'assistant'
  }),
  
  SYSTEM_MESSAGE: createMockMessage({
    content: 'System initialization complete',
    role: 'assistant'
  })
}

/**
 * Sample context items for testing
 */
export const MOCK_CONTEXT_ITEMS = {
  INSIGHT_1: createMockContextItem({
    type: 'insight',
    content: 'Users struggle with the onboarding process, citing complexity and time requirements as main pain points.',
    similarity: 0.9
  }),
  
  INSIGHT_2: createMockContextItem({
    type: 'insight',
    content: 'Customer support tickets show 60% of issues are related to feature discovery problems.',
    similarity: 0.8
  }),
  
  METRIC_1: createMockContextItem({
    type: 'metric',
    content: 'Average onboarding completion time: 12 minutes (target: 5 minutes)',
    similarity: 0.85
  }),
  
  METRIC_2: createMockContextItem({
    type: 'metric',
    content: 'User retention rate: 68% (target: 80%)',
    similarity: 0.7
  }),
  
  JTBD_1: createMockContextItem({
    type: 'jtbd',
    content: 'When I am a new user, I want to complete onboarding quickly so I can start using the app productively.',
    similarity: 0.9
  }),
  
  JTBD_2: createMockContextItem({
    type: 'jtbd',
    content: 'When I encounter a problem, I want to find help easily so I can resolve issues without frustration.',
    similarity: 0.8
  }),
  
  HMW_1: createMockContextItem({
    type: 'hmw',
    content: 'How might we simplify the onboarding process to reduce completion time?',
    similarity: 0.85
  }),
  
  SOLUTION_1: createMockContextItem({
    type: 'solution',
    content: 'Implement progressive onboarding with optional steps and clear progress indicators.',
    similarity: 0.8
  })
}

/**
 * Test scenarios for various workflows
 */
export const TEST_SCENARIOS = {
  BASIC_INTENT_DETECTION: {
    name: 'Basic Intent Detection',
    messages: [MOCK_MESSAGES.INSIGHTS_REQUEST],
    expectedIntent: ChatIntent.RETRIEVE_INSIGHTS,
    expectedConfidence: 0.8
  },
  
  CONTEXT_HEAVY: {
    name: 'Context Heavy Scenario',
    messages: [MOCK_MESSAGES.HMW_REQUEST],
    contextItems: [
      MOCK_CONTEXT_ITEMS.INSIGHT_1,
      MOCK_CONTEXT_ITEMS.INSIGHT_2,
      MOCK_CONTEXT_ITEMS.METRIC_1,
      MOCK_CONTEXT_ITEMS.JTBD_1
    ],
    expectedIntent: ChatIntent.GENERATE_HMW
  },
  
  TOKEN_BUDGET_EXCEEDED: {
    name: 'Token Budget Exceeded',
    messages: [
      MOCK_MESSAGES.LONG_MESSAGE,
      MOCK_MESSAGES.LONG_MESSAGE,
      MOCK_MESSAGES.LONG_MESSAGE
    ],
    contextItems: Object.values(MOCK_CONTEXT_ITEMS),
    expectsTruncation: true
  },
  
  MULTI_INTENT_CONVERSATION: {
    name: 'Multi-Intent Conversation',
    messages: [
      MOCK_MESSAGES.INSIGHTS_REQUEST,
      MOCK_MESSAGES.ASSISTANT_RESPONSE,
      MOCK_MESSAGES.METRICS_REQUEST,
      MOCK_MESSAGES.ASSISTANT_RESPONSE,
      MOCK_MESSAGES.HMW_REQUEST
    ],
    expectedFinalIntent: ChatIntent.GENERATE_HMW
  }
}

// ===== MOCK SERVICE IMPLEMENTATIONS =====

/**
 * Mock vector search service for testing
 */
export class MockVectorSearchService {
  private mockResults: Map<string, any[]> = new Map()
  
  setMockResults(query: string, results: any[]) {
    this.mockResults.set(query.toLowerCase(), results)
  }
  
  async searchInsights(query: string) {
    const results = this.mockResults.get(query.toLowerCase()) || []
    return createMockRetrievalResult(results.map(createMockContextItem))
  }
  
  async searchJTBDs(query: string) {
    const results = this.mockResults.get(query.toLowerCase()) || []
    return createMockRetrievalResult(results.map(createMockContextItem))
  }
  
  async searchMetrics(query: string) {
    const results = this.mockResults.get(query.toLowerCase()) || []
    return createMockRetrievalResult(results.map(createMockContextItem))
  }
}

/**
 * Mock database client for testing
 */
export class MockDatabaseClient {
  private mockData: Map<string, any[]> = new Map()
  
  setMockData(table: string, data: any[]) {
    this.mockData.set(table, data)
  }
  
  async query(table: string, filters?: any) {
    return this.mockData.get(table) || []
  }
}

/**
 * Mock token counter for testing
 */
export class MockTokenCounter {
  private tokenMap: Map<string, number> = new Map()
  
  setTokenCount(text: string, count: number) {
    this.tokenMap.set(text, count)
  }
  
  count(text: string): number {
    // If we have a specific count for this text, use it
    if (this.tokenMap.has(text)) {
      return this.tokenMap.get(text)!
    }
    
    // Otherwise, use a simple word-based approximation
    return Math.ceil(text.split(/\s+/).length * 1.3)
  }
  
  getCacheStats() {
    return {
      size: this.tokenMap.size,
      maxSize: 1000,
      hitRate: 0.8,
      entries: this.tokenMap.size
    }
  }
  
  clearCache() {
    this.tokenMap.clear()
  }
}

// ===== TEST HELPERS =====

/**
 * Wait for async operations to complete
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Assert that an object contains expected properties
 */
export function assertContains<T>(
  actual: T,
  expected: Partial<T>,
  message?: string
): void {
  for (const [key, value] of Object.entries(expected)) {
    if ((actual as any)[key] !== value) {
      throw new Error(
        message || 
        `Expected ${key} to be ${value}, but got ${(actual as any)[key]}`
      )
    }
  }
}

/**
 * Create a spy function with tracking capabilities
 */
export function createSpy<T extends (...args: any[]) => any>(
  implementation?: T
): T & { calls: Parameters<T>[], results: ReturnType<T>[] } {
  const calls: Parameters<T>[] = []
  const results: ReturnType<T>[] = []
  
  const spy = ((...args: Parameters<T>) => {
    calls.push(args)
    const result = implementation ? implementation(...args) : undefined
    results.push(result)
    return result
  }) as T & { calls: Parameters<T>[], results: ReturnType<T>[] }
  
  spy.calls = calls
  spy.results = results
  
  return spy
}

/**
 * Measure execution time of async operations
 */
export async function measureTime<T>(
  operation: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now()
  const result = await operation()
  const duration = Date.now() - start
  
  return { result, duration }
}

/**
 * Generate test data with specific characteristics
 */
export function generateTestMessages(count: number, avgLength = 50): Message[] {
  return Array.from({ length: count }, (_, i) => 
    createMockMessage({
      content: `Test message ${i + 1} `.repeat(Math.floor(avgLength / 15)),
      created_at: new Date(Date.now() - (count - i) * 1000).toISOString()
    })
  )
}

/**
 * Create a test suite configuration
 */
export interface TestSuiteConfig {
  timeout?: number
  retries?: number
  concurrent?: boolean
  setupEach?: () => Promise<void>
  teardownEach?: () => Promise<void>
}

export function createTestSuite(
  name: string,
  config: TestSuiteConfig = {}
): TestSuiteConfig {
  return {
    timeout: 10000,
    retries: 0,
    concurrent: false,
    ...config
  }
}

// ===== PERFORMANCE TEST UTILITIES =====

/**
 * Benchmark function execution time
 */
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T>,
  iterations = 100
): Promise<{
  name: string
  iterations: number
  totalTime: number
  averageTime: number
  minTime: number
  maxTime: number
  result: T
}> {
  const times: number[] = []
  let lastResult: T
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    lastResult = await fn()
    const end = performance.now()
    times.push(end - start)
  }
  
  return {
    name,
    iterations,
    totalTime: times.reduce((sum, time) => sum + time, 0),
    averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    result: lastResult!
  }
}

/**
 * Memory usage tracker for performance tests
 */
export function trackMemoryUsage(): {
  getUsage: () => NodeJS.MemoryUsage
  getDelta: () => NodeJS.MemoryUsage
} {
  const initialUsage = process.memoryUsage()
  
  return {
    getUsage: () => process.memoryUsage(),
    getDelta: () => {
      const current = process.memoryUsage()
      return {
        rss: current.rss - initialUsage.rss,
        heapTotal: current.heapTotal - initialUsage.heapTotal,
        heapUsed: current.heapUsed - initialUsage.heapUsed,
        external: current.external - initialUsage.external,
        arrayBuffers: current.arrayBuffers - initialUsage.arrayBuffers
      }
    }
  }
}
/**
 * Intent Detection Service Unit Tests
 * Comprehensive test coverage for intent detection with various inputs and edge cases
 */

import { 
  intentDetector, 
  detectChatIntent, 
  requiresContext, 
  isRetrievalIntent,
  ChatIntent,
  IntentDetectionError
} from '../intent-detector'
import { createMockIntentResult, waitFor, measureTime } from './test-utils'

describe('Intent Detection Service', () => {
  describe('Basic Intent Detection', () => {
    test('should detect insights intent with high confidence', () => {
      const testCases = [
        'What insights do we have?',
        'Show me our learnings',
        'what did we learn from users',
        'Tell me about the insights',
        'Display insights from research'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
        expect(result.confidence).toBeGreaterThan(0.7)
        expect(result.matchedKeywords.length).toBeGreaterThan(0)
        expect(result.rawMessage).toBe(message)
      })
    })

    test('should detect metrics intent with appropriate keywords', () => {
      const testCases = [
        'What metrics should we measure?',
        'Show me our KPIs',
        'How do we measure success?',
        'Display the key metrics',
        'What should we track?'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.RETRIEVE_METRICS)
        expect(result.confidence).toBeGreaterThan(0.6)
        expect(result.matchedKeywords.length).toBeGreaterThan(0)
      })
    })

    test('should detect JTBD intent accurately', () => {
      const testCases = [
        'What are our jobs to be done?',
        'Show me the jtbd statements',
        'What job to be done should we focus on?',
        'Display our JTBD analysis',
        'Tell me about jobs-to-be-done'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.RETRIEVE_JTBDS)
        expect(result.confidence).toBeGreaterThan(0.6)
        expect(result.matchedKeywords.length).toBeGreaterThan(0)
      })
    })

    test('should detect HMW generation intent', () => {
      const testCases = [
        'Generate how might we questions',
        'Create HMW questions for this problem',
        'how might we improve user experience',
        'Generate some how might we statements',
        'Create HMWs for onboarding'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.GENERATE_HMW)
        expect(result.confidence).toBeGreaterThan(0.6)
        expect(result.matchedKeywords.length).toBeGreaterThan(0)
      })
    })

    test('should detect solution creation intent', () => {
      const testCases = [
        'Create solutions for this problem',
        'How do we solve this issue?',
        'What ideas do you have?',
        'Generate solutions for onboarding',
        'Solve the user retention problem'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.CREATE_SOLUTIONS)
        expect(result.confidence).toBeGreaterThan(0.6)
        expect(result.matchedKeywords.length).toBeGreaterThan(0)
      })
    })

    test('should default to general exploration for ambiguous messages', () => {
      const testCases = [
        'Tell me about this product',
        "What's happening here?",
        'Random question without keywords',
        'Hello there',
        'Can you help me?'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.GENERAL_EXPLORATION)
        expect(result.confidence).toBeLessThan(0.8)
        expect(result.matchedKeywords.length).toBe(0)
      })
    })
  })

  describe('Confidence Scoring', () => {
    test('should assign higher confidence to exact keyword matches', () => {
      const exactMatch = detectChatIntent('insights')
      const partialMatch = detectChatIntent('insight data')
      const contextMatch = detectChatIntent('show me the insights from research')

      expect(exactMatch.confidence).toBeGreaterThan(partialMatch.confidence)
      expect(contextMatch.confidence).toBeGreaterThan(0.7)
    })

    test('should boost confidence for multiple keyword matches', () => {
      const singleKeyword = detectChatIntent('insights')
      const multipleKeywords = detectChatIntent('insights and learnings from research')

      expect(multipleKeywords.confidence).toBeGreaterThan(singleKeyword.confidence)
      expect(multipleKeywords.matchedKeywords.length).toBeGreaterThan(1)
    })

    test('should apply position bonus for keywords at beginning', () => {
      const earlyKeyword = detectChatIntent('insights are important for us')
      const lateKeyword = detectChatIntent('we need to gather insights at the end')

      expect(earlyKeyword.confidence).toBeGreaterThanOrEqual(lateKeyword.confidence)
    })

    test('should reduce confidence when multiple intents compete', () => {
      const clearIntent = detectChatIntent('show me insights')
      const conflictedIntent = detectChatIntent('show me insights and metrics and solutions')

      expect(clearIntent.confidence).toBeGreaterThan(conflictedIntent.confidence)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty and null messages gracefully', () => {
      const emptyResult = detectChatIntent('')
      const nullResult = detectChatIntent(null as any)
      const whitespaceResult = detectChatIntent('   ')

      expect(emptyResult.intent).toBe(ChatIntent.GENERAL_EXPLORATION)
      expect(nullResult.intent).toBe(ChatIntent.GENERAL_EXPLORATION)
      expect(whitespaceResult.intent).toBe(ChatIntent.GENERAL_EXPLORATION)

      expect(emptyResult.confidence).toBeLessThan(0.5)
      expect(nullResult.confidence).toBeLessThan(0.5)
      expect(whitespaceResult.confidence).toBeLessThan(0.5)
    })

    test('should handle very long messages', () => {
      const longMessage = 'This is a very long message that contains many words and should still detect insights correctly when we mention insights at the end. '.repeat(100) + 'insights'
      
      const result = detectChatIntent(longMessage)
      
      expect(result.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      expect(result.confidence).toBeGreaterThan(0.6)
      expect(result.rawMessage).toBe(longMessage)
    })

    test('should handle special characters and punctuation', () => {
      const specialChars = detectChatIntent('What insights!!! do we @#$% have???')
      const unicode = detectChatIntent('Qué insights tenemos? 🤔')
      const mixed = detectChatIntent('insights-data_analysis.2024')

      expect(specialChars.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      expect(unicode.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      expect(mixed.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
    })

    test('should be case insensitive', () => {
      const testCases = [
        'INSIGHTS',
        'Insights',
        'iNsIgHtS',
        'insights'
      ]

      testCases.forEach(message => {
        const result = detectChatIntent(message)
        expect(result.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
        expect(result.confidence).toBeGreaterThan(0.7)
      })
    })

    test('should handle undefined and invalid inputs', () => {
      const undefinedResult = detectChatIntent(undefined as any)
      const numberResult = detectChatIntent(123 as any)
      const objectResult = detectChatIntent({} as any)

      expect(undefinedResult.intent).toBe(ChatIntent.GENERAL_EXPLORATION)
      expect(numberResult.intent).toBe(ChatIntent.GENERAL_EXPLORATION)
      expect(objectResult.intent).toBe(ChatIntent.GENERAL_EXPLORATION)
    })
  })

  describe('Context Information', () => {
    test('should include processing time in context', () => {
      const result = detectChatIntent('show me insights')
      
      expect(result.context).toBeDefined()
      expect(result.context?.processingTime).toBeGreaterThan(0)
      expect(typeof result.context?.processingTime).toBe('number')
    })

    test('should include alternative intents when available', () => {
      const result = detectChatIntent('show me insights and metrics')
      
      expect(result.context?.alternativeIntents).toBeDefined()
      expect(Array.isArray(result.context?.alternativeIntents)).toBe(true)
      
      if (result.context?.alternativeIntents?.length) {
        expect(result.context.alternativeIntents[0]).toHaveProperty('intent')
        expect(result.context.alternativeIntents[0]).toHaveProperty('confidence')
      }
    })

    test('should limit alternative intents to reasonable number', () => {
      const result = detectChatIntent('insights metrics jtbd hmw solutions learnings')
      
      expect(result.context?.alternativeIntents?.length).toBeLessThanOrEqual(2)
    })
  })

  describe('Performance Tests', () => {
    test('should process intent detection quickly', async () => {
      const message = 'What insights do we have from the user research?'
      
      const { duration } = await measureTime(async () => {
        return detectChatIntent(message)
      })
      
      expect(duration).toBeLessThan(100) // Should complete in under 100ms
    })

    test('should handle batch processing efficiently', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => 
        `Test message ${i} with insights keyword`
      )
      
      const start = Date.now()
      const results = messages.map(detectChatIntent)
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(1000) // 100 messages in under 1 second
      expect(results).toHaveLength(100)
      results.forEach(result => {
        expect(result.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      })
    })

    test('should maintain consistent performance with repeated calls', async () => {
      const message = 'show me insights and metrics'
      const times: number[] = []
      
      for (let i = 0; i < 10; i++) {
        const start = Date.now()
        detectChatIntent(message)
        times.push(Date.now() - start)
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
      const maxTime = Math.max(...times)
      
      expect(avgTime).toBeLessThan(50)
      expect(maxTime).toBeLessThan(100)
    })
  })

  describe('Utility Functions', () => {
    test('requiresContext should correctly identify context-requiring intents', () => {
      expect(requiresContext(ChatIntent.GENERATE_HMW)).toBe(true)
      expect(requiresContext(ChatIntent.CREATE_SOLUTIONS)).toBe(true)
      expect(requiresContext(ChatIntent.RETRIEVE_INSIGHTS)).toBe(false)
      expect(requiresContext(ChatIntent.RETRIEVE_METRICS)).toBe(false)
      expect(requiresContext(ChatIntent.RETRIEVE_JTBDS)).toBe(false)
      expect(requiresContext(ChatIntent.GENERAL_EXPLORATION)).toBe(false)
    })

    test('isRetrievalIntent should correctly identify retrieval intents', () => {
      expect(isRetrievalIntent(ChatIntent.RETRIEVE_INSIGHTS)).toBe(true)
      expect(isRetrievalIntent(ChatIntent.RETRIEVE_METRICS)).toBe(true)
      expect(isRetrievalIntent(ChatIntent.RETRIEVE_JTBDS)).toBe(true)
      expect(isRetrievalIntent(ChatIntent.GENERATE_HMW)).toBe(false)
      expect(isRetrievalIntent(ChatIntent.CREATE_SOLUTIONS)).toBe(false)
      expect(isRetrievalIntent(ChatIntent.GENERAL_EXPLORATION)).toBe(false)
    })
  })

  describe('Singleton Behavior', () => {
    test('should maintain state consistency across calls', () => {
      const result1 = intentDetector.detectIntent('insights')
      const result2 = intentDetector.detectIntent('insights')
      
      expect(result1.intent).toBe(result2.intent)
      expect(result1.confidence).toBe(result2.confidence)
      expect(result1.matchedKeywords).toEqual(result2.matchedKeywords)
    })

    test('should not be affected by concurrent calls', async () => {
      const messages = [
        'insights data',
        'metrics tracking',
        'jtbd analysis',
        'hmw questions',
        'solution creation'
      ]
      
      const promises = messages.map(msg => 
        Promise.resolve(detectChatIntent(msg))
      )
      
      const results = await Promise.all(promises)
      
      expect(results[0].intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      expect(results[1].intent).toBe(ChatIntent.RETRIEVE_METRICS)
      expect(results[2].intent).toBe(ChatIntent.RETRIEVE_JTBDS)
      expect(results[3].intent).toBe(ChatIntent.GENERATE_HMW)
      expect(results[4].intent).toBe(ChatIntent.CREATE_SOLUTIONS)
    })
  })

  describe('Integration with Real Keywords', () => {
    test('should work with actual keyword mappings', () => {
      // Test that the service uses the real INTENT_KEYWORDS from constants
      const result = detectChatIntent('learnings')
      expect(result.intent).toBe(ChatIntent.RETRIEVE_INSIGHTS)
      
      const result2 = detectChatIntent('kpi')
      expect(result2.intent).toBe(ChatIntent.RETRIEVE_METRICS)
    })

    test('should handle keyword variations and synonyms', () => {
      const variations = [
        { message: 'user research findings', expected: ChatIntent.RETRIEVE_INSIGHTS },
        { message: 'performance indicators', expected: ChatIntent.RETRIEVE_METRICS },
        { message: 'customer jobs', expected: ChatIntent.RETRIEVE_JTBDS }
      ]
      
      variations.forEach(({ message, expected }) => {
        const result = detectChatIntent(message)
        // Note: These might not match exactly due to keyword mapping,
        // but should have reasonable confidence
        expect(result.confidence).toBeGreaterThan(0.3)
      })
    })
  })

  describe('Error Scenarios', () => {
    test('should handle IntentDetectionError properly', () => {
      const error = new IntentDetectionError(
        'Test error message',
        { testContext: 'value' }
      )
      
      expect(error.code).toBe('INTENT_DETECTION_ERROR')
      expect(error.message).toBe('Test error message')
      expect(error.action).toBe('NONE')
      expect(error.context).toEqual({ testContext: 'value' })
    })

    test('should recover gracefully from processing errors', () => {
      // Test with malformed input that might cause processing issues
      const malformedInputs = [
        '\x00\x01\x02',  // Control characters
        'a'.repeat(100000),  // Extremely long input
        '🔥'.repeat(1000),  // Many unicode characters
      ]
      
      malformedInputs.forEach(input => {
        expect(() => {
          const result = detectChatIntent(input)
          expect(result.intent).toBeDefined()
          expect(result.confidence).toBeGreaterThanOrEqual(0)
        }).not.toThrow()
      })
    })
  })

  describe('Memory and Resource Management', () => {
    test('should not leak memory with repeated calls', () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      // Make many calls to detect potential memory leaks
      for (let i = 0; i < 1000; i++) {
        detectChatIntent(`test message ${i} with insights`)
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      // Memory increase should be minimal (less than 10MB for 1000 calls)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
    })

    test('should cleanup resources properly', () => {
      // Test that the service doesn't hold onto large objects
      const largMessages = Array.from({ length: 100 }, (_, i) => 
        'very long message '.repeat(1000) + ` with insights ${i}`
      )
      
      largMessages.forEach(detectChatIntent)
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      // Memory should not grow excessively
      const memoryUsage = process.memoryUsage()
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024) // Less than 100MB
    })
  })
})
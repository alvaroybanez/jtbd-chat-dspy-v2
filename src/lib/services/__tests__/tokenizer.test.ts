/**
 * Unit tests for Token Counter
 * Tests token counting estimation, caching, and validation
 */

import { TokenCounter } from '../text-processing/tokenizer'

// Mock logger to avoid console output during tests
jest.mock('../../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

describe('TokenCounter', () => {
  let tokenCounter: TokenCounter

  beforeEach(() => {
    tokenCounter = new TokenCounter()
  })

  afterEach(() => {
    tokenCounter.clearCache()
  })

  describe('Basic Token Counting', () => {
    it('should count tokens for simple text', () => {
      const text = 'This is a simple test.'
      const count = tokenCounter.count(text)

      expect(count).toBeGreaterThan(0)
      expect(typeof count).toBe('number')
    })

    it('should return 0 for empty text', () => {
      expect(tokenCounter.count('')).toBe(0)
      expect(tokenCounter.count(null as any)).toBe(0)
      expect(tokenCounter.count(undefined as any)).toBe(0)
    })

    it('should handle whitespace-only text', () => {
      const count = tokenCounter.count('   \n\t   ')
      expect(count).toBeGreaterThan(0) // Whitespace still counts as tokens
    })

    it('should provide consistent results for same text', () => {
      const text = 'Consistent token counting test.'
      const count1 = tokenCounter.count(text)
      const count2 = tokenCounter.count(text)

      expect(count1).toBe(count2)
    })
  })

  describe('Token Estimation Accuracy', () => {
    it('should estimate reasonable token counts for different text types', () => {
      const tests = [
        { text: 'Short text.', expectedRange: [1, 5] },
        { text: 'This is a medium-length sentence with several words.', expectedRange: [8, 15] },
        { text: 'A'.repeat(100), expectedRange: [20, 35] }, // Long repetitive text
        { text: 'Word1 Word2 Word3 Word4 Word5', expectedRange: [4, 8] } // Space-separated words
      ]

      for (const test of tests) {
        const count = tokenCounter.count(test.text)
        expect(count).toBeGreaterThanOrEqual(test.expectedRange[0])
        expect(count).toBeLessThanOrEqual(test.expectedRange[1])
      }
    })

    it('should handle special characters and punctuation', () => {
      const texts = [
        'Hello, world!',
        'Test@example.com',
        'Price: $19.99',
        'Special chars: @#$%^&*()',
        'Unicode: 你好世界'
      ]

      for (const text of texts) {
        const count = tokenCounter.count(text)
        expect(count).toBeGreaterThan(0)
        expect(Number.isInteger(count)).toBe(true)
      }
    })

    it('should adjust for punctuation density', () => {
      const lightPunctuation = 'This is a simple sentence'
      const heavyPunctuation = 'This, is; a: sentence! With? Heavy... punctuation!!!'

      const countLight = tokenCounter.count(lightPunctuation)
      const countHeavy = tokenCounter.count(heavyPunctuation)

      // Heavy punctuation should generally result in more tokens
      expect(countHeavy).toBeGreaterThanOrEqual(countLight)
    })

    it('should adjust for numbers and numeric patterns', () => {
      const noNumbers = 'This text has no numbers at all'
      const withNumbers = 'This text has 123456 and 987654321 numbers'

      const countNoNumbers = tokenCounter.count(noNumbers)
      const countWithNumbers = tokenCounter.count(withNumbers)

      expect(countWithNumbers).toBeGreaterThan(0)
      expect(countNoNumbers).toBeGreaterThan(0)
    })
  })

  describe('Token Info', () => {
    it('should return detailed token information', () => {
      const text = 'Test text for token info.'
      const info = tokenCounter.getTokenInfo(text)

      expect(info.count).toBeGreaterThan(0)
      expect(info.model).toBe('text-embedding-3-small')
      expect(info.encoding).toBe('cl100k_base')
    })
  })

  describe('Batch Operations', () => {
    it('should count tokens for multiple texts', () => {
      const texts = [
        'First text.',
        'Second text with more words.',
        'Third text is the longest one with many words.'
      ]

      const counts = tokenCounter.countBatch(texts)

      expect(counts).toHaveLength(texts.length)
      expect(counts[0]).toBeGreaterThan(0)
      expect(counts[1]).toBeGreaterThan(counts[0]) // More words = more tokens
      expect(counts[2]).toBeGreaterThan(counts[1]) // Even more words
    })

    it('should calculate total token count', () => {
      const texts = ['First text.', 'Second text.', 'Third text.']
      const total = tokenCounter.countTotal(texts)
      const individual = tokenCounter.countBatch(texts)
      const expectedTotal = individual.reduce((sum, count) => sum + count, 0)

      expect(total).toBe(expectedTotal)
    })
  })

  describe('Token Limits', () => {
    it('should check if text fits within limit', () => {
      const shortText = 'Short text.'
      const longText = 'This is a very long text that should exceed a small token limit. '.repeat(10)

      expect(tokenCounter.fitsWithinLimit(shortText, 100)).toBe(true)
      expect(tokenCounter.fitsWithinLimit(longText, 10)).toBe(false)
    })

    it('should truncate text to fit within limit', () => {
      const longText = 'This is a long text that needs to be truncated. '.repeat(10)
      const limit = 50

      const truncated = tokenCounter.truncateToLimit(longText, limit)
      const truncatedCount = tokenCounter.count(truncated)

      expect(truncatedCount).toBeLessThanOrEqual(limit)
      expect(truncated.length).toBeLessThan(longText.length)
    })

    it('should return original text if already within limit', () => {
      const shortText = 'Short text.'
      const limit = 100

      const result = tokenCounter.truncateToLimit(shortText, limit)

      expect(result).toBe(shortText)
    })

    it('should truncate at word boundaries when possible', () => {
      const text = 'This is a test sentence that should be truncated.'
      const truncated = tokenCounter.truncateToLimit(text, 20)

      // Should not end in the middle of a word
      expect(truncated).not.toMatch(/\S$/) // Should not end with partial word
      expect(truncated.length).toBeGreaterThan(0)
    })
  })

  describe('Caching', () => {
    it('should cache token counts for repeated text', () => {
      const text = 'This text will be cached.'

      // First call should compute and cache
      const count1 = tokenCounter.count(text)
      
      // Second call should use cache
      const count2 = tokenCounter.count(text)

      expect(count1).toBe(count2)

      const stats = tokenCounter.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)
    })

    it('should handle cache size limits', () => {
      // Fill cache with many different texts
      for (let i = 0; i < 1500; i++) {
        tokenCounter.count(`Test text number ${i}`)
      }

      const stats = tokenCounter.getCacheStats()
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize)
    })

    it('should clear cache when requested', () => {
      tokenCounter.count('Test text for cache.')
      expect(tokenCounter.getCacheStats().size).toBeGreaterThan(0)

      tokenCounter.clearCache()
      expect(tokenCounter.getCacheStats().size).toBe(0)
    })
  })

  describe('Special Content Types', () => {
    it('should handle code-like content', () => {
      const codeText = `
        function testFunction(param) {
          return param * 2;
        }
        
        const result = testFunction(42);
      `

      const count = tokenCounter.count(codeText)
      expect(count).toBeGreaterThan(0)
    })

    it('should handle markdown content', () => {
      const markdownText = `
        # Heading 1
        
        This is **bold** text and *italic* text.
        
        ## Heading 2
        
        - List item 1
        - List item 2
        
        [Link](https://example.com)
      `

      const count = tokenCounter.count(markdownText)
      expect(count).toBeGreaterThan(0)
    })

    it('should handle URLs and email addresses', () => {
      const textWithUrls = 'Visit https://example.com or email test@example.com for more info.'

      const count = tokenCounter.count(textWithUrls)
      expect(count).toBeGreaterThan(0)
    })

    it('should handle non-English text', () => {
      const texts = [
        'Bonjour, comment allez-vous?', // French
        'Hola, ¿cómo estás?', // Spanish
        '你好世界', // Chinese
        'Здравствуй мир', // Russian
        'こんにちは世界' // Japanese
      ]

      for (const text of texts) {
        const count = tokenCounter.count(text)
        expect(count).toBeGreaterThan(0)
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long text', () => {
      const veryLongText = 'Word '.repeat(10000)
      const count = tokenCounter.count(veryLongText)

      expect(count).toBeGreaterThan(1000)
      expect(Number.isInteger(count)).toBe(true)
    })

    it('should handle text with only spaces', () => {
      const spacesOnly = ' '.repeat(100)
      const count = tokenCounter.count(spacesOnly)

      expect(count).toBeGreaterThan(0)
    })

    it('should handle text with only punctuation', () => {
      const punctuationOnly = '!@#$%^&*().,;:"\'[]{}|\\?/<>~`'
      const count = tokenCounter.count(punctuationOnly)

      expect(count).toBeGreaterThan(0)
    })

    it('should handle mixed content types', () => {
      const mixedContent = `
        Hello world! 
        
        Code: function() { return 42; }
        
        Email: test@example.com
        URL: https://example.com
        Number: 123456789
        Unicode: 🌟✨💫
        
        End of mixed content.
      `

      const count = tokenCounter.count(mixedContent)
      expect(count).toBeGreaterThan(10)
    })
  })

  describe('Validation', () => {
    it('should validate estimation accuracy when actual tokens provided', () => {
      const text = 'This is a test for validation.'
      const actualTokens = 8 // Mock actual token count

      const validation = tokenCounter.validateEstimation(text, actualTokens)

      expect(validation.estimated).toBeGreaterThan(0)
      expect(validation.actual).toBe(actualTokens)
      expect(validation.accuracy).toBeGreaterThanOrEqual(0)
      expect(validation.accuracy).toBeLessThanOrEqual(1)
      expect(validation.error).toBeGreaterThanOrEqual(0)
    })
  })
})
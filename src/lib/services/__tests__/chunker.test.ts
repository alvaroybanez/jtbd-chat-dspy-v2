/**
 * Unit tests for Text Chunker
 * Tests chunking strategies, validation, and optimization
 */

import { TextChunker } from '../text-processing/chunker'
import { ChunkingError } from '../types'
import type { ChunkingOptions, ChunkingStrategy } from '../types'

// Mock logger to avoid console output during tests
jest.mock('../../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  startPerformance: jest.fn(() => 'test-tracking-id'),
  endPerformance: jest.fn()
}))

describe('TextChunker', () => {
  let chunker: TextChunker

  beforeEach(() => {
    chunker = new TextChunker()
  })

  describe('Input Validation', () => {
    it('should reject empty text', async () => {
      await expect(chunker.chunkText('')).rejects.toThrow(ChunkingError)
    })

    it('should reject non-string input', async () => {
      await expect(chunker.chunkText(null as any)).rejects.toThrow(ChunkingError)
    })

    it('should reject whitespace-only text', async () => {
      await expect(chunker.chunkText('   \n\t   ')).rejects.toThrow(ChunkingError)
    })

    it('should reject invalid options', async () => {
      const options: ChunkingOptions = { maxTokens: -1 }
      await expect(chunker.chunkText('Valid text', options)).rejects.toThrow(ChunkingError)
    })

    it('should reject minTokens >= maxTokens', async () => {
      const options: ChunkingOptions = { minTokens: 500, maxTokens: 400 }
      await expect(chunker.chunkText('Valid text', options)).rejects.toThrow(ChunkingError)
    })

    it('should reject invalid overlap percentage', async () => {
      const options: ChunkingOptions = { overlapPercentage: 1.5 }
      await expect(chunker.chunkText('Valid text', options)).rejects.toThrow(ChunkingError)
    })
  })

  describe('Token-based Chunking', () => {
    it('should chunk text into appropriate token-sized pieces', async () => {
      const text = 'This is a test document with multiple sentences. ' +
                  'It should be chunked into pieces based on token count. ' +
                  'Each chunk should respect the maximum token limit.'

      const options: ChunkingOptions = {
        strategy: 'token-based',
        maxTokens: 50,
        minTokens: 10
      }

      const result = await chunker.chunkText(text, options)

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.totalTokens).toBeGreaterThan(0)
      expect(result.metadata.strategy).toBe('token-based')

      // Check each chunk respects token limits
      for (const chunk of result.chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(options.maxTokens!)
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(0)
        expect(chunk.content).toBeTruthy()
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0)
        expect(chunk.endIndex).toBeGreaterThan(chunk.startIndex)
      }
    })

    it('should handle very short text', async () => {
      const text = 'Short text.'
      
      const result = await chunker.chunkText(text)

      expect(result.chunks.length).toBe(1)
      expect(result.chunks[0].content.trim()).toBe(text.trim())
    })

    it('should maintain chunk order', async () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.'
      
      const result = await chunker.chunkText(text, { maxTokens: 20 })

      // Verify chunks are in order
      for (let i = 1; i < result.chunks.length; i++) {
        expect(result.chunks[i].startIndex).toBeGreaterThanOrEqual(
          result.chunks[i - 1].startIndex
        )
        expect(result.chunks[i].index).toBe(i)
      }
    })
  })

  describe('Sentence-based Chunking', () => {
    it('should respect sentence boundaries', async () => {
      const text = 'First sentence here. Second sentence follows. Third sentence completes the paragraph.'

      const options: ChunkingOptions = {
        strategy: 'sentence-based',
        maxTokens: 30,
        preserveSentences: true
      }

      const result = await chunker.chunkText(text, options)

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.metadata.strategy).toBe('sentence-based')

      // Check that chunks end with sentence punctuation when possible
      for (const chunk of result.chunks) {
        expect(chunk.content).toBeTruthy()
        expect(typeof chunk.metadata?.sentenceCount).toBe('number')
      }
    })

    it('should handle text without clear sentence boundaries', async () => {
      const text = 'This text has no proper punctuation and should still be chunked appropriately'

      const result = await chunker.chunkText(text, { strategy: 'sentence-based' })

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.chunks[0].content).toContain('This text')
    })
  })

  describe('Paragraph-based Chunking', () => {
    it('should respect paragraph boundaries', async () => {
      const text = `First paragraph with multiple sentences. This continues the first paragraph.

Second paragraph starts here. It has its own content.

Third paragraph is the final one. It wraps up the document.`

      const options: ChunkingOptions = {
        strategy: 'paragraph-based',
        maxTokens: 100,
        preserveParagraphs: true
      }

      const result = await chunker.chunkText(text, options)

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.metadata.strategy).toBe('paragraph-based')

      // Check for paragraph-specific metadata
      for (const chunk of result.chunks) {
        expect(chunk.content).toBeTruthy()
        expect(typeof chunk.metadata?.paragraphCount).toBe('number')
      }
    })
  })

  describe('Section-based Chunking', () => {
    it('should handle markdown headers', async () => {
      const text = `# Main Title

This is content under the main title.

## Subsection

Content for the subsection goes here.

### Sub-subsection

More detailed content.`

      const options: ChunkingOptions = {
        strategy: 'section-based',
        maxTokens: 150
      }

      const result = await chunker.chunkText(text, options)

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.metadata.strategy).toBe('section-based')

      // Check for section-specific metadata
      for (const chunk of result.chunks) {
        expect(chunk.content).toBeTruthy()
        if (chunk.metadata?.sectionTitle) {
          expect(typeof chunk.metadata.sectionTitle).toBe('string')
          expect(typeof chunk.metadata.sectionLevel).toBe('number')
        }
      }
    })

    it('should handle text without headers', async () => {
      const text = 'Regular text without any markdown headers or structure.'

      const result = await chunker.chunkText(text, { strategy: 'section-based' })

      expect(result.chunks.length).toBe(1)
      expect(result.chunks[0].content).toContain('Regular text')
    })
  })

  describe('Chunk Validation', () => {
    it('should validate chunk structure', () => {
      const validChunks = [
        {
          content: 'Valid chunk content',
          index: 0,
          tokenCount: 10,
          startIndex: 0,
          endIndex: 19
        },
        {
          content: 'Another valid chunk',
          index: 1,
          tokenCount: 15,
          startIndex: 20,
          endIndex: 39
        }
      ]

      expect(() => chunker.validateChunks(validChunks)).not.toThrow()
    })

    it('should reject chunks with invalid structure', () => {
      const invalidChunks = [
        {
          content: '', // Empty content
          index: 0,
          tokenCount: 0,
          startIndex: 0,
          endIndex: 0
        }
      ]

      expect(() => chunker.validateChunks(invalidChunks as any)).toThrow(ChunkingError)
    })

    it('should reject chunks with invalid token counts', () => {
      const invalidChunks = [
        {
          content: 'Valid content',
          index: 0,
          tokenCount: -1, // Invalid token count
          startIndex: 0,
          endIndex: 13
        }
      ]

      expect(() => chunker.validateChunks(invalidChunks as any)).toThrow(ChunkingError)
    })

    it('should reject chunks with invalid indices', () => {
      const invalidChunks = [
        {
          content: 'Valid content',
          index: 5, // Should be 0
          tokenCount: 10,
          startIndex: 0,
          endIndex: 13
        }
      ]

      expect(() => chunker.validateChunks(invalidChunks as any)).toThrow(ChunkingError)
    })
  })

  describe('Chunk Optimization', () => {
    it('should optimize chunks to target token count', async () => {
      const largeChunks = [
        {
          content: 'This is a very long chunk that exceeds the target token count and should be split into smaller pieces for optimization.',
          index: 0,
          tokenCount: 200, // Exceeds target
          startIndex: 0,
          endIndex: 120
        }
      ]

      const optimized = await chunker.optimizeChunks(largeChunks as any, 50)

      expect(optimized.length).toBeGreaterThan(1)
      for (const chunk of optimized) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(50)
      }
    })

    it('should keep chunks that are already within target', async () => {
      const goodChunks = [
        {
          content: 'Perfect size chunk',
          index: 0,
          tokenCount: 20,
          startIndex: 0,
          endIndex: 18
        }
      ]

      const optimized = await chunker.optimizeChunks(goodChunks as any, 50)

      expect(optimized.length).toBe(1)
      expect(optimized[0].content).toBe('Perfect size chunk')
    })
  })

  describe('Chunk Merging', () => {
    it('should merge small chunks', () => {
      const smallChunks = [
        {
          content: 'Small',
          index: 0,
          tokenCount: 5,
          startIndex: 0,
          endIndex: 5
        },
        {
          content: 'Also small',
          index: 1,
          tokenCount: 8,
          startIndex: 6,
          endIndex: 16
        },
        {
          content: 'Tiny',
          index: 2,
          tokenCount: 3,
          startIndex: 17,
          endIndex: 21
        }
      ]

      const merged = chunker.mergeSmallChunks(smallChunks as any, 10)

      expect(merged.length).toBeLessThan(smallChunks.length)
      expect(merged[0].tokenCount).toBeGreaterThanOrEqual(10)
    })

    it('should not merge chunks that would exceed max tokens', () => {
      const chunks = [
        {
          content: 'First chunk with moderate content',
          index: 0,
          tokenCount: 800,
          startIndex: 0,
          endIndex: 33
        },
        {
          content: 'Second chunk that cannot be merged',
          index: 1,
          tokenCount: 800,
          startIndex: 34,
          endIndex: 68
        }
      ]

      const merged = chunker.mergeSmallChunks(chunks as any, 10)

      expect(merged.length).toBe(2) // Should remain separate
    })
  })

  describe('Preview Functionality', () => {
    it('should provide chunking preview', async () => {
      const text = 'This is a test document for previewing the chunking process. ' +
                  'It should return estimates without full processing.'

      const preview = await chunker.previewChunking(text, { maxTokens: 50 })

      expect(preview.estimatedChunkCount).toBeGreaterThan(0)
      expect(preview.estimatedTokens).toBeGreaterThan(0)
      expect(preview.strategy).toBeTruthy()
      expect(Array.isArray(preview.previewChunks)).toBe(true)
      expect(preview.previewChunks.length).toBeLessThanOrEqual(3)

      for (const previewChunk of preview.previewChunks) {
        expect(previewChunk.content).toBeTruthy()
        expect(previewChunk.estimatedTokens).toBeGreaterThan(0)
      }
    })

    it('should handle very short text in preview', async () => {
      const text = 'Short.'

      const preview = await chunker.previewChunking(text)

      expect(preview.estimatedChunkCount).toBe(1)
      expect(preview.estimatedTokens).toBeGreaterThan(0)
      expect(preview.previewChunks.length).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle text with unusual characters', async () => {
      const text = 'Text with émojis 🚀 and spéciàl characters: @#$%^&*()'

      const result = await chunker.chunkText(text)

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.chunks[0].content).toContain('émojis')
      expect(result.chunks[0].content).toContain('🚀')
    })

    it('should handle very long words', async () => {
      const text = 'Supercalifragilisticexpialidocious is an extraordinarily long word that should be handled properly.'

      const result = await chunker.chunkText(text, { maxTokens: 20 })

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.chunks[0].content).toContain('Supercalifragilisticexpialidocious')
    })

    it('should handle repeated content', async () => {
      const text = 'Repeat. '.repeat(100) // Very repetitive content

      const result = await chunker.chunkText(text, { maxTokens: 50 })

      expect(result.chunks.length).toBeGreaterThan(1)
      for (const chunk of result.chunks) {
        expect(chunk.content).toContain('Repeat')
      }
    })

    it('should handle mixed line endings', async () => {
      const text = 'Line 1\nLine 2\r\nLine 3\rLine 4'

      const result = await chunker.chunkText(text)

      expect(result.chunks.length).toBeGreaterThan(0)
      expect(result.chunks[0].content).toContain('Line 1')
      expect(result.chunks[0].content).toContain('Line 4')
    })
  })

  describe('Statistics', () => {
    it('should return stats object', () => {
      const stats = chunker.getStats()

      expect(typeof stats).toBe('object')
      expect(typeof stats.totalChunksCreated).toBe('number')
      expect(typeof stats.averageChunkSize).toBe('number')
      expect(typeof stats.strategiesUsed).toBe('object')
    })
  })
})
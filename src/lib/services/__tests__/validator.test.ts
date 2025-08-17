/**
 * Unit tests for Document Validator
 * Tests validation rules, constraints, and error handling
 */

import { DocumentValidator } from '../document-processing/validator'
import { ChunkingError } from '../types'
import type { DocumentInput } from '../types'

// Mock logger to avoid console output during tests
jest.mock('../../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

describe('DocumentValidator', () => {
  let validator: DocumentValidator

  beforeEach(() => {
    validator = new DocumentValidator()
  })

  describe('Valid Documents', () => {
    it('should validate a simple valid document', () => {
      const document: DocumentInput = {
        content: 'This is a valid document with enough content to pass validation.',
        filename: 'test.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
      expect(validator.isValid(document)).toBe(true)
    })

    it('should validate document without filename', () => {
      const document: DocumentInput = {
        content: 'This document has no filename but should still be valid.'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should validate document with metadata', () => {
      const document: DocumentInput = {
        content: 'Document with valid metadata.',
        filename: 'meta-test.md',
        metadata: {
          author: 'Test Author',
          tags: ['test', 'validation'],
          created: new Date().toISOString()
        }
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should validate markdown document', () => {
      const document: DocumentInput = {
        content: `# Test Document

This is a markdown document with proper structure.

## Section 1

Content for section 1.

## Section 2

Content for section 2.`,
        filename: 'test.md'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })
  })

  describe('Basic Structure Validation', () => {
    it('should reject null document', () => {
      expect(() => validator.validate(null as any)).toThrow(ChunkingError)
    })

    it('should reject undefined document', () => {
      expect(() => validator.validate(undefined as any)).toThrow(ChunkingError)
    })

    it('should reject non-object document', () => {
      expect(() => validator.validate('string' as any)).toThrow(ChunkingError)
    })

    it('should reject document without content', () => {
      const document = { filename: 'test.txt' } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject document with non-string content', () => {
      const document = {
        content: 12345,
        filename: 'test.txt'
      } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })
  })

  describe('Content Validation', () => {
    it('should reject empty content', () => {
      const document: DocumentInput = {
        content: '',
        filename: 'empty.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject whitespace-only content', () => {
      const document: DocumentInput = {
        content: '   \n\t   ',
        filename: 'whitespace.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject content with insufficient words', () => {
      const document: DocumentInput = {
        content: 'Two words',
        filename: 'short.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should accept content with minimum required words', () => {
      const document: DocumentInput = {
        content: 'Three valid words',
        filename: 'minimum.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should reject extremely large documents', () => {
      const document: DocumentInput = {
        content: 'Large content. '.repeat(100000), // Very large document
        filename: 'huge.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })
  })

  describe('Filename Validation', () => {
    it('should accept valid filenames', () => {
      const validFilenames = [
        'document.txt',
        'my-file.md',
        'file_with_underscores.txt',
        'file123.md',
        'FILE.TXT',
        'simple'
      ]

      for (const filename of validFilenames) {
        const document: DocumentInput = {
          content: 'Valid content for filename test.',
          filename
        }

        expect(() => validator.validate(document)).not.toThrow()
      }
    })

    it('should reject non-string filenames', () => {
      const document = {
        content: 'Valid content.',
        filename: 123
      } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject empty filenames', () => {
      const document: DocumentInput = {
        content: 'Valid content.',
        filename: ''
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject filenames with invalid characters', () => {
      const invalidFilenames = [
        'file<test>.txt',
        'file:test.txt',
        'file|test.txt',
        'file?test.txt',
        'file*test.txt'
      ]

      for (const filename of invalidFilenames) {
        const document: DocumentInput = {
          content: 'Valid content for invalid filename test.',
          filename
        }

        expect(() => validator.validate(document)).toThrow(ChunkingError)
      }
    })

    it('should reject extremely long filenames', () => {
      const document: DocumentInput = {
        content: 'Valid content.',
        filename: 'a'.repeat(300) + '.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject unsupported file types', () => {
      const document: DocumentInput = {
        content: 'Valid content.',
        filename: 'document.pdf'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should accept supported file types', () => {
      const supportedTypes = ['txt', 'md']

      for (const type of supportedTypes) {
        const document: DocumentInput = {
          content: 'Valid content for file type test.',
          filename: `document.${type}`
        }

        expect(() => validator.validate(document)).not.toThrow()
      }
    })
  })

  describe('File Size Validation', () => {
    it('should reject documents that are too large', () => {
      const document: DocumentInput = {
        content: 'x'.repeat(2 * 1024 * 1024), // 2MB content
        filename: 'large.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject documents that are too small', () => {
      const document: DocumentInput = {
        content: 'tiny',
        filename: 'tiny.txt'
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should accept documents within size limits', () => {
      const document: DocumentInput = {
        content: 'This is a document with appropriate size for validation testing.',
        filename: 'good-size.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })
  })

  describe('Metadata Validation', () => {
    it('should accept valid metadata', () => {
      const document: DocumentInput = {
        content: 'Document with valid metadata.',
        filename: 'meta.txt',
        metadata: {
          author: 'John Doe',
          version: 1,
          tags: ['test', 'document'],
          settings: {
            public: true,
            priority: 'high'
          }
        }
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should reject non-object metadata', () => {
      const document = {
        content: 'Document with invalid metadata.',
        filename: 'meta.txt',
        metadata: 'invalid'
      } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject null metadata', () => {
      const document = {
        content: 'Document with null metadata.',
        filename: 'meta.txt',
        metadata: null
      } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject metadata that is too large', () => {
      const largeMetadata = {
        data: 'x'.repeat(20000) // Large metadata
      }

      const document: DocumentInput = {
        content: 'Document with large metadata.',
        filename: 'meta.txt',
        metadata: largeMetadata
      }

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject metadata with invalid keys', () => {
      const document = {
        content: 'Document with invalid metadata keys.',
        filename: 'meta.txt',
        metadata: {
          '': 'empty key',
          'x'.repeat(150): 'long key'
        }
      } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })

    it('should reject metadata with circular references', () => {
      const circularMetadata: any = { name: 'test' }
      circularMetadata.self = circularMetadata

      const document = {
        content: 'Document with circular metadata.',
        filename: 'meta.txt',
        metadata: circularMetadata
      } as any

      expect(() => validator.validate(document)).toThrow(ChunkingError)
    })
  })

  describe('Content Quality Validation', () => {
    it('should handle highly repetitive content', () => {
      const document: DocumentInput = {
        content: 'Repeat this line. \n'.repeat(100),
        filename: 'repetitive.txt'
      }

      // Should not throw but may log warnings
      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should handle content with encoding issues', () => {
      const document: DocumentInput = {
        content: 'Text with replacement chars: ' + '\uFFFD'.repeat(20),
        filename: 'encoding.txt'
      }

      // Should not throw but may log warnings
      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should handle content with unusual patterns', () => {
      const document: DocumentInput = {
        content: 'Normal text followed by: ' + 'a'.repeat(100) + ' more normal text.',
        filename: 'patterns.txt'
      }

      // Should not throw but may log warnings
      expect(() => validator.validate(document)).not.toThrow()
    })
  })

  describe('Batch Validation', () => {
    it('should validate multiple documents', () => {
      const documents: DocumentInput[] = [
        {
          content: 'First valid document.',
          filename: 'first.txt'
        },
        {
          content: 'Second valid document.',
          filename: 'second.md'
        },
        {
          content: '', // Invalid
          filename: 'invalid.txt'
        }
      ]

      const result = validator.validateBatch(documents)

      expect(result.valid).toHaveLength(2)
      expect(result.invalid).toHaveLength(1)
      expect(result.invalid[0].error).toBeInstanceOf(Error)
    })

    it('should handle empty batch', () => {
      const result = validator.validateBatch([])

      expect(result.valid).toHaveLength(0)
      expect(result.invalid).toHaveLength(0)
    })
  })

  describe('Validation Rules', () => {
    it('should return validation rules summary', () => {
      const rules = validator.getValidationRules()

      expect(typeof rules.maxFileSize).toBe('number')
      expect(Array.isArray(rules.allowedTypes)).toBe(true)
      expect(typeof rules.maxFilenameLength).toBe('number')
      expect(typeof rules.minContentWords).toBe('number')
      expect(typeof rules.maxEstimatedTokens).toBe('number')

      expect(rules.maxFileSize).toBeGreaterThan(0)
      expect(rules.allowedTypes.length).toBeGreaterThan(0)
      expect(rules.minContentWords).toBeGreaterThan(0)
    })
  })

  describe('Error Collection', () => {
    it('should collect all validation errors without throwing', () => {
      const document = {
        content: '', // Empty content
        filename: 'file<invalid>.pdf', // Invalid filename and extension
        metadata: null // Invalid metadata
      } as any

      const errors = validator.getValidationErrors(document)

      expect(errors.length).toBeGreaterThan(0)
      expect(errors.every(error => error instanceof Error)).toBe(true)
    })

    it('should return empty array for valid document', () => {
      const document: DocumentInput = {
        content: 'This is a valid document for error collection test.',
        filename: 'valid.txt'
      }

      const errors = validator.getValidationErrors(document)

      expect(errors).toHaveLength(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle unicode content', () => {
      const document: DocumentInput = {
        content: 'Unicode content: 你好世界 🌟 émojis and spëciàl characters.',
        filename: 'unicode.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should handle mixed line endings', () => {
      const document: DocumentInput = {
        content: 'Line 1\nLine 2\r\nLine 3\rLine 4',
        filename: 'mixed-endings.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should handle very long lines', () => {
      const document: DocumentInput = {
        content: 'Very long line: ' + 'word '.repeat(1000),
        filename: 'long-line.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })

    it('should handle binary-like content', () => {
      const document: DocumentInput = {
        content: 'Binary-like content: \x00\x01\x02\x03 mixed with text.',
        filename: 'binary.txt'
      }

      expect(() => validator.validate(document)).not.toThrow()
    })
  })
})
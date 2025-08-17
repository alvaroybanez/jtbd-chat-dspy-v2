/**
 * Document Input Validator
 * Validates document inputs against business rules and constraints
 */

import { DATABASE_LIMITS, FILE_PROCESSING } from '../../config/constants'
import { ChunkingError } from '../types'
import type { DocumentInput } from '../types'
import { logger } from '../../logger'

/**
 * Document validation rules and constraints
 */
export class DocumentValidator {
  private readonly maxFileSize = DATABASE_LIMITS.MAX_FILE_SIZE_BYTES
  private readonly allowedTypes = FILE_PROCESSING.ALLOWED_EXTENSIONS
  private readonly maxFilenameLength = FILE_PROCESSING.MAX_FILENAME_LENGTH

  /**
   * Validate document input against all rules
   */
  validate(document: DocumentInput): boolean {
    try {
      this.validateBasicStructure(document)
      this.validateContent(document)
      this.validateFilename(document)
      this.validateFileSize(document)
      this.validateMetadata(document)

      logger.debug('Document validation passed', {
        filename: document.filename,
        contentLength: document.content.length,
        hasMetadata: !!document.metadata
      })

      return true

    } catch (error) {
      logger.warn('Document validation failed', {
        filename: document.filename,
        error: error instanceof Error ? error.message : String(error)
      })

      throw error
    }
  }

  /**
   * Validate basic document structure
   */
  private validateBasicStructure(document: DocumentInput): void {
    if (!document || typeof document !== 'object') {
      throw new ChunkingError(
        'Document must be a valid object',
        'INVALID_DOCUMENT_STRUCTURE'
      )
    }

    if (!document.content) {
      throw new ChunkingError(
        'Document content is required',
        'MISSING_DOCUMENT_CONTENT'
      )
    }

    if (typeof document.content !== 'string') {
      throw new ChunkingError(
        'Document content must be a string',
        'INVALID_CONTENT_TYPE',
        { contentType: typeof document.content }
      )
    }
  }

  /**
   * Validate document content
   */
  private validateContent(document: DocumentInput): void {
    const content = document.content.trim()

    if (content.length === 0) {
      throw new ChunkingError(
        'Document content cannot be empty',
        'EMPTY_DOCUMENT_CONTENT'
      )
    }

    // Check for minimum meaningful content
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length
    if (wordCount < 3) {
      throw new ChunkingError(
        'Document must contain at least 3 words',
        'INSUFFICIENT_CONTENT',
        { wordCount }
      )
    }

    // Check for maximum content length (based on token limits)
    const estimatedTokens = Math.ceil(content.length / 4) // Rough estimate
    const maxTokens = DATABASE_LIMITS.MAX_CHUNK_TOKENS * 1000 // Allow up to 1000 chunks
    
    if (estimatedTokens > maxTokens) {
      throw new ChunkingError(
        `Document is too large: estimated ${estimatedTokens} tokens, maximum ${maxTokens}`,
        'DOCUMENT_TOO_LARGE',
        { estimatedTokens, maxTokens, contentLength: content.length }
      )
    }

    // Check for potentially problematic content
    this.validateContentQuality(content)
  }

  /**
   * Validate content quality and detect potential issues
   */
  private validateContentQuality(content: string): void {
    // Check for excessive repetition
    const lines = content.split('\n')
    const uniqueLines = new Set(lines.map(line => line.trim().toLowerCase()))
    const repetitionRatio = 1 - (uniqueLines.size / lines.length)

    if (repetitionRatio > 0.7 && lines.length > 10) {
      logger.warn('Document has high repetition ratio', {
        repetitionRatio,
        totalLines: lines.length,
        uniqueLines: uniqueLines.size
      })
    }

    // Check for suspicious patterns that might indicate corrupted data
    const suspiciousPatterns = [
      /(.)\1{50,}/g,  // Same character repeated 50+ times
      /(\w{1,3})\1{20,}/g,  // Short pattern repeated many times
      /[^\x20-\x7E\n\t]{100,}/g  // Long sequences of non-printable characters
    ]

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        logger.warn('Document contains suspicious patterns', {
          pattern: pattern.toString()
        })
        break
      }
    }

    // Check character encoding issues
    const nonUtf8Chars = content.match(/[\uFFFD]/g)
    if (nonUtf8Chars && nonUtf8Chars.length > 10) {
      logger.warn('Document may have encoding issues', {
        replacementCharCount: nonUtf8Chars.length
      })
    }
  }

  /**
   * Validate filename
   */
  private validateFilename(document: DocumentInput): void {
    if (!document.filename) {
      // Filename is optional, but if provided, must be valid
      return
    }

    if (typeof document.filename !== 'string') {
      throw new ChunkingError(
        'Filename must be a string',
        'INVALID_FILENAME_TYPE',
        { filenameType: typeof document.filename }
      )
    }

    const filename = document.filename.trim()

    if (filename.length === 0) {
      throw new ChunkingError(
        'Filename cannot be empty',
        'EMPTY_FILENAME'
      )
    }

    if (filename.length > this.maxFilenameLength) {
      throw new ChunkingError(
        `Filename too long: ${filename.length} characters, maximum ${this.maxFilenameLength}`,
        'FILENAME_TOO_LONG',
        { 
          filenameLength: filename.length, 
          maxLength: this.maxFilenameLength,
          filename: filename.substring(0, 50) + '...'
        }
      )
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/g
    if (invalidChars.test(filename)) {
      const matches = filename.match(invalidChars)
      throw new ChunkingError(
        'Filename contains invalid characters',
        'INVALID_FILENAME_CHARACTERS',
        { 
          invalidChars: [...new Set(matches)],
          filename: filename.substring(0, 50)
        }
      )
    }

    // Validate file extension if present
    const extension = this.extractFileExtension(filename)
    if (extension && !this.allowedTypes.includes(extension)) {
      throw new ChunkingError(
        `Unsupported file type: .${extension}`,
        'UNSUPPORTED_FILE_TYPE',
        { 
          extension,
          allowedTypes: this.allowedTypes,
          filename
        }
      )
    }
  }

  /**
   * Validate file size
   */
  private validateFileSize(document: DocumentInput): void {
    const contentSize = Buffer.byteLength(document.content, 'utf8')

    if (contentSize > this.maxFileSize) {
      throw new ChunkingError(
        `Document too large: ${contentSize} bytes, maximum ${this.maxFileSize} bytes`,
        'DOCUMENT_SIZE_EXCEEDED',
        { 
          contentSize,
          maxSize: this.maxFileSize,
          sizeMB: Math.round((contentSize / 1024 / 1024) * 100) / 100
        }
      )
    }

    // Check minimum size
    if (contentSize < 10) {
      throw new ChunkingError(
        'Document too small: minimum 10 bytes required',
        'DOCUMENT_TOO_SMALL',
        { contentSize }
      )
    }
  }

  /**
   * Validate metadata
   */
  private validateMetadata(document: DocumentInput): void {
    if (!document.metadata) {
      return // Metadata is optional
    }

    if (typeof document.metadata !== 'object' || document.metadata === null) {
      throw new ChunkingError(
        'Document metadata must be an object',
        'INVALID_METADATA_TYPE',
        { metadataType: typeof document.metadata }
      )
    }

    // Check metadata size
    const metadataStr = JSON.stringify(document.metadata)
    const metadataSize = Buffer.byteLength(metadataStr, 'utf8')
    const maxMetadataSize = 10240 // 10KB

    if (metadataSize > maxMetadataSize) {
      throw new ChunkingError(
        `Metadata too large: ${metadataSize} bytes, maximum ${maxMetadataSize} bytes`,
        'METADATA_TOO_LARGE',
        { metadataSize, maxMetadataSize }
      )
    }

    // Check for circular references
    try {
      JSON.stringify(document.metadata)
    } catch (error) {
      throw new ChunkingError(
        'Metadata contains circular references or non-serializable values',
        'INVALID_METADATA_STRUCTURE',
        { originalError: error instanceof Error ? error.message : String(error) }
      )
    }

    // Validate metadata keys
    for (const key of Object.keys(document.metadata)) {
      if (typeof key !== 'string' || key.length === 0) {
        throw new ChunkingError(
          'Metadata keys must be non-empty strings',
          'INVALID_METADATA_KEY',
          { invalidKey: key }
        )
      }

      if (key.length > 100) {
        throw new ChunkingError(
          `Metadata key too long: ${key.length} characters, maximum 100`,
          'METADATA_KEY_TOO_LONG',
          { key: key.substring(0, 50) + '...', keyLength: key.length }
        )
      }
    }
  }

  /**
   * Extract file extension from filename
   */
  private extractFileExtension(filename: string): string | null {
    const lastDotIndex = filename.lastIndexOf('.')
    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return null
    }

    const extension = filename.substring(lastDotIndex + 1).toLowerCase()
    return extension.length > 0 ? extension : null
  }

  /**
   * Validate multiple documents
   */
  validateBatch(documents: DocumentInput[]): {
    valid: DocumentInput[]
    invalid: Array<{ document: DocumentInput; error: Error }>
  } {
    const valid: DocumentInput[] = []
    const invalid: Array<{ document: DocumentInput; error: Error }> = []

    for (const document of documents) {
      try {
        this.validate(document)
        valid.push(document)
      } catch (error) {
        invalid.push({
          document,
          error: error instanceof Error ? error : new Error(String(error))
        })
      }
    }

    logger.info('Batch validation completed', {
      totalDocuments: documents.length,
      validDocuments: valid.length,
      invalidDocuments: invalid.length
    })

    return { valid, invalid }
  }

  /**
   * Get validation rules summary
   */
  getValidationRules(): {
    maxFileSize: number
    allowedTypes: string[]
    maxFilenameLength: number
    minContentWords: number
    maxEstimatedTokens: number
  } {
    return {
      maxFileSize: this.maxFileSize,
      allowedTypes: [...this.allowedTypes],
      maxFilenameLength: this.maxFilenameLength,
      minContentWords: 3,
      maxEstimatedTokens: DATABASE_LIMITS.MAX_CHUNK_TOKENS * 1000
    }
  }

  /**
   * Check if document would be valid without throwing
   */
  isValid(document: DocumentInput): boolean {
    try {
      this.validate(document)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get validation errors without throwing
   */
  getValidationErrors(document: DocumentInput): Error[] {
    const errors: Error[] = []

    try {
      this.validateBasicStructure(document)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    try {
      this.validateContent(document)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    try {
      this.validateFilename(document)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    try {
      this.validateFileSize(document)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    try {
      this.validateMetadata(document)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    return errors
  }
}
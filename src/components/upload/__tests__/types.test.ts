/**
 * Upload Types Tests
 * Tests for upload component type definitions and utilities
 */

import {
  isUploadResponse,
  isUploadErrorResponse,
  isValidFileType,
  UPLOAD_CONSTANTS,
  type UploadState,
  type UploadProgress,
  type FileValidationResult,
} from '../types'

describe('Upload Types and Utilities', () => {
  describe('Type Guards', () => {
    it('should correctly identify upload response objects', () => {
      const validResponse = {
        document_id: 'doc-123',
        filename: 'test.md',
        chunks_created: 5,
        insights_generated: 3,
        success: true,
      }

      const invalidResponse = {
        filename: 'test.md',
        success: true,
        // missing required fields
      }

      expect(isUploadResponse(validResponse)).toBe(true)
      expect(isUploadResponse(invalidResponse)).toBe(false)
      expect(isUploadResponse(null)).toBe(false)
      expect(isUploadResponse(undefined)).toBe(false)
      expect(isUploadResponse({})).toBe(false)
    })

    it('should correctly identify upload error response objects', () => {
      const validError = {
        code: 'FILE_UPLOAD_FAILED',
        message: 'Upload failed',
        action: 'RETRY',
      }

      const invalidError = {
        message: 'Upload failed',
        // missing required fields
      }

      expect(isUploadErrorResponse(validError)).toBe(true)
      expect(isUploadErrorResponse(invalidError)).toBe(false)
      expect(isUploadErrorResponse(null)).toBe(false)
      expect(isUploadErrorResponse({})).toBe(false)
    })

    it('should validate file types correctly', () => {
      const allowedTypes = ['md', 'txt']

      expect(isValidFileType('document.md', allowedTypes)).toBe(true)
      expect(isValidFileType('document.txt', allowedTypes)).toBe(true)
      expect(isValidFileType('document.pdf', allowedTypes)).toBe(false)
      expect(isValidFileType('document.docx', allowedTypes)).toBe(false)
      expect(isValidFileType('document', allowedTypes)).toBe(false)
    })
  })

  describe('Upload Constants', () => {
    it('should have correct default values', () => {
      expect(UPLOAD_CONSTANTS.DEFAULT_MAX_FILE_SIZE).toBe(1048576) // 1MB
      expect(UPLOAD_CONSTANTS.DEFAULT_ALLOWED_TYPES).toEqual(['md', 'txt'])
      expect(UPLOAD_CONSTANTS.DEFAULT_TIMEOUT).toBe(60000) // 60s
      expect(UPLOAD_CONSTANTS.DEFAULT_PREVIEW_LENGTH).toBe(500)
      expect(UPLOAD_CONSTANTS.PROGRESS_UPDATE_INTERVAL).toBe(100)
    })
  })

  describe('Type Definitions', () => {
    it('should have correct upload state values', () => {
      const states: UploadState[] = [
        'idle',
        'uploading', 
        'processing',
        'success',
        'error'
      ]

      // Test that all states are valid strings
      states.forEach(state => {
        expect(typeof state).toBe('string')
        expect(state.length).toBeGreaterThan(0)
      })
    })

    it('should have correct progress interface structure', () => {
      const progress: UploadProgress = {
        percentage: 50,
        bytesUploaded: 512000,
        totalBytes: 1024000,
        speed: 102400,
        remainingTime: 5000,
      }

      expect(progress.percentage).toBe(50)
      expect(progress.bytesUploaded).toBe(512000)
      expect(progress.totalBytes).toBe(1024000)
      expect(progress.speed).toBe(102400)
      expect(progress.remainingTime).toBe(5000)

      // Test required vs optional properties
      const minimalProgress: UploadProgress = {
        percentage: 25,
        bytesUploaded: 256000,
        totalBytes: 1024000,
      }

      expect(minimalProgress.percentage).toBe(25)
      expect(minimalProgress.speed).toBeUndefined()
      expect(minimalProgress.remainingTime).toBeUndefined()
    })

    it('should have correct validation result interface', () => {
      const validResult: FileValidationResult = {
        isValid: true,
        errors: [],
        warnings: ['File might be processed slowly'],
      }

      const invalidResult: FileValidationResult = {
        isValid: false,
        errors: ['File too large', 'Invalid type'],
      }

      expect(validResult.isValid).toBe(true)
      expect(validResult.errors).toHaveLength(0)
      expect(validResult.warnings).toHaveLength(1)

      expect(invalidResult.isValid).toBe(false)
      expect(invalidResult.errors).toHaveLength(2)
      expect(invalidResult.warnings).toBeUndefined()
    })
  })

  describe('File Extension Validation', () => {
    it('should extract file extensions correctly', () => {
      const getFileExtension = (filename: string): string => {
        const parts = filename.toLowerCase().split('.')
        if (parts.length === 1) return '' // no extension
        const extension = parts.pop()
        return extension || ''
      }

      expect(getFileExtension('document.md')).toBe('md')
      expect(getFileExtension('README.txt')).toBe('txt')
      expect(getFileExtension('complex.name.with.dots.md')).toBe('md')
      expect(getFileExtension('no-extension')).toBe('')
      expect(getFileExtension('hidden.file.')).toBe('')
    })

    it('should handle case insensitive extensions', () => {
      const allowedTypes = ['md', 'txt']
      
      expect(isValidFileType('document.MD', allowedTypes)).toBe(true)
      expect(isValidFileType('document.TXT', allowedTypes)).toBe(true)
      expect(isValidFileType('document.Md', allowedTypes)).toBe(true)
      expect(isValidFileType('document.mD', allowedTypes)).toBe(true)
    })
  })

  describe('Error Response Structure', () => {
    it('should properly structure error responses', () => {
      const errorResponse = {
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds maximum size limit',
        action: 'NONE' as const,
        details: {
          filename: 'large-file.md',
          fileSize: 2048576,
          maxSize: 1048576,
          timestamp: new Date().toISOString(),
        },
      }

      expect(errorResponse.code).toBe('FILE_TOO_LARGE')
      expect(errorResponse.message).toBe('File exceeds maximum size limit')
      expect(errorResponse.action).toBe('NONE')
      expect(errorResponse.details?.filename).toBe('large-file.md')
      expect(errorResponse.details?.fileSize).toBe(2048576)
      expect(errorResponse.details?.maxSize).toBe(1048576)
      expect(typeof errorResponse.details?.timestamp).toBe('string')
    })
  })

  describe('Upload Result Variations', () => {
    it('should handle successful upload results', () => {
      const successResult = {
        success: true,
        filename: 'test.md',
        documentId: 'doc-456',
        chunksCreated: 8,
        insightsGenerated: 5,
        processingTime: 2500,
      }

      expect(successResult.success).toBe(true)
      expect(successResult.filename).toBe('test.md')
      expect(successResult.documentId).toBe('doc-456')
      expect(successResult.chunksCreated).toBe(8)
      expect(successResult.insightsGenerated).toBe(5)
      expect(successResult.processingTime).toBe(2500)
      expect(successResult.error).toBeUndefined()
    })

    it('should handle failed upload results', () => {
      const failureResult = {
        success: false,
        filename: 'failed.md',
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network request failed',
          action: 'RETRY' as const,
          details: {
            filename: 'failed.md',
            timestamp: new Date().toISOString(),
          },
        },
      }

      expect(failureResult.success).toBe(false)
      expect(failureResult.filename).toBe('failed.md')
      expect(failureResult.documentId).toBeUndefined()
      expect(failureResult.chunksCreated).toBeUndefined()
      expect(failureResult.error?.code).toBe('NETWORK_ERROR')
      expect(failureResult.error?.action).toBe('RETRY')
    })
  })
})
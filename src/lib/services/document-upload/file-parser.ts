/**
 * File Parser for Document Upload
 * Handles multipart form data parsing, validation, and text extraction
 */

import { NextRequest } from 'next/server'
import { FILE_PROCESSING, DATABASE_LIMITS, ERROR_CODES } from '../../config/constants'
import type { FileType } from '../../database/types'
import { ValidationError } from '../../errors/base'

export interface ParsedFile {
  filename: string
  content: string
  fileType: FileType
  fileSize: number
}

export interface FileParseResult {
  file: ParsedFile
  isValid: boolean
  errors: string[]
}

/**
 * Parse uploaded file from multipart form data
 */
export class FileParser {
  /**
   * Extract and validate file from request
   */
  async parseUploadedFile(request: NextRequest): Promise<ParsedFile> {
    try {
      const formData = await request.formData()
      const file = formData.get('file') as File

      if (!file) {
        throw new ValidationError(
          'No file provided in upload request',
          ERROR_CODES.INVALID_INPUT,
          { field: 'file', reason: 'missing' }
        )
      }

      // Validate file size
      if (file.size > DATABASE_LIMITS.MAX_FILE_SIZE_BYTES) {
        throw new ValidationError(
          `File size ${file.size} bytes exceeds maximum allowed size of ${DATABASE_LIMITS.MAX_FILE_SIZE_BYTES} bytes`,
          ERROR_CODES.FILE_TOO_LARGE,
          { 
            fileSize: file.size, 
            maxSize: DATABASE_LIMITS.MAX_FILE_SIZE_BYTES,
            filename: file.name
          }
        )
      }

      // Validate filename length
      if (file.name.length > FILE_PROCESSING.MAX_FILENAME_LENGTH) {
        throw new ValidationError(
          `Filename exceeds maximum length of ${FILE_PROCESSING.MAX_FILENAME_LENGTH} characters`,
          ERROR_CODES.INVALID_INPUT,
          { 
            filename: file.name,
            filenameLength: file.name.length,
            maxLength: FILE_PROCESSING.MAX_FILENAME_LENGTH
          }
        )
      }

      // Extract and validate file extension
      const fileType = this.extractFileType(file.name)
      
      // Read file content
      const content = await this.extractTextContent(file, fileType)

      return {
        filename: file.name,
        content,
        fileType,
        fileSize: file.size
      }

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }

      throw new ValidationError(
        'Failed to parse uploaded file',
        ERROR_CODES.FILE_UPLOAD_FAILED,
        { 
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Extract file type from filename
   */
  private extractFileType(filename: string): FileType {
    const extension = filename.toLowerCase().split('.').pop()

    if (!extension || !FILE_PROCESSING.ALLOWED_EXTENSIONS.includes(extension as FileType)) {
      throw new ValidationError(
        `Invalid file type. Only ${FILE_PROCESSING.ALLOWED_EXTENSIONS.join(', ')} files are supported`,
        ERROR_CODES.FILE_TYPE_INVALID,
        { 
          filename,
          extension,
          allowedExtensions: FILE_PROCESSING.ALLOWED_EXTENSIONS
        }
      )
    }

    return extension as FileType
  }

  /**
   * Extract text content from file
   */
  private async extractTextContent(file: File, fileType: FileType): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const content = new TextDecoder(FILE_PROCESSING.ENCODING).decode(arrayBuffer)

      // Validate content is not empty
      if (!content.trim()) {
        throw new ValidationError(
          'File content is empty',
          ERROR_CODES.INVALID_INPUT,
          { filename: file.name, fileType }
        )
      }

      return content.trim()

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }

      throw new ValidationError(
        'Failed to extract text content from file',
        ERROR_CODES.FILE_UPLOAD_FAILED,
        { 
          filename: file.name,
          fileType,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Validate parsed file meets all requirements
   */
  validateFile(parsedFile: ParsedFile): FileParseResult {
    const errors: string[] = []

    // Check file size
    if (parsedFile.fileSize > DATABASE_LIMITS.MAX_FILE_SIZE_BYTES) {
      errors.push(`File size exceeds ${DATABASE_LIMITS.MAX_FILE_SIZE_BYTES} bytes`)
    }

    // Check file type
    if (!FILE_PROCESSING.ALLOWED_EXTENSIONS.includes(parsedFile.fileType)) {
      errors.push(`File type ${parsedFile.fileType} not supported`)
    }

    // Check filename length
    if (parsedFile.filename.length > FILE_PROCESSING.MAX_FILENAME_LENGTH) {
      errors.push(`Filename exceeds ${FILE_PROCESSING.MAX_FILENAME_LENGTH} characters`)
    }

    // Check content length
    if (!parsedFile.content || parsedFile.content.trim().length === 0) {
      errors.push('File content is empty')
    }

    return {
      file: parsedFile,
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Get MIME type for file type
   */
  getMimeType(fileType: FileType): string {
    switch (fileType) {
      case 'md':
        return FILE_PROCESSING.CONTENT_TYPE_MARKDOWN
      case 'txt':
        return FILE_PROCESSING.CONTENT_TYPE_TEXT
      default:
        return FILE_PROCESSING.CONTENT_TYPE_TEXT
    }
  }
}

// Export singleton instance
export const fileParser = new FileParser()
export default fileParser
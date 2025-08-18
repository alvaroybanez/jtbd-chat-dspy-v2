/**
 * Upload API Client
 * Robust client utility for file upload functionality
 * Handles FormData creation, progress tracking, error handling, and timeout management
 */

import type { UUID } from '@/lib/database/types'
import type {
  UploadRequestData,
  UploadResponse,
  UploadErrorResponse,
  UploadProgress,
  UploadResult,
  UploadOptions
} from '@/components/upload/types'
import { isUploadResponse, isUploadErrorResponse } from '@/components/upload/types'
import { 
  FileTooLargeError,
  InvalidFileTypeError,
  ValidationError,
  TimeoutError,
  ServiceError,
  type ErrorResponse 
} from '@/lib/errors/base'
import { 
  DATABASE_LIMITS, 
  FILE_PROCESSING, 
  TIMEOUTS, 
  ERROR_CODES, 
  HTTP_STATUS 
} from '@/lib/config/constants'
import { logger, startPerformance, endPerformance } from '@/lib/logger'

export interface UploadClientOptions {
  /** Base URL for API calls - defaults to current domain */
  baseUrl?: string
  /** Request timeout in milliseconds - defaults to 60 seconds */
  timeout?: number
  /** Additional headers to include with request */
  headers?: Record<string, string>
  /** Enable detailed logging */
  enableLogging?: boolean
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: UploadProgress) => void

/**
 * Upload API Client Class
 * Provides methods for uploading files with progress tracking and error handling
 */
export class UploadClient {
  private readonly options: Required<UploadClientOptions>
  private readonly headers: Record<string, string>

  constructor(options: UploadClientOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl || '',
      timeout: options.timeout || 60000, // 60 seconds
      headers: options.headers || {},
      enableLogging: options.enableLogging ?? true,
    }

    this.headers = {
      // Note: Don't set Content-Type header - browser will set it with boundary for multipart
      'Accept': 'application/json',
      ...this.options.headers,
    }
  }

  /**
   * Upload a file with progress tracking
   */
  async uploadFile(
    file: File,
    requestData: UploadRequestData,
    options: UploadOptions = {},
    onProgress?: ProgressCallback
  ): Promise<UploadResult> {
    const trackingId = startPerformance('file_upload')
    const uploadId = crypto.randomUUID()

    if (this.options.enableLogging) {
      logger.info('Starting file upload', {
        uploadId,
        filename: file.name,
        fileSize: file.size,
        fileType: this.getFileExtension(file.name),
        userId: requestData.user_id,
        generateInsights: requestData.generate_insights,
        generateEmbeddings: requestData.generate_embeddings,
      })
    }

    try {
      // Step 1: Validate file before upload
      this.validateFile(file, options)

      // Step 2: Create FormData with proper structure
      const formData = this.createFormData(file, requestData)

      // Step 3: Upload with progress tracking
      const response = await this.uploadWithProgress(
        formData,
        onProgress,
        options.timeout || this.options.timeout
      )

      // Step 4: Process response
      const result = await this.processResponse(response, file.name)

      endPerformance(trackingId, true, {
        uploadId,
        filename: file.name,
        documentId: result.documentId,
        chunksCreated: result.chunksCreated,
        insightsGenerated: result.insightsGenerated,
        processingTime: result.processingTime,
      })

      if (this.options.enableLogging) {
        logger.info('File upload completed successfully', {
          uploadId,
          filename: result.filename,
          documentId: result.documentId,
          chunksCreated: result.chunksCreated,
          insightsGenerated: result.insightsGenerated,
          processingTime: result.processingTime,
        })
      }

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        uploadId,
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
      })

      if (this.options.enableLogging) {
        logger.error('File upload failed', {
          uploadId,
          filename: file.name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      }

      // Convert error to UploadResult format
      const uploadError = this.convertToUploadError(error, file.name)
      
      return {
        success: false,
        filename: file.name,
        error: uploadError,
      }
    }
  }

  /**
   * Upload multiple files (for future use - currently not supported by backend)
   */
  async uploadFiles(
    files: File[],
    requestData: Omit<UploadRequestData, 'file'>,
    options: UploadOptions = {},
    onProgress?: ProgressCallback
  ): Promise<UploadResult[]> {
    // For now, upload files sequentially
    // In future, this could be enhanced to support concurrent uploads
    const results: UploadResult[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      // Calculate combined progress across all files
      const fileProgress: ProgressCallback | undefined = onProgress
        ? (progress) => {
            const overallProgress: UploadProgress = {
              percentage: ((i / files.length) * 100) + (progress.percentage / files.length),
              bytesUploaded: progress.bytesUploaded,
              totalBytes: progress.totalBytes,
              speed: progress.speed,
              remainingTime: progress.remainingTime,
            }
            onProgress(overallProgress)
          }
        : undefined

      const result = await this.uploadFile(file, requestData, options, fileProgress)
      results.push(result)

      // Stop on first error (could be made configurable)
      if (!result.success) {
        break
      }
    }

    return results
  }

  /**
   * Check if file meets upload requirements
   */
  validateFile(file: File, options: UploadOptions = {}): void {
    const maxSize = options.maxFileSize || DATABASE_LIMITS.MAX_FILE_SIZE_BYTES
    const allowedTypes = options.allowedTypes || FILE_PROCESSING.ALLOWED_EXTENSIONS

    // Check file size
    if (file.size > maxSize) {
      throw new FileTooLargeError(file.name, file.size, maxSize)
    }

    // Check file type
    const extension = this.getFileExtension(file.name)
    // Convert readonly array to mutable array for includes() method
    const allowedTypesArray = [...allowedTypes] as string[]
    if (!allowedTypesArray.includes(extension)) {
      throw new InvalidFileTypeError(file.name, extension, allowedTypesArray)
    }

    // Check filename length
    if (file.name.length > FILE_PROCESSING.MAX_FILENAME_LENGTH) {
      throw new ValidationError(
        `Filename exceeds maximum length of ${FILE_PROCESSING.MAX_FILENAME_LENGTH} characters`,
        ERROR_CODES.INVALID_INPUT,
        { 
          filename: file.name,
          filenameLength: file.name.length,
          maxLength: FILE_PROCESSING.MAX_FILENAME_LENGTH,
        }
      )
    }

    // Check for empty file
    if (file.size === 0) {
      throw new ValidationError(
        'File is empty',
        ERROR_CODES.INVALID_INPUT,
        { filename: file.name, fileSize: file.size }
      )
    }
  }

  /**
   * Create FormData with proper structure matching backend expectations
   */
  private createFormData(file: File, requestData: UploadRequestData): FormData {
    const formData = new FormData()

    // Add file - this must match backend expectation
    formData.append('file', file)

    // Add user_id
    formData.append('user_id', requestData.user_id)

    // Add optional boolean parameters
    if (requestData.generate_insights !== undefined) {
      formData.append('generate_insights', String(requestData.generate_insights))
    }

    if (requestData.generate_embeddings !== undefined) {
      formData.append('generate_embeddings', String(requestData.generate_embeddings))
    }

    return formData
  }

  /**
   * Upload with XMLHttpRequest to support progress tracking
   */
  private async uploadWithProgress(
    formData: FormData,
    onProgress?: ProgressCallback,
    timeout: number = this.options.timeout
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const url = `${this.options.baseUrl}/api/v1/upload`

      // Set timeout
      xhr.timeout = timeout

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress: UploadProgress = {
              percentage: Math.round((event.loaded / event.total) * 100),
              bytesUploaded: event.loaded,
              totalBytes: event.total,
            }

            // Calculate speed and remaining time if we have previous progress
            this.calculateProgressMetrics(progress, onProgress)
          }
        })
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Create Response object from XMLHttpRequest
          const response = new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: this.parseResponseHeaders(xhr.getAllResponseHeaders()),
          })
          resolve(response)
        } else {
          reject(new ServiceError(
            ERROR_CODES.FILE_UPLOAD_FAILED,
            'Upload',
            `HTTP ${xhr.status}: ${xhr.statusText}`,
            'RETRY',
            { 
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText,
            }
          ))
        }
      })

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new ServiceError(
          ERROR_CODES.FILE_UPLOAD_FAILED,
          'Upload',
          'Network error during file upload',
          'RETRY',
          { status: xhr.status, statusText: xhr.statusText }
        ))
      })

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        reject(new TimeoutError(
          'file_upload',
          timeout,
          { status: xhr.status }
        ))
      })

      // Handle abort
      xhr.addEventListener('abort', () => {
        reject(new ServiceError(
          ERROR_CODES.FILE_UPLOAD_FAILED,
          'Upload',
          'Upload cancelled',
          'NONE'
        ))
      })

      // Open connection and send
      xhr.open('POST', url, true)

      // Set headers (excluding Content-Type to let browser set it)
      Object.entries(this.headers).forEach(([key, value]) => {
        if (key.toLowerCase() !== 'content-type') {
          xhr.setRequestHeader(key, value)
        }
      })

      xhr.send(formData)
    })
  }

  /**
   * Process the upload response
   */
  private async processResponse(response: Response, filename: string): Promise<UploadResult> {
    const responseText = await response.text()
    
    try {
      const data = JSON.parse(responseText)
      
      if (isUploadResponse(data)) {
        return {
          success: true,
          filename,
          documentId: data.document_id,
          chunksCreated: data.chunks_created,
          insightsGenerated: data.insights_generated,
          processingTime: data.processing_time,
        }
      } else if (isUploadErrorResponse(data)) {
        return {
          success: false,
          filename,
          error: data,
        }
      } else {
        throw new ServiceError(
          ERROR_CODES.FILE_UPLOAD_FAILED,
          'Upload',
          'Invalid response format from server',
          'RETRY',
          { responseData: data }
        )
      }
    } catch (parseError) {
      throw new ServiceError(
        ERROR_CODES.FILE_UPLOAD_FAILED,
        'Upload',
        'Failed to parse server response',
        'RETRY',
        { 
          responseText: responseText.substring(0, 1000), // Truncate for logging
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        }
      )
    }
  }

  /**
   * Convert various error types to UploadErrorResponse
   */
  private convertToUploadError(error: unknown, filename: string): UploadErrorResponse {
    if (error instanceof FileTooLargeError || 
        error instanceof InvalidFileTypeError ||
        error instanceof ValidationError ||
        error instanceof TimeoutError ||
        error instanceof ServiceError) {
      // These error classes have toResponse() method
      const errorResponse = (error as any).toResponse()
      return {
        ...errorResponse,
        details: {
          ...errorResponse.details,
          filename,
        },
      } as UploadErrorResponse
    }

    // Generic error
    return {
      code: ERROR_CODES.FILE_UPLOAD_FAILED,
      message: error instanceof Error ? error.message : 'Unknown upload error',
      action: 'RETRY',
      details: {
        filename,
        timestamp: new Date().toISOString(),
        cause: error instanceof Error ? error.message : String(error),
      },
    } as UploadErrorResponse
  }

  /**
   * Calculate upload speed and remaining time
   */
  private lastProgressTime?: number
  private lastBytesUploaded?: number

  private calculateProgressMetrics(progress: UploadProgress, callback: ProgressCallback): void {
    const now = Date.now()

    if (this.lastProgressTime && this.lastBytesUploaded !== undefined) {
      const timeDiff = now - this.lastProgressTime
      const bytesDiff = progress.bytesUploaded - this.lastBytesUploaded

      if (timeDiff > 0) {
        // Calculate speed in bytes per second
        const speed = (bytesDiff / timeDiff) * 1000

        // Calculate remaining time
        const remainingBytes = progress.totalBytes - progress.bytesUploaded
        const remainingTime = speed > 0 ? (remainingBytes / speed) * 1000 : undefined

        progress.speed = Math.round(speed)
        progress.remainingTime = remainingTime ? Math.round(remainingTime) : undefined
      }
    }

    this.lastProgressTime = now
    this.lastBytesUploaded = progress.bytesUploaded

    callback(progress)
  }

  /**
   * Parse XMLHttpRequest headers to Headers-like object
   */
  private parseResponseHeaders(headerString: string): Record<string, string> {
    const headers: Record<string, string> = {}
    
    headerString.split('\r\n').forEach(line => {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase()
        const value = line.substring(colonIndex + 1).trim()
        headers[key] = value
      }
    })
    
    return headers
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop()
    return extension || ''
  }

  /**
   * Get client configuration (for debugging)
   */
  getConfig(): UploadClientOptions {
    return {
      baseUrl: this.options.baseUrl,
      timeout: this.options.timeout,
      headers: { ...this.options.headers },
      enableLogging: this.options.enableLogging,
    }
  }
}

/**
 * Convenience functions for common upload operations
 */

/**
 * Upload a single file with default options
 */
export async function uploadFile(
  file: File,
  userId: string,
  options: {
    generateInsights?: boolean
    generateEmbeddings?: boolean
    onProgress?: ProgressCallback
    timeout?: number
  } = {}
): Promise<UploadResult> {
  const client = new UploadClient({
    timeout: options.timeout,
  })

  const requestData: UploadRequestData = {
    user_id: userId,
    generate_insights: options.generateInsights,
    generate_embeddings: options.generateEmbeddings,
  }

  return client.uploadFile(file, requestData, {}, options.onProgress)
}

/**
 * Validate a file without uploading
 */
export function validateFileForUpload(
  file: File,
  options: UploadOptions = {}
): { isValid: boolean; errors: string[] } {
  const client = new UploadClient()
  const errors: string[] = []

  try {
    client.validateFile(file, options)
    return { isValid: true, errors: [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { isValid: false, errors: [errorMessage] }
  }
}

// Export singleton instance for common usage
export const uploadClient = new UploadClient()
export default uploadClient
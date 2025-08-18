/**
 * Upload Component Types
 * TypeScript interfaces for file upload functionality
 * Provides comprehensive typing for upload state management, progress tracking, and error handling
 */

import type { UUID, FileType, ErrorResponse } from '@/lib/database/types'

// File upload state management
export type UploadState = 
  | 'idle'           // No upload in progress
  | 'uploading'      // Upload in progress
  | 'processing'     // Server processing (chunking, insights)
  | 'success'        // Upload completed successfully
  | 'error'          // Upload failed

// Progress information during upload
export interface UploadProgress {
  /** Percentage completed (0-100) */
  percentage: number
  /** Bytes uploaded so far */
  bytesUploaded: number
  /** Total bytes to upload */
  totalBytes: number
  /** Current upload speed in bytes/second */
  speed?: number
  /** Estimated time remaining in milliseconds */
  remainingTime?: number
}

// API Request Types - matching backend exactly
export interface UploadRequestData {
  /** User ID (UUID format) - required */
  user_id: string
  /** Generate insights from document content - optional, defaults to true */
  generate_insights?: boolean
  /** Generate embeddings for vector search - optional, defaults to true */
  generate_embeddings?: boolean
}

// API Response Types - matching backend exactly
export interface UploadResponse {
  /** Generated document ID */
  document_id: UUID
  /** Original filename */
  filename: string
  /** Number of chunks created from document */
  chunks_created: number
  /** Number of insights generated */
  insights_generated: number
  /** Processing time in milliseconds */
  processing_time?: number
  /** Success indicator */
  success: true
}

// Upload error types extending base ErrorResponse
export interface UploadErrorResponse extends ErrorResponse {
  /** File-specific error details */
  details?: ErrorResponse['details'] & {
    filename?: string
    fileSize?: number
    maxSize?: number
    allowedTypes?: string[]
    actualType?: string
  }
}

// File validation result
export interface FileValidationResult {
  isValid: boolean
  errors: string[]
  warnings?: string[]
}

// Upload configuration options
export interface UploadOptions {
  /** Maximum file size in bytes - defaults to DATABASE_LIMITS.MAX_FILE_SIZE_BYTES */
  maxFileSize?: number
  /** Allowed file extensions - defaults to FILE_PROCESSING.ALLOWED_EXTENSIONS */
  allowedTypes?: FileType[]
  /** Whether to generate insights - defaults to true */
  generateInsights?: boolean
  /** Whether to generate embeddings - defaults to true */
  generateEmbeddings?: boolean
  /** Upload timeout in milliseconds - defaults to 60000 (60s) */
  timeout?: number
}

// File selection and preview
export interface SelectedFile {
  /** Browser File object */
  file: File
  /** Unique identifier for tracking */
  id: string
  /** File validation result */
  validation: FileValidationResult
  /** Preview content for text files */
  preview?: string
}

// Upload result after completion
export interface UploadResult {
  /** Success indicator */
  success: boolean
  /** Document ID if successful */
  documentId?: UUID
  /** Original filename */
  filename: string
  /** Number of chunks created */
  chunksCreated?: number
  /** Number of insights generated */
  insightsGenerated?: number
  /** Total processing time */
  processingTime?: number
  /** Error details if failed */
  error?: UploadErrorResponse
}

// Component Props Interfaces

// Main upload component props
export interface UploadComponentProps {
  /** User ID for upload */
  userId: string
  /** Upload configuration options */
  options?: UploadOptions
  /** Callback when upload starts */
  onUploadStart?: (file: SelectedFile) => void
  /** Progress callback during upload */
  onProgress?: (progress: UploadProgress) => void
  /** Callback when upload completes */
  onComplete?: (result: UploadResult) => void
  /** Callback when upload fails */
  onError?: (error: UploadErrorResponse) => void
  /** Callback when upload is cancelled */
  onCancel?: () => void
  /** Callback when file is selected */
  onFileSelect?: (file: SelectedFile) => void
  /** Custom CSS classes */
  className?: string
  /** Disable the upload component */
  disabled?: boolean
  /** Show detailed progress information */
  showDetailedProgress?: boolean
  /** Accept multiple files (not currently supported by backend) */
  multiple?: boolean
}

// File drop zone props
export interface DropZoneProps {
  /** Whether drop zone is active */
  isActive: boolean
  /** Whether files are being dragged over */
  isDragOver: boolean
  /** Callback when files are dropped */
  onDrop: (files: File[]) => void
  /** Callback when files are selected via input */
  onFileSelect: (files: File[]) => void
  /** Allowed file types */
  acceptedTypes: FileType[]
  /** Maximum file size in bytes */
  maxFileSize: number
  /** Whether component is disabled */
  disabled?: boolean
  /** Custom CSS classes */
  className?: string
  /** Custom content for drop zone */
  children?: React.ReactNode
}

// Progress bar props
export interface ProgressBarProps {
  /** Current upload progress */
  progress: UploadProgress
  /** Current upload state */
  state: UploadState
  /** Show percentage text */
  showPercentage?: boolean
  /** Show upload speed */
  showSpeed?: boolean
  /** Show remaining time */
  showRemainingTime?: boolean
  /** Custom CSS classes */
  className?: string
}

// File preview props
export interface FilePreviewProps {
  /** Selected file to preview */
  file: SelectedFile
  /** Whether to show full content or truncated */
  showFullContent?: boolean
  /** Maximum preview length in characters */
  maxPreviewLength?: number
  /** Callback to remove file */
  onRemove?: () => void
  /** Custom CSS classes */
  className?: string
}

// Upload status display props
export interface UploadStatusProps {
  /** Current upload state */
  state: UploadState
  /** Upload result if completed */
  result?: UploadResult
  /** Error information if failed */
  error?: UploadErrorResponse
  /** Callback to retry upload */
  onRetry?: () => void
  /** Callback to clear status */
  onClear?: () => void
  /** Custom CSS classes */
  className?: string
}

// Upload controls props (cancel, retry, etc.)
export interface UploadControlsProps {
  /** Current upload state */
  state: UploadState
  /** Whether upload can be cancelled */
  canCancel: boolean
  /** Whether upload can be retried */
  canRetry: boolean
  /** Callback to cancel upload */
  onCancel?: () => void
  /** Callback to retry upload */
  onRetry?: () => void
  /** Custom CSS classes */
  className?: string
}

// Upload history/queue props (for future multiple file support)
export interface UploadQueueProps {
  /** List of upload operations */
  uploads: Array<{
    id: string
    file: SelectedFile
    state: UploadState
    progress?: UploadProgress
    result?: UploadResult
    error?: UploadErrorResponse
  }>
  /** Callback to remove upload from queue */
  onRemove?: (id: string) => void
  /** Callback to retry upload */
  onRetry?: (id: string) => void
  /** Custom CSS classes */
  className?: string
}

// Utility Types

// Upload event types for tracking
export type UploadEventType = 
  | 'file_selected'
  | 'validation_failed'
  | 'upload_started'
  | 'upload_progress'
  | 'upload_completed'
  | 'upload_failed'
  | 'upload_cancelled'

export interface UploadEvent {
  type: UploadEventType
  timestamp: number
  fileId: string
  filename: string
  data?: any
}

// Type guards for runtime checking
export function isUploadResponse(obj: unknown): obj is UploadResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'document_id' in obj &&
    'filename' in obj &&
    'chunks_created' in obj &&
    'insights_generated' in obj &&
    'success' in obj &&
    (obj as any).success === true
  )
}

export function isUploadErrorResponse(obj: unknown): obj is UploadErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    'message' in obj &&
    'action' in obj
  )
}

export function isValidFileType(filename: string, allowedTypes: FileType[]): boolean {
  const extension = filename.toLowerCase().split('.').pop()
  return extension ? allowedTypes.includes(extension as FileType) : false
}

// Constants for upload component
export const UPLOAD_CONSTANTS = {
  /** Default maximum file size (1MB) */
  DEFAULT_MAX_FILE_SIZE: 1048576,
  /** Default allowed file types */
  DEFAULT_ALLOWED_TYPES: ['md', 'txt'] as FileType[],
  /** Default upload timeout (60 seconds) */
  DEFAULT_TIMEOUT: 60000,
  /** Default preview length (500 characters) */
  DEFAULT_PREVIEW_LENGTH: 500,
  /** Progress update interval (100ms) */
  PROGRESS_UPDATE_INTERVAL: 100,
} as const
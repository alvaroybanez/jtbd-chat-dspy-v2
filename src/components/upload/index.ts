/**
 * Upload Components Barrel Export
 * Centralizes all upload-related component exports
 */

export { default as FileUpload } from './FileUpload'
export type { FileUploadProps } from './FileUpload'

// Re-export types for convenience
export type {
  UploadState,
  UploadProgress,
  UploadResult,
  UploadErrorResponse,
  SelectedFile,
  FileValidationResult,
  UploadOptions,
  UploadComponentProps,
  DropZoneProps,
  ProgressBarProps,
  FilePreviewProps,
  UploadStatusProps,
  UploadControlsProps,
  UploadQueueProps,
} from './types'

export {
  isUploadResponse,
  isUploadErrorResponse,
  isValidFileType,
  UPLOAD_CONSTANTS,
} from './types'

// Re-export upload client utilities
export {
  uploadClient,
  uploadFile,
  validateFileForUpload,
  UploadClient,
} from '@/lib/services/upload-client'
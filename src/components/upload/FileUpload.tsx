/**
 * FileUpload Component
 * Comprehensive file upload component with drag-and-drop support
 * Provides visual feedback, progress tracking, and error handling
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Upload,
  File,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  FileText,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { uploadClient, validateFileForUpload, type ProgressCallback } from '@/lib/services/upload-client'
import type {
  UploadResult,
  UploadErrorResponse,
  UploadProgress,
  UploadState,
  SelectedFile,
  FileValidationResult,
  UploadOptions
} from './types'
import { UPLOAD_CONSTANTS } from './types'

// Main component props interface
export interface FileUploadProps {
  /** User ID for upload */
  userId: string
  /** Upload configuration options */
  options?: UploadOptions
  /** Maximum number of files (currently only 1 supported by backend) */
  maxFiles?: number
  /** Callback when upload completes successfully */
  onUploadComplete?: (results: UploadResult[]) => void
  /** Callback when upload fails */
  onUploadError?: (errors: UploadErrorResponse[]) => void
  /** Progress callback during upload */
  onUploadProgress?: (progress: UploadProgress[]) => void
  /** Callback when files are selected */
  onFileSelect?: (files: SelectedFile[]) => void
  /** Disable the upload component */
  disabled?: boolean
  /** Custom CSS classes */
  className?: string
}

// Individual file upload tracking
interface FileUploadState {
  id: string
  file: File
  validation: FileValidationResult
  state: UploadState
  progress?: UploadProgress
  result?: UploadResult
  error?: UploadErrorResponse
}

export default function FileUpload({
  userId,
  options = {},
  maxFiles = 1,
  onUploadComplete,
  onUploadError,
  onUploadProgress,
  onFileSelect,
  disabled = false,
  className,
}: FileUploadProps) {
  // State management
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [files, setFiles] = useState<FileUploadState[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Configuration
  const maxFileSize = options.maxFileSize || UPLOAD_CONSTANTS.DEFAULT_MAX_FILE_SIZE
  const allowedTypes = options.allowedTypes || UPLOAD_CONSTANTS.DEFAULT_ALLOWED_TYPES
  const canAddMoreFiles = files.length < maxFiles && !disabled

  // File selection handler
  const handleFileSelect = useCallback((selectedFiles: File[]) => {
    const newFiles: FileUploadState[] = []
    const currentFileCount = files.length

    // Process each selected file
    for (let i = 0; i < selectedFiles.length && (currentFileCount + newFiles.length) < maxFiles; i++) {
      const file = selectedFiles[i]
      const validation = validateFileForUpload(file, options)
      
      // Check for duplicates
      const isDuplicate = files.some(f => f.file.name === file.name && f.file.size === file.size)
      if (isDuplicate) {
        validation.errors.push('File already selected')
        validation.isValid = false
      }

      const fileState: FileUploadState = {
        id: crypto.randomUUID(),
        file,
        validation,
        state: validation.isValid ? 'idle' : 'error',
        error: validation.isValid ? undefined : {
          code: 'VALIDATION_FAILED',
          message: validation.errors.join(', '),
          action: 'NONE' as const,
          details: {
            filename: file.name,
            errors: validation.errors,
            timestamp: new Date().toISOString(),
          }
        }
      }

      newFiles.push(fileState)
    }

    if (newFiles.length > 0) {
      const updatedFiles = [...files, ...newFiles]
      setFiles(updatedFiles)

      // Convert to SelectedFile format for callback
      const selectedFileData: SelectedFile[] = newFiles.map(f => ({
        id: f.id,
        file: f.file,
        validation: f.validation,
        preview: f.file.type.startsWith('text/') ? undefined : undefined, // Could add preview logic
      }))

      onFileSelect?.(selectedFileData)
    }
  }, [files, maxFiles, options, onFileSelect])

  // File input change handler
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    if (selectedFiles.length > 0) {
      handleFileSelect(selectedFiles)
    }
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFileSelect])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled || !canAddMoreFiles) return
    
    setIsDragActive(true)
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true)
    }
  }, [disabled, canAddMoreFiles])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Only set drag states to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragActive(false)
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled || !canAddMoreFiles) return
    
    // Set drop effect
    e.dataTransfer.dropEffect = 'copy'
  }, [disabled, canAddMoreFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsDragActive(false)
    setIsDragOver(false)
    
    if (disabled || !canAddMoreFiles) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles)
    }
  }, [disabled, canAddMoreFiles, handleFileSelect])

  // Click handler for drop zone
  const handleDropZoneClick = useCallback(() => {
    if (disabled || !canAddMoreFiles) return
    fileInputRef.current?.click()
  }, [disabled, canAddMoreFiles])

  // Remove file handler
  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  // Upload handler
  const handleUpload = useCallback(async () => {
    const validFiles = files.filter(f => f.validation.isValid && f.state === 'idle')
    if (validFiles.length === 0) return

    setIsUploading(true)

    const results: UploadResult[] = []
    const errors: UploadErrorResponse[] = []

    for (const fileState of validFiles) {
      try {
        // Update file state to uploading
        setFiles(prev => prev.map(f => 
          f.id === fileState.id 
            ? { ...f, state: 'uploading' as UploadState }
            : f
        ))

        // Progress callback for this specific file
        const onProgress: ProgressCallback = (progress) => {
          setFiles(prev => prev.map(f => 
            f.id === fileState.id 
              ? { ...f, progress }
              : f
          ))
          
          // Call external progress callback
          onUploadProgress?.([progress])
        }

        // Upload the file
        const result = await uploadClient.uploadFile(
          fileState.file,
          {
            user_id: userId,
            generate_insights: options.generateInsights,
            generate_embeddings: options.generateEmbeddings,
          },
          options,
          onProgress
        )

        // Update file state with result
        setFiles(prev => prev.map(f => 
          f.id === fileState.id 
            ? { 
                ...f, 
                state: result.success ? 'success' : 'error',
                result,
                error: result.success ? undefined : result.error
              }
            : f
        ))

        results.push(result)

        if (!result.success && result.error) {
          errors.push(result.error)
        }

      } catch (error) {
        const uploadError: UploadErrorResponse = {
          code: 'FILE_UPLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Unknown upload error',
          action: 'RETRY',
          details: {
            filename: fileState.file.name,
            timestamp: new Date().toISOString(),
          }
        }

        setFiles(prev => prev.map(f => 
          f.id === fileState.id 
            ? { ...f, state: 'error', error: uploadError }
            : f
        ))

        errors.push(uploadError)
      }
    }

    setIsUploading(false)

    // Call completion callbacks
    if (results.some(r => r.success)) {
      onUploadComplete?.(results.filter(r => r.success))
    }
    
    if (errors.length > 0) {
      onUploadError?.(errors)
    }
  }, [files, userId, options, onUploadComplete, onUploadError, onUploadProgress])

  // Retry upload for a specific file
  const handleRetryFile = useCallback(async (fileId: string) => {
    const fileState = files.find(f => f.id === fileId)
    if (!fileState || fileState.state !== 'error') return

    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, state: 'idle', error: undefined, progress: undefined }
        : f
    ))

    // Trigger upload for just this file
    await handleUpload()
  }, [files, handleUpload])

  // Clear all files
  const handleClearAll = useCallback(() => {
    setFiles([])
    setIsUploading(false)
  }, [])

  // Prevent default drag behaviors on the window
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault()
    }

    window.addEventListener('dragenter', preventDefault)
    window.addEventListener('dragleave', preventDefault)
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)

    return () => {
      window.removeEventListener('dragenter', preventDefault)
      window.removeEventListener('dragleave', preventDefault)
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  const hasValidFiles = files.some(f => f.validation.isValid)
  const hasIdleFiles = files.some(f => f.state === 'idle')

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200',
          'hover:border-muted-foreground/40 hover:bg-muted/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isDragOver && !disabled && canAddMoreFiles 
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-muted bg-background',
          disabled || !canAddMoreFiles
            ? 'opacity-50 cursor-not-allowed'
            : '',
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleDropZoneClick}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label="Upload files"
        aria-disabled={disabled || !canAddMoreFiles}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple={maxFiles > 1}
          accept={allowedTypes.map(type => `.${type}`).join(',')}
          onChange={handleFileInputChange}
          disabled={disabled || !canAddMoreFiles}
          className="sr-only"
          aria-describedby="upload-description"
        />

        {/* Drop zone content */}
        <div className="space-y-4">
          <div className={cn(
            'mx-auto w-12 h-12 rounded-full flex items-center justify-center',
            isDragOver && !disabled && canAddMoreFiles
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}>
            <Upload className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <p className="text-lg font-medium">
              {isDragOver && !disabled && canAddMoreFiles
                ? 'Drop files here'
                : 'Upload your files'
              }
            </p>
            <p id="upload-description" className="text-sm text-muted-foreground">
              {disabled 
                ? 'Upload disabled'
                : !canAddMoreFiles
                ? `Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} selected`
                : `Drag and drop files here, or click to select files`
              }
            </p>
            <p className="text-xs text-muted-foreground">
              Supported formats: {allowedTypes.join(', ').toUpperCase()} • 
              Max size: {(maxFileSize / (1024 * 1024)).toFixed(1)}MB
            </p>
          </div>
        </div>

        {/* Drag overlay */}
        {isDragActive && !disabled && canAddMoreFiles && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-primary rounded-lg flex items-center justify-center">
            <div className="text-center">
              <Upload className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium text-primary">Drop files here</p>
            </div>
          </div>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Selected Files ({files.length})</h4>
            {files.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={isUploading}
                className={cn(
                  'text-sm text-muted-foreground hover:text-foreground transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-2">
            {files.map((fileState) => (
              <FileItem
                key={fileState.id}
                fileState={fileState}
                onRemove={() => handleRemoveFile(fileState.id)}
                onRetry={() => handleRetryFile(fileState.id)}
                disabled={isUploading}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload Controls */}
      {hasValidFiles && (
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            {files.filter(f => f.validation.isValid).length} file{files.filter(f => f.validation.isValid).length !== 1 ? 's' : ''} ready to upload
          </div>
          
          <div className="flex gap-2">
            {hasIdleFiles && (
              <button
                onClick={handleUpload}
                disabled={isUploading || !hasIdleFiles}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Files
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Individual file item component
interface FileItemProps {
  fileState: FileUploadState
  onRemove: () => void
  onRetry: () => void
  disabled?: boolean
}

function FileItem({ fileState, onRemove, onRetry, disabled = false }: FileItemProps) {
  const { file, validation, state, progress, result, error } = fileState

  const getStateIcon = () => {
    switch (state) {
      case 'idle':
        return validation.isValid 
          ? <File className="w-4 h-4 text-muted-foreground" />
          : <AlertTriangle className="w-4 h-4 text-destructive" />
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />
      default:
        return <File className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStateText = () => {
    switch (state) {
      case 'idle':
        return validation.isValid ? 'Ready to upload' : 'Validation failed'
      case 'uploading':
        return progress ? `Uploading... ${progress.percentage}%` : 'Uploading...'
      case 'processing':
        return 'Processing...'
      case 'success':
        return `Uploaded successfully${result?.chunksCreated ? ` • ${result.chunksCreated} chunks created` : ''}`
      case 'error':
        return error?.message || 'Upload failed'
      default:
        return 'Unknown state'
    }
  }

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 border rounded-lg',
      state === 'success' ? 'border-green-200 bg-green-50/50' : '',
      state === 'error' || !validation.isValid ? 'border-destructive/30 bg-destructive/5' : '',
      'transition-colors'
    )}>
      {/* File icon and info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" title={file.name}>
              {file.name}
            </p>
            {getStateIcon()}
          </div>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{formatFileSize(file.size)}</span>
            <span>{getStateText()}</span>
          </div>

          {/* Validation errors */}
          {!validation.isValid && validation.errors.length > 0 && (
            <div className="text-xs text-destructive">
              {validation.errors.join(', ')}
            </div>
          )}

          {/* Progress bar */}
          {state === 'uploading' && progress && (
            <div className="w-full bg-muted rounded-full h-1.5">
              <div 
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          )}

          {/* Upload details */}
          {progress && state === 'uploading' && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {progress.speed && (
                <span>{formatFileSize(progress.speed)}/s</span>
              )}
              {progress.remainingTime && (
                <span>{Math.round(progress.remainingTime / 1000)}s remaining</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {state === 'error' && (
          <button
            onClick={onRetry}
            disabled={disabled}
            className={cn(
              'p-1.5 rounded hover:bg-muted transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Retry upload"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
        
        {state !== 'uploading' && state !== 'processing' && (
          <button
            onClick={onRemove}
            disabled={disabled}
            className={cn(
              'p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
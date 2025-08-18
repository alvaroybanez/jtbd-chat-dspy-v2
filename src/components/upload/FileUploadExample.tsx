/**
 * FileUpload Usage Example
 * Demonstrates how to use the FileUpload component in a chat interface
 */

import { useState } from 'react'
import { FileUpload } from './index'
import type { UploadResult, UploadErrorResponse, UploadProgress, SelectedFile } from './types'

interface FileUploadExampleProps {
  userId: string
  onUploadSuccess?: (results: UploadResult[]) => void
}

export default function FileUploadExample({ userId, onUploadSuccess }: FileUploadExampleProps) {
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [uploadErrors, setUploadErrors] = useState<UploadErrorResponse[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])

  const handleUploadComplete = (results: UploadResult[]) => {
    console.log('Upload completed:', results)
    setUploadResults(prev => [...prev, ...results])
    onUploadSuccess?.(results)
    setIsUploading(false)
  }

  const handleUploadError = (errors: UploadErrorResponse[]) => {
    console.error('Upload failed:', errors)
    setUploadErrors(prev => [...prev, ...errors])
    setIsUploading(false)
  }

  const handleUploadProgress = (progress: UploadProgress[]) => {
    console.log('Upload progress:', progress)
    // You could update a global progress state here
  }

  const handleFileSelect = (files: SelectedFile[]) => {
    console.log('Files selected:', files)
    setSelectedFiles(files)
  }

  const clearResults = () => {
    setUploadResults([])
    setUploadErrors([])
    setSelectedFiles([])
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Document Upload</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your documents to extract insights and enable AI-powered analysis.
        </p>
      </div>

      {/* File Upload Component */}
      <FileUpload
        userId={userId}
        options={{
          maxFileSize: 1048576, // 1MB
          allowedTypes: ['md', 'txt'],
          generateInsights: true,
          generateEmbeddings: true,
          timeout: 60000,
        }}
        maxFiles={1}
        onUploadComplete={handleUploadComplete}
        onUploadError={handleUploadError}
        onUploadProgress={handleUploadProgress}
        onFileSelect={handleFileSelect}
        disabled={isUploading}
        className="border-2 border-dashed border-gray-300 rounded-lg"
      />

      {/* Results Section */}
      {(uploadResults.length > 0 || uploadErrors.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Upload Results</h3>
            <button
              onClick={clearResults}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Success Results */}
          {uploadResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-green-600">Successful Uploads</h4>
              {uploadResults.map((result, index) => (
                <div key={index} className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="font-medium">{result.filename}</div>
                  <div className="text-sm text-green-700 space-y-1">
                    {result.documentId && <div>Document ID: {result.documentId}</div>}
                    {result.chunksCreated && <div>Chunks created: {result.chunksCreated}</div>}
                    {result.insightsGenerated && <div>Insights generated: {result.insightsGenerated}</div>}
                    {result.processingTime && <div>Processing time: {result.processingTime}ms</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error Results */}
          {uploadErrors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-destructive">Upload Errors</h4>
              {uploadErrors.map((error, index) => (
                <div key={index} className="p-3 bg-destructive/5 border border-destructive/30 rounded-md">
                  <div className="font-medium text-destructive">{error.message}</div>
                  <div className="text-sm text-destructive/80">
                    Code: {error.code} • Action: {error.action}
                  </div>
                  {error.details?.filename && (
                    <div className="text-sm text-destructive/80">
                      File: {error.details.filename}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Files Info */}
      {selectedFiles.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {selectedFiles.length} file(s) selected • 
          {selectedFiles.filter(f => f.validation.isValid).length} valid • 
          {selectedFiles.filter(f => !f.validation.isValid).length} with errors
        </div>
      )}
    </div>
  )
}

/**
 * Integration with Chat Interface Example
 */
export function ChatFileUploadIntegration() {
  const [showUpload, setShowUpload] = useState(false)
  const userId = "example-user-id" // This would come from your auth context

  const handleUploadSuccess = (results: UploadResult[]) => {
    // Hide upload interface
    setShowUpload(false)
    
    // Could trigger a chat message or update context
    console.log('Files uploaded successfully:', results)
    
    // Example: Add a system message about successful upload
    // addSystemMessage(`Successfully uploaded ${results.length} document(s)`)
  }

  return (
    <div className="space-y-4">
      {/* Toggle Upload Button */}
      <button
        onClick={() => setShowUpload(!showUpload)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        {showUpload ? 'Hide Upload' : 'Upload Document'}
      </button>

      {/* Upload Interface */}
      {showUpload && (
        <div className="border rounded-lg p-4 bg-muted/20">
          <FileUpload
            userId={userId}
            onUploadComplete={handleUploadSuccess}
            onUploadError={(errors) => {
              console.error('Upload failed:', errors)
              // Could show toast notification or inline error
            }}
            maxFiles={1}
            className="mb-4"
          />
        </div>
      )}
    </div>
  )
}
/**
 * Document Upload Service
 * Orchestrates file upload, processing, and storage operations
 */

import crypto from 'crypto'
import { logger, startPerformance, endPerformance } from '../../logger'
import { executeQuery } from '../../database/client'
import documentProcessingService from '../document-processing'
import insightExtractionService from '../insights/extractor'
import type { 
  DocumentInsert, 
  DocumentChunkInsert, 
  FileType,
  UUID
} from '../../database/types'
import type { ParsedFile } from './file-parser'
import type { ProcessedDocument, DocumentInput } from '../types'
import { DatabaseError } from '../../errors/database'
import { ValidationError } from '../../errors/base'
import { ERROR_CODES } from '../../config/constants'

export interface UploadResult {
  documentId: UUID
  filename: string
  chunksCreated: number
  insightsGenerated: number
  processingTime: number
}

export interface UploadOptions {
  userId: UUID
  generateInsights?: boolean
  generateEmbeddings?: boolean
}

/**
 * Document upload service implementation
 */
class DocumentUploadService {
  /**
   * Upload and process a document
   */
  async uploadDocument(
    parsedFile: ParsedFile,
    options: UploadOptions
  ): Promise<UploadResult> {
    const trackingId = startPerformance('document_upload')
    const startTime = Date.now()

    try {
      logger.info('Starting document upload', {
        filename: parsedFile.filename,
        fileSize: parsedFile.fileSize,
        fileType: parsedFile.fileType,
        userId: options.userId
      })

      // Step 1: Generate content hash for duplicate detection
      const contentHash = this.generateContentHash(parsedFile.content)

      // Step 2: Check for duplicate document
      await this.checkForDuplicate(contentHash, options.userId)

      // Step 3: Store document in database
      const documentId = await this.storeDocument(parsedFile, contentHash, options.userId)

      // Step 4: Process document through chunking and embedding pipeline
      const processedDocument = await this.processDocument(parsedFile, documentId)

      // Step 5: Store chunks in database
      await this.storeDocumentChunks(processedDocument, documentId)

      // Step 6: Generate insights (if requested)
      let insightsGenerated = 0
      if (options.generateInsights !== false) {
        try {
          const insightResult = await insightExtractionService.extractInsights(
            documentId,
            options.userId,
            processedDocument.chunks,
            {
              maxInsights: 10,
              minConfidenceScore: 0.6
            }
          )
          insightsGenerated = insightResult.totalInsights
          
          logger.debug('Insights generated for document', {
            documentId,
            insightsGenerated,
            processingTime: insightResult.processingTime
          })
        } catch (error) {
          logger.warn('Failed to generate insights, continuing without them', {
            documentId,
            error: error instanceof Error ? error.message : String(error)
          })
          // Don't fail the entire upload if insight generation fails
          insightsGenerated = 0
        }
      }

      const processingTime = Date.now() - startTime

      const result: UploadResult = {
        documentId,
        filename: parsedFile.filename,
        chunksCreated: processedDocument.processing.chunkCount,
        insightsGenerated,
        processingTime
      }

      endPerformance(trackingId, true, {
        documentId: result.documentId,
        filename: result.filename,
        chunksCreated: result.chunksCreated,
        insightsGenerated: result.insightsGenerated,
        processingTime: result.processingTime
      })

      logger.info('Document upload completed successfully', result)

      return result

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error),
        filename: parsedFile.filename,
        processingTime: Date.now() - startTime
      })

      logger.error('Document upload failed', {
        filename: parsedFile.filename,
        fileSize: parsedFile.fileSize,
        userId: options.userId,
        error: error instanceof Error ? error.message : String(error)
      })

      throw error
    }
  }

  /**
   * Generate SHA-256 hash of file content
   */
  private generateContentHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content, 'utf8')
      .digest('hex')
  }

  /**
   * Check if document with same content hash already exists for user
   */
  private async checkForDuplicate(contentHash: string, userId: UUID): Promise<void> {
    try {
      const existingDocument = await executeQuery<{id: UUID, filename: string}>(
        async (client) => {
          return await client
            .from('documents')
            .select('id, filename')
            .eq('content_hash', contentHash)
            .eq('user_id', userId)
            .single()
        }
      )

      if (existingDocument) {
        throw new ValidationError(
          `Document with identical content already exists: ${existingDocument.filename}`,
          ERROR_CODES.CONSTRAINT_VIOLATION,
          {
            existingDocumentId: existingDocument.id,
            existingFilename: existingDocument.filename,
            contentHash
          }
        )
      }
    } catch (error) {
      // If no document found, that's what we want
      if (error instanceof ValidationError) {
        throw error
      }
      
      // Log other errors but don't throw (could be network issues)
      logger.warn('Failed to check for duplicate document', {
        contentHash,
        userId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Store document metadata in database
   */
  private async storeDocument(
    parsedFile: ParsedFile,
    contentHash: string,
    userId: UUID
  ): Promise<UUID> {
    try {
      const documentData: DocumentInsert = {
        user_id: userId,
        filename: parsedFile.filename,
        content: parsedFile.content,
        content_hash: contentHash,
        file_size: parsedFile.fileSize,
        file_type: parsedFile.fileType
      }

      const document = await executeQuery<{id: UUID}>(
        async (client) => {
          return await client
            .from('documents')
            .insert(documentData)
            .select('id')
            .single()
        }
      )

      return document.id

    } catch (error) {
      throw new DatabaseError(
        'Failed to store document in database',
        'RETRY',
        { 
          operation: 'INSERT',
          table: 'documents',
          filename: parsedFile.filename,
          userId,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Process document through chunking and embedding pipeline
   */
  private async processDocument(
    parsedFile: ParsedFile,
    documentId: UUID
  ): Promise<ProcessedDocument> {
    try {
      const documentInput: DocumentInput = {
        content: parsedFile.content,
        filename: parsedFile.filename,
        metadata: {
          documentId,
          fileType: parsedFile.fileType,
          fileSize: parsedFile.fileSize
        }
      }

      return await documentProcessingService.processDocument(documentInput, {
        generateEmbeddings: true,
        strategy: 'sentence-based',
        maxTokens: 800,
        overlapPercentage: 0.1
      })

    } catch (error) {
      throw new DatabaseError(
        'Failed to process document content',
        'RETRY',
        {
          operation: 'PROCESSING',
          service: 'document_processing',
          documentId,
          filename: parsedFile.filename,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Store document chunks with embeddings in database
   */
  private async storeDocumentChunks(
    processedDocument: ProcessedDocument,
    documentId: UUID
  ): Promise<void> {
    try {
      const chunks = processedDocument.chunks
      const embeddings = processedDocument.embeddings

      if (chunks.length !== embeddings.length) {
        throw new Error('Mismatch between chunks and embeddings count')
      }

      // Prepare chunk data for batch insert
      const chunkInserts: DocumentChunkInsert[] = chunks.map((chunk, index) => ({
        document_id: documentId,
        content: chunk.content,
        chunk_index: chunk.index,
        token_count: chunk.tokenCount,
        embedding: embeddings[index].embedding
      }))

      // Insert chunks in batches to avoid overwhelming the database
      const batchSize = 50
      for (let i = 0; i < chunkInserts.length; i += batchSize) {
        const batch = chunkInserts.slice(i, i + batchSize)
        
        await executeQuery<null>(
          async (client) => {
            return await client
              .from('document_chunks')
              .insert(batch)
          }
        )
      }

      logger.debug('Document chunks stored successfully', {
        documentId,
        chunksStored: chunks.length,
        embeddingsStored: embeddings.length
      })

    } catch (error) {
      throw new DatabaseError(
        'Failed to store document chunks',
        'RETRY',
        {
          operation: 'INSERT',
          table: 'document_chunks',
          documentId,
          chunkCount: processedDocument.chunks.length,
          originalError: error instanceof Error ? error.message : String(error)
        }
      )
    }
  }

  /**
   * Get upload statistics for monitoring
   */
  async getUploadStats(): Promise<{
    totalDocuments: number
    totalChunks: number
    averageChunksPerDocument: number
    totalStorageBytes: number
  }> {
    try {
      const stats = await executeQuery<Array<{
        id: UUID;
        file_size: number;
        document_chunks: Array<{id: UUID}>;
      }>>(
        async (client) => {
          return await client
            .from('documents')
            .select(`
              id,
              file_size,
              document_chunks!inner(id)
            `)
        }
      )

      const totalDocuments = stats.length
      const totalChunks = stats.reduce((sum, doc) => sum + doc.document_chunks.length, 0)
      const averageChunksPerDocument = totalDocuments > 0 ? totalChunks / totalDocuments : 0
      const totalStorageBytes = stats.reduce((sum, doc) => sum + doc.file_size, 0)

      return {
        totalDocuments,
        totalChunks,
        averageChunksPerDocument,
        totalStorageBytes
      }

    } catch (error) {
      logger.warn('Failed to get upload statistics', {
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        totalDocuments: 0,
        totalChunks: 0,
        averageChunksPerDocument: 0,
        totalStorageBytes: 0
      }
    }
  }
}

// Export singleton instance
const documentUploadService = new DocumentUploadService()
export default documentUploadService
export { DocumentUploadService }
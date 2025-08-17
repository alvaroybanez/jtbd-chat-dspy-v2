/**
 * Progress Tracker for Document Processing
 * Tracks and reports progress through the document processing pipeline
 */

import { logger } from '../../logger'
import type { ProcessingProgress, TextChunk } from '../types'

/**
 * Progress tracking and reporting for document processing
 */
export class ProgressTracker {
  private sessions = new Map<string, ProgressSession>()

  /**
   * Start tracking progress for a new session
   */
  startSession(sessionId: string, totalChunks: number): void {
    const session: ProgressSession = {
      sessionId,
      totalChunks,
      chunksProcessed: 0,
      embeddingsGenerated: 0,
      stage: 'chunking',
      startTime: Date.now(),
      lastUpdate: Date.now(),
      errors: []
    }

    this.sessions.set(sessionId, session)

    logger.debug('Progress tracking started', {
      sessionId,
      totalChunks,
      stage: session.stage
    })
  }

  /**
   * Update progress for a session
   */
  updateProgress(
    sessionId: string,
    update: Partial<ProcessingProgress>
  ): ProcessingProgress | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      logger.warn('Progress update for unknown session', { sessionId })
      return null
    }

    // Update session data
    if (update.stage) session.stage = update.stage
    if (update.chunksProcessed !== undefined) session.chunksProcessed = update.chunksProcessed
    if (update.embeddingsGenerated !== undefined) session.embeddingsGenerated = update.embeddingsGenerated
    if (update.currentChunk) session.currentChunk = update.currentChunk
    if (update.error) session.errors.push(update.error)

    session.lastUpdate = Date.now()

    // Calculate derived values
    const progress: ProcessingProgress = {
      stage: session.stage,
      chunksProcessed: session.chunksProcessed,
      totalChunks: session.totalChunks,
      embeddingsGenerated: session.embeddingsGenerated,
      percentage: Math.min(100, Math.round((session.chunksProcessed / session.totalChunks) * 100)),
      currentChunk: session.currentChunk,
      error: update.error
    }

    // Log significant progress milestones
    this.logProgressMilestones(sessionId, progress)

    return progress
  }

  /**
   * Mark session as completed
   */
  completeSession(sessionId: string): ProgressSummary | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const endTime = Date.now()
    const totalTime = endTime - session.startTime

    const summary: ProgressSummary = {
      sessionId,
      totalChunks: session.totalChunks,
      chunksProcessed: session.chunksProcessed,
      embeddingsGenerated: session.embeddingsGenerated,
      totalTime,
      averageTimePerChunk: session.chunksProcessed > 0 ? totalTime / session.chunksProcessed : 0,
      errorCount: session.errors.length,
      success: session.errors.length === 0 && session.chunksProcessed === session.totalChunks
    }

    logger.info('Document processing session completed', summary)

    // Clean up session data
    this.sessions.delete(sessionId)

    return summary
  }

  /**
   * Get current progress for a session
   */
  getProgress(sessionId: string): ProcessingProgress | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    return {
      stage: session.stage,
      chunksProcessed: session.chunksProcessed,
      totalChunks: session.totalChunks,
      embeddingsGenerated: session.embeddingsGenerated,
      percentage: Math.min(100, Math.round((session.chunksProcessed / session.totalChunks) * 100)),
      currentChunk: session.currentChunk
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * Cancel a session
   */
  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      logger.info('Progress tracking session cancelled', {
        sessionId,
        chunksProcessed: session.chunksProcessed,
        totalChunks: session.totalChunks,
        stage: session.stage
      })

      this.sessions.delete(sessionId)
    }
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs
    let cleanedCount = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastUpdate < cutoff) {
        this.sessions.delete(sessionId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up old progress tracking sessions', {
        cleanedCount,
        remainingCount: this.sessions.size
      })
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    activeSessions: number
    totalSessionsTracked: number
    averageProcessingTime: number
    successRate: number
  } {
    // This would be implemented with actual statistics tracking
    // For now, return current active sessions
    return {
      activeSessions: this.sessions.size,
      totalSessionsTracked: 0, // Would track historical data
      averageProcessingTime: 0, // Would calculate from historical data
      successRate: 1.0 // Would calculate from historical data
    }
  }

  /**
   * Log progress milestones
   */
  private logProgressMilestones(sessionId: string, progress: ProcessingProgress): void {
    const milestones = [10, 25, 50, 75, 90, 100]
    
    for (const milestone of milestones) {
      if (progress.percentage >= milestone) {
        const session = this.sessions.get(sessionId)
        if (session && !session.loggedMilestones?.includes(milestone)) {
          if (!session.loggedMilestones) {
            session.loggedMilestones = []
          }
          session.loggedMilestones.push(milestone)

          logger.info('Processing milestone reached', {
            sessionId,
            milestone: `${milestone}%`,
            stage: progress.stage,
            chunksProcessed: progress.chunksProcessed,
            totalChunks: progress.totalChunks,
            embeddingsGenerated: progress.embeddingsGenerated
          })
        }
        break // Only log the highest milestone reached
      }
    }
  }

  /**
   * Estimate remaining time
   */
  estimateTimeRemaining(sessionId: string): number | null {
    const session = this.sessions.get(sessionId)
    if (!session || session.chunksProcessed === 0) {
      return null
    }

    const elapsed = Date.now() - session.startTime
    const averageTimePerChunk = elapsed / session.chunksProcessed
    const remainingChunks = session.totalChunks - session.chunksProcessed

    return Math.round(averageTimePerChunk * remainingChunks)
  }

  /**
   * Create progress callback for streaming updates
   */
  createProgressCallback(sessionId: string): (update: Partial<ProcessingProgress>) => void {
    return (update: Partial<ProcessingProgress>) => {
      this.updateProgress(sessionId, update)
    }
  }

  /**
   * Get session performance metrics
   */
  getSessionMetrics(sessionId: string): SessionMetrics | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const elapsed = Date.now() - session.startTime
    const chunksPerSecond = session.chunksProcessed > 0 ? (session.chunksProcessed / elapsed) * 1000 : 0
    const embeddingsPerSecond = session.embeddingsGenerated > 0 ? (session.embeddingsGenerated / elapsed) * 1000 : 0

    return {
      sessionId,
      elapsedTime: elapsed,
      chunksPerSecond,
      embeddingsPerSecond,
      errorRate: session.errors.length / Math.max(session.chunksProcessed, 1),
      estimatedTimeRemaining: this.estimateTimeRemaining(sessionId)
    }
  }
}

/**
 * Internal session tracking data
 */
interface ProgressSession {
  sessionId: string
  totalChunks: number
  chunksProcessed: number
  embeddingsGenerated: number
  stage: ProcessingProgress['stage']
  startTime: number
  lastUpdate: number
  currentChunk?: TextChunk
  errors: Error[]
  loggedMilestones?: number[]
}

/**
 * Session completion summary
 */
interface ProgressSummary {
  sessionId: string
  totalChunks: number
  chunksProcessed: number
  embeddingsGenerated: number
  totalTime: number
  averageTimePerChunk: number
  errorCount: number
  success: boolean
}

/**
 * Session performance metrics
 */
interface SessionMetrics {
  sessionId: string
  elapsedTime: number
  chunksPerSecond: number
  embeddingsPerSecond: number
  errorRate: number
  estimatedTimeRemaining: number | null
}
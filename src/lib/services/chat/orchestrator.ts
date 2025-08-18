/**
 * Chat Orchestrator Service for JTBD Assistant Platform
 * Coordinates intent routing, context loading, and response generation
 */

import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { config } from '../../config'
import { logger, startPerformance, endPerformance } from '../../logger'
import { intentDetector, ChatIntent } from './intent-detector'
import contextRetrievalService from './context-retrieval'
import { MessagePersistencePipeline } from './message-persistence-pipeline'
import { ChatSessionManagerImpl } from './session-manager'
import { tokenBudgetManager } from './token-budget'
import { contextManager } from './context-manager'
import { hmwService } from '../intelligence/hmw-service'
import { solutionService } from '../intelligence/solution-service'
import { executeQuery } from '../../database/client'
import { 
  ChatSessionError,
  ValidationError,
  ChatNotFoundError
} from '../../errors'
import type { UUID, HMWInsert } from '../../database/types'
import type { HMWContext, HMWResult, SourceReferences, SolutionContext, SolutionResult, HMWItem } from '../intelligence/types'

// ===== ORCHESTRATOR TYPES =====

export interface ChatRequest {
  message: string
  chatId?: UUID
  userId: UUID
  contextItems?: {
    documentChunks?: UUID[]
    insights?: UUID[]
    jtbds?: UUID[]
    metrics?: UUID[]
  }
}

export interface ChatStreamChunk {
  type: 'message' | 'context' | 'picker' | 'metadata' | 'error' | 'done'
  content?: string
  data?: {
    id?: string
    type?: string
    status?: 'loading' | 'loaded' | 'error'
    message?: string
    results?: unknown[]
    generation_method?: string
    context_summary?: Record<string, number>
    items?: Array<{
      id: string
      type: string
      title: string
      content: string
      score?: number
      metadata?: Record<string, unknown>
      selected: boolean
    }>
    actions?: string[]
    selectedCount?: number
    maxSelections?: number
    title?: string
    description?: string
    error?: string
  }
  metadata?: {
    intent?: string
    processingTime?: number
    tokensUsed?: number
    contextLoaded?: boolean
  }
  error?: {
    code: string
    message: string
    action: 'RETRY' | 'NONE'
    details?: Record<string, unknown>
  }
}

// Enhanced types for AI SDK v5 patterns with reconciliation support
export interface ContextData {
  id: string
  type: 'insights_loading' | 'insights_loaded' | 'metrics_loading' | 'metrics_loaded' | 'jtbds_loading' | 'jtbds_loaded'
  status: 'loading' | 'loaded' | 'error'
  message?: string
  results?: Array<{
    id: string
    title?: string
    description?: string
    score?: number
    metadata?: Record<string, unknown>
  }>
  summary?: Record<string, string | number | boolean>
  error?: string
}

export interface PickerItem {
  id: string
  content: string
  type: 'insight' | 'metric' | 'jtbd'
  similarity?: number
  metadata: Record<string, unknown>
  displayText: string
  snippet: string
  selected: boolean
}

export interface PickerData {
  id: string
  type: 'insight_picker' | 'metric_picker' | 'jtbd_picker'
  items: PickerItem[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrevious: boolean
  }
  actions: string[]
  selectedCount: number
  maxSelections?: number
}

export interface ChatOrchestrationResult {
  stream: ReadableStream<Uint8Array>
  chatId: UUID
  messageId?: UUID
}

// AI SDK compatibility adapter
function createCompatibleLanguageModel(model: unknown): LanguageModel {
  return model as LanguageModel
}

/**
 * Chat Orchestrator Service Implementation
 */
export class ChatOrchestrator {
  private static instance: ChatOrchestrator | null = null
  private messagePipeline: MessagePersistencePipeline
  private sessionManager: ChatSessionManagerImpl

  // Singleton pattern
  public static getInstance(): ChatOrchestrator {
    if (!ChatOrchestrator.instance) {
      ChatOrchestrator.instance = new ChatOrchestrator()
    }
    return ChatOrchestrator.instance
  }

  private constructor() {
    this.messagePipeline = MessagePersistencePipeline.getInstance()
    this.sessionManager = ChatSessionManagerImpl.getInstance()
  }

  /**
   * Process chat request and return streaming response
   */
  async processChatRequest(request: ChatRequest): Promise<ChatOrchestrationResult> {
    const trackingId = startPerformance('chat_orchestration')
    const startTime = Date.now()

    try {
      // Validate request
      this.validateChatRequest(request)

      // Detect intent
      const intentResult = intentDetector.detectIntent(request.message)
      
      logger.info('Chat intent detected', {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        chatId: request.chatId
      })

      // Load or create chat session
      const { chatId, chat } = await this.loadOrCreateChat(request)

      // Persist user message
      const userMessageResult = await this.messagePipeline.persistUserMessage({
        chatId,
        userId: request.userId,
        content: request.message,
        contextItems: request.contextItems
      })

      logger.debug('User message persisted', {
        messageId: userMessageResult.messageId,
        chatId
      })

      // Create streaming response based on intent
      const stream = await this.createStreamingResponse(
        intentResult,
        request,
        chatId,
        startTime
      )

      endPerformance(trackingId, true, {
        intent: intentResult.intent,
        chatId,
        processingTime: Date.now() - startTime
      })

      return {
        stream,
        chatId,
        messageId: userMessageResult.messageId
      }

    } catch (error) {
      endPerformance(trackingId, false, {
        error: error instanceof Error ? error.message : String(error)
      })

      // Create error stream
      const errorStream = this.createErrorStream(error)
      
      return {
        stream: errorStream,
        chatId: request.chatId || '',
        messageId: undefined
      }
    }
  }

  /**
   * Create streaming response based on detected intent
   */
  private async createStreamingResponse(
    intentResult: { type: string; confidence?: number },
    request: ChatRequest,
    chatId: UUID,
    startTime: number
  ): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder()
    const self = this // Capture 'this' context

    return new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          const metadataChunk: ChatStreamChunk = {
            type: 'metadata',
            metadata: {
              intent: intentResult.intent,
              processingTime: Date.now() - startTime,
              contextLoaded: false
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadataChunk)}\n\n`))

          // Route based on intent
          switch (intentResult.intent) {
            case ChatIntent.RETRIEVE_INSIGHTS:
              await self.handleInsightRetrieval(request, controller, encoder, chatId, startTime)
              break
              
            case ChatIntent.RETRIEVE_METRICS:
              await self.handleMetricRetrieval(request, controller, encoder, chatId, startTime)
              break
              
            case ChatIntent.RETRIEVE_JTBDS:
              await self.handleJTBDRetrieval(request, controller, encoder, chatId, startTime)
              break
              
            case ChatIntent.GENERATE_HMW:
              await self.handleHMWGeneration(request, controller, encoder, chatId, startTime)
              break
              
            case ChatIntent.CREATE_SOLUTIONS:
              await self.handleSolutionCreation(request, controller, encoder, chatId, startTime)
              break
              
            case ChatIntent.GENERAL_EXPLORATION:
            default:
              await self.handleGeneralExploration(request, controller, encoder, chatId, startTime)
              break
          }

          // Send completion
          const doneChunk: ChatStreamChunk = {
            type: 'done',
            metadata: {
              processingTime: Date.now() - startTime
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`))
          controller.close()

        } catch (error) {
          const errorChunk: ChatStreamChunk = {
            type: 'error',
            error: {
              code: 'STREAM_PROCESSING_ERROR',
              message: error instanceof Error ? error.message : 'Unknown streaming error',
              action: 'RETRY'
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
          controller.close()
        }
      }
    })
  }

  /**
   * Handle insight retrieval intent with progressive loading and reconciliation
   */
  private async handleInsightRetrieval(
    request: ChatRequest,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    chatId: UUID,
    startTime: number
  ): Promise<void> {
    const contextId = `insights-context-${Date.now()}`
    const pickerId = `insights-picker-${Date.now()}`

    try {
      // 1. Send loading state
      const loadingChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Searching for relevant insights...',
        data: {
          id: contextId,
          type: 'insights_loading',
          status: 'loading',
          message: 'Analyzing your query and searching through insights...'
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadingChunk)}\n\n`))

      // 2. Retrieve data
      const contextResult = await contextRetrievalService.retrieveInsights(request.message, {
        limit: 20,
        userId: request.userId
      })

      // 3. Send loaded state with reconciliation (same ID for update)
      const loadedChunk: ChatStreamChunk = {
        type: 'context',
        content: `Found ${contextResult.items.length} relevant insights`,
        data: {
          id: contextId, // Same ID for reconciliation
          type: 'insights_loaded',
          status: 'loaded',
          results: contextResult.items,
          summary: contextResult.summary
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadedChunk)}\n\n`))

      // 4. Send enhanced picker interface with selection tracking
      const pickerItems: PickerItem[] = contextResult.items.map(item => ({
        ...item,
        selected: false // Initialize selection state
      }))

      const pickerChunk: ChatStreamChunk = {
        type: 'picker',
        data: {
          id: pickerId,
          type: 'insight_picker',
          items: pickerItems,
          pagination: contextResult.pagination,
          actions: ['select', 'confirm', 'cancel'],
          selectedCount: 0,
          maxSelections: 10 // Allow up to 10 insights to be selected
        } as PickerData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(pickerChunk)}\n\n`))

      // 5. Persist assistant message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Found ${contextResult.items.length} relevant insights`,
        'retrieve_insights',
        Date.now() - startTime,
        100
      )

    } catch (error) {
      // Send error state with reconciliation
      const errorChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Failed to retrieve insights',
        data: {
          id: contextId,
          type: 'insights_loaded',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
      
      logger.error('Insight retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        userId: request.userId
      })
      
      throw error
    }
  }

  /**
   * Handle metric retrieval intent with progressive loading and reconciliation
   */
  private async handleMetricRetrieval(
    request: ChatRequest,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    chatId: UUID,
    startTime: number
  ): Promise<void> {
    const contextId = `metrics-context-${Date.now()}`
    const pickerId = `metrics-picker-${Date.now()}`

    try {
      // 1. Send loading state
      const loadingChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Searching for relevant metrics...',
        data: {
          id: contextId,
          type: 'metrics_loading',
          status: 'loading',
          message: 'Finding metrics that match your query...'
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadingChunk)}\n\n`))

      // 2. Retrieve data
      const contextResult = await contextRetrievalService.retrieveMetrics(request.message, {
        limit: 20,
        userId: request.userId
      })

      // 3. Send loaded state with reconciliation
      const loadedChunk: ChatStreamChunk = {
        type: 'context',
        content: `Found ${contextResult.items.length} relevant metrics`,
        data: {
          id: contextId, // Same ID for reconciliation
          type: 'metrics_loaded',
          status: 'loaded',
          results: contextResult.items,
          summary: contextResult.summary
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadedChunk)}\n\n`))

      // 4. Send enhanced picker interface
      const pickerItems: PickerItem[] = contextResult.items.map(item => ({
        ...item,
        selected: false
      }))

      const pickerChunk: ChatStreamChunk = {
        type: 'picker',
        data: {
          id: pickerId,
          type: 'metric_picker',
          items: pickerItems,
          pagination: contextResult.pagination,
          actions: ['select', 'confirm', 'cancel'],
          selectedCount: 0,
          maxSelections: 5 // Allow up to 5 metrics to be selected
        } as PickerData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(pickerChunk)}\n\n`))

      // 5. Persist assistant message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Found ${contextResult.items.length} relevant metrics`,
        'retrieve_metrics',
        Date.now() - startTime,
        100
      )

    } catch (error) {
      // Send error state with reconciliation
      const errorChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Failed to retrieve metrics',
        data: {
          id: contextId,
          type: 'metrics_loaded',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
      
      logger.error('Metric retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        userId: request.userId
      })
      
      throw error
    }
  }

  /**
   * Handle JTBD retrieval intent with progressive loading and reconciliation
   */
  private async handleJTBDRetrieval(
    request: ChatRequest,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    chatId: UUID,
    startTime: number
  ): Promise<void> {
    const contextId = `jtbds-context-${Date.now()}`
    const pickerId = `jtbds-picker-${Date.now()}`

    try {
      // 1. Send loading state
      const loadingChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Searching for relevant Jobs to be Done...',
        data: {
          id: contextId,
          type: 'jtbds_loading',
          status: 'loading',
          message: 'Looking through your Jobs to be Done...'
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadingChunk)}\n\n`))

      // 2. Retrieve data
      const contextResult = await contextRetrievalService.retrieveJTBDs(request.message, {
        limit: 20,
        userId: request.userId
      })

      // 3. Send loaded state with reconciliation
      const loadedChunk: ChatStreamChunk = {
        type: 'context',
        content: `Found ${contextResult.items.length} relevant Jobs to be Done`,
        data: {
          id: contextId, // Same ID for reconciliation
          type: 'jtbds_loaded',
          status: 'loaded',
          results: contextResult.items,
          summary: contextResult.summary
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadedChunk)}\n\n`))

      // 4. Send enhanced picker interface
      const pickerItems: PickerItem[] = contextResult.items.map(item => ({
        ...item,
        selected: false
      }))

      const pickerChunk: ChatStreamChunk = {
        type: 'picker',
        data: {
          id: pickerId,
          type: 'jtbd_picker',
          items: pickerItems,
          pagination: contextResult.pagination,
          actions: ['select', 'confirm', 'cancel'],
          selectedCount: 0,
          maxSelections: 8 // Allow up to 8 JTBDs to be selected
        } as PickerData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(pickerChunk)}\n\n`))

      // 5. Persist assistant message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Found ${contextResult.items.length} relevant Jobs to be Done`,
        'retrieve_jtbds',
        Date.now() - startTime,
        100
      )

    } catch (error) {
      // Send error state with reconciliation
      const errorChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Failed to retrieve Jobs to be Done',
        data: {
          id: contextId,
          type: 'jtbds_loaded',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        } as ContextData
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
      
      logger.error('JTBD retrieval failed', {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        userId: request.userId
      })
      
      throw error
    }
  }

  /**
   * Handle HMW generation intent
   */
  private async handleHMWGeneration(
    request: ChatRequest,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    chatId: UUID,
    startTime: number
  ): Promise<void> {
    const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const pickerId = `picker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      // 1. Send loading state
      const loadingChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Analyzing selected context to generate How Might We questions...',
        data: {
          id: contextId,
          type: 'hmw_loading',
          status: 'loading',
          message: 'Building context and generating HMW questions...'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadingChunk)}\n\n`))

      // 2. Load context for HMW generation
      const contextResult = await contextManager.loadContextWithData(chatId, request.userId)
      const { context } = contextResult

      // 3. Validate context and build HMWContext
      if (context.totalItems === 0) {
        throw new ValidationError(
          'No context selected. Please select insights, metrics, or JTBDs to generate How Might We questions.',
          'NO_CONTEXT_SELECTED'
        )
      }

      // 4. Get properly typed context data from database directly
      const insightsData = context.insights.length > 0 
        ? await executeQuery<Array<{id: UUID, content: string}>>(async (client) =>
            client
              .from('insights')
              .select('id, content')
              .in('id', context.insights.map(i => i.id))
              .eq('user_id', request.userId)
          ) || []
        : []
      
      const metricsData = context.metrics.length > 0
        ? await executeQuery<Array<{id: UUID, name: string, description: string | null, current_value: number | null, target_value: number | null, unit: string}>>(async (client) =>
            client
              .from('metrics')
              .select('id, name, description, current_value, target_value, unit')
              .in('id', context.metrics.map(m => m.id))
              .eq('user_id', request.userId)
          ) || []
        : []
        
      const jtbdsData = context.jtbds.length > 0
        ? await executeQuery<Array<{id: UUID, statement: string, context: string | null, priority: number | null}>>(async (client) =>
            client
              .from('jtbds')
              .select('id, statement, context, priority')
              .in('id', context.jtbds.map(j => j.id))
              .eq('user_id', request.userId)
          ) || []
        : []

      const hmwContext: HMWContext = {
        insights: insightsData.map(item => ({
          id: item.id,
          content: item.content
        })),
        metrics: metricsData.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description || undefined,
          current_value: item.current_value || undefined,
          target_value: item.target_value || undefined,
          unit: item.unit
        })),
        jtbds: jtbdsData.map(item => ({
          id: item.id,
          statement: item.statement,
          context: item.context || undefined,
          priority: item.priority || undefined
        }))
      }

      // 4. Generate HMW questions using service
      const hmwResponse = await hmwService.generateHMW(hmwContext, {
        count: 8,
        temperature: 0.7
      })

      // 5. Persist HMWs to database
      const persistedHMWs: Array<{ id: UUID; question: string; score: number; source_references: SourceReferences }> = []
      
      for (const hmw of hmwResponse.hmws) {
        const hmwData: HMWInsert = {
          user_id: request.userId,
          question: hmw.question,
          score: hmw.score,
          insight_ids: hmw.source_references.insight_ids,
          metric_ids: hmw.source_references.metric_ids,
          jtbd_ids: hmw.source_references.jtbd_ids,
          generation_method: hmwResponse.meta.generation_method
        }

        try {
          const insertedHMW = await executeQuery<{id: UUID, question: string, score: number, insight_ids: UUID[], metric_ids: UUID[], jtbd_ids: UUID[]}>(async (client) =>
            client
              .from('hmws')
              .insert(hmwData)
              .select('id, question, score, insight_ids, metric_ids, jtbd_ids')
              .single()
          )

          if (insertedHMW) {
            persistedHMWs.push({
              id: insertedHMW.id,
              question: insertedHMW.question,
              score: insertedHMW.score,
              source_references: {
                insight_ids: insertedHMW.insight_ids,
                metric_ids: insertedHMW.metric_ids,
                jtbd_ids: insertedHMW.jtbd_ids
              }
            })
          }
        } catch (insertError) {
          logger.error('Failed to persist HMW', { error: insertError, hmwData })
          throw new Error(`Failed to persist HMW: ${insertError instanceof Error ? insertError.message : String(insertError)}`)
        }
      }

      // 6. Send loaded state with results
      const loadedChunk: ChatStreamChunk = {
        type: 'context',
        content: `Generated ${persistedHMWs.length} How Might We questions based on your selected context`,
        data: {
          id: contextId,
          type: 'hmw_loaded',
          status: 'loaded',
          results: persistedHMWs,
          generation_method: hmwResponse.meta.generation_method,
          context_summary: {
            insights_count: hmwContext.insights.length,
            metrics_count: hmwContext.metrics.length,
            jtbds_count: hmwContext.jtbds.length
          }
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadedChunk)}\n\n`))

      // 7. Send picker interface for selecting HMWs
      const pickerItems = persistedHMWs.map(hmw => ({
        id: hmw.id,
        type: 'hmw' as const,
        title: hmw.question,
        content: hmw.question,
        score: hmw.score,
        metadata: {
          source_references: hmw.source_references,
          confidence: hmwResponse.hmws.find(h => h.question === hmw.question)?.confidence
        },
        selected: false
      }))

      const pickerChunk: ChatStreamChunk = {
        type: 'picker',
        data: {
          id: pickerId,
          type: 'hmw_picker',
          items: pickerItems,
          actions: ['select', 'confirm', 'cancel'],
          selectedCount: 0,
          maxSelections: 5,
          title: 'Select How Might We Questions',
          description: 'Choose the questions that resonate most with your challenge'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(pickerChunk)}\n\n`))

      // 8. Persist assistant message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Generated ${persistedHMWs.length} How Might We questions from ${context.totalItems} context items using ${hmwResponse.meta.generation_method} method`,
        'generate_hmw',
        Date.now() - startTime,
        hmwResponse.hmws.length * 10 // Approximate tokens
      )

    } catch (error) {
      // Send error state with reconciliation
      const errorChunk: ChatStreamChunk = {
        type: 'context',
        content: `Failed to generate HMW questions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          id: contextId,
          type: 'hmw_error',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))

      // Persist error message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Failed to generate HMW questions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'generate_hmw',
        Date.now() - startTime,
        50
      )

      logger.error('HMW generation failed in chat orchestrator', {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        userId: request.userId,
        requestMessage: request.message
      })
    }
  }

  /**
   * Handle solution creation intent
   */
  private async handleSolutionCreation(
    request: ChatRequest,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    chatId: UUID,
    startTime: number
  ): Promise<void> {
    const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const pickerId = `picker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      // 1. Send loading state
      const loadingChunk: ChatStreamChunk = {
        type: 'context',
        content: 'Creating solutions from selected HMW questions and context...',
        data: {
          id: contextId,
          type: 'solution_loading',
          status: 'loading',
          message: 'Building context and generating prioritized solutions...'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadingChunk)}\n\n`))

      // 2. Load context for solution creation
      const contextResult = await contextManager.loadContextWithData(chatId, request.userId)
      const { context } = contextResult

      // 3. Validate HMW selection
      if (context.hmws.length === 0) {
        throw new ValidationError(
          'No HMW questions selected. Please generate and select How Might We questions first.',
          'NO_HMWS_SELECTED'
        )
      }

      if (context.metrics.length === 0) {
        throw new ValidationError(
          'No metrics selected. Please select at least one metric to create solutions.',
          'NO_METRICS_SELECTED'
        )
      }

      // 4. Get properly typed context data from database
      const hmwsData = await executeQuery<Array<{id: UUID, question: string, score?: number}>>(async (client) =>
        client
          .from('hmws')
          .select('id, question, score')
          .in('id', context.hmws.map(h => h.id))
          .eq('user_id', request.userId)
      ) || []

      const insightsData = context.insights.length > 0 
        ? await executeQuery<Array<{id: UUID, content: string}>>(async (client) =>
            client
              .from('insights')
              .select('id, content')
              .in('id', context.insights.map(i => i.id))
              .eq('user_id', request.userId)
          ) || []
        : []
      
      const metricsData = await executeQuery<Array<{id: UUID, name: string, description: string | null, current_value: number | null, target_value: number | null, unit: string}>>(async (client) =>
        client
          .from('metrics')
          .select('id, name, description, current_value, target_value, unit')
          .in('id', context.metrics.map(m => m.id))
          .eq('user_id', request.userId)
      ) || []
        
      const jtbdsData = context.jtbds.length > 0
        ? await executeQuery<Array<{id: UUID, statement: string, context: string | null, priority: number | null}>>(async (client) =>
            client
              .from('jtbds')
              .select('id, statement, context, priority')
              .in('id', context.jtbds.map(j => j.id))
              .eq('user_id', request.userId)
          ) || []
        : []

      // 5. Build solution context and HMW items
      const hmwItems: HMWItem[] = hmwsData.map(hmw => ({
        id: hmw.id,
        question: hmw.question,
        score: hmw.score
      }))

      const solutionContext: SolutionContext = {
        insights: insightsData.map(item => ({
          id: item.id,
          content: item.content
        })),
        metrics: metricsData.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description || undefined,
          current_value: item.current_value || undefined,
          target_value: item.target_value || undefined,
          unit: item.unit
        })),
        jtbds: jtbdsData.map(item => ({
          id: item.id,
          statement: item.statement,
          context: item.context || undefined,
          priority: item.priority || undefined
        })),
        hmws: hmwItems
      }

      // 6. Generate solutions using service
      const solutionResponse = await solutionService.createSolutions(hmwItems, solutionContext, {
        count: 5,
        temperature: 0.7
      })

      // 7. Persist solutions to database
      const persistedSolutions: Array<{ id: UUID; title: string; description: string; impact_score: number; effort_score: number; final_score: number; assigned_metrics: string[] }> = []

      for (const solution of solutionResponse.solutions) {
        const solutionData = {
          user_id: request.userId,
          title: solution.title,
          description: solution.description,
          impact_score: solution.impact_score,
          effort_score: solution.effort_score,
          final_score: solution.final_score || (solution.impact_score / solution.effort_score),
          metric_ids: solution.assigned_metrics,
          hmw_ids: hmwItems.map(h => h.id),
          jtbd_ids: solutionContext.jtbds.map(j => j.id),
          insight_ids: solutionContext.insights.map(i => i.id),
          generation_method: solutionResponse.meta.generation_method
        }

        try {
          const insertedSolution = await executeQuery<{id: UUID, title: string, description: string, impact_score: number, effort_score: number, final_score: number, metric_ids: string[]}>(async (client) =>
            client
              .from('solutions')
              .insert(solutionData)
              .select('id, title, description, impact_score, effort_score, final_score, metric_ids')
              .single()
          )

          if (insertedSolution) {
            persistedSolutions.push({
              id: insertedSolution.id,
              title: insertedSolution.title,
              description: insertedSolution.description,
              impact_score: insertedSolution.impact_score,
              effort_score: insertedSolution.effort_score,
              final_score: insertedSolution.final_score,
              assigned_metrics: insertedSolution.metric_ids
            })
          }
        } catch (insertError) {
          logger.error('Failed to persist solution', { error: insertError, solutionData })
          throw new Error(`Failed to persist solution: ${insertError instanceof Error ? insertError.message : String(insertError)}`)
        }
      }

      // Sort by final score (highest first)
      persistedSolutions.sort((a, b) => b.final_score - a.final_score)

      // 8. Send loaded state with results
      const loadedChunk: ChatStreamChunk = {
        type: 'context',
        content: `Created ${persistedSolutions.length} prioritized solutions from ${hmwItems.length} HMW questions`,
        data: {
          id: contextId,
          type: 'solution_loaded',
          status: 'loaded',
          results: persistedSolutions,
          generation_method: solutionResponse.meta.generation_method,
          context_summary: {
            hmws_count: hmwItems.length,
            insights_count: solutionContext.insights.length,
            metrics_count: solutionContext.metrics.length,
            jtbds_count: solutionContext.jtbds.length
          }
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(loadedChunk)}\n\n`))

      // 9. Send picker interface for solution review
      const pickerItems = persistedSolutions.map(solution => ({
        id: solution.id,
        type: 'solution' as const,
        title: solution.title,
        content: solution.description,
        score: solution.final_score,
        metadata: {
          impact_score: solution.impact_score,
          effort_score: solution.effort_score,
          assigned_metrics: solution.assigned_metrics
        },
        selected: false
      }))

      const pickerChunk: ChatStreamChunk = {
        type: 'picker',
        data: {
          id: pickerId,
          type: 'solution_picker',
          items: pickerItems,
          actions: ['view', 'prioritize', 'confirm'],
          selectedCount: 0,
          maxSelections: 10,
          title: 'Prioritized Solutions',
          description: 'Solutions sorted by final score (impact/effort ratio)'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(pickerChunk)}\n\n`))

      // 10. Persist assistant message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Created ${persistedSolutions.length} prioritized solutions from ${hmwItems.length} HMW questions using ${solutionResponse.meta.generation_method} method`,
        'create_solutions',
        Date.now() - startTime,
        solutionResponse.solutions.length * 15 // Approximate tokens
      )

    } catch (error) {
      // Send error state with reconciliation
      const errorChunk: ChatStreamChunk = {
        type: 'context',
        content: `Failed to create solutions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          id: contextId,
          type: 'solution_error',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))

      // Persist error message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        `Failed to create solutions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'create_solutions',
        Date.now() - startTime,
        50
      )

      logger.error('Solution creation failed in chat orchestrator', {
        error: error instanceof Error ? error.message : String(error),
        chatId,
        userId: request.userId,
        requestMessage: request.message
      })
    }
  }

  /**
   * Handle general exploration with AI streaming
   */
  private async handleGeneralExploration(
    request: ChatRequest,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
    chatId: UUID,
    startTime: number
  ): Promise<void> {
    try {
      // Load chat history for context
      const chatHistory = await this.loadChatHistory(chatId)
      
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt()
      
      // Build conversation context
      const conversationContext = this.buildConversationContext(chatHistory, request.message)
      
      // Stream response using AI SDK v5
      const streamResult = await streamText({
        model: createCompatibleLanguageModel(openai(config.openai.model)),
        system: systemPrompt,
        prompt: conversationContext,
        temperature: 0.7,
        maxOutputTokens: 1000
      })

      let fullContent = ''
      let tokensUsed = 0

      // Process stream chunks
      for await (const chunk of streamResult.textStream) {
        fullContent += chunk
        
        const messageChunk: ChatStreamChunk = {
          type: 'message',
          content: chunk
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageChunk)}\n\n`))
      }

      // Calculate tokens used (approximate)
      tokensUsed = Math.ceil(fullContent.length / 4)

      // Persist complete assistant message
      await this.persistAssistantMessage(
        chatId,
        request.userId,
        fullContent,
        'general_exploration',
        Date.now() - startTime,
        tokensUsed
      )

    } catch (error) {
      logger.error('General exploration streaming failed', error)
      
      const errorChunk: ChatStreamChunk = {
        type: 'error',
        error: {
          code: 'STREAM_GENERATION_ERROR',
          message: 'Failed to generate streaming response',
          action: 'RETRY'
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
    }
  }

  /**
   * Load or create chat session
   */
  private async loadOrCreateChat(request: ChatRequest): Promise<{ chatId: UUID, chat: { messages: unknown[] } }> {
    if (request.chatId) {
      // Load existing chat
      const chat = await this.sessionManager.loadChat(request.chatId, request.userId)
      return { chatId: request.chatId, chat }
    } else {
      // Create new chat
      const chat = await this.sessionManager.createChat(request.userId, 'New Chat')
      return { chatId: chat.id, chat }
    }
  }

  /**
   * Load chat history for context
   */
  private async loadChatHistory(chatId: UUID): Promise<any[]> {
    try {
      const chat = await this.sessionManager.loadChat(chatId, 'default-user-id') // TODO: Use proper user ID
      return chat.messages || []
    } catch (error) {
      logger.warn('Could not load chat history', { chatId, error })
      return []
    }
  }

  /**
   * Build system prompt for general exploration
   */
  private buildSystemPrompt(): string {
    return `You are an AI assistant for the JTBD (Jobs-to-be-Done) Assistant Platform. 

You help users:
- Analyze customer research and documents
- Extract insights from uploaded materials
- Create and manage Jobs-to-be-Done statements
- Define and track metrics
- Generate "How Might We" questions
- Create prioritized solutions

Be concise, helpful, and focused on actionable advice. If users ask about specific features, guide them toward using the appropriate commands or context selection.`
  }

  /**
   * Build conversation context from chat history
   */
  private buildConversationContext(messages: unknown[], currentMessage: string): string {
    let context = ''
    
    // Add recent messages for context (limited by token budget)
    const recentMessages = messages.slice(-5) // Last 5 messages
    
    for (const msg of recentMessages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      context += `${role}: ${msg.content}\n\n`
    }
    
    context += `User: ${currentMessage}`
    
    return context
  }

  /**
   * Persist assistant message
   */
  private async persistAssistantMessage(
    chatId: UUID,
    userId: UUID,
    content: string,
    intent: string,
    processingTimeMs: number,
    tokensUsed: number
  ): Promise<void> {
    try {
      await this.messagePipeline.persistAssistantMessage({
        chatId,
        userId,
        content,
        intent,
        processingTimeMs,
        tokensUsed,
        modelUsed: config.openai.model
      })
    } catch (error) {
      logger.error('Failed to persist assistant message', error, {
        chatId,
        intent,
        contentLength: content.length
      })
    }
  }

  /**
   * Validate chat request
   */
  private validateChatRequest(request: ChatRequest): void {
    if (!request.message?.trim()) {
      throw new ValidationError('Message cannot be empty')
    }
    
    if (!request.userId) {
      throw new ValidationError('User ID is required')
    }
    
    if (request.message.length > 4000) {
      throw new ValidationError('Message too long (max 4000 characters)')
    }
  }

  /**
   * Create error stream for failed requests
   */
  private createErrorStream(error: unknown): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    
    return new ReadableStream({
      start(controller) {
        const errorChunk: ChatStreamChunk = {
          type: 'error',
          error: {
            code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'An unknown error occurred',
            action: 'RETRY',
            details: error instanceof Error ? { stack: error.stack } : undefined
          }
        }
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
        controller.close()
      }
    })
  }
}

// Singleton export
export const chatOrchestrator = ChatOrchestrator.getInstance()
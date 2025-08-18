export interface ChatStreamChunk {
  type: 'message' | 'context' | 'picker' | 'metadata' | 'error' | 'done'
  content?: string
  data?: any
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
    details?: any
  }
}

export interface ContextData {
  id: string
  type: 'insights_loading' | 'insights_loaded' | 'metrics_loading' | 'metrics_loaded' | 'jtbds_loading' | 'jtbds_loaded'
  status: 'loading' | 'loaded' | 'error'
  message?: string
  results?: any[]
  summary?: any
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    intent?: string
    processingTime?: number
    tokensUsed?: number
  }
}

export interface StreamingState {
  isStreaming: boolean
  currentMessage: string
  error: string | null
  contextData: ContextData[]
  pickerData: PickerData[]
  metadata: any
}
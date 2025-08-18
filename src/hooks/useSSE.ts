import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatStreamChunk, StreamingState, ContextData, PickerData } from '@/types/chat'

interface UseSSEOptions {
  onMessage?: (chunk: ChatStreamChunk) => void
  onError?: (error: string) => void
  onComplete?: () => void
  reconnect?: boolean
  maxReconnectAttempts?: number
}

export function useSSE(options: UseSSEOptions = {}) {
  const { onMessage, onError, onComplete, reconnect = true, maxReconnectAttempts = 3 } = options
  
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    setIsConnected(false)
    setIsReconnecting(false)
  }, [])

  const connect = useCallback((url: string, requestInit?: RequestInit) => {
    cleanup()

    try {
      // For POST requests with SSE, we need to make a fetch first then connect to SSE
      if (requestInit?.method === 'POST') {
        fetch(url, {
          ...requestInit,
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            ...requestInit.headers,
          },
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          if (!response.body) {
            throw new Error('Response body is null')
          }

          setIsConnected(true)
          reconnectAttemptsRef.current = 0

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          function processStream(): Promise<void> {
            return reader.read().then(({ done, value }) => {
              if (done) {
                onComplete?.()
                setIsConnected(false)
                return
              }

              const chunk = decoder.decode(value)
              const lines = chunk.split('\n')
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6)) as ChatStreamChunk
                    onMessage?.(data)
                    
                    if (data.type === 'done') {
                      onComplete?.()
                      setIsConnected(false)
                      return
                    }
                  } catch (error) {
                    console.warn('Failed to parse SSE data:', line, error)
                  }
                }
              }

              return processStream()
            })
          }

          return processStream()
        })
        .catch(error => {
          console.error('SSE connection error:', error)
          setIsConnected(false)
          onError?.(error.message)
          
          if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            setIsReconnecting(true)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              setIsReconnecting(false)
              connect(url, requestInit)
            }, Math.pow(2, reconnectAttemptsRef.current) * 1000) // Exponential backoff
          }
        })
      } else {
        // For GET requests, use EventSource
        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          setIsConnected(true)
          reconnectAttemptsRef.current = 0
        }

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ChatStreamChunk
            onMessage?.(data)
            
            if (data.type === 'done') {
              onComplete?.()
              cleanup()
            }
          } catch (error) {
            console.warn('Failed to parse SSE message:', event.data, error)
          }
        }

        eventSource.onerror = (error) => {
          console.error('SSE error:', error)
          setIsConnected(false)
          onError?.('Connection error')
          
          if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            setIsReconnecting(true)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              setIsReconnecting(false)
              connect(url, requestInit)
            }, Math.pow(2, reconnectAttemptsRef.current) * 1000)
          }
        }
      }
    } catch (error) {
      console.error('Failed to establish SSE connection:', error)
      onError?.('Failed to establish connection')
    }
  }, [cleanup, onMessage, onError, onComplete, reconnect, maxReconnectAttempts])

  const disconnect = useCallback(() => {
    cleanup()
  }, [cleanup])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    connect,
    disconnect,
    isConnected,
    isReconnecting,
  }
}

export function useChatStream() {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentMessage: '',
    error: null,
    contextData: [],
    pickerData: [],
    metadata: null,
  })

  const handleChunk = useCallback((chunk: ChatStreamChunk) => {
    setStreamingState(prev => {
      const newState = { ...prev }

      switch (chunk.type) {
        case 'message':
          newState.currentMessage += chunk.content || ''
          break

        case 'context':
          if (chunk.data) {
            const contextData = chunk.data as ContextData
            const existingIndex = prev.contextData.findIndex(c => c.id === contextData.id)
            
            if (existingIndex >= 0) {
              // Update existing context (reconciliation)
              newState.contextData = [...prev.contextData]
              newState.contextData[existingIndex] = contextData
            } else {
              // Add new context
              newState.contextData = [...prev.contextData, contextData]
            }
          }
          break

        case 'picker':
          if (chunk.data) {
            const pickerData = chunk.data as PickerData
            const existingIndex = prev.pickerData.findIndex(p => p.id === pickerData.id)
            
            if (existingIndex >= 0) {
              // Update existing picker
              newState.pickerData = [...prev.pickerData]
              newState.pickerData[existingIndex] = pickerData
            } else {
              // Add new picker
              newState.pickerData = [...prev.pickerData, pickerData]
            }
          }
          break

        case 'metadata':
          newState.metadata = chunk.metadata
          break

        case 'error':
          newState.error = chunk.error?.message || 'An error occurred'
          break

        case 'done':
          newState.isStreaming = false
          break
      }

      return newState
    })
  }, [])

  const handleError = useCallback((error: string) => {
    setStreamingState(prev => ({
      ...prev,
      error,
      isStreaming: false,
    }))
  }, [])

  const handleComplete = useCallback(() => {
    setStreamingState(prev => ({
      ...prev,
      isStreaming: false,
    }))
  }, [])

  const { connect, disconnect, isConnected, isReconnecting } = useSSE({
    onMessage: handleChunk,
    onError: handleError,
    onComplete: handleComplete,
  })

  const startStream = useCallback((message: string) => {
    setStreamingState({
      isStreaming: true,
      currentMessage: '',
      error: null,
      contextData: [],
      pickerData: [],
      metadata: null,
    })

    connect('/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'default-user-id', // TODO: Replace with actual user ID
      },
      body: JSON.stringify({ message }),
    })
  }, [connect])

  const stopStream = useCallback(() => {
    disconnect()
    setStreamingState(prev => ({
      ...prev,
      isStreaming: false,
    }))
  }, [disconnect])

  return {
    streamingState,
    startStream,
    stopStream,
    isConnected,
    isReconnecting,
  }
}
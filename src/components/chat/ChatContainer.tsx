import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useChatStream } from '@/hooks/useSSE'
import { ChatMessage, PickerItem } from '@/types/chat'
import MessageBubble, { StreamingMessageBubble } from './MessageBubble'
import MessageInput from './MessageInput'
import TypingIndicator from './TypingIndicator'
import ContextLoader from './ContextLoader'
import PickerInterface from './PickerInterface'
import FileUpload from '@/components/upload/FileUpload'
import { MessageCircle, AlertCircle, Wifi, WifiOff, X, Upload as UploadIcon } from 'lucide-react'
import type { UploadResult, UploadErrorResponse } from '@/components/upload/types'

interface ChatContainerProps {
  className?: string
}

export default function ChatContainer({ className }: ChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  
  const { 
    streamingState, 
    startStream, 
    stopStream, 
    isConnected, 
    isReconnecting 
  } = useChatStream()

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingState.currentMessage])

  // Add completed streamed message to chat history
  useEffect(() => {
    if (!streamingState.isStreaming && streamingState.currentMessage && streamingState.currentMessage.trim()) {
      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: streamingState.currentMessage,
        timestamp: new Date(),
        metadata: streamingState.metadata,
      }
      
      setMessages(prev => [...prev, newMessage])
    }
  }, [streamingState.isStreaming, streamingState.currentMessage, streamingState.metadata])

  const handleSendMessage = (message: string) => {
    if (streamingState.isStreaming) return

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    }
    
    setMessages(prev => [...prev, userMessage])
    setIsFirstLoad(false)
    
    // Start streaming response
    startStream(message)
  }

  const handleStopStream = () => {
    stopStream()
  }

  const handlePickerSelection = (pickerId: string, selectedItems: PickerItem[]) => {
    console.log('Picker selection changed:', pickerId, selectedItems)
    // TODO: Implement picker selection handling
  }

  const handlePickerConfirm = (pickerId: string, selectedItems: PickerItem[]) => {
    console.log('Picker confirmed:', pickerId, selectedItems)
    // TODO: Implement picker confirmation
  }

  const handlePickerCancel = (pickerId: string) => {
    console.log('Picker cancelled:', pickerId)
    // TODO: Implement picker cancellation
  }

  const handleUploadClick = () => {
    setShowUpload(true)
  }

  const handleCloseUpload = () => {
    setShowUpload(false)
  }

  const handleUploadComplete = (results: UploadResult[]) => {
    console.log('Upload completed:', results)
    
    // Add success message to chat
    const successMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Successfully uploaded ${results.length} file${results.length !== 1 ? 's' : ''}:${results.map(r => `\n• ${r.document.title || 'Untitled'} (${r.chunksCreated} chunks created)`).join('')}`,
      timestamp: new Date(),
      metadata: {
        type: 'upload_success',
        uploadResults: results,
      },
    }
    
    setMessages(prev => [...prev, successMessage])
    setShowUpload(false)
    setIsFirstLoad(false)
  }

  const handleUploadError = (errors: UploadErrorResponse[]) => {
    console.error('Upload failed:', errors)
    
    // Add error message to chat
    const errorMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Upload failed:${errors.map(e => `\n• ${e.message}`).join('')}`,
      timestamp: new Date(),
      metadata: {
        type: 'upload_error',
        uploadErrors: errors,
      },
    }
    
    setMessages(prev => [...prev, errorMessage])
  }

  const hasAnyContent = messages.length > 0 || streamingState.isStreaming || streamingState.currentMessage
  const showTypingIndicator = streamingState.isStreaming && !streamingState.currentMessage

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">JTBD Assistant</h1>
          </div>
          
          {/* Connection status */}
          <div className="flex items-center gap-2 text-sm">
            {isReconnecting ? (
              <>
                <WifiOff className="w-4 h-4 text-destructive" />
                <span className="text-destructive">Reconnecting...</span>
              </>
            ) : isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-600" />
                <span className="text-green-600">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Upload Interface */}
      {showUpload && (
        <div className="border-b bg-card">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UploadIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Upload Documents</h2>
              </div>
              <button
                onClick={handleCloseUpload}
                className={cn(
                  'inline-flex items-center justify-center rounded-md h-8 w-8',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'transition-colors'
                )}
                aria-label="Close upload"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <FileUpload
              userId="default-user-id" // Matches the pattern used in API routes
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
              options={{
                generateInsights: true,
                generateEmbeddings: true,
              }}
              className="max-w-none"
            />
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <div 
          ref={messagesContainerRef}
          className="h-full overflow-y-auto chat-scroll px-4 py-6"
        >
          {/* Welcome message for first load */}
          {isFirstLoad && !hasAnyContent && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <MessageCircle className="w-12 h-12 text-primary/50" />
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Welcome to JTBD Assistant</h2>
                <p className="text-muted-foreground max-w-md">
                  Transform your customer research into actionable insights. 
                  Ask me to retrieve insights, metrics, or help generate solutions.
                </p>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Try asking:</p>
                <ul className="space-y-1 text-left">
                  <li>• &quot;Show me our insights&quot;</li>
                  <li>• &quot;What metrics do we have?&quot;</li>
                  <li>• &quot;Generate how might we questions&quot;</li>
                  <li>• &quot;Create solutions for our challenge&quot;</li>
                </ul>
              </div>
            </div>
          )}

          {/* Error state */}
          {streamingState.error && (
            <div className="mb-4 p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">Error</span>
              </div>
              <p className="text-sm text-destructive mt-1">{streamingState.error}</p>
            </div>
          )}

          {/* Chat messages */}
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Context loading states */}
            {streamingState.contextData.length > 0 && (
              <div className="space-y-4">
                <ContextLoader contextData={streamingState.contextData} />
              </div>
            )}

            {/* Picker interfaces */}
            {streamingState.pickerData.length > 0 && (
              <div className="space-y-4">
                <PickerInterface
                  pickerData={streamingState.pickerData}
                  onSelectionChange={handlePickerSelection}
                  onConfirm={handlePickerConfirm}
                  onCancel={handlePickerCancel}
                />
              </div>
            )}

            {/* Streaming message */}
            {streamingState.currentMessage && (
              <StreamingMessageBubble
                content={streamingState.currentMessage}
                isStreaming={streamingState.isStreaming}
              />
            )}

            {/* Typing indicator */}
            {showTypingIndicator && (
              <div className="flex justify-start">
                <div className="max-w-[80%] p-4">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </div>

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0">
        <MessageInput
          onSendMessage={handleSendMessage}
          onStopStream={handleStopStream}
          onUploadClick={handleUploadClick}
          disabled={!isConnected && !isReconnecting}
          isStreaming={streamingState.isStreaming}
          placeholder={
            !isConnected && !isReconnecting 
              ? "Connecting..." 
              : streamingState.isStreaming 
                ? "Streaming response..." 
                : "Type your message..."
          }
        />
      </div>
    </div>
  )
}
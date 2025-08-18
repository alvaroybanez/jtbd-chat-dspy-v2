import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { ChatMessage } from '@/types/chat'
import { User, Bot, Clock } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  className?: string
}

export default function MessageBubble({ message, isStreaming = false, className }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start', className)}>
      <div className={cn(
        'flex max-w-[80%] gap-3 p-4 rounded-lg',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isUser 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-muted'
      )}>
        {/* Avatar */}
        <div className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary-foreground/20' : 'bg-background'
        )}>
          {isUser ? (
            <User className="w-4 h-4" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-2">
          {/* Message content */}
          <div className={cn(
            'text-sm',
            isUser ? 'text-primary-foreground' : 'text-foreground'
          )}>
            {isAssistant ? (
              <ReactMarkdown
                className="prose-chat"
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ children }) => (
                    <code className={cn(
                      'px-1.5 py-0.5 rounded text-xs font-mono',
                      isUser ? 'bg-primary-foreground/20' : 'bg-background'
                    )}>
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className={cn(
                      'p-3 rounded-lg overflow-x-auto text-xs font-mono',
                      isUser ? 'bg-primary-foreground/20' : 'bg-background'
                    )}>
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary/30 pl-4 italic">
                      {children}
                    </blockquote>
                  ),
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <p>{message.content}</p>
            )}
          </div>

          {/* Metadata */}
          <div className={cn(
            'flex items-center gap-2 text-xs',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}>
            <Clock className="w-3 h-3" />
            <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            
            {message.metadata?.intent && (
              <>
                <span>•</span>
                <span className="capitalize">{message.metadata.intent.replace('_', ' ')}</span>
              </>
            )}
            
            {message.metadata?.processingTime && (
              <>
                <span>•</span>
                <span>{message.metadata.processingTime}ms</span>
              </>
            )}

            {isStreaming && (
              <>
                <span>•</span>
                <span className="animate-pulse">Streaming...</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Component for streaming messages that updates in real-time
interface StreamingMessageBubbleProps {
  content: string
  isStreaming: boolean
  className?: string
}

export function StreamingMessageBubble({ content, isStreaming, className }: StreamingMessageBubbleProps) {
  const message: ChatMessage = {
    id: 'streaming',
    role: 'assistant',
    content,
    timestamp: new Date(),
  }

  return (
    <MessageBubble 
      message={message} 
      isStreaming={isStreaming}
      className={className}
    />
  )
}
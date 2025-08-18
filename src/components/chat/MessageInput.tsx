import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Send, Square, Paperclip } from 'lucide-react'

interface MessageInputProps {
  onSendMessage: (message: string) => void
  onStopStream?: () => void
  onUploadClick?: () => void
  disabled?: boolean
  isStreaming?: boolean
  placeholder?: string
  className?: string
}

export default function MessageInput({
  onSendMessage,
  onStopStream,
  onUploadClick,
  disabled = false,
  isStreaming = false,
  placeholder = "Type your message...",
  className,
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [message])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || disabled || isStreaming) return

    onSendMessage(message.trim())
    setMessage('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleStop = () => {
    onStopStream?.()
  }

  const handleUploadClick = () => {
    onUploadClick?.()
  }

  return (
    <form onSubmit={handleSubmit} className={cn('relative', className)}>
      <div className="relative flex items-end gap-2 p-4 border-t bg-background">
        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-lg border border-input bg-background px-3 py-2 pr-12 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200'
            )}
            style={{
              minHeight: '40px',
              maxHeight: '120px',
            }}
          />

          {/* Character count for long messages */}
          {message.length > 500 && (
            <div className="absolute bottom-1 right-12 text-xs text-muted-foreground">
              {message.length}/2000
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Upload button */}
          {!isStreaming && onUploadClick && (
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={disabled}
              className={cn(
                'inline-flex items-center justify-center rounded-md h-10 w-10',
                'bg-muted text-muted-foreground',
                'hover:bg-muted/80 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                'transition-colors'
              )}
              aria-label="Upload files"
              title="Upload files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}

          {/* Send/Stop button */}
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className={cn(
                'inline-flex items-center justify-center rounded-md h-10 w-10',
                'bg-destructive text-destructive-foreground',
                'hover:bg-destructive/90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                'transition-colors'
              )}
              aria-label="Stop streaming"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !message.trim() || message.length > 2000}
              className={cn(
                'inline-flex items-center justify-center rounded-md h-10 w-10',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                'transition-colors'
              )}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Helper text */}
      <div className="px-4 pb-2">
        <p className="text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
          {message.length > 1800 && (
            <span className="text-destructive ml-2">
              Warning: Message is getting long ({message.length}/2000)
            </span>
          )}
        </p>
      </div>
    </form>
  )
}
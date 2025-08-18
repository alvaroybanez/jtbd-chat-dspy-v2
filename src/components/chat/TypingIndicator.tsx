import { cn } from '@/lib/utils'

interface TypingIndicatorProps {
  className?: string
}

export default function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={cn('flex items-center space-x-1', className)}>
      <div className="flex items-center space-x-1 typing-indicator">
        <span className="w-2 h-2 bg-muted-foreground rounded-full opacity-60"></span>
        <span className="w-2 h-2 bg-muted-foreground rounded-full opacity-60"></span>
        <span className="w-2 h-2 bg-muted-foreground rounded-full opacity-60"></span>
      </div>
      <span className="text-xs text-muted-foreground">Assistant is typing...</span>
    </div>
  )
}
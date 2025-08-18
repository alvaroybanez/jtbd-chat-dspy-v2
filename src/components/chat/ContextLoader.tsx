import { cn } from '@/lib/utils'
import { ContextData } from '@/types/chat'
import { Loader2, CheckCircle, AlertCircle, Search, Target, Lightbulb, HelpCircle, Wrench } from 'lucide-react'

interface ContextLoaderProps {
  contextData: ContextData[]
  className?: string
}

export default function ContextLoader({ contextData, className }: ContextLoaderProps) {
  if (contextData.length === 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      {contextData.map((context) => (
        <ContextItem key={context.id} context={context} />
      ))}
    </div>
  )
}

interface ContextItemProps {
  context: ContextData
}

function ContextItem({ context }: ContextItemProps) {
  const getIcon = (type: string) => {
    if (type.includes('insights')) return <Lightbulb className="w-4 h-4" />
    if (type.includes('metrics')) return <Target className="w-4 h-4" />
    if (type.includes('jtbds')) return <Search className="w-4 h-4" />
    if (type.includes('hmw')) return <HelpCircle className="w-4 h-4" />
    if (type.includes('solution')) return <Wrench className="w-4 h-4" />
    return <Search className="w-4 h-4" />
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="w-4 h-4 animate-spin" />
      case 'loaded':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />
      default:
        return <Loader2 className="w-4 h-4 animate-spin" />
    }
  }

  const getTypeLabel = (type: string) => {
    if (type.includes('insights')) return 'Insights'
    if (type.includes('metrics')) return 'Metrics'
    if (type.includes('jtbds')) return 'Jobs to be Done'
    if (type.includes('hmw')) return 'How Might We Questions'
    if (type.includes('solution')) return 'Solutions'
    return 'Context'
  }

  const getBorderColor = (status: string) => {
    switch (status) {
      case 'loading':
        return 'border-primary/20'
      case 'loaded':
        return 'border-green-200'
      case 'error':
        return 'border-destructive/20'
      default:
        return 'border-muted'
    }
  }

  const getBackgroundColor = (status: string) => {
    switch (status) {
      case 'loading':
        return 'bg-primary/5'
      case 'loaded':
        return 'bg-green-50'
      case 'error':
        return 'bg-destructive/5'
      default:
        return 'bg-muted/50'
    }
  }

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border',
      getBorderColor(context.status),
      getBackgroundColor(context.status)
    )}>
      {/* Type Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {getIcon(context.type)}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2">
        {/* Header with status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {getTypeLabel(context.type)}
          </span>
          {getStatusIcon(context.status)}
        </div>

        {/* Message */}
        {context.message && (
          <p className="text-sm text-muted-foreground">
            {context.message}
          </p>
        )}

        {/* Results summary */}
        {context.status === 'loaded' && context.results && (
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              Found {context.results.length} items
            </p>
            
            {/* Summary if available */}
            {context.summary && (
              <div className="text-xs text-muted-foreground space-y-1">
                {typeof context.summary === 'object' ? (
                  Object.entries(context.summary).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="capitalize">{key.replace('_', ' ')}:</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))
                ) : (
                  <p>{context.summary}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {context.status === 'error' && context.error && (
          <p className="text-sm text-destructive">
            {context.error}
          </p>
        )}
      </div>
    </div>
  )
}

// Skeleton loader for initial loading state
export function ContextLoaderSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-muted bg-muted/50">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-4 h-4 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              <div className="w-4 h-4 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-3 w-full bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
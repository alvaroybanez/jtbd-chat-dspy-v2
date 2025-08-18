import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PickerData, PickerItem } from '@/types/chat'
import { Check, Lightbulb, Target, Search, HelpCircle, Wrench, ChevronLeft, ChevronRight } from 'lucide-react'

interface PickerInterfaceProps {
  pickerData: PickerData[]
  onSelectionChange?: (pickerId: string, selectedItems: PickerItem[]) => void
  onConfirm?: (pickerId: string, selectedItems: PickerItem[]) => void
  onCancel?: (pickerId: string) => void
  className?: string
}

export default function PickerInterface({ 
  pickerData, 
  onSelectionChange, 
  onConfirm, 
  onCancel,
  className 
}: PickerInterfaceProps) {
  if (pickerData.length === 0) return null

  return (
    <div className={cn('space-y-6', className)}>
      {pickerData.map((picker) => (
        <PickerCard
          key={picker.id}
          picker={picker}
          onSelectionChange={onSelectionChange}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ))}
    </div>
  )
}

interface PickerCardProps {
  picker: PickerData
  onSelectionChange?: (pickerId: string, selectedItems: PickerItem[]) => void
  onConfirm?: (pickerId: string, selectedItems: PickerItem[]) => void
  onCancel?: (pickerId: string) => void
}

function PickerCard({ picker, onSelectionChange, onConfirm, onCancel }: PickerCardProps) {
  const [localItems, setLocalItems] = useState(picker.items)
  const [currentPage, setCurrentPage] = useState(picker.pagination.page)

  const getIcon = (type: string) => {
    switch (type) {
      case 'insight':
        return <Lightbulb className="w-4 h-4" />
      case 'metric':
        return <Target className="w-4 h-4" />
      case 'jtbd':
        return <Search className="w-4 h-4" />
      case 'hmw':
        return <HelpCircle className="w-4 h-4" />
      case 'solution':
        return <Wrench className="w-4 h-4" />
      default:
        return <Search className="w-4 h-4" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'insight_picker':
        return 'Select Insights'
      case 'metric_picker':
        return 'Select Metrics'
      case 'jtbd_picker':
        return 'Select Jobs to be Done'
      case 'hmw_picker':
        return 'Select How Might We Questions'
      case 'solution_picker':
        return 'Select Solutions'
      default:
        return 'Select Items'
    }
  }

  const selectedItems = localItems.filter(item => item.selected)
  const isMaxSelected = picker.maxSelections ? selectedItems.length >= picker.maxSelections : false

  const handleItemToggle = (itemId: string) => {
    const newItems = localItems.map(item => {
      if (item.id === itemId) {
        // If trying to select and max is reached, don't select
        if (!item.selected && isMaxSelected) return item
        return { ...item, selected: !item.selected }
      }
      return item
    })

    setLocalItems(newItems)
    const newSelectedItems = newItems.filter(item => item.selected)
    onSelectionChange?.(picker.id, newSelectedItems)
  }

  const handleConfirm = () => {
    onConfirm?.(picker.id, selectedItems)
  }

  const handleCancel = () => {
    onCancel?.(picker.id)
  }

  // Pagination
  const itemsPerPage = picker.pagination.pageSize
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedItems = localItems.slice(startIndex, endIndex)

  const canPreviousPage = currentPage > 1
  const canNextPage = currentPage < picker.pagination.totalPages

  return (
    <div className="border rounded-lg bg-card">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getIcon(picker.type)}
            <h3 className="text-lg font-semibold">{getTypeLabel(picker.type)}</h3>
          </div>
          <div className="text-sm text-muted-foreground">
            {selectedItems.length} of {picker.maxSelections || localItems.length} selected
          </div>
        </div>
        
        {picker.maxSelections && (
          <p className="text-sm text-muted-foreground mt-1">
            Select up to {picker.maxSelections} items
          </p>
        )}
      </div>

      {/* Items */}
      <div className="p-4 space-y-2">
        {paginatedItems.map((item) => (
          <PickerItem
            key={item.id}
            item={item}
            onToggle={() => handleItemToggle(item.id)}
            disabled={!item.selected && isMaxSelected}
          />
        ))}
      </div>

      {/* Pagination */}
      {picker.pagination.totalPages > 1 && (
        <div className="px-4 py-2 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {picker.pagination.totalPages} 
              ({picker.pagination.totalItems} total items)
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!canPreviousPage}
                className={cn(
                  'p-1 rounded hover:bg-muted',
                  !canPreviousPage && 'opacity-50 cursor-not-allowed'
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!canNextPage}
                className={cn(
                  'p-1 rounded hover:bg-muted',
                  !canNextPage && 'opacity-50 cursor-not-allowed'
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t bg-muted/50">
        <div className="flex justify-end gap-2">
          {picker.actions.includes('cancel') && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          )}
          {picker.actions.includes('confirm') && (
            <button
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
              className={cn(
                'px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              Confirm Selection ({selectedItems.length})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface PickerItemProps {
  item: PickerItem
  onToggle: () => void
  disabled?: boolean
}

function PickerItem({ item, onToggle, disabled = false }: PickerItemProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
        item.selected 
          ? 'border-primary bg-primary/5' 
          : 'border-muted hover:border-muted-foreground/20 hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={() => !disabled && onToggle()}
    >
      {/* Checkbox */}
      <div className={cn(
        'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
        item.selected 
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground'
      )}>
        {item.selected && <Check className="w-3 h-3" />}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1">
        <div className="text-sm font-medium">{item.displayText}</div>
        {item.snippet && (
          <div className="text-sm text-muted-foreground line-clamp-2">
            {item.snippet}
          </div>
        )}
        
        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="capitalize">{item.type}</span>
          {item.similarity !== undefined && (
            <span>Similarity: {Math.round(item.similarity * 100)}%</span>
          )}
          {item.metadata.score && (
            <span>Score: {item.metadata.score}</span>
          )}
        </div>
      </div>
    </div>
  )
}
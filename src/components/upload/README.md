# FileUpload Component

A comprehensive file upload component with drag-and-drop support, progress tracking, and error handling. Built specifically for the JTBD Assistant Platform to handle document uploads with intelligent processing.

## Features

### Core Functionality
- **HTML5 Drag-and-Drop**: Full drag-and-drop zone with visual feedback
- **Click-to-Upload**: Accessible fallback with hidden file input
- **Multiple File Support**: Handle multiple files with individual progress tracking
- **Real-time Validation**: Instant client-side validation for file type and size
- **Progress Tracking**: Individual progress bars for each file during upload
- **Success/Error States**: Clear visual feedback for upload results
- **Retry Functionality**: Ability to retry failed uploads
- **File Removal**: Remove files before or after upload

### UI/UX Features
- **Responsive Design**: Works on all screen sizes
- **Accessibility**: Full keyboard navigation and screen reader support
- **Visual Feedback**: Hover states, drag states, and loading indicators
- **Theme Support**: Supports both light and dark themes
- **Consistent Styling**: Matches existing chat interface patterns
- **Progressive Enhancement**: Works without JavaScript as a basic file input

## Installation

The component is already integrated into the project. Import it from the upload module:

```typescript
import { FileUpload } from '@/components/upload'
// or
import FileUpload from '@/components/upload/FileUpload'
```

## Basic Usage

```tsx
import { FileUpload } from '@/components/upload'

function MyComponent() {
  const handleUploadComplete = (results) => {
    console.log('Upload completed:', results)
  }

  const handleUploadError = (errors) => {
    console.error('Upload failed:', errors)
  }

  return (
    <FileUpload
      userId="user-123"
      onUploadComplete={handleUploadComplete}
      onUploadError={handleUploadError}
    />
  )
}
```

## Advanced Usage

```tsx
import { FileUpload } from '@/components/upload'
import type { UploadResult, UploadErrorResponse, UploadProgress } from '@/components/upload/types'

function AdvancedUploadComponent() {
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])

  return (
    <FileUpload
      userId="user-123"
      options={{
        maxFileSize: 2097152, // 2MB
        allowedTypes: ['md', 'txt'],
        generateInsights: true,
        generateEmbeddings: true,
        timeout: 120000, // 2 minutes
      }}
      maxFiles={5}
      onUploadComplete={(results) => {
        setUploadResults(prev => [...prev, ...results])
        // Could trigger chat system notification
        // chatSystem.addMessage(`Successfully uploaded ${results.length} document(s)`)
      }}
      onUploadError={(errors) => {
        // Handle errors (show toast, etc.)
        errors.forEach(error => {
          console.error(`Upload failed: ${error.message}`)
        })
      }}
      onUploadProgress={(progress) => {
        // Update global progress state
        console.log(`Upload progress: ${progress[0]?.percentage}%`)
      }}
      onFileSelect={(files) => {
        // Track file selection
        console.log(`${files.length} files selected`)
      }}
      disabled={false}
      className="border-2 border-dashed border-primary/30 rounded-lg p-6"
    />
  )
}
```

## Props

### Required Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` | User ID for upload authentication |

### Optional Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `UploadOptions` | `{}` | Upload configuration options |
| `maxFiles` | `number` | `1` | Maximum number of files (backend currently supports 1) |
| `onUploadComplete` | `function` | `undefined` | Callback when upload completes successfully |
| `onUploadError` | `function` | `undefined` | Callback when upload fails |
| `onUploadProgress` | `function` | `undefined` | Progress callback during upload |
| `onFileSelect` | `function` | `undefined` | Callback when files are selected |
| `disabled` | `boolean` | `false` | Disable the upload component |
| `className` | `string` | `undefined` | Custom CSS classes |

### UploadOptions

```typescript
interface UploadOptions {
  maxFileSize?: number        // Max file size in bytes (default: 1MB)
  allowedTypes?: FileType[]   // Allowed file extensions (default: ['md', 'txt'])
  generateInsights?: boolean  // Generate insights from content (default: true)
  generateEmbeddings?: boolean // Generate embeddings for search (default: true)
  timeout?: number           // Upload timeout in ms (default: 60000)
}
```

## Events and Callbacks

### onUploadComplete
Called when files are successfully uploaded.

```typescript
const handleUploadComplete = (results: UploadResult[]) => {
  results.forEach(result => {
    console.log(`✅ ${result.filename}`)
    console.log(`   Document ID: ${result.documentId}`)
    console.log(`   Chunks: ${result.chunksCreated}`)
    console.log(`   Insights: ${result.insightsGenerated}`)
  })
}
```

### onUploadError
Called when uploads fail.

```typescript
const handleUploadError = (errors: UploadErrorResponse[]) => {
  errors.forEach(error => {
    console.error(`❌ ${error.message}`)
    console.error(`   Code: ${error.code}`)
    console.error(`   Action: ${error.action}`)
    
    if (error.action === 'RETRY') {
      // Show retry button
    }
  })
}
```

### onUploadProgress
Called during upload with progress information.

```typescript
const handleUploadProgress = (progress: UploadProgress[]) => {
  const currentProgress = progress[0]
  if (currentProgress) {
    console.log(`${currentProgress.percentage}% complete`)
    if (currentProgress.speed) {
      console.log(`Speed: ${formatBytes(currentProgress.speed)}/s`)
    }
    if (currentProgress.remainingTime) {
      console.log(`ETA: ${formatTime(currentProgress.remainingTime)}`)
    }
  }
}
```

## Styling and Themes

The component uses Tailwind CSS and CSS variables for theming. It automatically supports light and dark themes through the existing design system.

### CSS Variables Used
- `--background`: Background color
- `--foreground`: Text color
- `--muted`: Muted background
- `--muted-foreground`: Muted text
- `--border`: Border color
- `--input`: Input border color
- `--primary`: Primary accent color
- `--primary-foreground`: Primary text color
- `--destructive`: Error color
- `--ring`: Focus ring color

### Custom Styling

```tsx
<FileUpload
  userId="user-123"
  className="
    border-2 border-dashed border-gray-300 rounded-xl p-8
    hover:border-blue-400 hover:bg-blue-50/50
    focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20
    transition-all duration-200
  "
/>
```

## Accessibility

The component follows WAI-ARIA guidelines and provides:

- **Keyboard Navigation**: Full keyboard support with Tab/Enter
- **Screen Reader Support**: Proper ARIA labels and descriptions
- **Focus Management**: Clear focus indicators and logical tab order
- **Error Announcement**: Errors are announced to screen readers
- **Progress Updates**: Upload progress is accessible
- **State Communication**: Current state is clearly communicated

### ARIA Attributes Used
- `role="button"` on the drop zone
- `aria-label` for interactive elements
- `aria-describedby` for descriptions
- `aria-disabled` for disabled state
- `tabIndex` for keyboard navigation

## Integration with Chat System

### Basic Integration

```tsx
function ChatInterface() {
  const [showUpload, setShowUpload] = useState(false)

  return (
    <div>
      <button onClick={() => setShowUpload(!showUpload)}>
        {showUpload ? 'Hide Upload' : 'Upload Document'}
      </button>
      
      {showUpload && (
        <FileUpload
          userId="user-123"
          onUploadComplete={(results) => {
            // Add system message to chat
            addChatMessage({
              type: 'system',
              content: `Successfully uploaded ${results.length} document(s). You can now ask questions about the content.`
            })
            setShowUpload(false)
          }}
        />
      )}
    </div>
  )
}
```

### Advanced Chat Integration

```tsx
function AdvancedChatIntegration() {
  const { addMessage, updateContext } = useChatSystem()

  const handleUploadSuccess = (results: UploadResult[]) => {
    // Update chat context
    results.forEach(result => {
      updateContext({
        type: 'document',
        id: result.documentId,
        name: result.filename,
        chunks: result.chunksCreated,
        insights: result.insightsGenerated,
      })
    })

    // Add contextual message
    addMessage({
      type: 'system',
      content: `📄 Uploaded: ${results.map(r => r.filename).join(', ')}\n\nI can now help you analyze this content, extract insights, or generate solutions based on the document.`,
      metadata: {
        documentIds: results.map(r => r.documentId),
        uploadTimestamp: Date.now(),
      }
    })
  }

  return (
    <FileUpload
      userId="user-123"
      onUploadComplete={handleUploadSuccess}
      onUploadError={(errors) => {
        addMessage({
          type: 'error',
          content: `Upload failed: ${errors.map(e => e.message).join(', ')}`,
        })
      }}
    />
  )
}
```

## Error Handling

The component provides comprehensive error handling:

### Client-Side Validation
- File type validation
- File size validation
- Filename length validation
- Empty file detection
- Duplicate file detection

### Server-Side Errors
- Network errors
- Authentication errors
- Processing errors
- Timeout errors

### Error Recovery
- Automatic retry for transient errors
- Manual retry for failed uploads
- Clear error messages and actions
- Graceful degradation

## Performance Considerations

### Upload Optimization
- Chunked uploads for large files (handled by upload client)
- Progress tracking with minimal re-renders
- Efficient file validation
- Memory-conscious file handling

### UI Performance
- Debounced drag events
- Optimized re-rendering with React.memo patterns
- Efficient state updates
- Minimal DOM manipulations

## Browser Support

- **Modern Browsers**: Full support with drag-and-drop
- **Legacy Browsers**: Graceful fallback to basic file input
- **Mobile Devices**: Touch-friendly interface
- **Screen Readers**: Full accessibility support

### Required APIs
- File API
- Drag and Drop API (optional)
- XMLHttpRequest (for progress tracking)
- FormData API

## Testing

Run the component tests:

```bash
npm test -- src/components/upload/__tests__/
```

### Test Coverage
- ✅ File validation logic
- ✅ Upload state management
- ✅ Progress tracking
- ✅ Error handling
- ✅ Type definitions
- ✅ Accessibility features

## Troubleshooting

### Common Issues

**Files not uploading**
- Check user authentication
- Verify file type and size limits
- Check network connectivity
- Review browser console for errors

**Drag and drop not working**
- Ensure modern browser support
- Check for conflicting event handlers
- Verify component is not disabled

**Progress not updating**
- Check upload client configuration
- Verify progress callback is provided
- Review network conditions

**Styling issues**
- Ensure Tailwind CSS is properly configured
- Check CSS variable definitions
- Verify theme system is working

### Debug Mode

Enable detailed logging:

```tsx
<FileUpload
  userId="user-123"
  options={{
    // This will be passed to the upload client
    enableLogging: true
  }}
/>
```

## Contributing

When contributing to the FileUpload component:

1. Follow existing TypeScript patterns
2. Maintain accessibility standards
3. Add appropriate tests
4. Update documentation
5. Test across browsers and devices

## Related Components

- `ChatContainer`: Main chat interface
- `MessageInput`: Text message input
- `PickerInterface`: Context selection interface
- `ContextLoader`: Document context management
# AI SDK v5 Integration Reference

## Overview

The JTBD Assistant Platform integrates with Vercel's AI SDK v5 for local AI generation when DSPy services are unavailable. This document provides comprehensive guidance for working with AI SDK v5 in our TypeScript services.

## Key Integration Points

### 1. HMW Fallback Generation
- **Location**: `src/lib/services/intelligence/hmw-fallback.ts`
- **Purpose**: Local HMW generation when DSPy Python service fails
- **Model**: OpenAI GPT-5-nano via AI SDK v5

### 2. Future Integrations
- Solution fallback generation (Task 7.2)
- Chat streaming responses (Task 9.1)
- General exploration responses (Task 9.2)

## Core AI SDK v5 Patterns

### Basic generateText Usage

```typescript
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { config } from '../../config'

const model = openai(config.openai.model) // 'gpt-5-nano'

const result = await generateText({
  model,
  system: 'You are an expert product strategist...',
  prompt: 'Generate 5 HMW questions based on...',
  temperature: 0.7,
  maxTokens: 1000,
  maxRetries: 2
})

console.log(result.text)
console.log(result.usage) // Token usage information
```

### Error Handling Pattern

```typescript
try {
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature,
    maxTokens: 1000,
    maxRetries: 2
  })
  
  return processResults(result.text)
  
} catch (error) {
  logger.error('AI generation failed', {
    error: error instanceof Error ? error.message : String(error)
  })
  
  if (error instanceof Error && error.name === 'AbortError') {
    throw new ServiceTimeoutError('AI generation timed out')
  }
  
  throw new AIGenerationError('Failed to generate content', 'AI_GENERATION_FAILED', error)
}
```

### Performance Tracking Integration

```typescript
import { startPerformance, endPerformance } from '../../logger'

async function generateWithTracking() {
  const trackingId = startPerformance('ai_generation')
  
  try {
    const result = await generateText({ /* config */ })
    
    endPerformance(trackingId, true, {
      tokenCount: result.usage.totalTokens,
      model: config.openai.model
    })
    
    return result
    
  } catch (error) {
    endPerformance(trackingId, false, {
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}
```

## Configuration Management

### Environment Variables
```typescript
// Required in .env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano           // Default model
OPENAI_MAX_TOKENS=4000            // Default max tokens
OPENAI_TEMPERATURE=0.7            // Default temperature
```

### Config Schema (`src/lib/config/env.schema.ts`)
```typescript
const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  model: z.string().default('gpt-5-nano'),
  embeddingModel: z.string().default('text-embedding-3-small'),
  maxTokens: z.number().int().positive().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
})
```

### Usage in Services
```typescript
import { config } from '../../config'

const model = openai(config.openai.model)
const maxTokens = config.openai.maxTokens
const temperature = config.openai.temperature
```

## Best Practices

### 1. System Prompts
Always use clear, specific system prompts:

```typescript
const buildSystemPrompt = (): string => {
  return `You are an expert product strategist specializing in generating How Might We (HMW) questions.

Your role is to analyze customer insights, metrics, and jobs-to-be-done (JTBDs) to create actionable HMW questions that:
- Start with exactly "How might we" (proper capitalization)
- End with a question mark
- Are specific and actionable
- Build directly on the provided context

Guidelines:
1. Every question MUST start with "How might we" - no exceptions
2. Focus on the most impactful opportunities from the context
3. Make questions specific enough to be actionable
4. Return exactly the requested number of questions

Format each response as numbered questions only.`
}
```

### 2. Input Validation
Always validate inputs before AI generation:

```typescript
private validateInput(context: HMWContext): void {
  if (!this.hasValidContext(context)) {
    throw new ValidationError('At least one context type must be provided')
  }
  
  // Additional validation...
}
```

### 3. Response Processing
Parse and normalize AI responses:

```typescript
private parseHMWsFromText(text: string): string[] {
  const lines = text.split('\n')
  const hmws: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      // Remove numbering (1., 2., etc.)
      const cleaned = trimmed.replace(/^\d+\.\s*/, '')
      if (cleaned.length > 15) { // Minimum reasonable HMW length
        hmws.push(cleaned)
      }
    }
  }

  return hmws
}
```

### 4. Model Selection
Use appropriate models for different tasks:

```typescript
// For precise, structured generation (HMWs, solutions)
const precisionModel = openai('gpt-5-nano')

// For creative, exploratory generation (general chat)
const creativeModel = openai('gpt-4o')

// For embeddings (always use this)
const embeddingModel = openai.embedding('text-embedding-3-small')
```

## Token Management

### Cost Estimation
```typescript
// Rough token estimation (4 chars = 1 token)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4)
}

// Pre-generation cost check
const totalInputTokens = estimateTokens(systemPrompt + userPrompt)
if (totalInputTokens > config.openai.maxTokens * 0.8) {
  throw new ValidationError('Input too long, may exceed token limit')
}
```

### Token Budget Tracking
```typescript
interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

const trackTokenUsage = (usage: TokenUsage) => {
  logger.info('AI generation completed', {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    model: config.openai.model
  })
}
```

## Testing Patterns

### Mocking AI SDK
```typescript
// Mock the AI SDK for testing
jest.mock('ai', () => ({
  generateText: jest.fn()
}))

jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn(() => 'mock-model')
}))

// In tests
import { generateText } from 'ai'
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>

beforeEach(() => {
  mockGenerateText.mockClear()
})

it('should generate valid responses', async () => {
  const mockResponse = {
    text: '1. How might we improve user experience?',
    usage: { totalTokens: 50 }
  }
  
  mockGenerateText.mockResolvedValue(mockResponse as any)
  
  const result = await service.generateContent()
  
  expect(mockGenerateText).toHaveBeenCalledWith({
    model: 'mock-model',
    system: expect.stringContaining('expert'),
    prompt: expect.any(String),
    temperature: 0.7,
    maxTokens: 1000,
    maxRetries: 2
  })
  
  expect(result).toBeDefined()
})
```

### Integration Testing
```typescript
// Test with actual OpenAI (use sparingly, only in CI)
describe('AI Integration', () => {
  beforeAll(() => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Skipping AI integration tests - no API key')
      return
    }
  })
  
  it('should generate real responses', async () => {
    if (!process.env.OPENAI_API_KEY) return
    
    const result = await actualService.generateContent()
    expect(result.length).toBeGreaterThan(0)
  }, 30000) // 30s timeout for real API calls
})
```

## Performance Optimization

### Request Optimization
```typescript
// Optimize for speed vs quality
const fastGeneration = {
  temperature: 0.3,      // Lower temperature for faster, more deterministic responses
  maxTokens: 500,        // Limit tokens for faster responses
  maxRetries: 1          // Reduce retries for speed
}

const qualityGeneration = {
  temperature: 0.8,      // Higher temperature for more creative responses
  maxTokens: 1500,       // Allow more tokens for detailed responses
  maxRetries: 3          // More retries for reliability
}
```

### Caching Strategy
```typescript
// Simple in-memory cache for repeated requests
const responseCache = new Map<string, any>()

const getCacheKey = (system: string, prompt: string, temperature: number): string => {
  return `${system}:${prompt}:${temperature}`
}

const generateWithCache = async (config: GenerateTextConfig) => {
  const cacheKey = getCacheKey(config.system, config.prompt, config.temperature)
  
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey)
  }
  
  const result = await generateText(config)
  responseCache.set(cacheKey, result)
  
  return result
}
```

## Error Handling

### Common Error Types
```typescript
// Network/connectivity errors
catch (error) {
  if (error.message.includes('network') || error.message.includes('fetch')) {
    throw new NetworkError('Failed to connect to OpenAI API')
  }
}

// Rate limiting
catch (error) {
  if (error.message.includes('rate') || error.message.includes('quota')) {
    throw new RateLimitError('OpenAI API rate limit exceeded')
  }
}

// Invalid API key
catch (error) {
  if (error.message.includes('unauthorized') || error.message.includes('401')) {
    throw new AuthenticationError('Invalid OpenAI API key')
  }
}
```

### Retry Strategy
```typescript
const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries) throw error
      
      // Don't retry on certain errors
      if (isNonRetryableError(error)) throw error
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Retry logic failed')
}
```

## Monitoring and Observability

### Logging Standards
```typescript
// Always log AI generation events
logger.info('AI generation started', {
  model: config.openai.model,
  estimatedTokens: estimateTokens(prompt),
  temperature,
  service: 'hmw-fallback'
})

logger.info('AI generation completed', {
  model: config.openai.model,
  actualTokens: result.usage.totalTokens,
  duration: Date.now() - startTime,
  service: 'hmw-fallback'
})

// Log failures with context
logger.error('AI generation failed', {
  model: config.openai.model,
  error: error.message,
  prompt: prompt.slice(0, 100), // Truncated for privacy
  service: 'hmw-fallback'
})
```

### Metrics Collection
```typescript
// Track generation metrics
const metrics = {
  generations: 0,
  totalTokens: 0,
  totalDuration: 0,
  failures: 0
}

const updateMetrics = (usage: TokenUsage, duration: number, failed: boolean = false) => {
  metrics.generations += 1
  metrics.totalTokens += usage.totalTokens
  metrics.totalDuration += duration
  if (failed) metrics.failures += 1
}
```

## Migration Guidelines

### From AI SDK v3/v4 to v5
1. Update imports: `import { generateText } from 'ai'`
2. Model initialization: `openai(modelName)` instead of `new OpenAI()`
3. Response structure: `result.text` instead of `result.choices[0].message.content`
4. Usage tracking: `result.usage` is now consistently available

### Breaking Changes
- Model provider imports changed: `@ai-sdk/openai` instead of `ai/openai`
- Response format standardized across providers
- Error handling improved with consistent error types

## Security Considerations

### API Key Management
```typescript
// Never log API keys
const sanitizeForLogging = (config: any) => ({
  ...config,
  apiKey: '[REDACTED]'
})

// Validate API key format
const validateApiKey = (key: string): boolean => {
  return key.startsWith('sk-') && key.length > 20
}
```

### Input Sanitization
```typescript
// Sanitize user inputs before AI generation
const sanitizePrompt = (prompt: string): string => {
  // Remove potential injection attempts
  return prompt
    .replace(/\b(ignore|forget|system|assistant)\b/gi, '[FILTERED]')
    .slice(0, 10000) // Limit length
}
```

## Future Considerations

### Streaming Support (for Task 9.1)
```typescript
import { streamText } from 'ai'

const streamResponse = await streamText({
  model: openai('gpt-5-nano'),
  prompt: 'Generate a response...',
  temperature: 0.7
})

// Stream handling
for await (const chunk of streamResponse.textStream) {
  console.log(chunk)
}
```

### Tool Calling (for advanced features)
```typescript
const result = await generateText({
  model: openai('gpt-4o'),
  tools: {
    searchDatabase: {
      description: 'Search the knowledge base',
      parameters: z.object({
        query: z.string().describe('Search query')
      }),
      execute: async ({ query }) => {
        return await searchKnowledgeBase(query)
      }
    }
  },
  prompt: 'Help me find information about...'
})
```

## Related Documentation

- [DSPy Integration](./dspy-integration.md) - How AI SDK v5 complements DSPy services
- [Services Architecture](./services-architecture.md) - Overall service design patterns
- [Configuration](./configuration.md) - Environment and runtime configuration
- [API Endpoints](./api-endpoints.md) - Public API that uses AI generation

## External Resources

- [AI SDK v5 Documentation](https://sdk.vercel.ai/docs)
- [OpenAI Models Reference](https://platform.openai.com/docs/models)
- [AI SDK GitHub Repository](https://github.com/vercel/ai)
- [GPT-5 Model Documentation](https://platform.openai.com/docs/models/gpt-5)
/**
 * Test setup and configuration
 * Global setup for all service tests
 */

// Global test timeout
jest.setTimeout(30000)

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.OPENAI_API_KEY = 'test-api-key'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.DSPY_API_KEY = 'test-dspy-key'

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console }

beforeAll(() => {
  console.log = jest.fn()
  console.info = jest.fn()
  console.warn = jest.fn()
  console.error = jest.fn()
})

afterAll(() => {
  Object.assign(console, originalConsole)
})

// Global test utilities
export const createMockDocument = (overrides?: any) => ({
  content: 'This is a test document with sufficient content for validation.',
  filename: 'test.txt',
  metadata: { test: true },
  ...overrides
})

export const createLongText = (wordCount: number = 1000): string => {
  return Array(wordCount).fill(0).map((_, i) => `word${i}`).join(' ')
}

export const createMarkdownDocument = (): string => {
  return `# Main Title

This is the introduction paragraph with some meaningful content.

## Section 1

Content for the first section goes here. It includes multiple sentences to ensure proper chunking.

### Subsection 1.1

More detailed content in a subsection.

## Section 2

Content for the second section.

- List item 1
- List item 2
- List item 3

### Subsection 2.1

Final subsection with concluding remarks.`
}

export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Test data generators
export const generateTestChunks = (count: number) => {
  return Array(count).fill(0).map((_, i) => ({
    content: `Test chunk content ${i + 1} with sufficient text.`,
    index: i,
    tokenCount: 15 + i,
    startIndex: i * 50,
    endIndex: (i + 1) * 50 - 1,
    metadata: { chunkNumber: i + 1 }
  }))
}

export const generateTestTexts = (count: number): string[] => {
  return Array(count).fill(0).map((_, i) => 
    `Test text number ${i + 1} with different content to ensure uniqueness.`
  )
}

// Performance testing utilities
export const measureExecutionTime = async <T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> => {
  const start = Date.now()
  const result = await fn()
  const duration = Date.now() - start
  return { result, duration }
}

// Error testing utilities
export const expectAsyncError = async (
  fn: () => Promise<any>,
  expectedError?: string | RegExp
): Promise<Error> => {
  try {
    await fn()
    throw new Error('Expected function to throw an error')
  } catch (error) {
    if (expectedError) {
      if (typeof expectedError === 'string') {
        expect(error.message).toContain(expectedError)
      } else {
        expect(error.message).toMatch(expectedError)
      }
    }
    return error as Error
  }
}

// Mock data for integration tests
export const mockEmbedding = Array(1536).fill(0).map(() => Math.random() - 0.5)

export const mockSearchResults = [
  {
    id: 'test-id-1',
    content: 'First test result content',
    similarity: 0.9,
    metadata: { source: 'test' }
  },
  {
    id: 'test-id-2', 
    content: 'Second test result content',
    similarity: 0.8,
    metadata: { source: 'test' }
  }
]

// Cleanup utilities
export const cleanupTestData = () => {
  // Clear any global state or caches
  // This would be called in afterEach hooks
}

export default {
  createMockDocument,
  createLongText,
  createMarkdownDocument,
  waitFor,
  generateTestChunks,
  generateTestTexts,
  measureExecutionTime,
  expectAsyncError,
  mockEmbedding,
  mockSearchResults,
  cleanupTestData
}
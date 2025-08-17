// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Global test utilities
global.console = {
  ...console,
  // Suppress specific console methods during tests to reduce noise
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.SUPABASE_URL = 'https://test-project.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.PYTHON_SERVICE_URL = 'http://localhost:8000'
process.env.PYTHON_API_KEY = 'test-python-key'

// Mock performance.now for consistent timing in tests
const mockPerformanceNow = () => Date.now()
global.performance = {
  now: mockPerformanceNow,
}

// Jest timeout for async operations
jest.setTimeout(30000)
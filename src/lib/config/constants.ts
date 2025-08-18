/**
 * Application-wide constants
 * Centralizes all magic numbers, thresholds, and configuration values
 * Following YAGNI principle - only constants currently needed
 */

// API Timeouts (milliseconds)
export const TIMEOUTS = {
  DSPY_SERVICE: 30000,      // 30 seconds for DSPy operations
  OPENAI_API: 30000,        // 30 seconds for OpenAI direct calls
  DATABASE: 10000,          // 10 seconds for database operations
  VECTOR_SEARCH: 5000,      // 5 seconds for vector searches
  HTTP_REQUEST: 15000,      // 15 seconds for general HTTP requests
  FALLBACK_GENERATION: 15000, // Shorter timeout for fallback calls
} as const

// Database Limits and Constraints
export const DATABASE_LIMITS = {
  MAX_FILE_SIZE_BYTES: 1048576,     // 1MB file upload limit
  MAX_CHUNK_TOKENS: 1000,           // Maximum tokens per document chunk
  MIN_CHUNK_TOKENS: 100,            // Minimum tokens per document chunk
  CHUNK_OVERLAP_TOKENS: 200,        // Token overlap between chunks
  MAX_SEARCH_RESULTS: 100,          // Maximum vector search results
  MAX_CHAT_CONTEXT_TOKENS: 4000,    // Chat context token limit
  MAX_INSIGHTS_PER_DOCUMENT: 50,    // Maximum insights per document
  MAX_SOLUTIONS_PER_REQUEST: 20,    // Maximum solutions generated per request
  MAX_HMWS_PER_REQUEST: 15,         // Maximum HMWs generated per request
} as const

// Vector Search Configuration
export const VECTOR_SEARCH = {
  EMBEDDING_DIMENSIONS: 1536,       // OpenAI text-embedding-3-small dimensions
  SIMILARITY_THRESHOLD: 0.7,        // Minimum similarity for relevance
  DEFAULT_MATCH_COUNT: 100,         // Default number of matches to return
  MIN_SIMILARITY_THRESHOLD: 0.5,    // Absolute minimum similarity
  MAX_SIMILARITY_THRESHOLD: 0.95,   // Maximum similarity threshold
  INDEX_TYPE: 'ivfflat',            // pgvector index type
} as const

// Scoring Ranges
export const SCORING = {
  MIN_SCORE: 1,                     // Minimum score value
  MAX_SCORE: 10,                    // Maximum score value
  DEFAULT_IMPACT_SCORE: 5,          // Default impact score for fallback
  DEFAULT_EFFORT_SCORE: 5,          // Default effort score for fallback
  MIN_CONFIDENCE: 0.0,              // Minimum confidence score
  MAX_CONFIDENCE: 1.0,              // Maximum confidence score
  MIN_PRIORITY: 1,                  // Highest priority (lowest number)
  MAX_PRIORITY: 5,                  // Lowest priority (highest number)
} as const

// OpenAI Model Configuration
export const OPENAI_MODELS = {
  CHAT_PRIMARY: 'gpt-4o-mini',           // Primary chat model
  CHAT_FALLBACK: 'gpt-4o-mini',          // Fallback chat model
  EMBEDDING: 'text-embedding-3-small',   // Embedding model
  MAX_TOKENS_CHAT: 4000,                 // Maximum tokens for chat completion
  MAX_TOKENS_GENERATION: 2000,           // Maximum tokens for content generation
  TEMPERATURE_DEFAULT: 0.7,              // Default temperature
  TEMPERATURE_CREATIVE: 0.9,             // Higher temperature for creative tasks
  TEMPERATURE_FACTUAL: 0.3,              // Lower temperature for factual tasks
} as const

// File Processing
export const FILE_PROCESSING = {
  ALLOWED_EXTENSIONS: ['md', 'txt'],     // Allowed file extensions
  MAX_FILENAME_LENGTH: 255,              // Maximum filename length
  ENCODING: 'utf-8',                     // File encoding
  CONTENT_TYPE_TEXT: 'text/plain',       // MIME type for text files
  CONTENT_TYPE_MARKDOWN: 'text/markdown', // MIME type for markdown files
} as const

// Retry Configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,                   // Maximum retry attempts
  INITIAL_DELAY: 1000,              // Initial retry delay (milliseconds)
  MAX_DELAY: 10000,                 // Maximum retry delay
  BACKOFF_MULTIPLIER: 2,            // Exponential backoff multiplier
  JITTER_FACTOR: 0.1,               // Random jitter factor (0-1)
} as const

// Chat Configuration
export const CHAT = {
  MAX_MESSAGE_LENGTH: 10000,        // Maximum message length
  MAX_MESSAGES_PER_CHAT: 1000,      // Maximum messages per chat session
  TRUNCATION_THRESHOLD: 0.8,        // When to start truncating (80% of token limit)
  MIN_PRESERVED_MESSAGES: 5,        // Minimum messages to preserve when truncating
  DEFAULT_CHAT_TITLE: 'New Chat',   // Default title for new chats
  MAX_CHAT_TITLE_LENGTH: 100,       // Maximum chat title length
} as const

// Intent Detection Keywords
export const INTENT_KEYWORDS = {
  INSIGHTS: ['insights', 'what did we learn', 'learnings', 'findings'],
  METRICS: ['metrics', 'measure', 'kpi', 'performance'],
  JTBDS: ['jtbd', 'job to be done', 'jobs to be done'],
  HMW: ['hmw', 'how might we', 'generate questions'],
  SOLUTIONS: ['solution', 'solve', 'ideas', 'recommendations'],
} as const

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const

// Error Codes (matching the standardized error format)
export const ERROR_CODES = {
  // Configuration errors
  MISSING_CONFIG: 'MISSING_CONFIG',
  INVALID_API_KEY: 'INVALID_API_KEY',
  INVALID_ENVIRONMENT: 'INVALID_ENVIRONMENT',
  
  // Service communication errors
  DSPY_MODULE_ERROR: 'DSPY_MODULE_ERROR',
  DSPY_TIMEOUT: 'DSPY_TIMEOUT',
  DSPY_CONNECTION_FAILED: 'DSPY_CONNECTION_FAILED',
  
  // Processing errors
  CHAIN_TIMEOUT: 'CHAIN_TIMEOUT',
  GENERATION_FAILED: 'GENERATION_FAILED',
  EMBEDDING_FAILED: 'EMBEDDING_FAILED',
  
  // Data validation errors
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  
  // File processing errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_INVALID: 'FILE_TYPE_INVALID',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  
  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',
  VECTOR_SEARCH_FAILED: 'VECTOR_SEARCH_FAILED',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

// Default UUIDs (seeded in database)
export const DEFAULT_IDS = {
  // This will be set from environment or database query
  DEFAULT_METRIC_ID: process.env.DEFAULT_METRIC_ID || null,
} as const

// Rate Limiting
export const RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 60,          // API requests per minute per user
  UPLOADS_PER_HOUR: 20,             // File uploads per hour per user
  CHAT_MESSAGES_PER_MINUTE: 30,     // Chat messages per minute per user
  VECTOR_SEARCHES_PER_MINUTE: 100,  // Vector searches per minute per user
} as const

// Logging Configuration
export const LOGGING = {
  MAX_LOG_LENGTH: 1000,             // Maximum length of logged strings
  SENSITIVE_FIELDS: [               // Fields to redact in logs
    'apiKey', 'password', 'token', 'secret', 'key', 'authorization'
  ],
  PERFORMANCE_THRESHOLD: 1000,      // Log performance warnings above 1s
} as const

// Environment-specific overrides
export const ENVIRONMENT_OVERRIDES = {
  development: {
    logLevel: 'debug',
    enableDetailedErrors: true,
    enablePerformanceLogging: true,
  },
  staging: {
    logLevel: 'info',
    enableDetailedErrors: true,
    enablePerformanceLogging: false,
  },
  production: {
    logLevel: 'warn',
    enableDetailedErrors: false,
    enablePerformanceLogging: false,
  },
} as const
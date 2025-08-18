import { z } from 'zod'

/**
 * Environment validation schemas using Zod for type-safe configuration
 * Provides runtime validation of all required environment variables
 */

// Log levels enum
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

// Environment types
const EnvironmentSchema = z.enum(['development', 'staging', 'production'])

// OpenAI configuration schema
const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  model: z.string().default('gpt-5-nano'),
  embeddingModel: z.string().default('text-embedding-3-small'),
  maxTokens: z.number().int().positive().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
})

// Supabase configuration schema
const SupabaseConfigSchema = z.object({
  url: z.string().url('Supabase URL must be a valid URL'),
  anonKey: z.string().min(1, 'Supabase anonymous key is required'),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelay: z.number().int().positive().default(1000), // milliseconds
  connectionTimeout: z.number().int().positive().default(10000), // 10 seconds
})

// DSPy service configuration schema
const DSPyConfigSchema = z.object({
  serviceUrl: z.string().url('DSPy service URL must be a valid URL').default('http://localhost:8000'),
  apiKey: z.string().min(1, 'DSPy API key is required'),
  timeout: z.number().int().positive().default(30000), // 30 seconds
  fallbackEnabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(5).default(1),
})

// Application configuration schema
const AppConfigSchema = z.object({
  environment: EnvironmentSchema.default('development'),
  logLevel: LogLevelSchema.default('info'),
  port: z.number().int().positive().default(3000),
  defaultUserId: z.string().uuid().optional(), // For development testing
})

// Vector search configuration schema
const VectorConfigSchema = z.object({
  dimensions: z.number().int().positive().default(1536), // OpenAI text-embedding-3-small
  similarityThreshold: z.number().min(0).max(1).default(0.7),
  maxResults: z.number().int().positive().default(100),
  indexType: z.string().default('ivfflat'),
})

// File upload configuration schema
const FileConfigSchema = z.object({
  maxSizeBytes: z.number().int().positive().default(1048576), // 1MB
  allowedTypes: z.array(z.string()).default(['md', 'txt']),
  chunkSizeTokens: z.number().int().positive().default(1000),
  chunkOverlapTokens: z.number().int().min(0).default(200),
})

// Complete environment configuration schema
export const EnvironmentConfigSchema = z.object({
  openai: OpenAIConfigSchema,
  supabase: SupabaseConfigSchema,
  dspy: DSPyConfigSchema,
  app: AppConfigSchema,
  vector: VectorConfigSchema,
  file: FileConfigSchema,
})

// Raw environment variables schema for validation
export const RawEnvironmentSchema = z.object({
  // Required environment variables
  OPENAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  DSPY_API_KEY: z.string().min(1),
  
  // Optional environment variables with defaults
  NODE_ENV: z.string().optional(),
  DSPY_SERVICE_URL: z.string().url().optional(),
  LOG_LEVEL: LogLevelSchema.optional(),
  PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  
  // Development-specific variables
  DEFAULT_USER_ID: z.string().uuid().optional(),
  
  // Performance tuning variables
  OPENAI_MAX_TOKENS: z.string().regex(/^\d+$/).transform(Number).optional(),
  OPENAI_TEMPERATURE: z.string().regex(/^\d*\.?\d+$/).transform(Number).optional(),
  SUPABASE_MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).optional(),
  SUPABASE_RETRY_DELAY: z.string().regex(/^\d+$/).transform(Number).optional(),
  DSPY_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).optional(),
  VECTOR_SIMILARITY_THRESHOLD: z.string().regex(/^\d*\.?\d+$/).transform(Number).optional(),
  FILE_MAX_SIZE_MB: z.string().regex(/^\d+$/).transform(Number).transform(mb => mb * 1024 * 1024).optional(),
})

// Type exports for TypeScript usage
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>
export type RawEnvironment = z.infer<typeof RawEnvironmentSchema>
export type LogLevel = z.infer<typeof LogLevelSchema>
export type Environment = z.infer<typeof EnvironmentSchema>

// Helper function to determine environment
export const getEnvironment = (): Environment => {
  const nodeEnv = process.env.NODE_ENV as string | undefined
  
  if (nodeEnv === 'production') return 'production'
  if (nodeEnv === 'staging') return 'staging'
  return 'development'
}

// Helper function to get default log level based on environment
export const getDefaultLogLevel = (env: Environment): LogLevel => {
  switch (env) {
    case 'development':
      return 'debug'
    case 'staging':
      return 'info'
    case 'production':
      return 'warn'
    default:
      return 'info'
  }
}
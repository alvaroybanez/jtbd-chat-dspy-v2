import { z } from 'zod'
import {
  EnvironmentConfigSchema,
  RawEnvironmentSchema,
  getEnvironment,
  getDefaultLogLevel,
  type EnvironmentConfig,
  type RawEnvironment,
  type Environment,
  type LogLevel
} from './env.schema'

/**
 * Centralized configuration management with runtime validation
 * Implements singleton pattern with lazy initialization and fail-fast validation
 */

class ConfigurationManager {
  private static instance: ConfigurationManager | null = null
  private _config: EnvironmentConfig | null = null
  private _isInitialized = false
  private _environment: Environment

  private constructor() {
    this._environment = getEnvironment()
  }

  /**
   * Get the singleton configuration instance
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager()
    }
    return ConfigurationManager.instance
  }

  /**
   * Initialize configuration with validation
   * This method is called automatically on first access
   */
  private initialize(): void {
    if (this._isInitialized) {
      return
    }

    try {
      // Parse and validate raw environment variables
      const rawEnv = this.parseRawEnvironment()
      
      // Transform raw environment to typed configuration
      this._config = this.transformToConfig(rawEnv)
      
      // Validate final configuration
      const validatedConfig = EnvironmentConfigSchema.parse(this._config)
      this._config = validatedConfig
      
      this._isInitialized = true
      
      // Log successful initialization (only in development)
      if (this._environment === 'development') {
        console.log('✅ Configuration initialized successfully')
        console.log(`🌍 Environment: ${this._environment}`)
        console.log(`📝 Log Level: ${this._config.app.logLevel}`)
      }
      
    } catch (error) {
      const errorMessage = error instanceof z.ZodError 
        ? this.formatValidationError(error)
        : `Configuration initialization failed: ${error instanceof Error ? error.message : String(error)}`
      
      console.error('❌ Configuration validation failed:')
      console.error(errorMessage)
      
      // Fail fast - exit process on configuration errors (server-side only)
      if (typeof process !== 'undefined' && process.exit) {
        process.exit(1)
      } else {
        // In browser environment, throw error instead of exiting
        throw new Error(`Configuration validation failed: ${errorMessage}`)
      }
    }
  }

  /**
   * Parse raw environment variables with validation
   */
  private parseRawEnvironment(): RawEnvironment {
    // In browser environment, provide default values or use global window variables
    if (typeof process === 'undefined' || !process.env) {
      return RawEnvironmentSchema.parse({
        NODE_ENV: 'development',
        // Browser-safe defaults - these will be overridden by server-side config
        OPENAI_API_KEY: 'browser-placeholder-key',
        SUPABASE_URL: 'https://placeholder.local',
        SUPABASE_ANON_KEY: 'browser-placeholder-key',
        DSPY_API_KEY: 'browser-placeholder-key',
      })
    }
    return RawEnvironmentSchema.parse(process.env)
  }

  /**
   * Transform raw environment variables to typed configuration
   */
  private transformToConfig(rawEnv: RawEnvironment): EnvironmentConfig {
    const environment = this._environment
    const defaultLogLevel = getDefaultLogLevel(environment)

    return {
      openai: {
        apiKey: rawEnv.OPENAI_API_KEY,
        model: 'gpt-5-nano',
        embeddingModel: 'text-embedding-3-small',
        maxTokens: rawEnv.OPENAI_MAX_TOKENS ?? 4000,
        temperature: rawEnv.OPENAI_TEMPERATURE ?? 0.7,
      },
      supabase: {
        url: rawEnv.SUPABASE_URL,
        anonKey: rawEnv.SUPABASE_ANON_KEY,
        maxRetries: rawEnv.SUPABASE_MAX_RETRIES ?? 3,
        retryDelay: rawEnv.SUPABASE_RETRY_DELAY ?? 1000,
        connectionTimeout: 10000,
      },
      dspy: {
        serviceUrl: rawEnv.DSPY_SERVICE_URL ?? 'http://localhost:8000',
        apiKey: rawEnv.DSPY_API_KEY,
        timeout: rawEnv.DSPY_TIMEOUT ?? 30000,
        fallbackEnabled: true,
        maxRetries: 1,
      },
      app: {
        environment,
        logLevel: (rawEnv.LOG_LEVEL as LogLevel) ?? defaultLogLevel,
        port: rawEnv.PORT ?? 3000,
        defaultUserId: rawEnv.DEFAULT_USER_ID,
      },
      vector: {
        dimensions: 1536,
        similarityThreshold: rawEnv.VECTOR_SIMILARITY_THRESHOLD ?? 0.7,
        maxResults: 100,
        indexType: 'ivfflat',
      },
      file: {
        maxSizeBytes: rawEnv.FILE_MAX_SIZE_MB ?? 1048576, // 1MB default
        allowedTypes: ['md', 'txt'],
        chunkSizeTokens: 1000,
        chunkOverlapTokens: 200,
      },
    }
  }

  /**
   * Format Zod validation errors for better readability
   */
  private formatValidationError(error: z.ZodError): string {
    const issues = error.issues.map(issue => {
      const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : ''
      return `  • ${issue.message}${path}`
    })

    return `Environment validation failed:\n${issues.join('\n')}\n\nRequired environment variables:\n  • OPENAI_API_KEY\n  • SUPABASE_URL\n  • SUPABASE_ANON_KEY\n  • DSPY_API_KEY`
  }

  /**
   * Get the validated configuration
   * Initializes configuration on first access
   */
  public get config(): EnvironmentConfig {
    if (!this._isInitialized) {
      this.initialize()
    }
    
    if (!this._config) {
      throw new Error('Configuration not initialized')
    }
    
    return this._config
  }

  /**
   * Get current environment
   */
  public get environment(): Environment {
    return this._environment
  }

  /**
   * Check if running in development mode
   */
  public get isDevelopment(): boolean {
    return this._environment === 'development'
  }

  /**
   * Check if running in production mode
   */
  public get isProduction(): boolean {
    return this._environment === 'production'
  }

  /**
   * Check if running in staging mode
   */
  public get isStaging(): boolean {
    return this._environment === 'staging'
  }

  /**
   * Validate configuration without throwing
   * Returns true if valid, false otherwise
   */
  public validate(): boolean {
    try {
      this.initialize()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get specific configuration section
   */
  public getSection<K extends keyof EnvironmentConfig>(section: K): EnvironmentConfig[K] {
    return this.config[section]
  }

  /**
   * Reset configuration (primarily for testing)
   */
  public reset(): void {
    this._config = null
    this._isInitialized = false
  }
}

// Export singleton instance
const configManager = ConfigurationManager.getInstance()

// Main configuration export - backward compatible with existing usage
// Use a getter to make it lazy and avoid initialization errors on module load
export const config = {
  get openai() { return configManager.config.openai },
  get supabase() { return configManager.config.supabase },
  get dspy() { return configManager.config.dspy },
  get app() { return configManager.config.app },
  get vector() { return configManager.config.vector },
  get file() { return configManager.config.file },
}

// Additional exports for more specific usage
export { configManager }
export type ConfigManager = typeof configManager
export const environment = configManager.environment
export const isDevelopment = configManager.isDevelopment
export const isProduction = configManager.isProduction
export const isStaging = configManager.isStaging

// Legacy validation function for backward compatibility
export function validateConfig(): void {
  if (!configManager.validate()) {
    throw new Error('Configuration validation failed')
  }
}

// Type exports
export type { EnvironmentConfig, Environment, LogLevel }
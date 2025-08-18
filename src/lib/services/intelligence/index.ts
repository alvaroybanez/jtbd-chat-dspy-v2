/**
 * Intelligence Service Module
 * Exports for HMW generation with DSPy and fallback capabilities
 */

// ===== MAIN SERVICE EXPORTS =====
export {
  hmwService as default,
  HMWGenerationService,
  type HMWGenerationOptions
} from './hmw-service'

// ===== DSPY CLIENT EXPORTS =====
export {
  dspyClient,
  DSPyIntelligenceClient,
  type DSPyClientOptions
} from './client'

// ===== FALLBACK SERVICE EXPORTS =====
export {
  hmwFallbackService,
  HMWFallbackService
} from './hmw-fallback'

// ===== TYPE EXPORTS =====
export type {
  // Request/Response types
  HMWContext,
  GenerateHMWRequest,
  GenerateHMWResponse,
  HMWResult,
  SourceReferences,
  MetaInfo,
  
  // Context item types
  ContextItem,
  MetricItem,
  JTBDItem,
  
  // Internal types
  HMWGenerationOptions as InternalHMWOptions,
  FallbackHMWResult,
  
  // Error types
  IntelligenceServiceError,
  DSPyServiceError,
  FallbackGenerationError
} from './types'

// ===== VALIDATION SCHEMA EXPORTS =====
export {
  ContextItemSchema,
  MetricItemSchema,
  JTBDItemSchema,
  HMWContextSchema,
  GenerateHMWRequestSchema
} from './types'
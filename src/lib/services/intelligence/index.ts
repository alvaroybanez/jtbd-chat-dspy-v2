/**
 * Intelligence Service Module
 * Exports for HMW generation and solution creation with DSPy and fallback capabilities
 */

// ===== MAIN SERVICE EXPORTS =====
export {
  hmwService as default,
  HMWGenerationService,
  type HMWGenerationOptions
} from './hmw-service'

export {
  solutionService,
  SolutionGenerationService,
  type SolutionGenerationServiceOptions
} from './solution-service'

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

export {
  solutionFallbackService,
  SolutionFallbackService
} from './solution-fallback'

// ===== TYPE EXPORTS =====
export type {
  // HMW Request/Response types
  HMWContext,
  GenerateHMWRequest,
  GenerateHMWResponse,
  HMWResult,
  
  // Solution Request/Response types
  HMWItem,
  SolutionContext,
  CreateSolutionsRequest,
  CreateSolutionsResponse,
  SolutionResult,
  
  // Shared types
  SourceReferences,
  MetaInfo,
  
  // Context item types
  ContextItem,
  MetricItem,
  JTBDItem,
  
  // Internal types
  HMWGenerationOptions as InternalHMWOptions,
  SolutionGenerationOptions,
  FallbackHMWResult,
  FallbackSolutionResult,
  
  // Error types
  IntelligenceServiceError,
  DSPyServiceError,
  FallbackGenerationError,
  SolutionGenerationError
} from './types'

// ===== VALIDATION SCHEMA EXPORTS =====
export {
  // Base schemas
  ContextItemSchema,
  MetricItemSchema,
  JTBDItemSchema,
  
  // HMW schemas
  HMWContextSchema,
  GenerateHMWRequestSchema,
  
  // Solution schemas
  HMWItemSchema,
  SolutionContextSchema,
  CreateSolutionsRequestSchema
} from './types'
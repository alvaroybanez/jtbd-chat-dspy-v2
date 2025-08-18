/**
 * Types and interfaces for Intelligence Service
 * Used for DSPy Python service communication and fallback generation
 */

import { z } from 'zod'

// ===== REQUEST TYPES =====

export interface ContextItem {
  id: string
  content: string
}

export interface MetricItem {
  id: string
  name: string
  description?: string
  current_value?: number
  target_value?: number
  unit: string
}

export interface JTBDItem {
  id: string
  statement: string
  context?: string
  priority?: number
}

export interface HMWContext {
  insights: ContextItem[]
  metrics: MetricItem[]
  jtbds: JTBDItem[]
}

export interface GenerateHMWRequest {
  context: HMWContext
  count?: number
  temperature?: number
}

// ===== RESPONSE TYPES =====

export interface SourceReferences {
  insight_ids: string[]
  metric_ids: string[]
  jtbd_ids: string[]
}

export interface HMWResult {
  question: string
  score: number
  source_references: SourceReferences
  confidence?: number
}

export interface MetaInfo {
  duration_ms: number
  retries: number
  model_used: string
  generation_method: 'dspy' | 'fallback'
  timestamp: string
}

export interface GenerateHMWResponse {
  hmws: HMWResult[]
  meta: MetaInfo
  total_hmws: number
}

// ===== ERROR TYPES =====

export class IntelligenceServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'IntelligenceServiceError'
  }
}

export class DSPyServiceError extends IntelligenceServiceError {
  constructor(
    message: string,
    code: string = 'DSPY_SERVICE_ERROR',
    originalError?: unknown
  ) {
    super(message, code, originalError)
    this.name = 'DSPyServiceError'
  }
}

export class FallbackGenerationError extends IntelligenceServiceError {
  constructor(
    message: string,
    code: string = 'FALLBACK_GENERATION_ERROR',
    originalError?: unknown
  ) {
    super(message, code, originalError)
    this.name = 'FallbackGenerationError'
  }
}

// ===== INTERNAL TYPES =====

export interface HMWGenerationOptions {
  count: number
  temperature: number
  maxRetries: number
  timeout: number
}

export interface FallbackHMWResult {
  question: string
  score: number
  reasoning: string
}

// ===== VALIDATION SCHEMAS =====

export const ContextItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1)
})

export const MetricItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  current_value: z.number().optional(),
  target_value: z.number().optional(),
  unit: z.string().min(1)
})

export const JTBDItemSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(10),
  context: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional()
})

export const HMWContextSchema = z.object({
  insights: z.array(ContextItemSchema).default([]),
  metrics: z.array(MetricItemSchema).default([]),
  jtbds: z.array(JTBDItemSchema).default([])
})

export const GenerateHMWRequestSchema = z.object({
  context: HMWContextSchema,
  count: z.number().int().min(1).max(20).default(5),
  temperature: z.number().min(0).max(2).default(0.7)
})
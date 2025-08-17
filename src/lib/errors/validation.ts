import { z } from 'zod'
import { ValidationError, BaseError } from './base'
import { ERROR_CODES } from '../config/constants'

/**
 * Validation error classes for input validation and schema validation
 * Handles Zod validation errors, field validation, and context validation
 */

// Enhanced validation error with field-specific information
export class FieldValidationError extends ValidationError {
  constructor(
    field: string,
    value: unknown,
    requirement: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Field '${field}' is invalid: ${requirement}`,
      field,
      { value, requirement, ...context },
      cause
    )
  }
}

// Required field missing error
export class RequiredFieldError extends FieldValidationError {
  constructor(
    field: string,
    context: Record<string, unknown> = {}
  ) {
    super(field, undefined, 'field is required', context)
  }
}

// Invalid field type error
export class InvalidFieldTypeError extends FieldValidationError {
  constructor(
    field: string,
    value: unknown,
    expectedType: string,
    actualType: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      field,
      value,
      `expected ${expectedType}, got ${actualType}`,
      { expectedType, actualType, ...context }
    )
  }
}

// Field value out of range error
export class FieldRangeError extends FieldValidationError {
  constructor(
    field: string,
    value: number,
    min?: number,
    max?: number,
    context: Record<string, unknown> = {}
  ) {
    const requirement = min !== undefined && max !== undefined
      ? `value must be between ${min} and ${max}`
      : min !== undefined
      ? `value must be at least ${min}`
      : max !== undefined
      ? `value must be at most ${max}`
      : 'value is out of range'
    
    super(field, value, requirement, { min, max, ...context })
  }
}

// String length validation error
export class StringLengthError extends FieldValidationError {
  constructor(
    field: string,
    value: string,
    minLength?: number,
    maxLength?: number,
    context: Record<string, unknown> = {}
  ) {
    const actualLength = value.length
    const requirement = minLength !== undefined && maxLength !== undefined
      ? `length must be between ${minLength} and ${maxLength} characters`
      : minLength !== undefined
      ? `length must be at least ${minLength} characters`
      : maxLength !== undefined
      ? `length must be at most ${maxLength} characters`
      : 'invalid length'
    
    super(
      field,
      value,
      requirement,
      { actualLength, minLength, maxLength, ...context }
    )
  }
}

// Email validation error
export class InvalidEmailError extends FieldValidationError {
  constructor(
    field: string,
    value: string,
    context: Record<string, unknown> = {}
  ) {
    super(field, value, 'must be a valid email address', context)
  }
}

// URL validation error
export class InvalidUrlError extends FieldValidationError {
  constructor(
    field: string,
    value: string,
    context: Record<string, unknown> = {}
  ) {
    super(field, value, 'must be a valid URL', context)
  }
}

// UUID validation error
export class InvalidUuidError extends FieldValidationError {
  constructor(
    field: string,
    value: string,
    context: Record<string, unknown> = {}
  ) {
    super(field, value, 'must be a valid UUID', context)
  }
}

// Array validation error
export class ArrayValidationError extends FieldValidationError {
  constructor(
    field: string,
    arrayLength: number,
    minItems?: number,
    maxItems?: number,
    context: Record<string, unknown> = {}
  ) {
    const requirement = minItems !== undefined && maxItems !== undefined
      ? `array must contain between ${minItems} and ${maxItems} items`
      : minItems !== undefined
      ? `array must contain at least ${minItems} items`
      : maxItems !== undefined
      ? `array must contain at most ${maxItems} items`
      : 'invalid array'
    
    super(
      field,
      arrayLength,
      requirement,
      { arrayLength, minItems, maxItems, ...context }
    )
  }
}

// Enum validation error
export class InvalidEnumError extends FieldValidationError {
  constructor(
    field: string,
    value: string,
    allowedValues: string[],
    context: Record<string, unknown> = {}
  ) {
    super(
      field,
      value,
      `must be one of: ${allowedValues.join(', ')}`,
      { allowedValues, ...context }
    )
  }
}

// Schema validation error (for complex objects)
export class SchemaValidationError extends ValidationError {
  public readonly zodError?: z.ZodError
  public readonly fieldErrors: Record<string, string[]>

  constructor(
    message: string,
    zodError?: z.ZodError,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(message, undefined, context, cause)
    
    this.zodError = zodError
    this.fieldErrors = this.extractFieldErrors(zodError)
  }

  private extractFieldErrors(zodError?: z.ZodError): Record<string, string[]> {
    if (!zodError) return {}
    
    const fieldErrors: Record<string, string[]> = {}
    
    for (const issue of zodError.issues) {
      const field = issue.path.join('.')
      if (!fieldErrors[field]) {
        fieldErrors[field] = []
      }
      fieldErrors[field].push(issue.message)
    }
    
    return fieldErrors
  }

  /**
   * Get formatted error message with field details
   */
  public getDetailedMessage(): string {
    const fieldMessages = Object.entries(this.fieldErrors)
      .map(([field, errors]) => `  ${field}: ${errors.join(', ')}`)
      .join('\n')
    
    return fieldMessages.length > 0 
      ? `${this.message}\nField errors:\n${fieldMessages}`
      : this.message
  }
}

// Context validation error (insufficient data for operations)
export class ContextValidationError extends BaseError {
  constructor(
    operation: string,
    missingItems: string[],
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      ERROR_CODES.INVALID_CONTEXT,
      `Insufficient context for ${operation}. Missing: ${missingItems.join(', ')}`,
      'NONE',
      { operation, missingItems, ...context },
      cause
    )
  }
}

// Business rule validation error
export class BusinessRuleValidationError extends ValidationError {
  constructor(
    rule: string,
    message: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Business rule violation (${rule}): ${message}`,
      rule,
      context,
      cause
    )
  }
}

// JTBD validation errors
export class JTBDValidationError extends FieldValidationError {
  constructor(
    statement: string,
    issue: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      'statement',
      statement,
      `JTBD statement ${issue}`,
      context
    )
  }
}

// HMW validation errors
export class HMWValidationError extends FieldValidationError {
  constructor(
    question: string,
    issue: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      'question',
      question,
      `HMW question ${issue}`,
      context
    )
  }
}

// Solution validation errors
export class SolutionValidationError extends ValidationError {
  constructor(
    field: string,
    value: unknown,
    requirement: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Solution ${field} is invalid: ${requirement}`,
      field,
      { value, requirement, ...context }
    )
  }
}

// Metric validation errors
export class MetricValidationError extends FieldValidationError {
  constructor(
    field: string,
    value: unknown,
    requirement: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      field,
      value,
      `metric ${requirement}`,
      context
    )
  }
}

// File validation errors
export class FileValidationError extends ValidationError {
  constructor(
    filename: string,
    issue: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `File '${filename}' validation failed: ${issue}`,
      'file',
      { filename, issue, ...context },
      cause
    )
  }
}

// Chat validation errors
export class ChatValidationError extends ValidationError {
  constructor(
    field: string,
    value: unknown,
    requirement: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Chat ${field} is invalid: ${requirement}`,
      field,
      { value, requirement, ...context }
    )
  }
}

// Helper function to convert Zod errors to our validation errors
export function fromZodError(
  zodError: z.ZodError,
  context: Record<string, unknown> = {}
): SchemaValidationError {
  return new SchemaValidationError(
    'Schema validation failed',
    zodError,
    context
  )
}

// Helper function to validate required fields
export function validateRequired<T>(
  value: T | undefined | null,
  fieldName: string
): asserts value is T {
  if (value === undefined || value === null) {
    throw new RequiredFieldError(fieldName)
  }
}

// Helper function to validate string length
export function validateStringLength(
  value: string,
  fieldName: string,
  minLength?: number,
  maxLength?: number
): void {
  const length = value.length
  
  if (minLength !== undefined && length < minLength) {
    throw new StringLengthError(fieldName, value, minLength, maxLength)
  }
  
  if (maxLength !== undefined && length > maxLength) {
    throw new StringLengthError(fieldName, value, minLength, maxLength)
  }
}

// Helper function to validate numeric range
export function validateNumericRange(
  value: number,
  fieldName: string,
  min?: number,
  max?: number
): void {
  if (min !== undefined && value < min) {
    throw new FieldRangeError(fieldName, value, min, max)
  }
  
  if (max !== undefined && value > max) {
    throw new FieldRangeError(fieldName, value, min, max)
  }
}

// Helper function to validate array length
export function validateArrayLength<T>(
  array: T[],
  fieldName: string,
  minItems?: number,
  maxItems?: number
): void {
  const length = array.length
  
  if (minItems !== undefined && length < minItems) {
    throw new ArrayValidationError(fieldName, length, minItems, maxItems)
  }
  
  if (maxItems !== undefined && length > maxItems) {
    throw new ArrayValidationError(fieldName, length, minItems, maxItems)
  }
}

// Type guard functions
export function isFieldValidationError(error: unknown): error is FieldValidationError {
  return error instanceof FieldValidationError
}

export function isSchemaValidationError(error: unknown): error is SchemaValidationError {
  return error instanceof SchemaValidationError
}

export function isContextValidationError(error: unknown): error is ContextValidationError {
  return error instanceof ContextValidationError
}

export function isBusinessRuleValidationError(error: unknown): error is BusinessRuleValidationError {
  return error instanceof BusinessRuleValidationError
}
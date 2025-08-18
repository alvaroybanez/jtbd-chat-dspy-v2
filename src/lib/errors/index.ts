/**
 * Error handling module exports
 * Provides centralized access to all error classes, handlers, and utilities
 */

// Base error classes and interfaces
export {
  BaseError,
  ConfigurationError,
  InvalidApiKeyError,
  ServiceError,
  DSPyServiceError,
  TimeoutError,
  ValidationError,
  FileProcessingError,
  FileTooLargeError,
  InvalidFileTypeError,
  RateLimitError,
  NotFoundError,
  UnauthorizedError,
  InternalError,
  isBaseError,
  isRetryableError,
  isServiceError,
  isValidationError,
  isTimeoutError,
  type ErrorResponse,
  type ErrorAction,
} from './base'

// Database-specific errors
export {
  DatabaseError,
  DatabaseConnectionError,
  QueryError,
  ConstraintViolationError,
  ForeignKeyViolationError,
  UniqueConstraintViolationError,
  CheckConstraintViolationError,
  VectorSearchError,
  EmbeddingGenerationError,
  TransactionError,
  MigrationError,
  RPCError,
  SupabaseError,
  SupabaseAuthError,
  RowLevelSecurityError,
  StorageError,
  ConnectionPoolExhaustedError,
  QueryTimeoutError,
  isDatabaseError,
  isConnectionError,
  isConstraintViolation,
  isVectorSearchError,
  isSupabaseError,
  isQueryTimeoutError,
  isTransactionError,
} from './database'

// Validation errors
export {
  FieldValidationError,
  RequiredFieldError,
  InvalidFieldTypeError,
  FieldRangeError,
  StringLengthError,
  InvalidEmailError,
  InvalidUrlError,
  InvalidUuidError,
  ArrayValidationError,
  InvalidEnumError,
  SchemaValidationError,
  ContextValidationError,
  BusinessRuleValidationError,
  JTBDValidationError,
  HMWValidationError,
  SolutionValidationError,
  MetricValidationError,
  FileValidationError,
  ChatValidationError,
  fromZodError,
  validateRequired,
  validateStringLength,
  validateNumericRange,
  validateArrayLength,
  isFieldValidationError,
  isSchemaValidationError,
  isContextValidationError,
  isBusinessRuleValidationError,
} from './validation'

// Chat-specific errors
export {
  ChatSessionError,
  ChatNotFoundError,
  ChatAccessDeniedError,
  ChatValidationError,
  ChatContextError,
  ChatMessageError,
  ChatPersistenceError,
  ChatTitleError,
  ChatArchivalError,
  isChatSessionError,
  isChatNotFoundError,
  isChatAccessDeniedError,
  isChatValidationError,
  isChatPersistenceError,
  CHAT_ERROR_CODES,
  type ChatErrorCode,
} from './chat'

// Error handler and utilities
export {
  GlobalErrorHandler,
  ErrorLogger,
  handleError,
  handleApiError,
  withErrorRecovery,
  createErrorBoundaryHandler,
  withErrorHandling,
  type ErrorContext,
  type ErrorHandlerConfig,
} from './handler'

// Re-export error codes for convenience
export { ERROR_CODES } from '../config/constants'
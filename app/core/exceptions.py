"""
Custom exceptions for the JTBD Assistant Platform.
Provides structured error handling with proper inheritance hierarchy.
"""


class JTBDAssistantError(Exception):
    """Base exception for all JTBD Assistant Platform errors."""
    
    def __init__(self, message: str, error_code: str = None, details: dict = None):
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> dict:
        """Convert exception to dictionary format."""
        return {
            "success": False,
            "error": self.message,
            "error_code": self.error_code,
            "details": self.details
        }


# === DATABASE EXCEPTIONS ===

class DatabaseError(JTBDAssistantError):
    """Base exception for database-related errors."""
    pass


class ConnectionError(DatabaseError):
    """Raised when database connection fails."""
    pass


class ClientNotInitializedError(DatabaseError):
    """Raised when database client is not properly initialized."""
    pass


class TableNotFoundError(DatabaseError):
    """Raised when required database table doesn't exist."""
    pass


class InsertError(DatabaseError):
    """Raised when database insert operation fails."""
    pass


class UpdateError(DatabaseError):
    """Raised when database update operation fails."""
    pass


class SearchError(DatabaseError):
    """Raised when database search operation fails."""
    pass


# === EMBEDDING EXCEPTIONS ===

class EmbeddingError(JTBDAssistantError):
    """Base exception for embedding-related errors."""
    pass


class InvalidEmbeddingDimensionError(EmbeddingError):
    """Raised when embedding has incorrect dimensions."""
    
    def __init__(self, actual_dimension: int, expected_dimension: int):
        message = f"Invalid embedding dimension: {actual_dimension}, expected {expected_dimension}"
        super().__init__(message, details={
            "actual_dimension": actual_dimension,
            "expected_dimension": expected_dimension
        })


class EmptyTextError(EmbeddingError):
    """Raised when empty text is provided for embedding."""
    pass


class BatchSizeExceededError(EmbeddingError):
    """Raised when batch size exceeds maximum allowed."""
    
    def __init__(self, actual_size: int, max_size: int):
        message = f"Batch size {actual_size} exceeds maximum {max_size}"
        super().__init__(message, details={
            "actual_size": actual_size,
            "max_size": max_size
        })


class EmbeddingGenerationError(EmbeddingError):
    """Raised when embedding generation fails."""
    pass


class CacheError(EmbeddingError):
    """Raised when cache operations fail."""
    pass


# === LLM EXCEPTIONS ===

class LLMError(JTBDAssistantError):
    """Base exception for LLM-related errors."""
    pass


class LLMClientNotInitializedError(LLMError):
    """Raised when LLM client is not properly initialized."""
    pass


class APIKeyNotFoundError(LLMError):
    """Raised when API key is not found in environment."""
    pass


class TokenLimitExceededError(LLMError):
    """Raised when token limit is exceeded."""
    
    def __init__(self, tokens_used: int, token_limit: int):
        message = f"Token limit exceeded: {tokens_used} > {token_limit}"
        super().__init__(message, details={
            "tokens_used": tokens_used,
            "token_limit": token_limit
        })


class RateLimitExceededError(LLMError):
    """Raised when API rate limit is exceeded."""
    pass


class ModelNotAvailableError(LLMError):
    """Raised when requested model is not available."""
    pass


class LLMTimeoutError(LLMError):
    """Raised when LLM request times out."""
    pass


# === VALIDATION EXCEPTIONS ===

class ValidationError(JTBDAssistantError):
    """Base exception for validation errors."""
    pass


class TextTooLongError(ValidationError):
    """Raised when text exceeds maximum allowed length."""
    
    def __init__(self, actual_length: int, max_length: int):
        message = f"Text too long: {actual_length} characters, maximum {max_length}"
        super().__init__(message, details={
            "actual_length": actual_length,
            "max_length": max_length
        })


class TextTooShortError(ValidationError):
    """Raised when text is shorter than minimum required length."""
    
    def __init__(self, actual_length: int, min_length: int):
        message = f"Text too short: {actual_length} characters, minimum {min_length}"
        super().__init__(message, details={
            "actual_length": actual_length,
            "min_length": min_length
        })


class InvalidFormatError(ValidationError):
    """Raised when data format is invalid."""
    pass


class MissingRequiredFieldError(ValidationError):
    """Raised when required field is missing."""
    
    def __init__(self, field_name: str):
        message = f"Missing required field: {field_name}"
        super().__init__(message, details={"field_name": field_name})


# === CONFIGURATION EXCEPTIONS ===

class ConfigurationError(JTBDAssistantError):
    """Base exception for configuration errors."""
    pass


class EnvironmentVariableNotFoundError(ConfigurationError):
    """Raised when required environment variable is not found."""
    
    def __init__(self, variable_name: str, alternatives: list = None):
        message = f"Environment variable not found: {variable_name}"
        if alternatives:
            message += f". Tried alternatives: {', '.join(alternatives)}"
        
        super().__init__(message, details={
            "variable_name": variable_name,
            "alternatives": alternatives or []
        })


class InvalidConfigurationError(ConfigurationError):
    """Raised when configuration values are invalid."""
    pass


# === UTILITY FUNCTIONS ===

def handle_database_exception(e: Exception) -> dict:
    """Convert database exceptions to standardized error response."""
    if isinstance(e, JTBDAssistantError):
        return e.to_dict()
    
    # Handle common database errors
    error_msg = str(e).lower()
    if "connection" in error_msg:
        return ConnectionError(str(e)).to_dict()
    elif "timeout" in error_msg:
        return DatabaseError(f"Database operation timed out: {e}").to_dict()
    elif "not found" in error_msg:
        return TableNotFoundError(str(e)).to_dict()
    else:
        return DatabaseError(f"Database error: {e}").to_dict()


def handle_llm_exception(e: Exception) -> dict:
    """Convert LLM exceptions to standardized error response."""
    if isinstance(e, JTBDAssistantError):
        return e.to_dict()
    
    # Handle common OpenAI errors
    error_msg = str(e).lower()
    if "api key" in error_msg or "authentication" in error_msg:
        return APIKeyNotFoundError(str(e)).to_dict()
    elif "rate limit" in error_msg:
        return RateLimitExceededError(str(e)).to_dict()
    elif "timeout" in error_msg:
        return LLMTimeoutError(str(e)).to_dict()
    elif "model" in error_msg and "not found" in error_msg:
        return ModelNotAvailableError(str(e)).to_dict()
    else:
        return LLMError(f"LLM error: {e}").to_dict()


def handle_embedding_exception(e: Exception) -> dict:
    """Convert embedding exceptions to standardized error response."""
    if isinstance(e, JTBDAssistantError):
        return e.to_dict()
    
    return EmbeddingError(f"Embedding error: {e}").to_dict()
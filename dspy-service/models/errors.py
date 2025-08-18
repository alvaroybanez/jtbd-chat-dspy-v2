"""
Error models for the JTBD Intelligence Service.

These models provide standardized error responses that match the platform's
error handling format used by the TypeScript service.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any, Dict, Literal
from datetime import datetime


class ValidationErrorDetail(BaseModel):
    """Individual validation error detail."""
    model_config = ConfigDict(validate_assignment=True)
    
    field: str = Field(..., description="Field name that failed validation")
    message: str = Field(..., description="Validation error message")
    invalid_value: Optional[Any] = Field(None, description="The invalid value that caused the error")


class ErrorResponse(BaseModel):
    """Standard error response format matching platform specification."""
    model_config = ConfigDict(validate_assignment=True)
    
    code: str = Field(
        ..., 
        description="UPPER_SNAKE_CASE error identifier",
        pattern=r"^[A-Z][A-Z0-9_]*$"
    )
    message: str = Field(..., min_length=1, description="Human-readable error description")
    action: Literal["RETRY", "NONE"] = Field(..., description="Suggested user action")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error context")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")
    
    # Common error factory methods
    @classmethod
    def invalid_api_key(cls, details: Optional[Dict[str, Any]] = None) -> "ErrorResponse":
        """Create invalid API key error."""
        return cls(
            code="INVALID_API_KEY",
            message="Authentication failed - invalid or missing API key",
            action="NONE",
            details=details or {}
        )
    
    @classmethod
    def dspy_generation_error(cls, error_msg: str, details: Optional[Dict[str, Any]] = None) -> "ErrorResponse":
        """Create DSPy generation error."""
        return cls(
            code="DSPY_GENERATION_ERROR",
            message=f"DSPy generation failed: {error_msg}",
            action="RETRY",
            details=details or {}
        )
    
    @classmethod
    def openai_api_error(cls, error_msg: str, details: Optional[Dict[str, Any]] = None) -> "ErrorResponse":
        """Create OpenAI API error."""
        return cls(
            code="OPENAI_API_ERROR",
            message=f"OpenAI API error: {error_msg}",
            action="RETRY",
            details=details or {}
        )
    
    @classmethod
    def timeout_error(cls, timeout_seconds: int, details: Optional[Dict[str, Any]] = None) -> "ErrorResponse":
        """Create timeout error."""
        return cls(
            code="TIMEOUT_ERROR",
            message=f"Request timed out after {timeout_seconds} seconds",
            action="RETRY",
            details=details or {}
        )
    
    @classmethod
    def validation_error(
        cls, 
        validation_errors: List[ValidationErrorDetail], 
        details: Optional[Dict[str, Any]] = None
    ) -> "ErrorResponse":
        """Create validation error with detailed field errors."""
        error_details = details or {}
        error_details["validation_errors"] = [error.model_dump() for error in validation_errors]
        
        return cls(
            code="VALIDATION_ERROR",
            message=f"Request validation failed - {len(validation_errors)} errors found",
            action="NONE",
            details=error_details
        )
    
    @classmethod
    def internal_server_error(
        cls, 
        error_msg: str = "Internal server error occurred", 
        details: Optional[Dict[str, Any]] = None
    ) -> "ErrorResponse":
        """Create internal server error."""
        return cls(
            code="INTERNAL_SERVER_ERROR",
            message=error_msg,
            action="RETRY",
            details=details or {}
        )
    
    @classmethod
    def configuration_error(cls, config_issue: str, details: Optional[Dict[str, Any]] = None) -> "ErrorResponse":
        """Create configuration error."""
        return cls(
            code="CONFIGURATION_ERROR",
            message=f"Service configuration error: {config_issue}",
            action="NONE",
            details=details or {}
        )
    
    @classmethod
    def insufficient_context_error(cls, missing_context: str, details: Optional[Dict[str, Any]] = None) -> "ErrorResponse":
        """Create insufficient context error."""
        return cls(
            code="INSUFFICIENT_CONTEXT",
            message=f"Insufficient context for generation: {missing_context}",
            action="NONE",
            details=details or {}
        )
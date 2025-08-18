"""
Pydantic models for the JTBD Intelligence Service API.

This module exports all request and response models used by the FastAPI endpoints.
"""

from .requests import (
    GenerateHMWRequest,
    CreateSolutionsRequest,
    ContextItem,
    HMWItem
)

from .responses import (
    GenerateHMWResponse,
    CreateSolutionsResponse,
    HMWResult,
    SolutionResult,
    MetaInfo,
    SourceReferences,
    HealthResponse
)

from .errors import (
    ErrorResponse,
    ValidationErrorDetail
)

__all__ = [
    # Request models
    "GenerateHMWRequest",
    "CreateSolutionsRequest", 
    "ContextItem",
    "HMWItem",
    
    # Response models
    "GenerateHMWResponse",
    "CreateSolutionsResponse",
    "HMWResult",
    "SolutionResult",
    "MetaInfo",
    "SourceReferences",
    "HealthResponse",
    
    # Error models
    "ErrorResponse",
    "ValidationErrorDetail"
]
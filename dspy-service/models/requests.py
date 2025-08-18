"""
Request models for the JTBD Intelligence Service.

These models validate and structure incoming requests to the HMW generation
and solution creation endpoints according to the API specification.
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, List, Any
from uuid import UUID


class ContextItem(BaseModel):
    """Base context item for insights, metrics, or JTBDs."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True
    )
    
    id: str = Field(..., description="Unique identifier for the context item")
    content: str = Field(..., min_length=1, max_length=2000, description="Content or description")
    
    @field_validator('id')
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Validate that ID is not empty and is reasonable length."""
        if not v or not v.strip():
            raise ValueError("ID cannot be empty")
        if len(v) > 100:
            raise ValueError("ID cannot exceed 100 characters")
        return v.strip()


class InsightItem(ContextItem):
    """Insight context item."""
    content: str = Field(..., min_length=10, max_length=2000, description="Insight content")


class MetricItem(BaseModel):
    """Metric context item."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True
    )
    
    id: str = Field(..., description="Unique identifier for the metric")
    name: str = Field(..., min_length=1, max_length=100, description="Metric name")
    description: Optional[str] = Field(None, max_length=500, description="Metric description")
    current_value: Optional[float] = Field(None, description="Current metric value")
    target_value: Optional[float] = Field(None, description="Target metric value")
    unit: str = Field(..., min_length=1, max_length=50, description="Metric unit")


class JTBDItem(ContextItem):
    """Jobs-to-be-Done context item."""
    statement: str = Field(..., min_length=10, max_length=500, description="JTBD statement")
    context: Optional[str] = Field(None, max_length=1000, description="Additional JTBD context")
    priority: Optional[int] = Field(None, ge=1, le=5, description="Priority (1=highest)")


class GenerateHMWRequest(BaseModel):
    """Request model for generating How Might We questions."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid'
    )
    
    context: Dict[str, List[Any]] = Field(
        ..., 
        description="Context containing insights, metrics, and JTBDs"
    )
    count: Optional[int] = Field(
        default=5, 
        ge=1, 
        le=20, 
        description="Number of HMW questions to generate"
    )
    temperature: Optional[float] = Field(
        default=0.7, 
        ge=0.0, 
        le=2.0, 
        description="Generation temperature"
    )
    
    @field_validator('context')
    @classmethod
    def validate_context(cls, v: Dict[str, List[Any]]) -> Dict[str, List[Any]]:
        """Validate context structure and content."""
        allowed_keys = {'insights', 'metrics', 'jtbds'}
        
        # Check for valid keys
        invalid_keys = set(v.keys()) - allowed_keys
        if invalid_keys:
            raise ValueError(f"Invalid context keys: {invalid_keys}. Allowed: {allowed_keys}")
        
        # Ensure at least one context type is provided
        if not any(v.get(key) for key in allowed_keys):
            raise ValueError("At least one context type (insights, metrics, jtbds) must be provided")
        
        # Validate each context type has reasonable limits
        for key, items in v.items():
            if items and len(items) > 50:
                raise ValueError(f"Too many {key} items (max: 50)")
        
        return v


class HMWItem(BaseModel):
    """Individual HMW question item for solution generation."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True
    )
    
    id: str = Field(..., description="Unique identifier for the HMW")
    question: str = Field(..., min_length=15, max_length=200, description="HMW question")
    score: Optional[float] = Field(None, ge=0.0, le=10.0, description="Relevance score")
    
    @field_validator('question')
    @classmethod
    def validate_hmw_format(cls, v: str) -> str:
        """Validate HMW question format."""
        question = v.strip()
        if not question.lower().startswith('how might we'):
            raise ValueError("HMW question must start with 'How might we'")
        return question


class CreateSolutionsRequest(BaseModel):
    """Request model for creating prioritized solutions."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid'
    )
    
    hmws: List[HMWItem] = Field(
        ..., 
        min_length=1,
        max_length=20,
        description="HMW questions to generate solutions for"
    )
    context: Dict[str, List[Any]] = Field(
        ..., 
        description="Context containing metrics, JTBDs, and insights"
    )
    count: Optional[int] = Field(
        default=5, 
        ge=1, 
        le=20, 
        description="Number of solutions to generate"
    )
    temperature: Optional[float] = Field(
        default=0.7, 
        ge=0.0, 
        le=2.0, 
        description="Generation temperature"
    )
    
    @field_validator('context')
    @classmethod
    def validate_context(cls, v: Dict[str, List[Any]]) -> Dict[str, List[Any]]:
        """Validate context structure and content."""
        allowed_keys = {'metrics', 'jtbds', 'insights'}
        
        # Check for valid keys
        invalid_keys = set(v.keys()) - allowed_keys
        if invalid_keys:
            raise ValueError(f"Invalid context keys: {invalid_keys}. Allowed: {allowed_keys}")
        
        # Ensure metrics are provided (required for solution assignment)
        if not v.get('metrics'):
            raise ValueError("At least one metric must be provided for solution assignment")
        
        # Validate reasonable limits
        for key, items in v.items():
            if items and len(items) > 50:
                raise ValueError(f"Too many {key} items (max: 50)")
        
        return v
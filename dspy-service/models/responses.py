"""
Response models for the JTBD Intelligence Service.

These models structure the responses from HMW generation and solution creation
endpoints according to the API specification.
"""

from pydantic import BaseModel, Field, ConfigDict, computed_field
from typing import Optional, List, Dict, Any
from datetime import datetime


class SourceReferences(BaseModel):
    """References to source context items that contributed to generation."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True
    )
    
    insight_ids: List[str] = Field(default_factory=list, description="Related insight IDs")
    metric_ids: List[str] = Field(default_factory=list, description="Related metric IDs")
    jtbd_ids: List[str] = Field(default_factory=list, description="Related JTBD IDs")


class MetaInfo(BaseModel):
    """Metadata about the generation process."""
    model_config = ConfigDict(
        validate_assignment=True
    )
    
    duration_ms: int = Field(..., ge=0, description="Generation duration in milliseconds")
    retries: int = Field(default=0, ge=0, description="Number of retries performed")
    model_used: str = Field(default="gpt-5-nano", description="Model used for generation")
    generation_method: str = Field(default="dspy", description="Generation method (dspy or fallback)")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Generation timestamp")
    
    @computed_field
    @property
    def duration_seconds(self) -> float:
        """Duration in seconds (computed field)."""
        return self.duration_ms / 1000.0


class HMWResult(BaseModel):
    """Individual HMW question result."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True
    )
    
    question: str = Field(..., description="Generated HMW question")
    score: float = Field(..., ge=0.0, le=10.0, description="Relevance score (0-10)")
    source_references: SourceReferences = Field(
        default_factory=SourceReferences, 
        description="Source context references"
    )
    confidence: Optional[float] = Field(
        None, 
        ge=0.0, 
        le=1.0, 
        description="Generation confidence score"
    )


class SolutionResult(BaseModel):
    """Individual solution result with scoring."""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True
    )
    
    title: str = Field(..., min_length=5, max_length=100, description="Solution title")
    description: str = Field(..., min_length=20, max_length=1000, description="Solution description")
    impact_score: int = Field(..., ge=1, le=10, description="Impact score (1-10)")
    effort_score: int = Field(..., ge=1, le=10, description="Effort score (1-10)")
    assigned_metrics: List[str] = Field(..., min_length=1, description="Assigned metric IDs")
    source_references: SourceReferences = Field(
        default_factory=SourceReferences,
        description="Source context references"
    )
    confidence: Optional[float] = Field(
        None, 
        ge=0.0, 
        le=1.0, 
        description="Generation confidence score"
    )
    
    @computed_field
    @property
    def final_score(self) -> float:
        """Final score calculated as impact/effort ratio."""
        return round(self.impact_score / self.effort_score, 2)


class GenerateHMWResponse(BaseModel):
    """Response for HMW generation endpoint."""
    model_config = ConfigDict(validate_assignment=True)
    
    hmws: List[HMWResult] = Field(
        ..., 
        description="Generated HMW questions with scores"
    )
    meta: MetaInfo = Field(..., description="Generation metadata")
    
    @computed_field
    @property
    def total_hmws(self) -> int:
        """Total number of HMWs generated."""
        return len(self.hmws)


class CreateSolutionsResponse(BaseModel):
    """Response for solution creation endpoint."""
    model_config = ConfigDict(validate_assignment=True)
    
    solutions: List[SolutionResult] = Field(
        ..., 
        description="Generated solutions sorted by final score"
    )
    meta: MetaInfo = Field(..., description="Generation metadata")
    fallback_metric_used: Optional[bool] = Field(
        None, 
        description="Whether fallback metric assignment was used"
    )
    
    @computed_field
    @property
    def total_solutions(self) -> int:
        """Total number of solutions generated."""
        return len(self.solutions)
    
    @computed_field 
    @property
    def avg_impact_score(self) -> float:
        """Average impact score across all solutions."""
        if not self.solutions:
            return 0.0
        return round(sum(s.impact_score for s in self.solutions) / len(self.solutions), 2)
    
    @computed_field
    @property
    def avg_effort_score(self) -> float:
        """Average effort score across all solutions."""
        if not self.solutions:
            return 0.0
        return round(sum(s.effort_score for s in self.solutions) / len(self.solutions), 2)


class HealthResponse(BaseModel):
    """Response for health check endpoint."""
    model_config = ConfigDict(validate_assignment=True)
    
    status: str = Field(..., description="Service status")
    service: str = Field(default="intelligence", description="Service name") 
    dspy_configured: bool = Field(..., description="Whether DSPy is properly configured")
    openai_accessible: bool = Field(..., description="Whether OpenAI API is accessible")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Health check timestamp")
    version: str = Field(default="0.1.0", description="Service version")
    uptime_seconds: Optional[float] = Field(None, description="Service uptime in seconds")
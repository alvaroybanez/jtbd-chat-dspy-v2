"""
Tests for Pydantic model validation and serialization.
"""

import pytest
from pydantic import ValidationError

from models.requests import (
    GenerateHMWRequest, CreateSolutionsRequest,
    ContextItem, MetricItem, JTBDItem, HMWItem
)
from models.responses import (
    GenerateHMWResponse, CreateSolutionsResponse,
    HMWResult, SolutionResult, MetaInfo, SourceReferences,
    HealthResponse
)
from models.errors import ErrorResponse, ValidationErrorDetail


class TestRequestModels:
    """Test request model validation."""
    
    def test_context_item_valid(self):
        """Test valid context item creation."""
        item = ContextItem(id="test-id", content="Test content")
        assert item.id == "test-id"
        assert item.content == "Test content"
    
    def test_context_item_invalid_empty_id(self):
        """Test context item validation fails with empty ID."""
        with pytest.raises(ValidationError):
            ContextItem(id="", content="Test content")
    
    def test_context_item_invalid_long_content(self):
        """Test context item validation fails with too long content."""
        long_content = "x" * 2001
        with pytest.raises(ValidationError):
            ContextItem(id="test-id", content=long_content)
    
    def test_metric_item_valid(self):
        """Test valid metric item creation."""
        metric = MetricItem(
            id="metric-1",
            name="Customer Satisfaction",
            description="Overall customer satisfaction score",
            current_value=7.5,
            target_value=9.0,
            unit="score"
        )
        assert metric.name == "Customer Satisfaction"
        assert metric.current_value == 7.5
    
    def test_jtbd_item_valid(self):
        """Test valid JTBD item creation."""
        jtbd = JTBDItem(
            id="jtbd-1",
            content="Help users track fitness goals",
            statement="Help users track their fitness goals consistently",
            context="Users struggle with maintaining routines",
            priority=3
        )
        assert jtbd.statement == "Help users track their fitness goals consistently"
        assert jtbd.priority == 3
    
    def test_hmw_item_valid(self):
        """Test valid HMW item creation."""
        hmw = HMWItem(
            id="hmw-1",
            question="How might we help users stay motivated?",
            score=8.5
        )
        assert hmw.question == "How might we help users stay motivated?"
        assert hmw.score == 8.5
    
    def test_hmw_item_invalid_format(self):
        """Test HMW item validation fails without proper format."""
        with pytest.raises(ValidationError):
            HMWItem(
                id="hmw-1",
                question="What if we help users stay motivated?"
            )
    
    def test_generate_hmw_request_valid(self):
        """Test valid HMW generation request."""
        request = GenerateHMWRequest(
            context={
                "insights": [{"id": "insight-1", "content": "Users need motivation"}],
                "metrics": [{"id": "metric-1", "name": "Engagement", "unit": "score"}],
                "jtbds": [{"id": "jtbd-1", "statement": "Track fitness goals"}]
            },
            count=5,
            temperature=0.8
        )
        assert request.count == 5
        assert request.temperature == 0.8
    
    def test_generate_hmw_request_invalid_empty_context(self):
        """Test HMW request validation fails with empty context."""
        with pytest.raises(ValidationError):
            GenerateHMWRequest(context={})
    
    def test_generate_hmw_request_invalid_context_keys(self):
        """Test HMW request validation fails with invalid context keys."""
        with pytest.raises(ValidationError):
            GenerateHMWRequest(context={"invalid_key": ["data"]})
    
    def test_create_solutions_request_valid(self):
        """Test valid solution creation request."""
        request = CreateSolutionsRequest(
            hmws=[
                HMWItem(id="hmw-1", question="How might we improve engagement?")
            ],
            context={
                "metrics": [{"id": "metric-1", "name": "Engagement", "unit": "score"}],
                "insights": [{"id": "insight-1", "content": "Users need motivation"}]
            },
            count=3
        )
        assert len(request.hmws) == 1
        assert request.count == 3
    
    def test_create_solutions_request_no_metrics(self):
        """Test solution request validation fails without metrics."""
        with pytest.raises(ValidationError):
            CreateSolutionsRequest(
                hmws=[HMWItem(id="hmw-1", question="How might we improve?")],
                context={"insights": [{"id": "insight-1", "content": "Test"}]}
            )


class TestResponseModels:
    """Test response model creation and computed fields."""
    
    def test_source_references_default(self):
        """Test source references default empty lists."""
        refs = SourceReferences()
        assert refs.insight_ids == []
        assert refs.metric_ids == []
        assert refs.jtbd_ids == []
    
    def test_meta_info_computed_duration(self):
        """Test meta info computed duration in seconds."""
        meta = MetaInfo(duration_ms=1500, retries=1)
        assert meta.duration_seconds == 1.5
        assert meta.retries == 1
    
    def test_hmw_result_valid(self):
        """Test HMW result creation."""
        result = HMWResult(
            question="How might we improve user experience?",
            score=8.5,
            confidence=0.9
        )
        assert result.question == "How might we improve user experience?"
        assert result.score == 8.5
        assert result.confidence == 0.9
    
    def test_solution_result_computed_final_score(self):
        """Test solution result computed final score."""
        solution = SolutionResult(
            title="Improve Onboarding",
            description="Streamline the user onboarding process",
            impact_score=8,
            effort_score=4,
            assigned_metrics=["metric-1"]
        )
        assert solution.final_score == 2.0  # 8/4 = 2.0
    
    def test_solution_result_invalid_no_metrics(self):
        """Test solution result validation fails without assigned metrics."""
        with pytest.raises(ValidationError):
            SolutionResult(
                title="Test Solution",
                description="Test description",
                impact_score=5,
                effort_score=3,
                assigned_metrics=[]  # Empty list should fail
            )
    
    def test_generate_hmw_response_computed_total(self):
        """Test HMW response computed total count."""
        hmw1 = HMWResult(question="How might we improve?", score=7.0)
        hmw2 = HMWResult(question="How might we enhance?", score=8.0)
        
        response = GenerateHMWResponse(
            hmws=[hmw1, hmw2],
            meta=MetaInfo(duration_ms=1000)
        )
        assert response.total_hmws == 2
    
    def test_create_solutions_response_computed_averages(self):
        """Test solution response computed average scores."""
        solution1 = SolutionResult(
            title="Solution 1", description="Description 1",
            impact_score=8, effort_score=4, assigned_metrics=["m1"]
        )
        solution2 = SolutionResult(
            title="Solution 2", description="Description 2", 
            impact_score=6, effort_score=2, assigned_metrics=["m2"]
        )
        
        response = CreateSolutionsResponse(
            solutions=[solution1, solution2],
            meta=MetaInfo(duration_ms=2000)
        )
        assert response.total_solutions == 2
        assert response.avg_impact_score == 7.0  # (8+6)/2
        assert response.avg_effort_score == 3.0   # (4+2)/2
    
    def test_health_response_valid(self):
        """Test health response creation."""
        health = HealthResponse(
            status="healthy",
            dspy_configured=True,
            openai_accessible=True,
            uptime_seconds=3600.0
        )
        assert health.status == "healthy"
        assert health.dspy_configured is True
        assert health.openai_accessible is True


class TestErrorModels:
    """Test error model creation and factory methods."""
    
    def test_error_response_valid(self):
        """Test basic error response creation."""
        error = ErrorResponse(
            code="TEST_ERROR",
            message="Test error message",
            action="RETRY"
        )
        assert error.code == "TEST_ERROR"
        assert error.message == "Test error message"
        assert error.action == "RETRY"
    
    def test_error_response_invalid_code_format(self):
        """Test error response validation fails with invalid code format."""
        with pytest.raises(ValidationError):
            ErrorResponse(
                code="invalid-code",  # Should be UPPER_SNAKE_CASE
                message="Test message",
                action="RETRY"
            )
    
    def test_error_response_factory_methods(self):
        """Test error response factory methods."""
        # Invalid API key error
        error = ErrorResponse.invalid_api_key()
        assert error.code == "INVALID_API_KEY"
        assert error.action == "NONE"
        
        # DSPy generation error
        error = ErrorResponse.dspy_generation_error("Test error")
        assert error.code == "DSPY_GENERATION_ERROR"
        assert error.action == "RETRY"
        assert "Test error" in error.message
        
        # Timeout error
        error = ErrorResponse.timeout_error(30)
        assert error.code == "TIMEOUT_ERROR"
        assert "30 seconds" in error.message
        
        # Validation error with details
        validation_errors = [
            ValidationErrorDetail(field="test_field", message="Required field")
        ]
        error = ErrorResponse.validation_error(validation_errors)
        assert error.code == "VALIDATION_ERROR"
        assert error.action == "NONE"
        assert "validation_errors" in error.details
    
    def test_validation_error_detail(self):
        """Test validation error detail model."""
        detail = ValidationErrorDetail(
            field="context.insights",
            message="Field is required",
            invalid_value=None
        )
        assert detail.field == "context.insights"
        assert detail.message == "Field is required"
        assert detail.invalid_value is None